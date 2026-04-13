"""
代码解释器服务 - 安全执行Python代码
支持：代码执行、文件操作、数据可视化
"""
import os
import sys
import json
import base64
import asyncio
import tempfile
import traceback
import logging
from typing import Optional, Any
from dataclasses import dataclass, asdict
from pathlib import Path
from datetime import datetime
from contextlib import redirect_stdout, redirect_stderr
import io

import aiohttp
from aiohttp import web

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 执行限制
MAX_EXECUTION_TIME = 30  # 最大执行时间（秒）
MAX_OUTPUT_LENGTH = 10000  # 最大输出长度
ALLOWED_MODULES = {
    'math', 'random', 'statistics', 'decimal', 'fractions', 'itertools',
    'collections', 'datetime', 'json', 're', 'string', 'hashlib', 'uuid',
    'typing', 'copy', 'pprint', 'textwrap', 'string', 'inspect',
    'numpy', 'np',
    'pandas', 'pd',
    'matplotlib', 'matplotlib.pyplot', 'plt',
    'PIL', 'PIL.Image',
}

# 禁止的操作
FORBIDDEN_KEYWORDS = [
    'import os', 'import sys', 'import subprocess',
    'exec(', 'eval(', '__import__', 'open(',
    'file', 'socket', 'urllib', 'http', 'ftp',
    'remove', 'rmdir', 'unlink', 'system', 'popen',
]


@dataclass
class ExecutionResult:
    """代码执行结果"""
    success: bool
    output: str
    error: Optional[str] = None
    figures: list[str] = None  # base64编码的图片
    execution_time: float = 0.0
    
    def to_dict(self):
        return asdict(self)


class CodeExecutor:
    """安全代码执行器"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.work_dir = Path(tempfile.mkdtemp(prefix=f"code_{session_id}_"))
        self.figures_dir = self.work_dir / "figures"
        self.figures_dir.mkdir(exist_ok=True)
        
        # 存储变量状态
        self.namespace = {
            '__builtins__': {
                name: getattr(__builtins__, name)
                for name in dir(__builtins__)
                if name not in ['open', 'exec', 'eval', '__import__']
            }
        }
        
        # 注入安全的模块
        self._inject_safe_modules()
        
        logger.info(f"[{session_id}] 代码执行器初始化，工作目录: {self.work_dir}")
    
    def _inject_safe_modules(self):
        """注入安全的模块到命名空间"""
        # NumPy
        try:
            import numpy as np
            self.namespace['numpy'] = np
            self.namespace['np'] = np
        except ImportError:
            pass
        
        # Pandas
        try:
            import pandas as pd
            self.namespace['pandas'] = pd
            self.namespace['pd'] = pd
        except ImportError:
            pass
        
        # Matplotlib
        try:
            import matplotlib
            matplotlib.use('Agg')  # 非交互式后端
            import matplotlib.pyplot as plt
            
            # 自定义savefig来捕获图片
            original_savefig = plt.savefig
            self._captured_figures = []
            
            def custom_savefig(*args, **kwargs):
                if args and isinstance(args[0], str):
                    filepath = self.figures_dir / args[0]
                    return original_savefig(filepath, **kwargs)
                else:
                    # 生成文件名
                    fig_name = f"figure_{len(self._captured_figures)}.png"
                    filepath = self.figures_dir / fig_name
                    result = original_savefig(filepath, **kwargs)
                    self._captured_figures.append(str(filepath))
                    return result
            
            plt.savefig = custom_savefig
            self.namespace['matplotlib'] = matplotlib
            self.namespace['plt'] = plt
            self.namespace['matplotlib.pyplot'] = plt
        except ImportError:
            pass
        
        # PIL
        try:
            from PIL import Image
            self.namespace['PIL'] = Image
            self.namespace['Image'] = Image
        except ImportError:
            pass
    
    def _check_code_safety(self, code: str) -> tuple[bool, str]:
        """检查代码安全性"""
        code_lower = code.lower()
        
        for keyword in FORBIDDEN_KEYWORDS:
            if keyword.lower() in code_lower:
                return False, f"代码包含禁止的操作: {keyword}"
        
        return True, ""
    
    async def execute(self, code: str) -> ExecutionResult:
        """执行代码"""
        start_time = datetime.now()
        
        # 安全检查
        is_safe, error_msg = self._check_code_safety(code)
        if not is_safe:
            return ExecutionResult(
                success=False,
                output="",
                error=f"安全错误: {error_msg}",
                execution_time=0.0
            )
        
        # 重置matplotlib
        if 'plt' in self.namespace:
            self.namespace['plt'].close('all')
            self._captured_figures = []
        
        # 捕获输出
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        try:
            # 在事件循环中执行代码
            loop = asyncio.get_event_loop()
            
            def run_code():
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    # 添加工作目录到代码（用于文件操作）
                    exec_globals = self.namespace.copy()
                    exec_globals['WORK_DIR'] = str(self.work_dir)
                    
                    # 执行代码
                    exec(code, exec_globals)
                    
                    # 更新命名空间
                    self.namespace.update(exec_globals)
            
            # 使用线程池执行（带超时）
            await asyncio.wait_for(
                loop.run_in_executor(None, run_code),
                timeout=MAX_EXECUTION_TIME
            )
            
            # 获取输出
            output = stdout_capture.getvalue()
            error_output = stderr_capture.getvalue()
            
            # 截断过长输出
            if len(output) > MAX_OUTPUT_LENGTH:
                output = output[:MAX_OUTPUT_LENGTH] + "\n... (输出已截断)"
            
            # 收集生成的图片
            figures = []
            
            # 检查matplotlib图片
            if 'plt' in self.namespace and self._captured_figures:
                for fig_path in self._captured_figures:
                    if os.path.exists(fig_path):
                        with open(fig_path, 'rb') as f:
                            figures.append(base64.b64encode(f.read()).decode())
            
            # 检查工作目录中的其他图片
            for img_file in self.work_dir.glob("*.png"):
                if img_file.name not in [os.path.basename(f) for f in self._captured_figures]:
                    with open(img_file, 'rb') as f:
                        figures.append(base64.b64encode(f.read()).decode())
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            return ExecutionResult(
                success=True,
                output=output,
                error=error_output if error_output else None,
                figures=figures,
                execution_time=execution_time
            )
            
        except asyncio.TimeoutError:
            return ExecutionResult(
                success=False,
                output=stdout_capture.getvalue(),
                error=f"代码执行超时（超过{MAX_EXECUTION_TIME}秒）",
                execution_time=MAX_EXECUTION_TIME
            )
        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            
            return ExecutionResult(
                success=False,
                output=stdout_capture.getvalue(),
                error=error_msg,
                execution_time=execution_time
            )
    
    def cleanup(self):
        """清理临时文件"""
        try:
            import shutil
            shutil.rmtree(self.work_dir, ignore_errors=True)
            logger.info(f"[{self.session_id}] 清理工作目录")
        except Exception as e:
            logger.error(f"清理失败: {e}")


# 会话管理
executors: dict[str, CodeExecutor] = {}


async def handle_execute(request: web.Request) -> web.Response:
    """处理代码执行请求"""
    try:
        data = await request.json()
        code = data.get("code", "")
        session_id = data.get("session_id", "default")
        
        if not code.strip():
            return web.json_response({
                "success": False,
                "error": "代码不能为空"
            }, status=400)
        
        # 获取或创建执行器
        if session_id not in executors:
            executors[session_id] = CodeExecutor(session_id)
        
        executor = executors[session_id]
        result = await executor.execute(code)
        
        return web.json_response(result.to_dict())
        
    except json.JSONDecodeError:
        return web.json_response({
            "success": False,
            "error": "无效的JSON"
        }, status=400)
    except Exception as e:
        logger.error(f"执行请求处理失败: {e}")
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)


async def handle_reset(request: web.Request) -> web.Response:
    """重置会话（清理变量）"""
    try:
        data = await request.json()
        session_id = data.get("session_id", "default")
        
        if session_id in executors:
            executors[session_id].cleanup()
            del executors[session_id]
        
        return web.json_response({
            "success": True,
            "message": "会话已重置"
        })
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)


async def handle_health(request: web.Request) -> web.Response:
    """健康检查"""
    return web.json_response({
        "status": "ok",
        "active_sessions": len(executors)
    })


# 创建应用
app = web.Application()
app.router.add_post("/execute", handle_execute)
app.router.add_post("/reset", handle_reset)
app.router.add_get("/health", handle_health)

# CORS中间件
async def cors_middleware(app, handler):
    async def middleware(request):
        if request.method == 'OPTIONS':
            return web.Response(headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            })
        
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
    return middleware

app.middlewares.append(cors_middleware)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8882)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()
    
    logger.info(f"启动代码解释器服务: http://{args.host}:{args.port}")
    web.run_app(app, host=args.host, port=args.port)

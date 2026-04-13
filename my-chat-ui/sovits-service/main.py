"""
GPT-SoVITS TTS 推理服务代理
提供 HTTP API 接口供前端调用，转发到GPT-SoVITS api_v2服务
"""

import os
import sys
import json
import yaml
import uuid
import logging
import subprocess
import time
from pathlib import Path
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import requests

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 加载配置
CONFIG_PATH = Path(__file__).parent / "config.yaml"
with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    CONFIG = yaml.safe_load(f)

# GPT-SoVITS API服务地址
GSV_API_HOST = "127.0.0.1"
GSV_API_PORT = 9880
GSV_API_URL = f"http://{GSV_API_HOST}:{GSV_API_PORT}"

# 创建 FastAPI 应用
app = FastAPI(
    title="GPT-SoVITS TTS Service",
    description="GPT-SoVITS 语音合成推理服务",
    version="1.0.0"
)

# 启用 CORS - 允许前端开发服务器
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

# 全局状态
class ServiceState:
    def __init__(self):
        self.initialized = False
        self.gpt_sovits_available = False
        self.models = {}
        self.temp_dir = Path("./temp")
        self.temp_dir.mkdir(exist_ok=True)
        self.gsv_process = None
        
    def check_gsv_service(self):
        """检查GPT-SoVITS服务是否可用"""
        try:
            response = requests.get(f"{GSV_API_URL}/", timeout=2)
            # 任何响应都表示服务在运行（404也表示服务可用，只是路径不存在）
            self.gpt_sovits_available = True
            logger.info("GPT-SoVITS API service is available")
            return True
        except Exception as e:
            logger.debug(f"GPT-SoVITS check failed: {e}")
            pass
        
        self.gpt_sovits_available = False
        logger.warning("GPT-SoVITS API service not available")
        return False
    
    def start_gsv_service(self):
        """启动GPT-SoVITS API服务"""
        try:
            gsv_path = Path(__file__).parent / CONFIG['gpt_sovits_path']
            if not gsv_path.exists():
                logger.error(f"GPT-SoVITS not found at: {gsv_path}")
                return False
            
            # 启动api_v2.py
            api_script = gsv_path / "api_v2.py"
            if not api_script.exists():
                logger.error(f"api_v2.py not found at: {api_script}")
                return False
            
            logger.info(f"Starting GPT-SoVITS API service on port {GSV_API_PORT}...")
            
            # 使用subprocess启动
            cmd = [
                sys.executable,
                str(api_script),
                "-a", GSV_API_HOST,
                "-p", str(GSV_API_PORT),
            ]
            
            self.gsv_process = subprocess.Popen(
                cmd,
                cwd=str(gsv_path),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
            )
            
            # 等待服务启动
            for i in range(30):
                time.sleep(1)
                if self.check_gsv_service():
                    logger.info("GPT-SoVITS API service started successfully")
                    return True
                logger.info(f"Waiting for GPT-SoVITS service... ({i+1}s)")
            
            logger.error("GPT-SoVITS API service failed to start")
            return False
            
        except Exception as e:
            logger.error(f"Failed to start GPT-SoVITS service: {e}")
            return False

state = ServiceState()

# ============== 数据模型 ==============

class TTSRequest(BaseModel):
    text: str
    character: str = "芙宁娜_ZH"
    emotion: str = "default"
    language: str = "zh"
    speed: float = 1.0

class TTSResponse(BaseModel):
    success: bool
    audio_url: Optional[str] = None
    duration: Optional[float] = None
    message: Optional[str] = None

class CharacterInfo(BaseModel):
    id: str
    name: str
    description: str
    language: str
    emotions: List[str]

# ============== API 路由 ==============

@app.on_event("startup")
async def startup_event():
    """服务启动时的初始化"""
    logger.info("Starting GPT-SoVITS TTS Service...")
    
    # 尝试连接已有的GPT-SoVITS服务，或启动它
    if not state.check_gsv_service():
        logger.info("Attempting to start GPT-SoVITS service...")
        state.start_gsv_service()
    
    # 加载角色配置
    base_path = Path(CONFIG['models']['base_path'])
    
    for char_config in CONFIG['models']['characters']:
        char_id = char_config['id']
        emotions = []
        ref_dir = base_path / char_id / "reference"
        if ref_dir.exists():
            for ref_file in ref_dir.glob("*.wav"):
                emotion = "default"
                if ref_file.name.startswith("【"):
                    emotion = ref_file.name.split("】")[0][1:]
                emotions.append(emotion)
        
        if not emotions:
            emotions = ["default"]
            
        state.models[char_id] = {
            **char_config,
            "emotions": list(set(emotions))
        }
        
        logger.info(f"Loaded character: {char_id} - {char_config['name']}")
    
    state.initialized = True
    logger.info(f"Service initialized (Mode: {'Real' if state.gpt_sovits_available else 'Mock'})")

@app.on_event("shutdown")
async def shutdown_event():
    """服务关闭时清理"""
    if state.gsv_process:
        logger.info("Shutting down GPT-SoVITS service...")
        state.gsv_process.terminate()

@app.get("/")
async def root():
    """服务状态检查"""
    return {
        "status": "running",
        "initialized": state.initialized,
        "gpt_sovits_available": state.gpt_sovits_available,
        "characters": list(state.models.keys())
    }

@app.get("/characters")
async def list_characters():
    """获取可用角色列表"""
    characters = []
    for char_id, char_data in state.models.items():
        characters.append(CharacterInfo(
            id=char_id,
            name=char_data['name'],
            description=char_data['description'],
            language=char_data['language'],
            emotions=char_data.get('emotions', ['default'])
        ))
    return characters

def get_ref_audio_path(character: str, emotion: str = "default") -> Path:
    """获取参考音频路径"""
    char_data = state.models.get(character)
    if not char_data:
        return None
    
    base_path = Path(CONFIG['models']['base_path'])
    ref_path = base_path / char_data['references']['default']
    return ref_path

@app.post("/tts")
async def text_to_speech(request: TTSRequest, background_tasks: BackgroundTasks):
    """文本转语音接口"""
    logger.info(f"TTS request: {request.text[:50]}... character: {request.character}")
    
    if request.character not in state.models:
        raise HTTPException(status_code=400, detail=f"Character not found: {request.character}")
    
    max_len = CONFIG['inference']['output']['max_text_length']
    if len(request.text) > max_len:
        raise HTTPException(status_code=400, detail=f"Text too long, max {max_len} chars")
    
    # 如果GPT-SoVITS服务可用，转发请求
    if state.gpt_sovits_available:
        try:
            ref_path = get_ref_audio_path(request.character, request.emotion)
            if not ref_path or not ref_path.exists():
                raise HTTPException(status_code=400, detail="Reference audio not found")
            
            # 构建GPT-SoVITS API请求
            gsv_request = {
                "text": request.text,
                "text_lang": request.language,
                "ref_audio_path": str(ref_path.absolute()),
                "prompt_text": "",
                "prompt_lang": request.language,
                "top_k": 5,
                "top_p": 1.0,
                "temperature": 1.0,
                "text_split_method": "cut5",
                "batch_size": 1,
                "speed_factor": request.speed,
                "streaming_mode": False,
            }
            
            # 调用GPT-SoVITS API
            response = requests.post(
                f"{GSV_API_URL}/tts",
                json=gsv_request,
                timeout=120
            )
            
            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"GPT-SoVITS API error: {error_detail}")
                raise HTTPException(status_code=500, detail=f"TTS generation failed: {error_detail}")
            
            # 保存音频文件
            output_id = str(uuid.uuid4())[:8]
            output_path = state.temp_dir / f"{output_id}.wav"
            
            with open(output_path, "wb") as f:
                f.write(response.content)
            
            # 估算时长（粗略计算）
            duration = len(request.text) * 0.3  # 大约每秒3-4个字符
            
            audio_filename = output_path.name
            audio_url = f"/audio/{audio_filename}"
            
            background_tasks.add_task(cleanup_old_files)
            
            return TTSResponse(
                success=True,
                audio_url=audio_url,
                duration=duration,
                message="Success"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"TTS failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Mock模式
        return await generate_audio_mock(request)

async def generate_audio_mock(request: TTSRequest) -> TTSResponse:
    """模拟生成音频（用于测试）"""
    import time
    
    time.sleep(0.5)
    
    output_id = str(uuid.uuid4())[:8]
    output_path = state.temp_dir / f"{output_id}.mp3"
    
    # 复制参考音频作为占位
    char_data = state.models[request.character]
    ref_path = Path(CONFIG['models']['base_path']) / char_data['references']['default']
    
    if ref_path.exists():
        import shutil
        shutil.copy(ref_path, output_path)
        duration = 3.0
    else:
        output_path.touch()
        duration = 1.0
    
    audio_filename = output_path.name
    audio_url = f"/audio/{audio_filename}"
    
    return TTSResponse(
        success=True,
        audio_url=audio_url,
        duration=duration,
        message="Mock mode"
    )

@app.get("/audio/{filename}")
async def get_audio(filename: str):
    """获取音频文件"""
    audio_path = state.temp_dir / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    
    return FileResponse(
        audio_path,
        media_type="audio/wav",
        filename=filename
    )

async def cleanup_old_files():
    """清理临时文件"""
    try:
        current_time = datetime.now()
        for file in state.temp_dir.glob("*"):
            if file.is_file():
                file_time = datetime.fromtimestamp(file.stat().st_mtime)
                if (current_time - file_time).total_seconds() > 3600:  # 删除1小时前的文件
                    file.unlink()
                    logger.debug(f"Cleaned up: {file}")
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")

# ============== 主入口 ==============

if __name__ == "__main__":
    config = CONFIG['service']
    uvicorn.run(
        "main:app",
        host=config['host'],
        port=config['port'],
        reload=config['debug']
    )

# ============== 千问 TTS 代理端点 ==============
from qwen_tts import generate_qwen_tts

@app.post("/tts/qwen")
async def text_to_speech_qwen(request: TTSRequest, background_tasks: BackgroundTasks):
    """通义千问 TTS 代理（解决 CORS）"""
    logger.info(f"[Qwen TTS] Request: {request.text[:50]}...")
    
    success, result, message = generate_qwen_tts(
        text=request.text,
        voice="zhimeng",
        speed=request.speed
    )
    
    if success:
        output_path = Path(result)
        audio_filename = output_path.name
        audio_url = f"/audio/{audio_filename}"
        
        background_tasks.add_task(cleanup_old_files)
        
        return TTSResponse(
            success=True,
            audio_url=audio_url,
            duration=len(request.text) * 0.3,
            message=message
        )
    else:
        raise HTTPException(status_code=500, detail=f"Qwen TTS failed: {result}")

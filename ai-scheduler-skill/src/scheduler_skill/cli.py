"""
命令行接口

提供便捷的命令行工具管理调度器
"""

import argparse
import asyncio
import sys
from pathlib import Path

from .core.scheduler import HybridScheduler
from .core.config import SchedulerConfig


def main():
    """主入口"""
    parser = argparse.ArgumentParser(
        description="AI Scheduler Skill - 统一混合调度系统",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 启动MCP服务器
  scheduler-skill mcp --config scheduler.yaml
  
  # 启动API服务
  scheduler-skill api --config scheduler.yaml --port 8000
  
  # 验证配置文件
  scheduler-skill validate --config scheduler.yaml
  
  # 生成默认配置
  scheduler-skill init --output scheduler.yaml
        """
    )
    
    parser.add_argument(
        "--config", "-c",
        default="scheduler.yaml",
        help="配置文件路径 (默认: scheduler.yaml)"
    )
    parser.add_argument(
        "--version", "-v",
        action="version",
        version="%(prog)s 1.0.0"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="可用命令")
    
    # mcp命令
    mcp_parser = subparsers.add_parser(
        "mcp",
        help="启动MCP服务器"
    )
    mcp_parser.add_argument(
        "--transport",
        default="stdio",
        choices=["stdio", "sse"],
        help="传输方式 (默认: stdio)"
    )
    
    # api命令
    api_parser = subparsers.add_parser(
        "api",
        help="启动REST API服务"
    )
    api_parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="监听地址 (默认: 0.0.0.0)"
    )
    api_parser.add_argument(
        "--port", "-p",
        type=int,
        default=8000,
        help="监听端口 (默认: 8000)"
    )
    
    # validate命令
    validate_parser = subparsers.add_parser(
        "validate",
        help="验证配置文件"
    )
    
    # init命令
    init_parser = subparsers.add_parser(
        "init",
        help="生成默认配置文件"
    )
    init_parser.add_argument(
        "--output", "-o",
        default="scheduler.yaml",
        help="输出文件路径 (默认: scheduler.yaml)"
    )
    
    # run命令 - 直接运行Python文件
    run_parser = subparsers.add_parser(
        "run",
        help="运行Python调度脚本"
    )
    run_parser.add_argument(
        "script",
        help="Python脚本路径"
    )
    
    # dashboard命令
    dashboard_parser = subparsers.add_parser(
        "dashboard",
        help="启动监控面板"
    )
    dashboard_parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="面板端口 (默认: 8080)"
    )
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == "mcp":
        from .mcp.server import MCPServer
        server = MCPServer(config_path=args.config)
        asyncio.run(server.run())
    
    elif args.command == "api":
        from .api.server import APIServer
        
        if not Path(args.config).exists():
            print(f"配置文件不存在: {args.config}")
            print("创建默认配置...")
            config = SchedulerConfig()
            config.api_host = args.host
            config.api_port = args.port
            config.to_yaml(args.config)
        
        server = APIServer.from_config(args.config)
        asyncio.run(server.start())
    
    elif args.command == "validate":
        validate_config(args.config)
    
    elif args.command == "init":
        init_config(args.output)
    
    elif args.command == "run":
        run_script(args.script)
    
    elif args.command == "dashboard":
        start_dashboard(args.config, args.port)


def validate_config(config_path: str):
    """验证配置文件"""
    try:
        config = SchedulerConfig.from_yaml(config_path)
        print(f"✅ 配置文件验证通过: {config_path}")
        print(f"\n配置摘要:")
        print(f"  - 存储类型: {config.storage.type}")
        print(f"  - 状态目录: {config.state_dir}")
        print(f"  - API端口: {config.api_port}")
        print(f"  - 任务数量: {len(config.tasks)}")
        
        if config.tasks:
            print(f"\n任务列表:")
            for task in config.tasks:
                print(f"  - {task.name} ({task.mode.value})")
        
        return True
    except Exception as e:
        print(f"❌ 配置文件验证失败: {e}")
        return False


def init_config(output_path: str):
    """生成默认配置文件"""
    config = SchedulerConfig()
    config.to_yaml(output_path)
    print(f"✅ 默认配置文件已生成: {output_path}")
    print(f"\n接下来:")
    print(f"  1. 编辑 {output_path} 配置你的任务")
    print(f"  2. 运行: scheduler-skill mcp -c {output_path}")
    print(f"  3. 或使用: scheduler-skill api -c {output_path}")


def run_script(script_path: str):
    """运行Python脚本"""
    import importlib.util
    
    if not Path(script_path).exists():
        print(f"❌ 脚本不存在: {script_path}")
        return
    
    spec = importlib.util.spec_from_file_location("user_script", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


def start_dashboard(config_path: str, port: int):
    """启动监控面板"""
    try:
        from flask import Flask, render_template, jsonify
        import json
        
        app = Flask(__name__)
        
        state_dir = Path(".scheduler_state")
        
        @app.route("/")
        def index():
            return """
<!DOCTYPE html>
<html>
<head>
    <title>AI Scheduler Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .stat { display: inline-block; margin: 10px; padding: 15px; background: #f0f0f0; border-radius: 8px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #333; }
        .stat-label { font-size: 12px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #4CAF50; color: white; }
        tr:hover { background: #f5f5f5; }
        .status-idle { color: green; }
        .status-running { color: orange; }
        .status-error { color: red; }
    </style>
</head>
<body>
    <h1>🤖 AI Scheduler Dashboard</h1>
    
    <div id="stats">
        <div class="stat">
            <div class="stat-value" id="total-tasks">-</div>
            <div class="stat-label">总任务</div>
        </div>
        <div class="stat">
            <div class="stat-value" id="running-tasks">-</div>
            <div class="stat-label">运行中</div>
        </div>
        <div class="stat">
            <div class="stat-value" id="failed-tasks">-</div>
            <div class="stat-label">异常</div>
        </div>
    </div>
    
    <h2>任务列表</h2>
    <table id="tasks-table">
        <thead>
            <tr>
                <th>名称</th>
                <th>模式</th>
                <th>状态</th>
                <th>调度</th>
                <th>执行次数</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
    
    <script>
        async function refresh() {
            const res = await fetch('/api/stats');
            const data = await res.json();
            
            document.getElementById('total-tasks').textContent = data.total_tasks;
            document.getElementById('running-tasks').textContent = data.running_tasks;
            document.getElementById('failed-tasks').textContent = data.failed_tasks;
        }
        
        setInterval(refresh, 5000);
        refresh();
    </script>
</body>
</html>
            """
        
        @app.route("/api/stats")
        def stats():
            from ..core.state import StateManager
            state = StateManager(str(state_dir))
            return jsonify(state.get_dashboard_data())
        
        print(f"🚀 Dashboard 启动于 http://localhost:{port}")
        app.run(host="0.0.0.0", port=port, debug=False)
        
    except ImportError:
        print("❌ 需要安装flask: pip install flask")


if __name__ == "__main__":
    main()

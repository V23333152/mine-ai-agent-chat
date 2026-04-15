#!/usr/bin/env python3
"""
MCP Scheduler Wrapper
用于通过 PYTHONPATH 方式加载 ai-scheduler-skill
"""

import sys
import os

# 添加 ai-scheduler-skill 到 Python 路径
# 支持环境变量配置，便于 Docker 部署
SCHEDULER_SKILL_PATH = os.getenv(
    "SCHEDULER_SKILL_PATH",
    r"D:\IT\AI智能体\ai-scheduler-skill\src"
)
sys.path.insert(0, SCHEDULER_SKILL_PATH)

# 首先加载 .env 文件（如果存在）
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    print(f"[MCP Scheduler] Loading .env from: {env_path}")
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key not in os.environ:
                    os.environ[key] = value
                    print(f"[MCP Scheduler] Loaded env: {key}={'*' * len(value) if 'KEY' in key or 'API' in key else value}")
else:
    print(f"[MCP Scheduler] No .env file found at: {env_path}")

# 设置默认配置路径
if not os.getenv("SCHEDULER_CONFIG"):
    os.environ["SCHEDULER_CONFIG"] = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "scheduler.yaml"
    )

# 启动 MCP 服务器
from scheduler_skill.mcp.server import MCPServer
import asyncio

if __name__ == "__main__":
    print(f"[MCP Scheduler] Starting...")
    print(f"[MCP Scheduler] Python path added: {SCHEDULER_SKILL_PATH}")
    print(f"[MCP Scheduler] Config path: {os.environ['SCHEDULER_CONFIG']}")

    # 调试：检查搜索API配置
    if os.getenv("TAVILY_API_KEY"):
        print(f"[MCP Scheduler] TAVILY_API_KEY is set (length: {len(os.getenv('TAVILY_API_KEY'))})")
    else:
        print(f"[MCP Scheduler] WARNING: TAVILY_API_KEY is NOT set")

    # 调试：打印所有相关环境变量
    env_keys = [k for k in os.environ.keys() if "API" in k or "KEY" in k or "TAVILY" in k]
    print(f"[MCP Scheduler] API/KEY env vars: {env_keys}")

    server = MCPServer()
    asyncio.run(server.run())

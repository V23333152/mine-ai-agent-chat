# AI Scheduler Skill - Docker 镜像
# 支持 MCP 模式和 API 模式

FROM python:3.11-slim

LABEL maintainer="AI Scheduler Team"
LABEL description="AI Scheduler Skill with MCP support"

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY pyproject.toml ./
COPY README.md ./
COPY src/ ./src/

# 安装 Python 依赖（包含 LLM 支持）
RUN pip install --no-cache-dir -e ".[llm]"

# 创建数据目录
RUN mkdir -p /app/data /app/config /app/logs

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV SCHEDULER_CONFIG=/app/config/scheduler.yaml
ENV SCHEDULER_DATA_DIR=/app/data
ENV SCHEDULER_LOG_DIR=/app/logs

# 暴露端口
# 8000: API 服务
# 8765: WebSocket 通知
EXPOSE 8000 8765

# 健康检查（使用标准库）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/stats', timeout=5)" || exit 1

# 复制入口脚本
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 启动命令
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["mcp"]

# AI Scheduler Skill - Docker 部署指南

## 快速开始

### 1. 准备环境

```bash
# 克隆项目
git clone <repository-url>
cd ai-scheduler-skill

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API Keys
vi .env
```

### 2. 构建镜像

```bash
# 构建镜像
docker build -t ai-scheduler:latest .

# 或直接使用 docker-compose
docker-compose build
```

### 3. 运行服务

#### 方式一：使用 docker-compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f scheduler-mcp

# 停止服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

#### 方式二：使用 docker run

```bash
# 运行 MCP 服务
docker run -d \
  --name ai-scheduler \
  -e MOONSHOT_API_KEY=your_key \
  -e TAVILY_API_KEY=your_key \
  -v $(pwd)/config:/app/config:ro \
  -v scheduler-data:/app/data \
  -p 8765:8765 \
  ai-scheduler:latest mcp

# 运行 API 服务
docker run -d \
  --name ai-scheduler-api \
  -e MOONSHOT_API_KEY=your_key \
  -e TAVILY_API_KEY=your_key \
  -v $(pwd)/config:/app/config:ro \
  -v scheduler-data:/app/data \
  -p 8000:8000 \
  ai-scheduler:latest api --host 0.0.0.0
```

## 目录结构

```
ai-scheduler-skill/
├── config/              # 配置文件目录（挂载为只读）
│   └── scheduler.yaml   # 调度器配置
├── data/                # 数据目录（Docker 卷持久化）
├── logs/                # 日志目录（挂载到主机）
├── docker-compose.yml   # Docker Compose 配置
├── Dockerfile           # Docker 镜像构建
├── .env                 # 环境变量（不提交到 Git）
└── .env.example         # 环境变量模板
```

## 环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `MOONSHOT_API_KEY` | 是 | Moonshot/Kimi API Key |
| `TAVILY_API_KEY` | 是 | Tavily 搜索 API Key |
| `AMAP_WEBSERVICE_KEY` | 否 | 高德地图 API Key（天气功能） |
| `LOG_LEVEL` | 否 | 日志级别: DEBUG/INFO/WARNING/ERROR |
| `API_PORT` | 否 | API 服务端口，默认 8000 |
| `NOTIFY_UI_PORT` | 否 | WebSocket 端口，默认 8765 |

## 常用命令

### 查看日志

```bash
# 查看 MCP 服务日志
docker-compose logs -f scheduler-mcp

# 查看 API 服务日志
docker-compose logs -f scheduler-api

# 查看所有日志
docker-compose logs -f
```

### 更新配置

```bash
# 修改 config/scheduler.yaml 后重启
docker-compose restart

# 或只重启特定服务
docker-compose restart scheduler-mcp
```

### 备份数据

```bash
# 备份 SQLite 数据库
docker cp ai-scheduler-mcp:/app/data/scheduler.db ./backup-$(date +%Y%m%d).db

# 或使用卷备份
docker run --rm -v scheduler-data:/data -v $(pwd):/backup alpine tar czf /backup/scheduler-backup.tar.gz -C /data .
```

### 进入容器调试

```bash
# 进入容器 shell
docker exec -it ai-scheduler-mcp bash

# 检查环境变量
docker exec ai-scheduler-mcp env | grep -E 'KEY|API'

# 测试 API 连接
docker exec -it ai-scheduler-mcp python -c "
import os
from scheduler_skill.connectors.unified import UnifiedLLMClient
from scheduler_skill.core.config import ModelConfig

config = ModelConfig(
    provider='openai',
    model='kimi-k2.5',
    api_key=os.getenv('MOONSHOT_API_KEY'),
    base_url='https://api.moonshot.cn/v1',
    temperature=1.0
)
client = UnifiedLLMClient(config)
import asyncio
result = asyncio.run(client.generate('你好'))
print(result)
"
```

## 故障排查

### 问题：容器启动后立即退出

```bash
# 检查日志
docker-compose logs scheduler-mcp

# 常见原因：
# 1. API Key 未设置
# 2. 配置文件路径错误
# 3. 端口被占用
```

### 问题：无法连接到 WebSocket

```bash
# 检查端口映射
docker-compose ps

# 检查防火墙
curl http://localhost:8765

# 查看 WebSocket 日志
docker-compose logs scheduler-mcp | grep -i websocket
```

### 问题：任务执行超时

```bash
# 检查日志中的耗时
docker-compose logs scheduler-mcp | grep -E "TIMEOUT|耗时"

# 调整配置：减少任务数量或增加超时时间
vi config/scheduler.yaml
```

## 多平台支持

### 构建多平台镜像

```bash
# 使用 buildx 构建多平台镜像
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/ai-scheduler:latest \
  --push .
```

### 不同平台运行

```bash
# Linux AMD64
docker run -d --platform linux/amd64 ai-scheduler:latest

# Linux ARM64 (树莓派/Apple Silicon)
docker run -d --platform linux/arm64 ai-scheduler:latest
```

## 生产环境建议

1. **使用外部数据库**：将 SQLite 替换为 PostgreSQL
2. **配置反向代理**：使用 Nginx/Caddy 处理 HTTPS
3. **设置监控**：集成 Prometheus/Grafana 监控
4. **日志收集**：使用 ELK 或 Loki 集中管理日志
5. **自动重启**：配置 Docker 自动重启策略

## 参考链接

- [Docker 文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Moonshot API](https://platform.moonshot.cn/)
- [Tavily API](https://app.tavily.com)

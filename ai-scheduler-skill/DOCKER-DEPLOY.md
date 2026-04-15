# AI Scheduler Skill - Docker 部署清单

## 已创建的文件

### Docker 核心文件
- `Dockerfile` - 多阶段构建的 Docker 镜像定义
- `docker-compose.yml` - 多服务编排配置（MCP + API + UI）
- `.dockerignore` - 构建忽略规则
- `docker-entrypoint.sh` - 容器入口脚本

### 配置文件
- `.env.example` - 环境变量模板
- `config/scheduler.yaml` - 默认调度器配置

### 管理脚本
- `start-docker.sh` - 交互式管理脚本
- `test-docker.sh` - 配置验证脚本

### 文档
- `DOCKER.md` - 完整部署文档
- `DOCKER-DEPLOY.md` - 本清单
- `CODESPACES.md` - GitHub Codespaces 测试指南

### GitHub Codespaces 配置
- `.devcontainer/devcontainer.json` - Codespaces 开发容器配置
- `.devcontainer/post-create.sh` - 容器创建后初始化脚本
- `.devcontainer/post-start.sh` - 容器启动后脚本
- `.github/workflows/docker-test.yml` - CI/CD 自动化测试
- `docs/test-api.html` - 浏览器 API 测试页面

## 快速部署步骤

### 1. 准备（在 ai-scheduler-skill 目录）

```bash
cd /d/IT/新项目/ai-scheduler-skill

# 运行测试
./test-docker.sh

# 复制环境变量
cp .env.example .env

# 编辑环境变量
vi .env
```

### 2. 配置环境变量

编辑 `.env` 文件：

```bash
MOONSHOT_API_KEY=your_moonshot_key_here
TAVILY_API_KEY=your_tavily_key_here
AMAP_WEBSERVICE_KEY=your_amap_key_here  # 可选
```

### 3. 构建和运行

```bash
# 使用管理脚本
./start-docker.sh

# 或手动操作
docker-compose up -d
docker-compose logs -f
```

## 服务说明

### scheduler-mcp（主要服务）
- **模式**: MCP stdio 模式
- **端口**: 8765 (WebSocket 通知)
- **用途**: 与前端 Skill 通信
- **必需**: 是

### scheduler-api（可选）
- **模式**: REST API
- **端口**: 8000
- **用途**: 独立 API 访问
- **必需**: 否

### scheduler-ui（可选）
- **模式**: 通知界面
- **端口**: 3000
- **用途**: Web 通知展示
- **必需**: 否

## 数据持久化

| 路径 | 说明 | 持久化方式 |
|------|------|-----------|
| `/app/data` | SQLite 数据库 | Docker 卷 `scheduler-data` |
| `/app/logs` | 日志文件 | 挂载到主机 `./logs` |
| `/app/config` | 配置文件 | 只读挂载 `./config` |

## 常见问题

### Q: 容器启动后立即退出？
A: 检查 `.env` 文件是否正确配置 API Keys
```bash
docker-compose logs scheduler-mcp
```

### Q: 如何更新配置？
A: 修改 `config/scheduler.yaml` 后重启
```bash
docker-compose restart
```

### Q: 如何查看任务执行日志？
A: 
```bash
docker-compose logs -f scheduler-mcp | grep "Task Handler"
```

### Q: 如何备份数据？
A: 使用管理脚本
```bash
./start-docker.sh  # 选择选项 7
```

## 与前端集成

### 修改前端配置

编辑 `d:/IT/AI智能体/my-chat-ui/apps/agents/mcp_scheduler_wrapper.py`:

```python
# 使用环境变量配置路径
SCHEDULER_SKILL_PATH = os.getenv(
    "SCHEDULER_SKILL_PATH",
    r"d:\IT\新项目\ai-scheduler-skill\src"
)
```

### 前端环境变量

在 `d:/IT/AI智能体/my-chat-ui/apps/agents/.env` 添加：

```bash
# 使用 Docker 部署的调度器
SCHEDULER_DOCKER_MODE=true
SCHEDULER_API_URL=http://localhost:8000
```

## 生产环境建议

1. **使用反向代理**: Nginx/Caddy 处理 HTTPS
2. **数据库**: SQLite → PostgreSQL
3. **监控**: 添加 Prometheus 指标
4. **日志**: 集中化日志收集
5. **备份**: 定期自动备份数据卷

## 升级步骤

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建
docker-compose build --no-cache

# 3. 重启服务
docker-compose up -d

# 4. 验证状态
docker-compose ps
```

## 卸载

```bash
# 停止并删除容器
docker-compose down

# 删除数据卷（谨慎！）
docker-compose down -v

# 删除镜像
docker rmi ai-scheduler:latest
```

## 在浏览器中测试（GitHub Codespaces）

### 快速启动

1. **点击此按钮启动 Codespaces**:
   
   [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=YOUR_REPO_NAME)

2. **等待环境初始化**（约 2-3 分钟）
   - 容器会自动安装 Docker、Python 依赖
   - 端口会自动转发到浏览器

3. **配置 API Keys**:
   ```bash
   # 编辑 .env 文件
   nano .env
   # 或
   code .env
   ```

4. **运行测试**:
   ```bash
   ./test-docker.sh
   ```

5. **启动服务**:
   ```bash
   ./start-docker.sh
   # 或
   docker-compose up -d
   ```

6. **访问服务**:
   - 点击 VS Code 底部的 "端口" 标签
   - 找到端口 8000 (API) 或 8765 (WebSocket)
   - 点击 "在浏览器中打开"

7. **使用 API 测试页面**:
   ```bash
   # 在 Codespaces 终端启动 HTTP 服务器
   python -m http.server 8080 --directory docs/
   
   # 然后打开 "端口" 面板中的 8080 端口链接
   # 访问 test-api.html 进行可视化 API 测试
   ```

### 手动创建 Codespaces

1. 打开 GitHub 仓库页面
2. 点击绿色 "<> Code" 按钮
3. 选择 "Codespaces" 标签
4. 点击 "Create codespace on main"

### Codespaces 功能

- ✅ **Docker-in-Docker**: 容器内可直接运行 Docker
- ✅ **自动端口转发**: 本地端口自动映射到浏览器
- ✅ **预装工具**: Python、Node.js、Docker Compose、GitHub CLI
- ✅ **VS Code 扩展**: Python、Docker、YAML 语法高亮

---

**部署完成！** 🎉

现在可以通过 `./start-docker.sh` 管理你的 AI Scheduler 服务了。

或在浏览器中通过 [GitHub Codespaces](https://github.com/codespaces) 直接测试！

# GitHub Codespaces 测试指南

本指南介绍如何在浏览器中使用 GitHub Codespaces 测试 AI Scheduler Skill 的 Docker 容器化部署。

## 🚀 快速开始

### 方式一：一键启动（推荐）

1. 将代码推送到 GitHub 仓库
2. 访问: `https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=YOUR_REPO_ID`
3. 等待环境初始化完成

### 方式二：从 GitHub 界面创建

1. 打开你的 GitHub 仓库
2. 点击绿色 **<> Code** 按钮
3. 切换到 **Codespaces** 标签
4. 点击 **"Create codespace on main"**

## 📋 初始化流程

创建 Codespace 后，会自动执行以下步骤：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   创建容器       │────>│  安装依赖        │────>│  配置环境        │
│  (约 1-2 分钟)  │     │ Python/Docker   │     │  .env / 目录    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   开始测试       │<────│  启动服务        │<────│  准备就绪        │
│ ./test-docker.sh│     │ docker-compose  │     │  显示提示        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 🔧 测试步骤

### 1. 配置 API Keys

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件（使用 VS Code 编辑器）
code .env
```

填入你的 API Keys：
```env
MOONSHOT_API_KEY=your_moonshot_key_here
TAVILY_API_KEY=your_tavily_key_here
AMAP_WEBSERVICE_KEY=your_amap_key_here  # 可选
```

### 2. 运行配置测试

```bash
./test-docker.sh
```

预期输出：
```
========================================
Docker 配置测试
========================================

[TEST 1] 检查必要文件...
  ✓ Dockerfile 存在
  ✓ docker-compose.yml 存在
  ✓ .env.example 存在
  ✓ docker-entrypoint.sh 存在
  ✓ config/scheduler.yaml 存在

[TEST 2] 检查环境变量模板...
  ✓ 必需变量已定义

[TEST 3] 检查 Dockerfile 语法...
  ✓ Dockerfile 语法正确

[TEST 4] 检查配置文件...
  ✓ 配置文件结构正确

[TEST 5] 检查入口脚本...
  ✓ 入口脚本可执行

[TEST 6] 验证 docker-compose 配置...
  ✓ docker-compose.yml 语法正确

========================================
所有测试通过!
========================================
```

### 3. 启动服务

**方式 A：交互式管理脚本**
```bash
./start-docker.sh
```

**方式 B：直接启动**
```bash
docker-compose up -d
```

### 4. 验证服务状态

```bash
# 查看运行中的容器
docker-compose ps

# 查看日志
docker-compose logs -f scheduler-mcp
```

## 🌐 访问服务

Codespaces 会自动转发端口到浏览器：

| 服务 | 端口 | 访问方式 |
|------|------|---------|
| API | 8000 | 点击 "端口" 面板中的链接 |
| WebSocket | 8765 | 自动转发，无需手动访问 |
| UI | 3000 | 点击 "端口" 面板中的链接 |

### 如何访问：

1. 在 VS Code 底部找到 **"端口"** 标签
2. 找到对应端口的行
3. 点击 **"在浏览器中打开"** 图标 🌐

或直接在浏览器访问：
```
https://YOUR_CODESPACE_NAME-8000.github.dev/
```

## 🧪 API 测试

### 测试健康检查

```bash
curl http://localhost:8000/api/v1/stats
```

### 测试创建任务

```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试任务",
    "schedule": "*/5 * * * *",
    "skill_name": "news_search",
    "arguments": {"query": "科技新闻"}
  }'
```

## 📊 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 只看 MCP 服务
docker-compose logs -f scheduler-mcp

# 只看最近 100 行
docker-compose logs --tail=100 scheduler-mcp
```

## 🔄 重启/停止服务

```bash
# 重启
docker-compose restart

# 停止
docker-compose down

# 停止并删除数据（谨慎使用！）
docker-compose down -v
```

## 💡 常见问题

### Q: 端口无法访问？

A: 确保端口是 **Public** 可见性：
1. 在 "端口" 面板找到对应端口
2. 右键 → "端口可见性" → "Public"

### Q: 容器启动后退出？

A: 检查日志查看错误：
```bash
docker-compose logs scheduler-mcp
```

常见原因：
- `.env` 文件中的 API Keys 未配置
- 端口冲突

### Q: 如何持久化数据？

A: Codespaces 关闭后数据会丢失。如需持久化：
1. 将数据导出到 GitHub
2. 或使用 GitHub Secrets 存储配置

### Q: 免费额度限制？

A: GitHub Codespaces 免费额度：
- 个人账户：每月 120 核时 + 15GB 存储
- 超出后需要付费或等待下月重置

## 📁 相关文件

- `.devcontainer/devcontainer.json` - 容器配置
- `.devcontainer/post-create.sh` - 初始化脚本
- `.github/workflows/docker-test.yml` - CI/CD 测试
- `docker-compose.yml` - 服务编排
- `Dockerfile` - 镜像定义

## 🎉 下一步

测试成功后，你可以：
1. 将代码推送到 GitHub
2. 在本地环境部署
3. 与前端项目集成
4. 配置 GitHub Actions 自动化测试

---

**有问题？** 查看 `DOCKER.md` 获取完整文档。

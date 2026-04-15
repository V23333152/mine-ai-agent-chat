# AI Scheduler Skill - 可移植性测试脚本

本目录包含用于测试 AI Scheduler Skill 项目可移植性的自动化脚本。

## 测试脚本说明

### 1. test-portability.sh (Linux/macOS)

**快速测试** (2-3分钟):
```bash
./scripts/test-portability.sh
# 或
./scripts/test-portability.sh --quick
```

**完整测试** (10-15分钟):
```bash
./scripts/test-portability.sh --full
```

**测试内容**:
- 从 GitHub 克隆仓库
- 文件完整性检查
- Python 环境兼容性
- Docker 环境检查
- 镜像构建测试
- Python 包安装
- 模块导入测试
- 基本功能验证

### 2. test-portability.ps1 (Windows)

**快速测试**:
```powershell
.\scripts\test-portability.ps1
# 或
.\scripts\test-portability.ps1 -Quick
```

**完整测试**:
```powershell
.\scripts\test-portability.ps1 -Full
```

## 一键测试命令

### Linux/macOS
```bash
curl -fsSL https://raw.githubusercontent.com/V23333152/ai-scheduler-skill/main/scripts/test-portability.sh | bash
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/V23333152/ai-scheduler-skill/main/scripts/test-portability.ps1 | iex
```

## 测试输出

测试完成后会生成以下文件：
- `report.md` - 人类可读的测试报告
- `results.json` - 机器可读的测试结果

## CI/CD 集成

GitHub Actions 工作流已配置，会自动在以下场景运行测试：
- 每次 Pull Request
- 推送到 main/master 分支
- 每周一定时运行

## 可移植性评分标准

| 分数 | 评级 | 说明 |
|-----|------|-----|
| 90-100 | ⭐⭐⭐⭐⭐ | 优秀 - 完全兼容 |
| 75-89 | ⭐⭐⭐⭐ | 良好 - 基本兼容，小问题 |
| 60-74 | ⭐⭐⭐ | 一般 - 需要调整配置 |
| < 60 | ⭐⭐ | 差 - 存在兼容性问题 |

## 常见问题

### Q: 测试需要多长时间？
- 快速测试：2-3分钟
- 完整测试：10-15分钟

### Q: 没有 Docker 可以测试吗？
可以！脚本会自动检测 Docker 是否安装，如果没有会跳过相关测试。

### Q: 测试失败怎么办？
1. 查看生成的 `report.md` 了解详细错误信息
2. 检查日志文件（位于 `/tmp/ai-scheduler-test-*`）
3. 确认系统满足最低要求（Python 3.9+）

### Q: 如何贡献新的测试？
1. Fork 仓库
2. 在 `scripts/` 目录添加新的测试脚本
3. 更新 `.github/workflows/portability-test.yml`
4. 提交 Pull Request

## 测试矩阵

### 已验证平台
- ✅ Ubuntu 20.04/22.04
- ✅ macOS 13/14
- ✅ Windows 10/11
- ✅ Debian 12
- ✅ Alpine Linux (Docker)

### 已验证部署方式
- ✅ MCP 工具模式
- ✅ Python SDK 模式
- ✅ Docker 单容器
- ✅ Docker Compose
- ✅ 源码安装

## 联系

如有问题请提交 Issue: https://github.com/V23333152/ai-scheduler-skill/issues

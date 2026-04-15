# Notify UI - 任务通知界面

当任务触发时自动打开浏览器界面显示 AI 对话内容。

## 功能特性

- 🔔 任务触发时自动弹出浏览器界面
- 💬 实时显示 AI 对话内容
- 🎨 美观的渐变 UI 设计
- 🔊 消息到达时播放提示音
- 📱 响应式设计，支持移动端
- ⚡ WebSocket 实时通信
- 🔄 自动重连机制

## 使用方法

### 1. 配置启用

在 `scheduler.yaml` 中添加：

```yaml
notify_ui:
  enabled: true              # 启用通知界面
  port: 8765                 # WebSocket 服务器端口
  auto_open_browser: true    # 自动打开浏览器
```

### 2. 启动调度器

```bash
python -m scheduler_skill.mcp
```

任务触发时会自动：
1. 启动 WebSocket 服务器 (默认端口 8765)
2. 打开浏览器访问界面
3. 发送任务通知和 AI 回复到界面

### 3. 访问界面

手动打开浏览器访问：
```
http://localhost:8765
```

## 界面预览

界面分为三种消息类型：

- **蓝色 (info)** - 任务开始执行
- **绿色 (success)** - 任务执行成功，显示 AI 回复
- **红色 (error)** - 任务执行失败

## 可移植性

此模块与 `ai-scheduler-skill` 项目绑定：

- 跨项目使用时自动随调度器启动
- 无需额外安装，依赖已包含
- 支持 Windows/macOS/Linux
- 可作为系统托盘应用（未来版本）

## API

```python
from scheduler_skill.notify_ui import notify_manager

# 发送自定义通知
await notify_manager.send_notification(
    title="标题",
    content="内容",
    task_name="任务名",
    msg_type="info"  # info/success/warning/error
)

# 任务生命周期通知
await notify_manager.send_task_start("任务名", "提示词")
await notify_manager.send_task_result("任务名", "执行结果")
await notify_manager.send_task_error("任务名", "错误信息")
```

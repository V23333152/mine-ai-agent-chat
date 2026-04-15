"""
通知界面模块 - 任务触发时打开前端界面显示对话

使用方式:
    # 在 scheduler.yaml 中配置
    notify_ui:
      enabled: true
      port: 8765
      auto_open_browser: true

    # 任务执行时会自动:
    # 1. 启动 WebSocket 服务器
    # 2. 打开浏览器界面 (如果配置了 auto_open_browser)
    # 3. 发送对话内容到界面
"""

from .server import NotifyUIServer, notify_manager

__all__ = ["NotifyUIServer", "notify_manager"]

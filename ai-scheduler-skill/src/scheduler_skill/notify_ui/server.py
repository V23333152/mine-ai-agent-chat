"""
通知界面服务器 - WebSocket 实时通信
"""

import asyncio
import json
import logging
import os
import webbrowser
from pathlib import Path
from typing import Dict, Set, Optional
from datetime import datetime
import aiohttp
from aiohttp import web

logger = logging.getLogger("scheduler_skill.notify_ui")


class NotifyManager:
    """通知管理器 - 管理 WebSocket 连接和消息发送"""

    def __init__(self, port: int = 8765):
        self.port = port
        self.websockets: Set[web.WebSocketResponse] = set()
        self.server: Optional[web.AppRunner] = None
        self.site: Optional[web.TCPSite] = None
        self._running = False
        self._static_dir = Path(__file__).parent / "static"

    async def start(self, auto_open_browser: bool = True):
        """启动 WebSocket 服务器"""
        if self._running:
            return

        app = web.Application()
        app.router.add_get("/ws", self._handle_websocket)
        app.router.add_get("/", self._handle_index)
        app.router.add_static("/static", self._static_dir)

        self.server = web.AppRunner(app)
        await self.server.setup()
        self.site = web.TCPSite(self.server, "localhost", self.port)
        await self.site.start()

        self._running = True
        logger.info(f"[NotifyUI] Server started at http://localhost:{self.port}")

        if auto_open_browser:
            self._open_browser()

    async def stop(self):
        """停止服务器"""
        if not self._running:
            return

        # 关闭所有 WebSocket 连接
        for ws in list(self.websockets):
            await ws.close()
        self.websockets.clear()

        if self.site:
            await self.site.stop()
        if self.server:
            await self.server.cleanup()

        self._running = False
        logger.info("[NotifyUI] Server stopped")

    def _open_browser(self):
        """打开浏览器"""
        url = f"http://localhost:{self.port}"
        try:
            webbrowser.open(url)
            logger.info(f"[NotifyUI] Opened browser: {url}")
        except Exception as e:
            logger.warning(f"[NotifyUI] Failed to open browser: {e}")

    async def _handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        """处理 WebSocket 连接"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self.websockets.add(ws)
        logger.info(f"[NotifyUI] Client connected, total: {len(self.websockets)}")

        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    # 处理客户端消息（如需要）
                    pass
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f"[NotifyUI] WS error: {ws.exception()}")
        finally:
            self.websockets.discard(ws)
            logger.info(f"[NotifyUI] Client disconnected, total: {len(self.websockets)}")

        return ws

    async def _handle_index(self, request: web.Request) -> web.Response:
        """提供首页"""
        index_file = self._static_dir / "index.html"
        if index_file.exists():
            with open(index_file, "r", encoding="utf-8") as f:
                content = f.read()
            return web.Response(text=content, content_type="text/html")
        return web.Response(text="UI not found", status=404)

    async def send_notification(self, title: str, content: str, task_name: str = "", msg_type: str = "info"):
        """
        发送通知到所有连接的客户端

        Args:
            title: 通知标题
            content: 通知内容
            task_name: 任务名称
            msg_type: 消息类型 (info/success/warning/error)
        """
        # 如果服务器未启动，尝试启动
        if not self._running:
            logger.info("[NotifyUI] Server not running, starting...")
            try:
                await self.start(auto_open_browser=True)
                await asyncio.sleep(3)  # 等待浏览器打开和连接
            except Exception as e:
                logger.error(f"[NotifyUI] Failed to start server: {e}")
                return
        
        # 如果没有连接，尝试打开浏览器并等待连接
        if not self.websockets:
            logger.warning("[NotifyUI] No clients connected, opening browser...")
            self._open_browser()
            # 等待客户端连接（最多5秒）
            for i in range(10):
                if self.websockets:
                    break
                await asyncio.sleep(0.5)

        message = {
            "type": "notification",
            "data": {
                "title": title,
                "content": content,
                "taskName": task_name,
                "msgType": msg_type,
                "timestamp": datetime.now().isoformat(),
            }
        }

        disconnected = set()
        for ws in self.websockets:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.error(f"[NotifyUI] Failed to send message: {e}")
                disconnected.add(ws)

        # 清理断开的连接
        self.websockets -= disconnected

        logger.info(f"[NotifyUI] Notification sent to {len(self.websockets)} clients")

    async def send_task_start(self, task_name: str, prompt: str):
        """发送任务开始通知"""
        await self.send_notification(
            title=f"⏰ 任务触发: {task_name}",
            content=f"正在执行: {prompt[:100]}..." if len(prompt) > 100 else f"正在执行: {prompt}",
            task_name=task_name,
            msg_type="info"
        )

    async def send_task_result(self, task_name: str, result: str):
        """发送任务结果"""
        await self.send_notification(
            title=f"✅ 任务完成: {task_name}",
            content=result,
            task_name=task_name,
            msg_type="success"
        )

    async def send_task_error(self, task_name: str, error: str):
        """发送任务错误"""
        await self.send_notification(
            title=f"❌ 任务失败: {task_name}",
            content=error,
            task_name=task_name,
            msg_type="error"
        )


# 全局通知管理器实例
notify_manager = NotifyManager()


class NotifyUIServer:
    """
    通知界面服务器封装类

    使用示例:
        server = NotifyUIServer(port=8765)
        await server.start(auto_open_browser=True)

        # 发送通知
        await server.notify("任务完成", "这是任务执行结果")
    """

    def __init__(self, port: int = 8765):
        self.port = port
        self._manager = NotifyManager(port)

    async def start(self, auto_open_browser: bool = True):
        """启动服务器"""
        await self._manager.start(auto_open_browser)

    async def stop(self):
        """停止服务器"""
        await self._manager.stop()

    async def notify(self, title: str, content: str, task_name: str = "", msg_type: str = "info"):
        """发送通知"""
        await self._manager.send_notification(title, content, task_name, msg_type)

    @property
    def is_running(self) -> bool:
        return self._manager._running

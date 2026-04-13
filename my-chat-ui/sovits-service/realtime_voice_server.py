"""
实时语音对话 WebSocket 服务器
支持：流式ASR -> LLM -> 流式TTS
"""
import os
import json
import base64
import asyncio
import logging
from typing import Optional
from datetime import datetime
from pathlib import Path

import websockets
from websockets.server import WebSocketServerProtocol
import aiohttp
import numpy as np

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API Keys
MOONSHOT_API_KEY = os.getenv("MOONSHOT_API_KEY", "")
MOONSHOT_BASE_URL = os.getenv("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1")
QWEN_API_KEY = "sk-e40494c523b74914aa9e40114a29032e"

# 音频配置
SAMPLE_RATE = 16000  # ASR要求的采样率
CHUNK_DURATION = 0.5  # 每次发送的音频时长（秒）
VAD_THRESHOLD = 0.02  # 语音活动检测阈值
SILENCE_TIMEOUT = 1.5  # 静音超时（秒）


class RealtimeVoiceSession:
    """实时语音会话管理"""
    
    def __init__(self, websocket: WebSocketServerProtocol):
        self.websocket = websocket
        self.session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 状态管理
        self.is_recording = False
        self.is_playing = False
        self.silence_start: Optional[datetime] = None
        
        # 音频缓冲区
        self.audio_buffer: list[bytes] = []
        self.buffer_lock = asyncio.Lock()
        
        # 对话历史
        self.messages: list[dict] = []
        
        # 任务管理
        self.tasks: list[asyncio.Task] = []
        
        logger.info(f"[{self.session_id}] 新会话创建")
    
    async def process_audio_chunk(self, audio_data: bytes) -> Optional[str]:
        """处理音频片段，检测语音并转录"""
        # 转换为numpy数组进行VAD检测
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # 计算音量
        volume = np.abs(audio_array).mean() / 32768.0
        
        if volume > VAD_THRESHOLD:
            # 有语音，添加到缓冲区
            async with self.buffer_lock:
                self.audio_buffer.append(audio_data)
            self.silence_start = None
            return None
        else:
            # 静音
            if self.silence_start is None:
                self.silence_start = datetime.now()
            else:
                elapsed = (datetime.now() - self.silence_start).total_seconds()
                if elapsed > SILENCE_TIMEOUT and self.audio_buffer:
                    # 静音超时，处理积累的音频
                    return await self.transcribe_buffer()
            return None
    
    async def transcribe_buffer(self) -> Optional[str]:
        """转录缓冲区中的音频"""
        async with self.buffer_lock:
            if not self.audio_buffer:
                return None
            
            # 合并音频
            combined_audio = b"".join(self.audio_buffer)
            self.audio_buffer.clear()
        
        try:
            # 使用Moonshot ASR
            headers = {
                "Authorization": f"Bearer {MOONSHOT_API_KEY}",
            }
            
            # 构建multipart请求
            form_data = aiohttp.FormData()
            form_data.add_field(
                "file",
                combined_audio,
                filename="audio.wav",
                content_type="audio/wav"
            )
            form_data.add_field("model", "kimi-audio-asr")
            form_data.add_field("language", "zh")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{MOONSHOT_BASE_URL}/audio/transcriptions",
                    headers=headers,
                    data=form_data,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        text = result.get("text", "")
                        if text.strip():
                            logger.info(f"[{self.session_id}] ASR识别: {text}")
                            return text
                    else:
                        error = await resp.text()
                        logger.error(f"ASR错误: {error}")
            
            return None
            
        except Exception as e:
            logger.error(f"转录失败: {e}")
            return None
    
    async def chat_with_llm(self, user_text: str) -> str:
        """与LLM对话"""
        # 添加用户消息
        self.messages.append({"role": "user", "content": user_text})
        
        try:
            headers = {
                "Authorization": f"Bearer {MOONSHOT_API_KEY}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": "moonshot-v1-8k",
                "messages": self.messages,
                "temperature": 0.7,
                "stream": False
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{MOONSHOT_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        assistant_text = result["choices"][0]["message"]["content"]
                        
                        # 添加助手消息到历史
                        self.messages.append({
                            "role": "assistant",
                            "content": assistant_text
                        })
                        
                        # 保持历史长度
                        if len(self.messages) > 10:
                            self.messages = self.messages[-10:]
                        
                        logger.info(f"[{self.session_id}] LLM回复: {assistant_text[:50]}...")
                        return assistant_text
                    else:
                        error = await resp.text()
                        logger.error(f"LLM错误: {error}")
                        return "抱歉，我遇到了一些问题，请稍后再试。"
                        
        except Exception as e:
            logger.error(f"LLM调用失败: {e}")
            return "抱歉，服务暂时不可用。"
    
    async def synthesize_speech(self, text: str):
        """流式语音合成并发送"""
        import requests
        
        try:
            # 使用千问TTS
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {QWEN_API_KEY}",
            }
            
            # 分段处理长文本
            max_chunk = 100
            text_chunks = [text[i:i+max_chunk] for i in range(0, len(text), max_chunk)]
            
            for chunk in text_chunks:
                if not chunk.strip():
                    continue
                
                response = requests.post(
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
                    headers=headers,
                    json={
                        "model": "qwen3-tts-flash",
                        "input": {
                            "text": chunk,
                            "voice": "Cherry",
                            "language_type": "Chinese"
                        }
                    },
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    audio_url = data.get("output", {}).get("audio", {}).get("url")
                    
                    if audio_url:
                        # 下载音频
                        async with aiohttp.ClientSession() as session:
                            async with session.get(audio_url) as resp:
                                if resp.status == 200:
                                    audio_data = await resp.read()
                                    
                                    # 发送音频到前端
                                    await self.websocket.send(json.dumps({
                                        "type": "audio",
                                        "data": base64.b64encode(audio_data).decode(),
                                        "format": "wav"
                                    }))
                                    
                                    # 标记正在播放
                                    self.is_playing = True
                                    await asyncio.sleep(0.1)  # 小延迟避免拥塞
                
        except Exception as e:
            logger.error(f"语音合成失败: {e}")
    
    async def handle_message(self, message: str):
        """处理客户端消息"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "audio":
                # 接收音频数据
                audio_base64 = data.get("data")
                if audio_base64:
                    audio_bytes = base64.b64decode(audio_base64)
                    
                    # 处理音频片段
                    transcript = await self.process_audio_chunk(audio_bytes)
                    
                    if transcript:
                        # 发送转录结果到前端
                        await self.websocket.send(json.dumps({
                            "type": "transcript",
                            "text": transcript
                        }))
                        
                        # 调用LLM
                        await self.websocket.send(json.dumps({
                            "type": "status",
                            "status": "thinking"
                        }))
                        
                        response_text = await self.chat_with_llm(transcript)
                        
                        # 发送文本回复
                        await self.websocket.send(json.dumps({
                            "type": "text",
                            "text": response_text
                        }))
                        
                        # 合成语音
                        await self.synthesize_speech(response_text)
                        
                        # 播放完成
                        await self.websocket.send(json.dumps({
                            "type": "status",
                            "status": "idle"
                        }))
                        self.is_playing = False
            
            elif msg_type == "text":
                # 直接文本输入
                user_text = data.get("text", "")
                if user_text:
                    response_text = await self.chat_with_llm(user_text)
                    
                    await self.websocket.send(json.dumps({
                        "type": "text",
                        "text": response_text
                    }))
                    
                    await self.synthesize_speech(response_text)
            
            elif msg_type == "ping":
                await self.websocket.send(json.dumps({"type": "pong"}))
                
        except json.JSONDecodeError:
            logger.error(f"无效的JSON消息: {message[:100]}")
        except Exception as e:
            logger.error(f"处理消息失败: {e}")
    
    async def close(self):
        """关闭会话"""
        # 取消所有任务
        for task in self.tasks:
            if not task.done():
                task.cancel()
        
        logger.info(f"[{self.session_id}] 会话关闭")


# WebSocket服务器
class RealtimeVoiceServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8881):
        self.host = host
        self.port = port
        self.sessions: dict[WebSocketServerProtocol, RealtimeVoiceSession] = {}
    
    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """处理客户端连接"""
        session = RealtimeVoiceSession(websocket)
        self.sessions[websocket] = session
        
        try:
            await websocket.send(json.dumps({
                "type": "connected",
                "session_id": session.session_id,
                "message": "实时语音对话已连接"
            }))
            
            async for message in websocket:
                await session.handle_message(message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"客户端断开连接: {websocket.remote_address}")
        finally:
            await session.close()
            del self.sessions[websocket]
    
    async def start(self):
        """启动服务器"""
        logger.info(f"启动实时语音服务器: ws://{self.host}:{self.port}")
        
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            await asyncio.Future()  # 永久运行


if __name__ == "__main__":
    server = RealtimeVoiceServer()
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        logger.info("服务器已停止")

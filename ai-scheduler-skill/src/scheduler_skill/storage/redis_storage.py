"""
Redis存储实现 (可选)

需要安装: pip install redis
"""

from typing import Dict, Any, Optional, List
import json

try:
    import redis.asyncio as redis
except ImportError:
    redis = None

from .base import Storage


class RedisStorage(Storage):
    """Redis存储实现"""
    
    def __init__(self, url: str = "redis://localhost:6379"):
        if redis is None:
            raise ImportError("Please install redis: pip install redis")
        
        self.url = url
        self._client: Optional[redis.Redis] = None
    
    async def initialize(self):
        """初始化连接"""
        self._client = redis.from_url(self.url, decode_responses=True)
        await self._client.ping()
    
    async def close(self):
        """关闭连接"""
        if self._client:
            await self._client.close()
    
    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        """保存数据"""
        full_key = f"{task_id}:{key}" if task_id else key
        await self._client.set(full_key, json.dumps(value, ensure_ascii=False))
    
    async def load(self, key: str, default=None) -> Any:
        """加载数据"""
        value = await self._client.get(key)
        if value is None:
            return default
        return json.loads(value)
    
    async def delete(self, key: str):
        """删除数据"""
        await self._client.delete(key)
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """列出所有键"""
        keys = []
        async for key in self._client.scan_iter(match=f"{prefix}*"):
            keys.append(key)
        return keys
    
    async def save_task_config(self, task_id: str, config: Any):
        """保存任务配置"""
        key = f"task_config:{task_id}"
        await self._client.set(
            key, 
            json.dumps(config, ensure_ascii=False, default=lambda o: o.__dict__)
        )
    
    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        """获取任务配置"""
        key = f"task_config:{task_id}"
        value = await self._client.get(key)
        if value is None:
            return None
        return json.loads(value)
    
    async def get_all_task_configs(self) -> List[Dict]:
        """获取所有任务配置"""
        configs = []
        async for key in self._client.scan_iter(match="task_config:*"):
            value = await self._client.get(key)
            if value:
                configs.append(json.loads(value))
        return configs
    
    async def delete_task_config(self, task_id: str):
        """删除任务配置"""
        key = f"task_config:{task_id}"
        await self._client.delete(key)

"""
内存存储实现 - 用于测试
"""

from typing import Dict, Any, Optional, List
from dataclasses import asdict

from .base import Storage


class MemoryStorage(Storage):
    """内存存储实现 - 数据不会持久化"""
    
    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._task_configs: Dict[str, Dict] = {}
    
    async def initialize(self):
        """初始化"""
        pass
    
    async def close(self):
        """关闭"""
        self._data.clear()
        self._task_configs.clear()
    
    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        """保存数据"""
        full_key = f"{task_id}:{key}" if task_id else key
        self._data[full_key] = value
    
    async def load(self, key: str, default=None) -> Any:
        """加载数据"""
        return self._data.get(key, default)
    
    async def delete(self, key: str):
        """删除数据"""
        self._data.pop(key, None)
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """列出所有键"""
        return [k for k in self._data.keys() if k.startswith(prefix)]
    
    async def save_task_config(self, task_id: str, config: Any):
        """保存任务配置"""
        self._task_configs[task_id] = asdict(config) if hasattr(config, '__dataclass_fields__') else config
    
    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        """获取任务配置"""
        return self._task_configs.get(task_id)
    
    async def get_all_task_configs(self) -> List[Dict]:
        """获取所有任务配置"""
        return list(self._task_configs.values())
    
    async def delete_task_config(self, task_id: str):
        """删除任务配置"""
        self._task_configs.pop(task_id, None)

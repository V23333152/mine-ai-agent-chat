"""
存储基类 - 提供统一的存储接口

支持:
- SQLite (默认，内置)
- PostgreSQL (可选)
- Redis (可选)
- Memory (测试用)
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import asdict

from ..core.config import StorageConfig


class Storage(ABC):
    """存储抽象基类"""
    
    @classmethod
    def create(cls, config: StorageConfig) -> "Storage":
        """创建存储实例"""
        if config.type == "sqlite":
            from .sqlite_storage import SQLiteStorage
            return SQLiteStorage(config.path or "scheduler.db")
        elif config.type == "postgresql":
            from .postgres_storage import PostgreSQLStorage
            return PostgreSQLStorage(config.url)
        elif config.type == "redis":
            from .redis_storage import RedisStorage
            return RedisStorage(config.url)
        elif config.type == "memory":
            from .memory_storage import MemoryStorage
            return MemoryStorage()
        else:
            raise ValueError(f"Unsupported storage type: {config.type}")
    
    @abstractmethod
    async def initialize(self):
        """初始化存储"""
        pass
    
    @abstractmethod
    async def close(self):
        """关闭存储连接"""
        pass
    
    @abstractmethod
    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        """
        保存数据
        
        Args:
            key: 键
            value: 值
            task_id: 可选，任务ID（用于命名空间）
        """
        pass
    
    @abstractmethod
    async def load(self, key: str, default=None) -> Any:
        """
        加载数据
        
        Args:
            key: 键
            default: 默认值
        
        Returns:
            存储的值，如果不存在返回default
        """
        pass
    
    @abstractmethod
    async def delete(self, key: str):
        """删除数据"""
        pass
    
    @abstractmethod
    async def list_keys(self, prefix: str = "") -> List[str]:
        """列出所有键"""
        pass
    
    @abstractmethod
    async def save_task_config(self, task_id: str, config: Any):
        """保存任务配置"""
        pass
    
    @abstractmethod
    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        """获取任务配置"""
        pass
    
    @abstractmethod
    async def get_all_task_configs(self) -> List[Dict]:
        """获取所有任务配置"""
        pass
    
    @abstractmethod
    async def delete_task_config(self, task_id: str):
        """删除任务配置"""
        pass

    @abstractmethod
    async def save_execution_history(self, task_id: str, status: str, output: Optional[str] = None, error: Optional[str] = None, started_at: Optional[str] = None, finished_at: Optional[str] = None, duration_ms: Optional[int] = None):
        pass

    @abstractmethod
    async def get_task_history(self, task_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        pass


class MemoryStorage(Storage):
    """内存存储（用于测试）"""

    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._task_configs: Dict[str, Dict] = {}
        self._history: List[Dict] = []

    async def initialize(self):
        pass

    async def close(self):
        self._data.clear()
        self._task_configs.clear()

    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        full_key = f"{task_id}:{key}" if task_id else key
        self._data[full_key] = value

    async def load(self, key: str, default=None) -> Any:
        return self._data.get(key, default)

    async def delete(self, key: str):
        self._data.pop(key, None)

    async def list_keys(self, prefix: str = "") -> List[str]:
        return [k for k in self._data.keys() if k.startswith(prefix)]

    async def save_task_config(self, task_id: str, config: Any):
        self._task_configs[task_id] = asdict(config) if hasattr(config, '__dataclass_fields__') else config

    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        return self._task_configs.get(task_id)

    async def get_all_task_configs(self) -> List[Dict]:
        return list(self._task_configs.values())

    async def delete_task_config(self, task_id: str):
        self._task_configs.pop(task_id, None)

    async def save_execution_history(self, task_id: str, status: str, output: Optional[str] = None, error: Optional[str] = None, started_at: Optional[str] = None, finished_at: Optional[str] = None, duration_ms: Optional[int] = None):
        self._history.append({
            "id": len(self._history) + 1,
            "task_id": task_id,
            "status": status,
            "output": output,
            "error": error,
            "started_at": started_at,
            "finished_at": finished_at,
            "duration_ms": duration_ms,
        })

    async def get_task_history(self, task_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        rows = [r for r in self._history if task_id is None or r["task_id"] == task_id]
        rows.reverse()
        return rows[:limit]

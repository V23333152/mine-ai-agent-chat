"""
PostgreSQL存储实现 (可选)

需要安装: pip install asyncpg
"""

from typing import Dict, Any, Optional, List
import json

try:
    import asyncpg
except ImportError:
    asyncpg = None

from .base import Storage


class PostgreSQLStorage(Storage):
    """PostgreSQL存储实现"""
    
    def __init__(self, dsn: str):
        if asyncpg is None:
            raise ImportError("Please install asyncpg: pip install asyncpg")
        
        self.dsn = dsn
        self._pool: Optional[asyncpg.Pool] = None
    
    async def initialize(self):
        """初始化连接池"""
        self._pool = await asyncpg.create_pool(self.dsn)
        
        # 创建表
        async with self._pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS kv_store (
                    key TEXT PRIMARY KEY,
                    value JSONB,
                    task_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS task_configs (
                    task_id TEXT PRIMARY KEY,
                    config JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
    
    async def close(self):
        """关闭连接池"""
        if self._pool:
            await self._pool.close()
    
    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        """保存数据"""
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO kv_store (key, value, task_id, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    task_id = EXCLUDED.task_id,
                    updated_at = CURRENT_TIMESTAMP
                """,
                key, json.dumps(value), task_id
            )
    
    async def load(self, key: str, default=None) -> Any:
        """加载数据"""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT value FROM kv_store WHERE key = $1",
                key
            )
            if row:
                return json.loads(row['value'])
            return default
    
    async def delete(self, key: str):
        """删除数据"""
        async with self._pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM kv_store WHERE key = $1",
                key
            )
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """列出所有键"""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT key FROM kv_store WHERE key LIKE $1",
                f"{prefix}%"
            )
            return [row['key'] for row in rows]
    
    async def save_task_config(self, task_id: str, config: Any):
        """保存任务配置"""
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO task_configs (task_id, config, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (task_id) DO UPDATE SET
                    config = EXCLUDED.config,
                    updated_at = CURRENT_TIMESTAMP
                """,
                task_id, json.dumps(config, default=lambda o: o.__dict__)
            )
    
    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        """获取任务配置"""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT config FROM task_configs WHERE task_id = $1",
                task_id
            )
            if row:
                return json.loads(row['config'])
            return None
    
    async def get_all_task_configs(self) -> List[Dict]:
        """获取所有任务配置"""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch("SELECT config FROM task_configs")
            return [json.loads(row['config']) for row in rows]
    
    async def delete_task_config(self, task_id: str):
        """删除任务配置"""
        async with self._pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM task_configs WHERE task_id = $1",
                task_id
            )

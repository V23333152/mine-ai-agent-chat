"""
SQLite存储实现
"""

import json
import aiosqlite
from typing import Dict, Any, Optional, List
from pathlib import Path

from .base import Storage


class SQLiteStorage(Storage):
    """SQLite存储实现"""
    
    def __init__(self, db_path: str = "scheduler.db"):
        self.db_path = db_path
        self._conn: Optional[aiosqlite.Connection] = None
    
    async def initialize(self):
        """初始化数据库"""
        self._conn = await aiosqlite.connect(self.db_path)
        await self._conn.execute("PRAGMA foreign_keys = ON")
        
        # 创建表
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT,
                task_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS task_configs (
                task_id TEXT PRIMARY KEY,
                config TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                status TEXT,
                output TEXT,
                error TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                duration_ms INTEGER
            )
        """)

        await self._conn.commit()
    
    async def close(self):
        """关闭连接"""
        if self._conn:
            await self._conn.close()
            self._conn = None
    
    async def save(self, key: str, value: Any, task_id: Optional[str] = None):
        """保存数据"""
        if not self._conn:
            await self.initialize()
        
        json_value = json.dumps(value, ensure_ascii=False)
        
        await self._conn.execute(
            """
            INSERT INTO kv_store (key, value, task_id, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                task_id = excluded.task_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, json_value, task_id)
        )
        await self._conn.commit()
    
    async def load(self, key: str, default=None) -> Any:
        """加载数据"""
        if not self._conn:
            await self.initialize()
        
        async with self._conn.execute(
            "SELECT value FROM kv_store WHERE key = ?",
            (key,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
            return default
    
    async def delete(self, key: str):
        """删除数据"""
        if not self._conn:
            await self.initialize()
        
        await self._conn.execute(
            "DELETE FROM kv_store WHERE key = ?",
            (key,)
        )
        await self._conn.commit()
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """列出所有键"""
        if not self._conn:
            await self.initialize()
        
        async with self._conn.execute(
            "SELECT key FROM kv_store WHERE key LIKE ?",
            (f"{prefix}%",)
        ) as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]
    
    async def save_task_config(self, task_id: str, config: Any):
        """保存任务配置"""
        if not self._conn:
            await self.initialize()
        
        json_config = json.dumps(config, ensure_ascii=False, default=lambda o: o.__dict__)
        
        await self._conn.execute(
            """
            INSERT INTO task_configs (task_id, config, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(task_id) DO UPDATE SET
                config = excluded.config,
                updated_at = CURRENT_TIMESTAMP
            """,
            (task_id, json_config)
        )
        await self._conn.commit()
    
    async def get_task_config(self, task_id: str) -> Optional[Dict]:
        """获取任务配置"""
        if not self._conn:
            await self.initialize()
        
        async with self._conn.execute(
            "SELECT config FROM task_configs WHERE task_id = ?",
            (task_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
            return None
    
    async def get_all_task_configs(self) -> List[Dict]:
        """获取所有任务配置"""
        if not self._conn:
            await self.initialize()
        
        async with self._conn.execute(
            "SELECT config FROM task_configs"
        ) as cursor:
            rows = await cursor.fetchall()
            return [json.loads(row[0]) for row in rows]
    
    async def delete_task_config(self, task_id: str):
        """删除任务配置"""
        if not self._conn:
            await self.initialize()

        await self._conn.execute(
            "DELETE FROM task_configs WHERE task_id = ?",
            (task_id,)
        )
        await self._conn.commit()

    async def save_execution_history(self, task_id: str, status: str, output: Optional[str] = None, error: Optional[str] = None, started_at: Optional[str] = None, finished_at: Optional[str] = None, duration_ms: Optional[int] = None):
        if not self._conn:
            await self.initialize()
        await self._conn.execute(
            """
            INSERT INTO execution_history (task_id, status, output, error, started_at, finished_at, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (task_id, status, output, error, started_at, finished_at, duration_ms)
        )
        await self._conn.commit()

    async def get_task_history(self, task_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        if not self._conn:
            await self.initialize()
        if task_id:
            async with self._conn.execute(
                "SELECT * FROM execution_history WHERE task_id = ? ORDER BY finished_at DESC LIMIT ?",
                (task_id, limit)
            ) as cursor:
                rows = await cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in rows]
        else:
            async with self._conn.execute(
                "SELECT * FROM execution_history ORDER BY finished_at DESC LIMIT ?",
                (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in rows]

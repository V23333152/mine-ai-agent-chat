"""
状态管理系统 - OpenClaw风格

核心设计原则:
1. 状态文件记录Agent的"记忆"
2. 避免重复提醒（已提醒过的事项不再提醒）
3. 支持状态持久化和恢复
"""

import json
import time
from typing import Dict, Any, Optional, List
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import asyncio
import aiofiles


@dataclass
class HeartbeatState:
    """Heartbeat状态记录"""
    last_check: float = 0  # 上次检查时间戳
    last_speak: float = 0  # 上次说话时间戳
    silent_hours: float = 0  # 连续沉默小时数
    
    # 各检查项状态
    check_results: Dict[str, Any] = None
    reminded_items: List[str] = None
    
    def __post_init__(self):
        if self.check_results is None:
            self.check_results = {}
        if self.reminded_items is None:
            self.reminded_items = []


@dataclass
class TaskState:
    """任务执行状态"""
    task_id: str
    task_name: str
    
    # 执行统计
    total_runs: int = 0
    successful_runs: int = 0
    failed_runs: int = 0
    last_run: Optional[float] = None
    last_success: Optional[float] = None
    last_failure: Optional[float] = None
    
    # 当前状态
    status: str = "idle"  # idle, running, paused, error
    next_run: Optional[float] = None
    
    # 错误追踪
    consecutive_failures: int = 0
    last_error: Optional[str] = None
    
    # 自定义状态数据
    custom_data: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.custom_data is None:
            self.custom_data = {}
    
    def record_success(self):
        """记录成功执行"""
        self.total_runs += 1
        self.successful_runs += 1
        self.last_run = time.time()
        self.last_success = time.time()
        self.consecutive_failures = 0
        self.status = "idle"
    
    def record_failure(self, error: str):
        """记录失败执行"""
        self.total_runs += 1
        self.failed_runs += 1
        self.last_run = time.time()
        self.last_failure = time.time()
        self.consecutive_failures += 1
        self.last_error = error
        self.status = "error"


class StateManager:
    """
    状态管理器
    
    管理以下状态文件:
    - state/heartbeat/{task_name}.json - Heartbeat任务状态
    - state/tasks/{task_id}.json - 普通任务状态
    - state/global.json - 全局状态
    """
    
    def __init__(self, state_dir: str = "./.scheduler_state"):
        self.state_dir = Path(state_dir)
        self._cache: Dict[str, Any] = {}
        self._lock = asyncio.Lock()
        
        # 创建目录
        self._ensure_directories()
    
    def _ensure_directories(self):
        """确保状态目录存在"""
        (self.state_dir / "heartbeat").mkdir(parents=True, exist_ok=True)
        (self.state_dir / "tasks").mkdir(parents=True, exist_ok=True)
    
    # ===== Heartbeat状态管理 =====
    
    async def get_heartbeat_state(self, task_name: str) -> HeartbeatState:
        """获取Heartbeat状态"""
        path = self.state_dir / "heartbeat" / f"{task_name}.json"
        
        async with self._lock:
            if task_name in self._cache:
                return self._cache[task_name]
            
            if path.exists():
                try:
                    async with aiofiles.open(path, "r", encoding="utf-8") as f:
                        content = await f.read()
                        data = json.loads(content)
                        state = HeartbeatState(**data)
                        self._cache[task_name] = state
                        return state
                except Exception:
                    pass
            
            # 返回默认状态
            state = HeartbeatState()
            self._cache[task_name] = state
            return state
    
    async def save_heartbeat_state(self, task_name: str, state: HeartbeatState):
        """保存Heartbeat状态"""
        path = self.state_dir / "heartbeat" / f"{task_name}.json"
        
        async with self._lock:
            self._cache[task_name] = state
            
            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(asdict(state), indent=2, ensure_ascii=False))
    
    async def should_speak(
        self, 
        task_name: str, 
        condition: str,
        remember_duration: int = 86400
    ) -> bool:
        """
        判断是否应该说话（避免重复提醒）
        
        Args:
            task_name: 任务名称
            condition: 当前条件标识
            remember_duration: 记住提醒的时长(秒)
        
        Returns:
            是否应该说话
        """
        state = await self.get_heartbeat_state(task_name)
        now = time.time()
        
        # 检查是否已经提醒过这个条件
        if condition in state.reminded_items:
            # 检查是否在记忆期内
            last_reminded = state.check_results.get(f"{condition}_time", 0)
            if now - last_reminded < remember_duration:
                return False
            # 超过记忆期，移除标记
            state.reminded_items.remove(condition)
        
        return True
    
    async def mark_spoke(self, task_name: str, condition: str, result: Any = None):
        """标记已说话"""
        state = await self.get_heartbeat_state(task_name)
        now = time.time()
        
        state.last_speak = now
        state.silent_hours = 0
        
        if condition not in state.reminded_items:
            state.reminded_items.append(condition)
        
        state.check_results[condition] = result
        state.check_results[f"{condition}_time"] = now
        
        await self.save_heartbeat_state(task_name, state)
    
    async def mark_silent(self, task_name: str):
        """标记保持沉默（更新连续沉默时间）"""
        state = await self.get_heartbeat_state(task_name)
        now = time.time()
        
        if state.last_speak > 0:
            hours_since_speak = (now - state.last_speak) / 3600
            state.silent_hours = hours_since_speak
        
        state.last_check = now
        
        await self.save_heartbeat_state(task_name, state)
    
    async def is_night_time(self, silent_hours: tuple = (23, 7)) -> bool:
        """检查是否是夜间时间"""
        hour = datetime.now().hour
        start, end = silent_hours
        
        if start <= end:
            return start <= hour < end
        else:  # 跨午夜，如 23:00-7:00
            return hour >= start or hour < end
    
    # ===== 普通任务状态管理 =====
    
    async def get_task_state(self, task_id: str, task_name: str = "") -> TaskState:
        """获取任务状态"""
        path = self.state_dir / "tasks" / f"{task_id}.json"
        
        async with self._lock:
            if task_id in self._cache:
                return self._cache[task_id]
            
            if path.exists():
                try:
                    async with aiofiles.open(path, "r", encoding="utf-8") as f:
                        content = await f.read()
                        data = json.loads(content)
                        state = TaskState(**data)
                        self._cache[task_id] = state
                        return state
                except Exception:
                    pass
            
            # 返回默认状态
            state = TaskState(task_id=task_id, task_name=task_name)
            self._cache[task_id] = state
            return state
    
    async def save_task_state(self, task_id: str, state: TaskState):
        """保存任务状态"""
        path = self.state_dir / "tasks" / f"{task_id}.json"
        
        async with self._lock:
            self._cache[task_id] = state
            
            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(asdict(state), indent=2, ensure_ascii=False))
    
    async def record_task_success(self, task_id: str, task_name: str = ""):
        """记录任务成功"""
        state = await self.get_task_state(task_id, task_name)
        state.record_success()
        await self.save_task_state(task_id, state)
    
    async def record_task_failure(self, task_id: str, error: str, task_name: str = ""):
        """记录任务失败"""
        state = await self.get_task_state(task_id, task_name)
        state.record_failure(error)
        await self.save_task_state(task_id, state)
    
    # ===== 全局状态 =====
    
    async def get_global_state(self) -> Dict[str, Any]:
        """获取全局状态"""
        path = self.state_dir / "global.json"
        
        if path.exists():
            try:
                async with aiofiles.open(path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    return json.loads(content)
            except Exception:
                pass
        
        return {
            "started_at": time.time(),
            "version": "1.0.0",
        }
    
    async def save_global_state(self, data: Dict[str, Any]):
        """保存全局状态"""
        path = self.state_dir / "global.json"
        
        async with aiofiles.open(path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(data, indent=2, ensure_ascii=False))
    
    # ===== 工具方法 =====
    
    async def clear_cache(self):
        """清除缓存"""
        async with self._lock:
            self._cache.clear()
    
    async def get_all_task_states(self) -> Dict[str, TaskState]:
        """获取所有任务状态"""
        states = {}
        tasks_dir = self.state_dir / "tasks"
        
        if tasks_dir.exists():
            for file_path in tasks_dir.glob("*.json"):
                task_id = file_path.stem
                state = await self.get_task_state(task_id)
                states[task_id] = state
        
        return states
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """获取Dashboard展示数据"""
        now = time.time()
        
        # 统计数据
        total_tasks = 0
        running_tasks = 0
        failed_tasks = 0
        
        tasks_dir = self.state_dir / "tasks"
        if tasks_dir.exists():
            for file_path in tasks_dir.glob("*.json"):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        total_tasks += 1
                        if data.get("status") == "running":
                            running_tasks += 1
                        if data.get("consecutive_failures", 0) > 0:
                            failed_tasks += 1
                except Exception:
                    pass
        
        return {
            "total_tasks": total_tasks,
            "running_tasks": running_tasks,
            "failed_tasks": failed_tasks,
            "healthy_tasks": total_tasks - failed_tasks,
            "timestamp": now,
        }

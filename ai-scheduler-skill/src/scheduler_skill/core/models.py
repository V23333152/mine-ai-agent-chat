"""
数据模型定义
"""

from enum import Enum
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime


class LLMProvider(Enum):
    """LLM提供商枚举"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    DEEPSEEK = "deepseek"
    CUSTOM = "custom"


class TaskStatus(Enum):
    """任务状态枚举"""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    COMPLETED = "completed"


class ExecutionStatus(Enum):
    """执行状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class ExecutionResult:
    """任务执行结果"""
    execution_id: str
    task_id: str
    task_name: str
    
    status: ExecutionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    
    result: Any = None
    error: Optional[str] = None
    
    # 元数据
    attempt: int = 1
    duration_ms: float = 0.0
    tokens_used: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "execution_id": self.execution_id,
            "task_id": self.task_id,
            "task_name": self.task_name,
            "status": self.status.value,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "result": self.result,
            "error": self.error,
            "attempt": self.attempt,
            "duration_ms": self.duration_ms,
            "tokens_used": self.tokens_used,
        }


@dataclass
class TaskInfo:
    """任务信息（用于API返回）"""
    id: str
    name: str
    mode: str
    description: Optional[str] = None
    
    # 调度信息
    schedule: Optional[str] = None  # Cron表达式或间隔描述
    enabled: bool = True
    
    # 状态
    status: str = "idle"
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    
    # 统计
    total_runs: int = 0
    successful_runs: int = 0
    failed_runs: int = 0
    
    # 元数据
    tags: List[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "mode": self.mode,
            "description": self.description,
            "schedule": self.schedule,
            "enabled": self.enabled,
            "status": self.status,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "next_run": self.next_run.isoformat() if self.next_run else None,
            "total_runs": self.total_runs,
            "successful_runs": self.successful_runs,
            "failed_runs": self.failed_runs,
            "tags": self.tags,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


@dataclass
class ModelConfig:
    """模型配置（简化版，完整版在config.py）"""
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2000


@dataclass
class WebhookPayload:
    """Webhook回调载荷"""
    event: str  # task.started, task.completed, task.failed
    task_id: str
    task_name: str
    execution_id: str
    timestamp: datetime
    
    # 事件特定数据
    result: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "event": self.event,
            "task_id": self.task_id,
            "task_name": self.task_name,
            "execution_id": self.execution_id,
            "timestamp": self.timestamp.isoformat(),
            "result": self.result,
            "error": self.error,
            "duration_ms": self.duration_ms,
        }


@dataclass
class DashboardStats:
    """Dashboard统计数据"""
    total_tasks: int = 0
    running_tasks: int = 0
    failed_tasks: int = 0
    healthy_tasks: int = 0
    
    total_executions_today: int = 0
    successful_executions_today: int = 0
    failed_executions_today: int = 0
    
    # 系统状态
    uptime_seconds: float = 0.0
    memory_usage_mb: float = 0.0
    
    # 时间戳
    timestamp: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "total_tasks": self.total_tasks,
            "running_tasks": self.running_tasks,
            "failed_tasks": self.failed_tasks,
            "healthy_tasks": self.healthy_tasks,
            "total_executions_today": self.total_executions_today,
            "successful_executions_today": self.successful_executions_today,
            "failed_executions_today": self.failed_executions_today,
            "uptime_seconds": self.uptime_seconds,
            "memory_usage_mb": self.memory_usage_mb,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }

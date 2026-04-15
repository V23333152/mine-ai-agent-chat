"""
AI Scheduler Skill - 统一混合调度系统

一个系统，三种用法：
1. MCP工具 - 零代码集成到Claude Desktop等客户端
2. Python SDK - 灵活编程接口
3. REST API服务 - 多语言支持

示例:
    >>> from scheduler_skill import HybridScheduler
    >>> 
    >>> # 从配置文件初始化
    >>> scheduler = HybridScheduler.from_config("scheduler.yaml")
    >>> 
    >>> # 使用装饰器注册Cron任务
    >>> @scheduler.cron("0 9 * * *")
    >>> async def daily_task(ctx):
    ...     return await ctx.llm.generate("生成日报")
    >>> 
    >>> # 使用Heartbeat智能检查
    >>> @scheduler.heartbeat(interval=1800)
    >>> async def smart_check(ctx):
    ...     if await has_urgent_mail():
    ...         return "有紧急邮件！"
    ...     return "HEARTBEAT_OK"  # 保持沉默
"""

__version__ = "1.0.0"
__author__ = "AI Scheduler Team"

from .core.scheduler import HybridScheduler
from .core.config import (
    TaskConfig,
    ScheduleMode,
    CronConfig,
    HeartbeatConfig,
    EventConfig,
    SchedulerConfig,
)
from .core.context import TaskContext
from .core.models import ModelConfig, LLMProvider
from .storage.base import Storage
from .connectors.base import Connector

__all__ = [
    # 主类
    "HybridScheduler",
    
    # 配置类
    "TaskConfig",
    "ScheduleMode",
    "CronConfig", 
    "HeartbeatConfig",
    "EventConfig",
    "SchedulerConfig",
    
    # 上下文和模型
    "TaskContext",
    "ModelConfig",
    "LLMProvider",
    
    # 扩展基类
    "Storage",
    "Connector",
]

# 可选：Skill 集成（如果依赖满足）
try:
    from .skill_integration import create_scheduler_skill, skill_metadata
    __all__.extend(["create_scheduler_skill", "skill_metadata"])
except ImportError:
    pass  # 可选依赖未安装

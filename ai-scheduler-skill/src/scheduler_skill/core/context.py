"""
任务执行上下文 - 依赖注入核心

提供任务执行时可用的工具:
- ctx.llm: LLM客户端
- ctx.storage: 存储客户端
- ctx.http: HTTP客户端
- ctx.state: 状态管理
- ctx.log: 日志记录
"""

from typing import Dict, Any, Optional, TYPE_CHECKING
from dataclasses import dataclass, field
from datetime import datetime
import logging

if TYPE_CHECKING:
    from .scheduler import HybridScheduler


@dataclass
class TaskContext:
    """
    任务执行上下文
    
    示例:
        >>> async def my_task(ctx: TaskContext):
        ...     # 使用LLM
        ...     result = await ctx.llm.generate("分析数据")
        ...     
        ...     # 存储数据
        ...     await ctx.storage.save("key", result)
        ...     
        ...     # HTTP请求
        ...     data = await ctx.http.get("https://api.example.com/data")
        ...     
        ...     # 记录日志
        ...     ctx.log.info("任务执行完成")
        ...     
        ...     return result
    """
    
    # 任务信息
    task_id: str
    task_name: str
    execution_id: str
    started_at: datetime
    
    # 执行元数据
    attempt: int = 1  # 当前重试次数
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # 内部引用
    _scheduler: Optional["HybridScheduler"] = field(default=None, repr=False)
    
    def __post_init__(self):
        """初始化日志记录器"""
        self._logger = logging.getLogger(f"scheduler.task.{self.task_name}")
    
    # ===== LLM访问 =====
    
    @property
    def llm(self):
        """LLM客户端"""
        if self._scheduler is None:
            raise RuntimeError("Context not properly initialized")
        return self._scheduler.llm_client
    
    async def generate(
        self, 
        prompt: str, 
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        **kwargs
    ) -> str:
        """
        快捷方法：生成文本
        
        Args:
            prompt: 提示词
            model: 可选，指定模型
            temperature: 可选，温度参数
            **kwargs: 其他参数
        
        Returns:
            生成的文本
        """
        return await self.llm.generate(
            prompt, 
            model=model, 
            temperature=temperature,
            **kwargs
        )
    
    # ===== 存储访问 =====
    
    @property
    def storage(self):
        """存储客户端"""
        if self._scheduler is None:
            raise RuntimeError("Context not properly initialized")
        return self._scheduler.storage
    
    async def save(self, key: str, value: Any, namespace: Optional[str] = None):
        """
        快捷方法：保存数据
        
        Args:
            key: 键
            value: 值
            namespace: 可选，命名空间
        """
        full_key = f"{namespace}:{key}" if namespace else key
        await self.storage.save(full_key, value, task_id=self.task_id)
    
    async def load(self, key: str, namespace: Optional[str] = None, default=None):
        """
        快捷方法：加载数据
        
        Args:
            key: 键
            namespace: 可选，命名空间
            default: 默认值
        
        Returns:
            存储的值，如果不存在返回default
        """
        full_key = f"{namespace}:{key}" if namespace else key
        return await self.storage.load(full_key, default=default)
    
    # ===== HTTP访问 =====
    
    @property
    def http(self):
        """HTTP客户端"""
        if self._scheduler is None:
            raise RuntimeError("Context not properly initialized")
        return self._scheduler.http_client
    
    async def get(self, url: str, **kwargs):
        """快捷方法：GET请求"""
        return await self.http.get(url, **kwargs)
    
    async def post(self, url: str, **kwargs):
        """快捷方法：POST请求"""
        return await self.http.post(url, **kwargs)
    
    # ===== 状态管理 =====
    
    @property
    def state(self):
        """状态管理器"""
        if self._scheduler is None:
            raise RuntimeError("Context not properly initialized")
        return self._scheduler.state_manager
    
    async def should_speak(self, condition: str, remember_duration: int = 86400) -> bool:
        """
        Heartbeat专用：检查是否应该说话
        
        Args:
            condition: 条件标识
            remember_duration: 记住时长(秒)
        
        Returns:
            是否应该说话
        """
        return await self.state.should_speak(
            self.task_name, condition, remember_duration
        )
    
    async def mark_spoke(self, condition: str, result: Any = None):
        """
        Heartbeat专用：标记已说话
        
        Args:
            condition: 条件标识
            result: 结果数据
        """
        await self.state.mark_spoke(self.task_name, condition, result)
    
    async def mark_silent(self):
        """Heartbeat专用：标记保持沉默"""
        await self.state.mark_silent(self.task_name)
    
    async def is_night_time(self, silent_hours: tuple = (23, 7)) -> bool:
        """
        检查是否是夜间时间
        
        Args:
            silent_hours: 夜间时间段 (开始小时, 结束小时)
        
        Returns:
            是否是夜间
        """
        return await self.state.is_night_time(silent_hours)
    
    # ===== 日志 =====
    
    @property
    def log(self):
        """日志记录器"""
        return self._logger
    
    def info(self, message: str, **kwargs):
        """记录info日志"""
        self._logger.info(message, extra={
            "execution_id": self.execution_id,
            "attempt": self.attempt,
            **kwargs
        })
    
    def warning(self, message: str, **kwargs):
        """记录warning日志"""
        self._logger.warning(message, extra={
            "execution_id": self.execution_id,
            "attempt": self.attempt,
            **kwargs
        })
    
    def error(self, message: str, **kwargs):
        """记录error日志"""
        self._logger.error(message, extra={
            "execution_id": self.execution_id,
            "attempt": self.attempt,
            **kwargs
        })
    
    def debug(self, message: str, **kwargs):
        """记录debug日志"""
        self._logger.debug(message, extra={
            "execution_id": self.execution_id,
            "attempt": self.attempt,
            **kwargs
        })
    
    # ===== 工具方法 =====
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "task_id": self.task_id,
            "task_name": self.task_name,
            "execution_id": self.execution_id,
            "started_at": self.started_at.isoformat(),
            "attempt": self.attempt,
            "metadata": self.metadata,
        }
    
    @property
    def elapsed_seconds(self) -> float:
        """获取已执行时间(秒)"""
        return (datetime.now() - self.started_at).total_seconds()

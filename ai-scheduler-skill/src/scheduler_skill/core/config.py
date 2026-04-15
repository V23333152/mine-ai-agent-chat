"""
配置系统 - 统一YAML配置驱动

支持三种调度模式:
- Cron: 精确时间调度
- Heartbeat: 智能检查调度
- Event: 事件驱动调度
"""

from enum import Enum
from typing import Optional, Dict, Any, List, Callable, Union
from dataclasses import dataclass, field
from pathlib import Path
import yaml
import os


class ScheduleMode(Enum):
    """调度模式枚举"""
    CRON = "cron"
    HEARTBEAT = "heartbeat"
    EVENT = "event"


@dataclass
class RetryPolicy:
    """重试策略配置"""
    max_attempts: int = 3
    delay: float = 60.0  # 初始延迟(秒)
    backoff: str = "exponential"  # fixed, linear, exponential
    max_delay: float = 3600.0  # 最大延迟(秒)
    
    def get_delay(self, attempt: int) -> float:
        """计算第attempt次的延迟时间"""
        if self.backoff == "fixed":
            return self.delay
        elif self.backoff == "linear":
            return min(self.delay * attempt, self.max_delay)
        elif self.backoff == "exponential":
            import math
            return min(self.delay * (2 ** (attempt - 1)), self.max_delay)
        return self.delay


@dataclass
class CronConfig:
    """Cron调度配置"""
    # 必需
    schedule: str  # Cron表达式，如 "0 9 * * *"
    
    # 可选
    timezone: str = "UTC"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    jitter: Optional[int] = None  # 随机延迟(秒)，避免并发
    
    def validate(self) -> bool:
        """验证Cron表达式是否有效"""
        try:
            from croniter import croniter
            return croniter.is_valid(self.schedule)
        except ImportError:
            # 简单验证
            parts = self.schedule.split()
            return len(parts) == 5


@dataclass
class HeartbeatConfig:
    """Heartbeat智能检查配置 (OpenClaw风格)"""
    # 必需
    interval: int  # 检查间隔(秒)
    
    # 可选 - 何时说话
    speak_conditions: List[str] = field(default_factory=list)
    # 例如:
    # - "has_urgent_email"
    # - "upcoming_meeting_within_2h"
    # - "server_cpu_high"
    
    # 可选 - 何时保持沉默
    silent_hours: tuple = (23, 7)  # 夜间23:00-7:00保持沉默(除非critical)
    silent_if_no_change: bool = True  # 无变化时保持沉默
    
    # 可选 - 状态跟踪
    state_file: Optional[str] = None  # 状态文件路径
    remember_duration: int = 86400  # 记住提醒的时间(秒)
    
    # 成本优化
    max_tokens_per_check: int = 500  # 每次检查最大token数
    use_cheap_model: bool = True  # 是否使用低成本模型进行检查


@dataclass
class EventConfig:
    """事件驱动配置"""
    # 触发方式
    webhook_path: Optional[str] = None  # Webhook路径
    webhook_secret: Optional[str] = None  # 签名验证密钥
    
    # 过滤条件
    filter_expr: Optional[str] = None  # 过滤表达式
    # 例如: "event.type == 'push' and event.branch == 'main'"
    
    # 速率限制
    rate_limit: Optional[int] = None  # 每分钟最大触发次数


@dataclass
class ModelConfig:
    """AI模型配置"""
    provider: str = "openai"  # openai, anthropic, ollama, etc.
    model: str = "gpt-4o-mini"  # 默认使用低成本模型
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    
    # 生成参数
    temperature: float = 1.0  # Kimi K2.5 只接受 temperature=1
    max_tokens: int = 8000  # 增加到8000以支持10条完整新闻输出
    top_p: Optional[float] = None
    
    # 可选：备用模型
    fallback_model: Optional[str] = None
    fallback_provider: Optional[str] = None


@dataclass
class TaskConfig:
    """统一任务配置 - 支持三种模式"""
    # 必需
    name: str
    mode: ScheduleMode
    
    # 执行内容 (三选一)
    prompt: Optional[str] = None  # 直接prompt
    handler: Optional[Callable] = None  # Python函数
    command: Optional[str] = None  # 系统命令
    
    # 调度配置 (根据mode选择)
    cron: Optional[CronConfig] = None
    heartbeat: Optional[HeartbeatConfig] = None
    event: Optional[EventConfig] = None
    
    # 模型配置
    model: Optional[ModelConfig] = None
    
    # 通用配置
    description: Optional[str] = None
    enabled: bool = True
    timeout: float = 300.0  # 任务超时(秒)
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    
    # 通知配置
    webhook_url: Optional[str] = None  # 任务完成回调
    notify_on_failure: bool = True
    notify_on_success: bool = False
    
    # 元数据
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """验证配置"""
        if isinstance(self.mode, str):
            self.mode = ScheduleMode(self.mode)
        
        # 根据mode验证配置
        if self.mode == ScheduleMode.CRON and not self.cron:
            raise ValueError("Cron mode requires cron config")
        if self.mode == ScheduleMode.HEARTBEAT and not self.heartbeat:
            raise ValueError("Heartbeat mode requires heartbeat config")
        if self.mode == ScheduleMode.EVENT and not self.event:
            raise ValueError("Event mode requires event config")


@dataclass
class StorageConfig:
    """存储配置"""
    type: str = "sqlite"  # sqlite, postgresql, redis, memory
    url: Optional[str] = None  # 数据库连接URL
    path: Optional[str] = None  # 本地文件路径
    
    def get_default_url(self) -> str:
        """获取默认连接URL"""
        if self.type == "sqlite":
            return self.path or "scheduler.db"
        elif self.type == "postgresql":
            return self.url or os.getenv("DATABASE_URL", "postgresql://localhost/scheduler")
        elif self.type == "redis":
            return self.url or os.getenv("REDIS_URL", "redis://localhost:6379")
        return "memory"


@dataclass
class SchedulerConfig:
    """调度器全局配置"""
    # 存储
    storage: StorageConfig = field(default_factory=StorageConfig)
    
    # 状态管理
    state_dir: str = "./.scheduler_state"
    log_dir: str = "./logs"
    
    # 全局模型配置
    default_model: ModelConfig = field(default_factory=ModelConfig)
    
    # 性能配置
    max_concurrent_tasks: int = 10
    worker_threads: int = 4
    
    # API服务配置
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_prefix: str = "/api/v1"
    
    # MCP配置
    mcp_transport: str = "stdio"  # stdio, sse
    mcp_server_name: str = "ai-scheduler"
    
    # 通知界面配置
    notify_ui: dict = field(default_factory=lambda: {
        "enabled": False,
        "port": 8765,
        "auto_open_browser": True
    })
    
    # 任务列表
    tasks: List[TaskConfig] = field(default_factory=list)
    
    @classmethod
    def from_yaml(cls, path: Union[str, Path]) -> "SchedulerConfig":
        """从YAML文件加载配置"""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")
        
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        
        return cls.from_dict(data)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SchedulerConfig":
        """从字典加载配置"""
        config = cls()
        
        # 存储配置
        if "storage" in data:
            storage_data = data["storage"]
            config.storage = StorageConfig(
                type=storage_data.get("type", "sqlite"),
                url=storage_data.get("url"),
                path=storage_data.get("path"),
            )
        
        # 路径配置
        config.state_dir = data.get("state_dir", config.state_dir)
        config.log_dir = data.get("log_dir", config.log_dir)
        
        # API配置
        if "api" in data:
            api_data = data["api"]
            config.api_host = api_data.get("host", config.api_host)
            config.api_port = api_data.get("port", config.api_port)
            config.api_prefix = api_data.get("prefix", config.api_prefix)
        
        # MCP配置
        if "mcp" in data:
            mcp_data = data["mcp"]
            config.mcp_transport = mcp_data.get("transport", config.mcp_transport)
            config.mcp_server_name = mcp_data.get("server_name", config.mcp_server_name)
        
        # 通知界面配置
        if "notify_ui" in data:
            config.notify_ui.update(data["notify_ui"])
        
        # 默认模型
        if "default_model" in data:
            config.default_model = ModelConfig(**data["default_model"])
        elif "llm" in data:
            # 支持 llm 作为 default_model 的别名
            llm_data = data["llm"]
            config.default_model = ModelConfig(
                model=llm_data.get("default_model", "gpt-4o-mini"),
                api_key=llm_data.get("api_key"),
                base_url=llm_data.get("base_url"),
                temperature=llm_data.get("temperature", 1.0),
            )
        
        # 加载任务
        if "tasks" in data:
            for task_data in data["tasks"]:
                config.tasks.append(cls._parse_task(task_data))
        
        # 加载cron_jobs
        if "cron_jobs" in data:
            for job_data in data["cron_jobs"]:
                task_data = {**job_data, "mode": "cron"}
                config.tasks.append(cls._parse_task(task_data))
        
        # 加载heartbeat
        if "heartbeat" in data:
            hb_data = data["heartbeat"]
            checks = hb_data.get("checks", [])
            for check in checks:
                task_data = {
                    "name": check.get("name", "heartbeat-check"),
                    "mode": "heartbeat",
                    "heartbeat": check,
                    **{k: v for k, v in check.items() if k not in ["name", "condition", "action"]}
                }
                config.tasks.append(cls._parse_task(task_data))
        
        return config
    
    @staticmethod
    def _parse_task(data: Dict[str, Any]) -> TaskConfig:
        """解析任务配置"""
        mode = ScheduleMode(data.get("mode", "cron"))
        
        # 解析各模式配置
        cron_config = None
        heartbeat_config = None
        event_config = None
        
        if mode == ScheduleMode.CRON:
            cron_data = data.get("cron", {})
            if "schedule" in data:  # 简写形式
                cron_data["schedule"] = data["schedule"]
            cron_config = CronConfig(**cron_data)
        
        elif mode == ScheduleMode.HEARTBEAT:
            hb_data = data.get("heartbeat", {})
            if "interval" in data:
                hb_data["interval"] = data["interval"]
            if not hb_data.get("interval"):
                hb_data["interval"] = 1800  # 默认30分钟
            heartbeat_config = HeartbeatConfig(**hb_data)
        
        elif mode == ScheduleMode.EVENT:
            event_data = data.get("event", {})
            if "webhook_path" in data:
                event_data["webhook_path"] = data["webhook_path"]
            event_config = EventConfig(**event_data)
        
        # 解析模型配置
        model_config = None
        if "model" in data:
            model_data = data["model"]
            if isinstance(model_data, str):
                model_config = ModelConfig(model=model_data)
            else:
                model_config = ModelConfig(**model_data)
        
        # 解析重试策略
        retry_policy = RetryPolicy()
        if "retry_policy" in data:
            retry_policy = RetryPolicy(**data["retry_policy"])
        elif "retries" in data:
            retry_policy.max_attempts = data["retries"]
        
        return TaskConfig(
            name=data["name"],
            mode=mode,
            prompt=data.get("prompt"),
            command=data.get("command"),
            cron=cron_config,
            heartbeat=heartbeat_config,
            event=event_config,
            model=model_config,
            description=data.get("description"),
            enabled=data.get("enabled", True),
            timeout=data.get("timeout", 300.0),
            retry_policy=retry_policy,
            webhook_url=data.get("webhook_url"),
            notify_on_failure=data.get("notify_on_failure", True),
            notify_on_success=data.get("notify_on_success", False),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {}),
        )
    
    def to_yaml(self, path: Union[str, Path]):
        """保存配置到YAML文件"""
        path = Path(path)
        data = {
            "version": "1.0",
            "storage": {
                "type": self.storage.type,
                "path": self.storage.path,
            },
            "state_dir": self.state_dir,
            "log_dir": self.log_dir,
            "api": {
                "host": self.api_host,
                "port": self.api_port,
                "prefix": self.api_prefix,
            },
            "tasks": [],
        }
        
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, sort_keys=False)

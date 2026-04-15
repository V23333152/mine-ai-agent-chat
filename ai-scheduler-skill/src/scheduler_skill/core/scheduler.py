"""
统一混合调度器 - 核心引擎

支持三种调度模式:
1. Cron: 精确时间调度 (基于APScheduler)
2. Heartbeat: 智能检查调度 (OpenClaw风格)
3. Event: 事件驱动调度 (Webhook)
"""

import asyncio
import uuid
import logging
import inspect
import os
from typing import Dict, List, Optional, Callable, Any, Union
from datetime import datetime
from pathlib import Path

from .config import (
    TaskConfig, ScheduleMode, SchedulerConfig,
    CronConfig, HeartbeatConfig, EventConfig
)

# 通知界面支持
try:
    from ..notify_ui import notify_manager
    NOTIFY_UI_AVAILABLE = True
except ImportError:
    NOTIFY_UI_AVAILABLE = False
from .context import TaskContext
from .state import StateManager
from .models import ExecutionResult, ExecutionStatus, TaskInfo

logger = logging.getLogger("scheduler_skill")


class HybridScheduler:
    """
    统一混合调度器
    
    示例:
        >>> # 方式1: 从配置文件初始化
        >>> scheduler = HybridScheduler.from_config("scheduler.yaml")
        >>> 
        >>> # 方式2: 程序化配置
        >>> scheduler = HybridScheduler(config)
        >>> 
        >>> # 注册Cron任务
        >>> @scheduler.cron("0 9 * * *")
        >>> async def daily_task(ctx):
        ...     return await ctx.llm.generate("生成日报")
        >>> 
        >>> # 注册Heartbeat任务
        >>> @scheduler.heartbeat(interval=1800)
        >>> async def check_task(ctx):
        ...     if await has_alert():
        ...         return "有告警！"
        ...     return "HEARTBEAT_OK"
        >>> 
        >>> # 启动
        >>> await scheduler.start()
        >>> await scheduler.run_forever()
    """
    
    def __init__(self, config: Optional[SchedulerConfig] = None):
        """
        初始化调度器
        
        Args:
            config: 调度器配置，如果为None则使用默认配置
        """
        self.config = config or SchedulerConfig()
        
        # 任务存储
        self._tasks: Dict[str, TaskConfig] = {}
        self._handlers: Dict[str, Callable] = {}
        self._task_info: Dict[str, TaskInfo] = {}
        
        # 调度器引擎
        self._cron_scheduler = None  # APScheduler实例
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._event_handlers: Dict[str, Callable] = {}
        
        # 组件
        self.state_manager = StateManager(self.config.state_dir)
        self._llm_client = None
        self._storage = None
        self._http_client = None
        
        # 状态
        self._running = False
        self._startup_handlers: List[Callable] = []
        self._shutdown_handlers: List[Callable] = []
        
        # 启动时间
        self._started_at: Optional[datetime] = None
        
        # 通知界面
        self._notify_ui_enabled = getattr(self.config, 'notify_ui', {}).get('enabled', False)
        self._notify_ui_port = getattr(self.config, 'notify_ui', {}).get('port', 8765)
        self._notify_ui_auto_open = getattr(self.config, 'notify_ui', {}).get('auto_open_browser', True)
    
    @classmethod
    def from_config(cls, path: Union[str, Path]) -> "HybridScheduler":
        """从配置文件创建调度器"""
        config = SchedulerConfig.from_yaml(path)
        return cls(config)
    
    # ===== 属性访问 =====
    
    @property
    def llm_client(self):
        """获取LLM客户端（延迟初始化）"""
        if self._llm_client is None:
            from ..connectors.unified import UnifiedLLMClient
            self._llm_client = UnifiedLLMClient(self.config.default_model)
        return self._llm_client
    
    @property
    def storage(self):
        """获取存储客户端（延迟初始化）"""
        if self._storage is None:
            from ..storage.base import Storage
            self._storage = Storage.create(self.config.storage)
        return self._storage
    
    @property
    def http_client(self):
        """获取HTTP客户端（延迟初始化）"""
        if self._http_client is None:
            from ..connectors.http import HTTPClient
            self._http_client = HTTPClient()
        return self._http_client
    
    # ===== 生命周期 =====
    
    async def start(self):
        """启动调度器"""
        if self._running:
            return
        
        logger.info("正在启动 Hybrid Scheduler...")
        
        # 初始化存储
        await self.storage.initialize()
        
        # 初始化Cron调度器
        self._init_cron_scheduler()
        
        # 执行启动回调
        for handler in self._startup_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    handler()
            except Exception as e:
                logger.error(f"启动回调执行失败: {e}")
        
        # 加载配置文件中的任务
        for task_config in self.config.tasks:
            # 如果环境变量中配置了 webhook_url，注入到任务配置中
            if not task_config.webhook_url and os.getenv("AGENTS_WEBHOOK_URL"):
                task_config.webhook_url = os.getenv("AGENTS_WEBHOOK_URL")
            await self._register_task(task_config)
        
        # 启动通知界面服务器
        logger.info(f"[Scheduler] Notify UI check: enabled={self._notify_ui_enabled}, available={NOTIFY_UI_AVAILABLE}")
        if self._notify_ui_enabled and NOTIFY_UI_AVAILABLE:
            try:
                notify_manager.port = self._notify_ui_port
                logger.info(f"[Scheduler] Starting notify UI on port {self._notify_ui_port}...")
                await notify_manager.start(auto_open_browser=self._notify_ui_auto_open)
                logger.info(f"[Scheduler] Notify UI started on port {self._notify_ui_port}")
            except Exception as e:
                logger.warning(f"[Scheduler] Failed to start notify UI: {e}")
        
        self._running = True
        self._started_at = datetime.now()
        logger.info("Hybrid Scheduler 已启动")
    
    async def shutdown(self):
        """关闭调度器"""
        if not self._running:
            return
        
        logger.info("正在关闭 Hybrid Scheduler...")
        
        # 执行关闭回调
        for handler in self._shutdown_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    handler()
            except Exception as e:
                logger.error(f"关闭回调执行失败: {e}")
        
        # 停止通知界面服务器
        if self._notify_ui_enabled and NOTIFY_UI_AVAILABLE:
            try:
                await notify_manager.stop()
                logger.info("[Scheduler] Notify UI stopped")
            except Exception as e:
                logger.warning(f"[Scheduler] Failed to stop notify UI: {e}")
        
        # 停止Heartbeat任务
        for task in self._heartbeat_tasks.values():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        # 停止Cron调度器
        if self._cron_scheduler:
            self._cron_scheduler.shutdown(wait=True)
        
        # 关闭组件
        await self.storage.close()
        if self._http_client:
            await self._http_client.close()
        
        self._running = False
        logger.info("Hybrid Scheduler 已关闭")
    
    def _init_cron_scheduler(self):
        """初始化Cron调度器"""
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.executors.asyncio import AsyncIOExecutor
        
        executors = {
            'default': AsyncIOExecutor()
        }
        
        self._cron_scheduler = AsyncIOScheduler(executors=executors)
        self._cron_scheduler.start()
    
    # ===== 任务注册 =====
    
    async def register(self, config: TaskConfig, handler: Optional[Callable] = None):
        """
        注册任务
        
        Args:
            config: 任务配置
            handler: 可选，任务处理函数
        """
        if handler:
            config.handler = handler
        await self._register_task(config)
    
    async def _register_task(self, config: TaskConfig):
        """内部：注册任务到调度器"""
        task_id = str(uuid.uuid4())
        
        self._tasks[task_id] = config
        
        # 如果没有 handler 但有 prompt，自动生成一个默认 handler
        if not config.handler and config.prompt:
            config.handler = self._create_default_handler(config)
        
        if config.handler:
            self._handlers[task_id] = config.handler
        
        # 创建任务信息
        task_info = TaskInfo(
            id=task_id,
            name=config.name,
            mode=config.mode.value,
            description=config.description,
            enabled=config.enabled,
            tags=config.tags,
            created_at=datetime.now(),
        )
        
        # 根据调度模式设置schedule描述
        if config.mode == ScheduleMode.CRON and config.cron:
            task_info.schedule = config.cron.schedule
        elif config.mode == ScheduleMode.HEARTBEAT and config.heartbeat:
            task_info.schedule = f"every {config.heartbeat.interval}s"
        elif config.mode == ScheduleMode.EVENT and config.event:
            task_info.schedule = f"webhook {config.event.webhook_path}"
        
        self._task_info[task_id] = task_info
        
        # 根据模式注册到对应引擎
        if config.mode == ScheduleMode.CRON:
            await self._register_cron_task(task_id, config)
        elif config.mode == ScheduleMode.HEARTBEAT:
            await self._register_heartbeat_task(task_id, config)
        elif config.mode == ScheduleMode.EVENT:
            await self._register_event_task(task_id, config)
        
        logger.info(f"任务已注册: {config.name} (ID: {task_id}, Mode: {config.mode.value})")
        return task_id
    
    async def _register_cron_task(self, task_id: str, config: TaskConfig):
        """注册Cron任务"""
        from apscheduler.triggers.cron import CronTrigger
        
        cron_config = config.cron
        
        trigger = CronTrigger.from_crontab(
            cron_config.schedule,
            timezone=cron_config.timezone
        )
        
        self._cron_scheduler.add_job(
            func=self._execute_task,
            trigger=trigger,
            id=task_id,
            name=config.name,
            args=[task_id],
            replace_existing=True,
            max_instances=1,
        )
    
    async def _register_heartbeat_task(self, task_id: str, config: TaskConfig):
        """注册Heartbeat任务"""
        async def heartbeat_loop():
            """Heartbeat循环"""
            interval = config.heartbeat.interval
            
            while self._running:
                try:
                    await self._execute_task(task_id)
                except Exception as e:
                    logger.error(f"Heartbeat任务执行失败: {config.name}, error: {e}")
                
                await asyncio.sleep(interval)
        
        # 创建后台任务
        task = asyncio.create_task(heartbeat_loop())
        self._heartbeat_tasks[task_id] = task
    
    async def _register_event_task(self, task_id: str, config: TaskConfig):
        """注册Event任务（仅存储，由API层触发）"""
        # Event任务由Webhook API层处理
        self._event_handlers[config.event.webhook_path] = lambda data: self._execute_task(task_id)
    
    # ===== 装饰器API =====
    
    def cron(self, schedule: str, **kwargs):
        """
        装饰器：注册Cron任务
        
        Args:
            schedule: Cron表达式，如 "0 9 * * *"
            **kwargs: 其他配置参数
        
        示例:
            >>> @scheduler.cron("0 9 * * *")
            >>> async def daily_task(ctx: TaskContext):
            ...     return await ctx.llm.generate("生成日报")
        """
        def decorator(func: Callable) -> Callable:
            # 提取配置
            name = kwargs.get("name", func.__name__)
            
            config = TaskConfig(
                name=name,
                mode=ScheduleMode.CRON,
                handler=func,
                cron=CronConfig(schedule=schedule, **{k: v for k, v in kwargs.items() if k not in ["name"]}),
                prompt=kwargs.get("prompt"),
                description=kwargs.get("description", func.__doc__),
                enabled=kwargs.get("enabled", True),
                timeout=kwargs.get("timeout", 300.0),
                webhook_url=kwargs.get("webhook_url"),
                tags=kwargs.get("tags", []),
            )
            
            # 异步注册
            asyncio.create_task(self._register_task(config))
            
            return func
        return decorator
    
    def heartbeat(self, interval: int, **kwargs):
        """
        装饰器：注册Heartbeat任务
        
        Args:
            interval: 检查间隔(秒)
            **kwargs: 其他配置参数
        
        示例:
            >>> @scheduler.heartbeat(1800)  # 每30分钟
            >>> async def check_task(ctx: TaskContext):
            ...     if await has_alert():
            ...         return "有告警！"
            ...     return "HEARTBEAT_OK"  # 保持沉默
        """
        def decorator(func: Callable) -> Callable:
            name = kwargs.get("name", func.__name__)
            
            hb_config = HeartbeatConfig(
                interval=interval,
                speak_conditions=kwargs.get("speak_conditions", []),
                silent_hours=kwargs.get("silent_hours", (23, 7)),
                state_file=kwargs.get("state_file"),
                use_cheap_model=kwargs.get("use_cheap_model", True),
            )
            
            config = TaskConfig(
                name=name,
                mode=ScheduleMode.HEARTBEAT,
                handler=func,
                heartbeat=hb_config,
                description=kwargs.get("description", func.__doc__),
                enabled=kwargs.get("enabled", True),
                timeout=kwargs.get("timeout", 300.0),
                tags=kwargs.get("tags", []),
            )
            
            asyncio.create_task(self._register_task(config))
            
            return func
        return decorator
    
    def event(self, path: str, **kwargs):
        """
        装饰器：注册Event任务
        
        Args:
            path: Webhook路径
            **kwargs: 其他配置参数
        
        示例:
            >>> @scheduler.event("/webhooks/github")
            >>> async def deploy(ctx: TaskContext, payload: dict):
            ...     if payload.get("ref") == "refs/heads/main":
            ...         await deploy_app()
            ...     return "OK"
        """
        def decorator(func: Callable) -> Callable:
            name = kwargs.get("name", func.__name__)
            
            event_config = EventConfig(
                webhook_path=path,
                webhook_secret=kwargs.get("secret"),
                filter_expr=kwargs.get("filter"),
                rate_limit=kwargs.get("rate_limit"),
            )
            
            config = TaskConfig(
                name=name,
                mode=ScheduleMode.EVENT,
                handler=func,
                event=event_config,
                description=kwargs.get("description", func.__doc__),
                enabled=kwargs.get("enabled", True),
                tags=kwargs.get("tags", []),
            )
            
            asyncio.create_task(self._register_task(config))
            
            return func
        return decorator
    
    def on_startup(self, func: Callable):
        """装饰器：注册启动回调"""
        self._startup_handlers.append(func)
        return func
    
    def on_shutdown(self, func: Callable):
        """装饰器：注册关闭回调"""
        self._shutdown_handlers.append(func)
        return func
    
    # ===== 任务执行 =====
    
    async def _execute_task(self, task_id: str, event_data: Any = None) -> ExecutionResult:
        """
        执行任务
        
        Args:
            task_id: 任务ID
            event_data: 事件数据（Event模式使用）
        
        Returns:
            执行结果
        """
        config = self._tasks.get(task_id)
        if not config:
            raise ValueError(f"任务不存在: {task_id}")
        
        handler = config.handler or self._handlers.get(task_id)
        if not handler:
            raise ValueError(f"任务没有处理函数: {config.name}")
        
        # 创建执行上下文
        execution_id = str(uuid.uuid4())
        ctx = TaskContext(
            task_id=task_id,
            task_name=config.name,
            execution_id=execution_id,
            started_at=datetime.now(),
            metadata=config.metadata,
            _scheduler=self,
        )
        
        # 兜底注入 webhook_url（防止配置文件任务缺失）
        if not config.webhook_url and os.getenv("AGENTS_WEBHOOK_URL"):
            config.webhook_url = os.getenv("AGENTS_WEBHOOK_URL")
            logger.info(f"[Scheduler] Injected webhook_url for {config.name}")

        # 更新任务状态
        task_info = self._task_info[task_id]
        task_info.status = "running"

        # 记录开始
        logger.info(f"开始执行任务: {config.name} (执行ID: {execution_id}, webhook_url={config.webhook_url})")

        # 发送任务开始通知
        if self._notify_ui_enabled and NOTIFY_UI_AVAILABLE:
            try:
                await notify_manager.send_task_start(config.name, config.prompt or "")
            except Exception as e:
                logger.debug(f"[Scheduler] Failed to send start notification: {e}")
        # 注意：不要在任务开始时就记录成功，这会污染统计
        # await self.state_manager.record_task_success(task_id, config.name)
        
        # 执行
        result = None
        error = None
        status = ExecutionStatus.SUCCESS
        
        retry_policy = config.retry_policy
        
        for attempt in range(1, retry_policy.max_attempts + 1):
            ctx.attempt = attempt
            
            try:
                # 设置超时
                if config.mode == ScheduleMode.EVENT and event_data is not None:
                    result = await asyncio.wait_for(
                        self._call_handler(handler, ctx, event_data),
                        timeout=config.timeout
                    )
                else:
                    result = await asyncio.wait_for(
                        self._call_handler(handler, ctx),
                        timeout=config.timeout
                    )
                
                # 处理Heartbeat的"沉默"
                if config.mode == ScheduleMode.HEARTBEAT:
                    if result == "HEARTBEAT_OK" or result is None:
                        await self.state_manager.mark_silent(config.name)
                    else:
                        await self.state_manager.mark_spoke(config.name, "speak", result)
                
                # 发送任务完成通知
                if self._notify_ui_enabled and NOTIFY_UI_AVAILABLE:
                    try:
                        await notify_manager.send_task_result(config.name, str(result))
                    except Exception as e:
                        logger.debug(f"[Scheduler] Failed to send result notification: {e}")
                
                # 执行成功
                break
                
            except asyncio.TimeoutError:
                error = f"任务执行超时 ({config.timeout}秒)"
                logger.error(f"任务超时: {config.name}")
                status = ExecutionStatus.TIMEOUT
                
                if attempt < retry_policy.max_attempts:
                    delay = retry_policy.get_delay(attempt)
                    logger.info(f"{delay}秒后重试...")
                    await asyncio.sleep(delay)
                else:
                    await self.state_manager.record_task_failure(task_id, error, config.name)
                    
            except Exception as e:
                error = str(e)
                logger.error(f"任务执行失败 (尝试 {attempt}): {e}")
                status = ExecutionStatus.FAILED
                
                if attempt < retry_policy.max_attempts:
                    delay = retry_policy.get_delay(attempt)
                    logger.info(f"{delay}秒后重试...")
                    await asyncio.sleep(delay)
                else:
                    await self.state_manager.record_task_failure(task_id, error, config.name)
        
        # 计算执行时间
        completed_at = datetime.now()
        duration_ms = (completed_at - ctx.started_at).total_seconds() * 1000
        
        # 更新任务状态
        if status == ExecutionStatus.SUCCESS:
            task_info.status = "idle"
            task_info.successful_runs += 1
            await self.state_manager.record_task_success(task_id, config.name)
        else:
            task_info.status = "error"
            task_info.failed_runs += 1
        
        task_info.last_run = completed_at
        task_info.total_runs += 1
        
        # 创建执行结果
        execution_result = ExecutionResult(
            execution_id=execution_id,
            task_id=task_id,
            task_name=config.name,
            status=status,
            started_at=ctx.started_at,
            completed_at=completed_at,
            result=result,
            error=error,
            attempt=ctx.attempt,
            duration_ms=duration_ms,
        )
        
        # 发送Webhook通知
        if config.webhook_url:
            logger.info(f"[Scheduler] Sending webhook for {config.name} to {config.webhook_url}")
            await self._send_webhook(config.webhook_url, execution_result)
            logger.info(f"[Scheduler] Webhook sent successfully for {config.name}")
        else:
            logger.warning(f"[Scheduler] No webhook_url configured for {config.name}, skipping webhook")

        try:
            await self.storage.save_execution_history(
                task_id=task_id,
                status=status.value,
                output=str(result) if result is not None else None,
                error=error,
                started_at=ctx.started_at.isoformat() if ctx.started_at else None,
                finished_at=completed_at.isoformat() if completed_at else None,
                duration_ms=int(duration_ms),
            )
        except Exception as e:
            logger.warning(f"保存执行历史失败: {e}")

        logger.info(f"任务执行完成: {config.name}, 状态: {status.value}, 耗时: {duration_ms:.2f}ms")

        return execution_result
    
    async def _call_handler(self, handler: Callable, ctx: TaskContext, event_data: Any = None) -> Any:
        """调用任务处理函数"""
        sig = inspect.signature(handler)
        
        if event_data is not None and len(sig.parameters) > 1:
            # Event模式，传递event_data
            return await handler(ctx, event_data) if asyncio.iscoroutinefunction(handler) else handler(ctx, event_data)
        elif len(sig.parameters) > 0:
            return await handler(ctx) if asyncio.iscoroutinefunction(handler) else handler(ctx)
        else:
            return await handler() if asyncio.iscoroutinefunction(handler) else handler()
    
    async def _send_webhook(self, url: str, result: ExecutionResult):
        """发送Webhook通知"""
        try:
            from ..connectors.http import HTTPClient
            async with HTTPClient() as client:
                await client.post(url, json=result.to_dict())
        except Exception as e:
            logger.error(f"Webhook发送失败: {e}")
    
    # ===== 任务管理 =====
    
    async def trigger_task(self, task_id: str) -> ExecutionResult:
        """手动触发任务"""
        return await self._execute_task(task_id)
    
    def _create_default_handler(self, config: TaskConfig):
        """为配置任务创建默认 handler（支持变量替换和联网搜索）"""
        async def default_handler(ctx):
            import time
            task_start = time.time()
            prompt = config.prompt or ""
            ctx.log.info(f"[DefaultHandler] TASK START: task={config.name}, prompt_length={len(prompt)}")

            # 支持动态变量替换
            if "{{" in prompt:
                from datetime import datetime
                now = datetime.now()
                weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

                # 基础时间变量
                variables = {
                    "date": now.strftime("%Y年%m月%d日"),
                    "weekday": weekdays[now.weekday()],
                    "time": now.strftime("%H:%M"),
                }

                ctx.log.info(f"[DefaultHandler] Base variables: {variables}")

                # 尝试获取天气信息
                try:
                    weather_info = await self._get_weather_for_handler()
                    variables.update(weather_info)
                    ctx.log.info(f"[DefaultHandler] Weather: {weather_info}")
                except Exception as e:
                    ctx.log.warning(f"[DefaultHandler] 天气获取失败: {e}")
                    variables.update({
                        "weather": "晴朗",
                        "temperature": "20-28°C",
                        "clothing_advice": "天气舒适，建议穿着轻便",
                        "travel_advice": "适合出行",
                        "festival": "无特殊节日"
                    })

                # 替换变量
                for key, value in variables.items():
                    prompt = prompt.replace(f"{{{{{key}}}}}", str(value))

                ctx.log.info(f"[DefaultHandler] Processed prompt: {prompt[:200]}...")

            # 检测是否需要联网搜索
            # 只有当提示词明确包含"新闻"相关词汇时才触发搜索
            news_keywords = ["新闻", "热点", "头条", "资讯", "要闻"]
            needs_search = any(keyword in prompt for keyword in news_keywords)

            ctx.log.info(f"[DefaultHandler] Search check: needs_search={needs_search} (keywords: {news_keywords})")

            ctx.log.info(f"[DefaultHandler] Search check: keywords in prompt={needs_search}, prompt={prompt[:100]}...")

            if needs_search:
                ctx.log.info(f"[DefaultHandler] Search keywords detected, performing web search...")
                try:
                    # 提取搜索查询（简单实现：使用提示词的前50个字符作为搜索词）
                    from ..connectors.search import search_manager

                    # 检查搜索功能是否可用
                    ctx.log.info(f"[DefaultHandler] Search manager available: {search_manager.is_available()}")
                    ctx.log.info(f"[DefaultHandler] TAVILY_API_KEY in env: {bool(os.getenv('TAVILY_API_KEY'))}")

                    # 构建搜索查询
                    search_query = self._extract_search_query(prompt)
                    ctx.log.info(f"[DefaultHandler] Search query: {search_query}")

                    if search_manager.is_available():
                        from datetime import datetime
                        today = datetime.now().strftime("%Y年%m月%d日")

                        # 官方媒体域名列表（最安全）
                        official_domains = [
                            "people.com.cn", "people.cn",
                            "xinhuanet.com", "news.cn",
                            "cctv.com", "news.cctv.com",
                            "chinadaily.com.cn",
                            "china.com.cn",
                        ]

                        # 构建搜索查询（只搜索1次，减少耗时）
                        search_queries = [
                            f"{today} 重要事件",
                        ]
                        ctx.log.info(f"[DefaultHandler] Will perform {len(search_queries)} searches to get more results")

                        # 执行多次搜索并合并结果
                        import time
                        search_start_time = time.time()
                        all_results = []
                        search_stats = []

                        for idx, query in enumerate(search_queries, 1):
                            query_start = time.time()
                            try:
                                ctx.log.info(f"[DefaultHandler] Search {idx}/{len(search_queries)} START: '{query}'")
                                raw_result = await asyncio.wait_for(
                                    search_manager.search(
                                        query=query,
                                        max_results=5,
                                        include_answer=True,
                                        search_depth="basic",  # 使用 basic 更快
                                        include_domains=official_domains
                                    ),
                                    timeout=20.0  # 减少到20秒，给LLM更多时间
                                )
                                query_elapsed = time.time() - query_start
                                if raw_result and raw_result.get("results"):
                                    result_count = len(raw_result["results"])
                                    all_results.extend(raw_result["results"])
                                    search_stats.append({"query": query, "results": result_count, "time": f"{query_elapsed:.2f}s", "status": "success"})
                                    ctx.log.info(f"[DefaultHandler] Search {idx} SUCCESS: {result_count} results in {query_elapsed:.2f}s")
                                else:
                                    search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": "empty"})
                                    ctx.log.warning(f"[DefaultHandler] Search {idx} EMPTY: no results in {query_elapsed:.2f}s")
                            except asyncio.TimeoutError:
                                query_elapsed = time.time() - query_start
                                search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": "timeout"})
                                ctx.log.error(f"[DefaultHandler] Search {idx} TIMEOUT after {query_elapsed:.2f}s: '{query}'")
                            except Exception as e:
                                query_elapsed = time.time() - query_start
                                search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": f"error:{str(e)[:50]}"})
                                ctx.log.error(f"[DefaultHandler] Search {idx} ERROR after {query_elapsed:.2f}s: {e}")

                        total_search_time = time.time() - search_start_time
                        ctx.log.info(f"[DefaultHandler] ALL SEARCHES COMPLETE: {len(all_results)} total raw results in {total_search_time:.2f}s")
                        ctx.log.info(f"[DefaultHandler] Search stats: {search_stats}")

                        # 去重：基于URL去重
                        dedup_start = time.time()
                        seen_urls = set()
                        unique_results = []
                        duplicates = 0
                        for result in all_results:
                            url = result.get("url", "")
                            if url and url not in seen_urls:
                                seen_urls.add(url)
                                unique_results.append(result)
                            else:
                                duplicates += 1
                                if url:
                                    ctx.log.debug(f"[DefaultHandler] Duplicate URL removed: {url[:80]}...")

                        dedup_time = time.time() - dedup_start
                        ctx.log.info(f"[DefaultHandler] DEDUP COMPLETE: {len(unique_results)} unique, {duplicates} duplicates removed, took {dedup_time:.2f}s")

                        # 格式化合并后的结果（极简格式，避免敏感内容）
                        format_start = time.time()
                        if unique_results:
                            # 手动格式化结果，只保留标题和链接，不保留摘要
                            results_to_use = unique_results[:5]  # 最多取5条
                            lines = []
                            for i, result in enumerate(results_to_use, 1):
                                title = result.get("title", "无标题")
                                url = result.get("url", "")
                                # 只保留标题和链接，避免摘要中的敏感内容
                                lines.append(f"{i}. {title} - {url}")

                            search_results = "\n".join(lines)
                            format_time = time.time() - format_start
                            ctx.log.info(f"[DefaultHandler] FORMAT COMPLETE: {len(results_to_use)} entries formatted into {len(search_results)} chars, took {format_time:.2f}s")
                        else:
                            search_results = "[搜索未返回结果]"
                            ctx.log.warning("[DefaultHandler] FORMAT: No results to format")

                        # 针对内容整理优化提示词（要求快速输出）
                        enhanced_prompt = f"""快速整理以下材料为10条。只输出编号列表，不要有引言、结论或其他文字。

格式：
1. [标题](链接) - 一句话简述
2. [标题](链接) - 一句话简述
...
5. [标题](链接) - 一句话简述

材料：
{search_results}

直接输出5条："""
                        prompt = enhanced_prompt
                    else:
                        ctx.log.warning("[DefaultHandler] Search not available: TAVILY_API_KEY not configured")
                        prompt = f"""【注意：联网搜索功能未配置，以下回答可能不包含最新信息】

{prompt}"""
                except Exception as e:
                    ctx.log.error(f"[DefaultHandler] Search failed: {e}")
                    # 搜索失败，继续使用原始提示词

            # 使用 LLM 生成响应（带超时）
            llm_start = time.time()
            LLM_TIMEOUT = 120.0  # 增加到120秒
            ctx.log.info(f"[DefaultHandler] LLM GENERATION START: prompt length={len(prompt)} chars, timeout={LLM_TIMEOUT}s")
            try:
                result = await asyncio.wait_for(
                    self.llm_client.generate(prompt),
                    timeout=LLM_TIMEOUT  # LLM 调用最多120秒
                )
                llm_elapsed = time.time() - llm_start
                result_lines = result.strip().split('\n') if result else []
                # 统计输出中有多少条（通过行首的数字+点判断）
                entry_count = sum(1 for line in result_lines if line.strip() and line.strip()[0].isdigit() and '. ' in line[:5])
                ctx.log.info(f"[DefaultHandler] LLM GENERATION SUCCESS: {llm_elapsed:.2f}s, output={len(result)} chars, ~{entry_count} entries")
                ctx.log.info(f"[DefaultHandler] Result preview: {result[:200]}...")
                total_time = time.time() - task_start
                ctx.log.info(f"[DefaultHandler] TASK COMPLETE: total_time={total_time:.2f}s")
                return result
            except asyncio.TimeoutError:
                llm_elapsed = time.time() - llm_start
                total_time = time.time() - task_start
                ctx.log.error(f"[DefaultHandler] LLM GENERATION TIMEOUT after {llm_elapsed:.2f}s (limit: {LLM_TIMEOUT}s), total={total_time:.2f}s")
                return f"【错误】LLM生成超时（已等待{llm_elapsed:.1f}秒），请稍后重试"
            except Exception as e:
                llm_elapsed = time.time() - llm_start
                total_time = time.time() - task_start
                ctx.log.error(f"[DefaultHandler] LLM GENERATION ERROR after {llm_elapsed:.2f}s, total={total_time:.2f}s: {e}")
                return f"【错误】LLM生成失败: {str(e)[:100]}"
        return default_handler

    def _extract_search_query(self, prompt: str) -> str:
        """从提示词中提取搜索查询"""
        from datetime import datetime
        today = datetime.now()
        today_str = today.strftime("%Y年%m月%d日")
        today_str_short = today.strftime("%-m月%-d日")

        # 移除常见的指令性词语
        remove_words = [
            "请", "帮我", "给我", "为我", "需要", "想要", "希望",
            "生成", "创建", "制作", "写", "整理", "总结", "概括",
            "一个", "一份", "一篇", "一条",
            "搜索", "查询", "查找", "查一下", "找找", "联网",
        ]

        query = prompt
        for word in remove_words:
            query = query.replace(word, "")

        # 清理并截断
        query = query.strip().replace("  ", " ")

        # 针对新闻场景优化：强制添加今日日期以获得最新结果（使用中性词汇）
        if "新闻" in prompt or "热点" in prompt or "头条" in prompt or "资讯" in prompt:
            # 保留用户提取的查询词，添加日期和扩展词
            if query:
                query = f"{today_str} {query} 动态"
            else:
                query = f"{today_str} 重要事件 最新动态"
            logger.info(f"[DefaultHandler] Enhanced news query with date: {query}")

        # 如果提取后为空，构建一个默认的查询
        if not query:
            query = f"{today_str} 重要事件 最新"

        return query if query else prompt
    
    async def _get_weather_for_handler(self) -> dict:
        """获取天气信息（供 handler 使用）"""
        import os
        import aiohttp
        
        amap_key = os.getenv("AMAP_WEBSERVICE_KEY")
        if not amap_key:
            raise ValueError("AMAP_WEBSERVICE_KEY not set")
        
        city_code = "110000"  # 北京市
        url = f"https://restapi.amap.com/v3/weather/weatherInfo?key={amap_key}&city={city_code}&extensions=all"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
                
                if data.get("status") == "1" and data.get("forecasts"):
                    forecast = data["forecasts"][0]["casts"][0]
                    
                    weather = forecast.get("dayweather", "晴")
                    temp_high = forecast.get("daytemp", "25")
                    temp_low = forecast.get("nighttemp", "15")
                    
                    temp_avg = (int(temp_high) + int(temp_low)) / 2
                    if temp_avg < 10:
                        clothing = "天气寒冷，建议穿厚外套、毛衣"
                    elif temp_avg < 20:
                        clothing = "天气较凉，建议穿长袖、薄外套"
                    elif temp_avg < 28:
                        clothing = "天气舒适，建议穿短袖、薄衫"
                    else:
                        clothing = "天气炎热，建议穿轻薄透气的衣物"
                    
                    if "雨" in weather:
                        travel = "有雨，出门请带伞，注意路面湿滑"
                    elif "雪" in weather:
                        travel = "有雪，注意保暖和交通安全"
                    elif "雾" in weather or "霾" in weather:
                        travel = "能见度较低，驾车请减速慢行"
                    else:
                        travel = "天气良好，适合出行"
                    
                    return {
                        "weather": weather,
                        "temperature": f"{temp_low}-{temp_high}°C",
                        "clothing_advice": clothing,
                        "travel_advice": travel,
                        "festival": "请关注当日节日信息"
                    }
                else:
                    raise ValueError(f"天气API返回错误: {data}")

    async def pause_task(self, task_id: str):
        """暂停任务"""
        if task_id in self._tasks:
            config = self._tasks[task_id]
            config.enabled = False
            self._task_info[task_id].status = "paused"
            
            if config.mode == ScheduleMode.CRON:
                self._cron_scheduler.pause_job(task_id)
    
    async def resume_task(self, task_id: str):
        """恢复任务"""
        if task_id in self._tasks:
            config = self._tasks[task_id]
            config.enabled = True
            self._task_info[task_id].status = "idle"
            
            if config.mode == ScheduleMode.CRON:
                self._cron_scheduler.resume_job(task_id)
    
    async def remove_task(self, task_id: str):
        """移除任务"""
        if task_id not in self._tasks:
            return
        
        config = self._tasks[task_id]
        
        # 从调度器移除
        if config.mode == ScheduleMode.CRON:
            try:
                self._cron_scheduler.remove_job(task_id)
            except Exception:
                pass
        elif config.mode == ScheduleMode.HEARTBEAT and task_id in self._heartbeat_tasks:
            self._heartbeat_tasks[task_id].cancel()
        
        # 从存储移除
        del self._tasks[task_id]
        if task_id in self._handlers:
            del self._handlers[task_id]
        if task_id in self._task_info:
            del self._task_info[task_id]
    
    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        """获取任务信息"""
        return self._task_info.get(task_id)
    
    def list_tasks(self) -> List[TaskInfo]:
        """列出所有任务"""
        return list(self._task_info.values())
    
    # ===== 运行控制 =====
    
    async def run_forever(self):
        """保持运行"""
        try:
            while self._running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            await self.shutdown()
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            "running": self._running,
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "total_tasks": len(self._tasks),
            "cron_tasks": sum(1 for t in self._tasks.values() if t.mode == ScheduleMode.CRON),
            "heartbeat_tasks": sum(1 for t in self._tasks.values() if t.mode == ScheduleMode.HEARTBEAT),
            "event_tasks": sum(1 for t in self._tasks.values() if t.mode == ScheduleMode.EVENT),
        }

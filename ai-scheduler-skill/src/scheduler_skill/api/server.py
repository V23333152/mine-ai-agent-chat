"""
REST API服务器 - 提供HTTP接口

支持多语言集成，提供完整的RESTful API
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime

from ..core.scheduler import HybridScheduler
from ..core.config import SchedulerConfig, TaskConfig, ScheduleMode, CronConfig, HeartbeatConfig, EventConfig, ModelConfig
from ..core.models import ExecutionResult


# ===== Pydantic模型 =====

class CreateCronTaskRequest(BaseModel):
    """创建Cron任务请求"""
    name: str = Field(..., description="任务名称")
    schedule: str = Field(..., description="Cron表达式，如 '0 9 * * *'")
    prompt: Optional[str] = Field(None, description="AI提示词")
    model: str = Field("gpt-4o-mini", description="模型名称")
    description: Optional[str] = Field(None, description="任务描述")
    timezone: str = Field("UTC", description="时区")


class CreateHeartbeatTaskRequest(BaseModel):
    """创建Heartbeat任务请求"""
    name: str = Field(..., description="任务名称")
    interval: int = Field(..., description="检查间隔（秒）")
    check_prompt: Optional[str] = Field(None, description="检查提示词")
    description: Optional[str] = Field(None, description="任务描述")


class CreateEventTaskRequest(BaseModel):
    """创建Event任务请求"""
    name: str = Field(..., description="任务名称")
    webhook_path: str = Field(..., description="Webhook路径，如 '/webhooks/github'")
    description: Optional[str] = Field(None, description="任务描述")


class TaskResponse(BaseModel):
    """任务响应"""
    id: str
    name: str
    mode: str
    description: Optional[str]
    schedule: Optional[str]
    enabled: bool
    status: str
    total_runs: int
    created_at: Optional[str]


class ExecutionResponse(BaseModel):
    """执行结果响应"""
    execution_id: str
    task_id: str
    task_name: str
    status: str
    result: Optional[str]
    error: Optional[str]
    duration_ms: float


class StatsResponse(BaseModel):
    """统计信息响应"""
    running: bool
    started_at: Optional[str]
    total_tasks: int
    cron_tasks: int
    heartbeat_tasks: int
    event_tasks: int


# ===== API服务器 =====

class APIServer:
    """
    REST API服务器
    
    提供HTTP接口供外部调用
    
    示例:
        >>> server = APIServer.from_config("scheduler.yaml")
        >>> await server.start()
    """
    
    def __init__(self, config: SchedulerConfig):
        self.config = config
        self.scheduler: Optional[HybridScheduler] = None
        self.app: Optional[FastAPI] = None
    
    @classmethod
    def from_config(cls, path: str) -> "APIServer":
        """从配置文件创建服务器"""
        config = SchedulerConfig.from_yaml(path)
        return cls(config)
    
    def create_app(self) -> FastAPI:
        """创建FastAPI应用"""
        
        @asynccontextmanager
        async def lifespan(app: FastAPI):
            # 启动时
            self.scheduler = HybridScheduler(self.config)
            await self.scheduler.start()
            yield
            # 关闭时
            await self.scheduler.shutdown()
        
        app = FastAPI(
            title="AI Scheduler API",
            description="统一混合调度系统REST API",
            version="1.0.0",
            lifespan=lifespan
        )
        
        # CORS
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        prefix = self.config.api_prefix
        
        # ===== 任务管理接口 =====
        
        @app.post(f"{prefix}/tasks/cron", response_model=dict)
        async def create_cron_task(request: CreateCronTaskRequest):
            """创建Cron任务"""
            task_config = TaskConfig(
                name=request.name,
                mode=ScheduleMode.CRON,
                prompt=request.prompt,
                cron=CronConfig(
                    schedule=request.schedule,
                    timezone=request.timezone
                ),
                model=ModelConfig(model=request.model),
                description=request.description,
            )
            
            async def handler(ctx):
                if request.prompt:
                    result = await ctx.llm.generate(request.prompt)
                    return result
                return "No prompt provided"
            
            task_config.handler = handler
            task_id = await self.scheduler._register_task(task_config)
            
            return {
                "task_id": task_id,
                "name": request.name,
                "schedule": request.schedule,
                "message": "Cron任务已创建"
            }
        
        @app.post(f"{prefix}/tasks/heartbeat", response_model=dict)
        async def create_heartbeat_task(request: CreateHeartbeatTaskRequest):
            """创建Heartbeat任务"""
            task_config = TaskConfig(
                name=request.name,
                mode=ScheduleMode.HEARTBEAT,
                heartbeat=HeartbeatConfig(
                    interval=request.interval,
                ),
                description=request.description,
            )
            
            async def handler(ctx):
                if request.check_prompt:
                    result = await ctx.llm.generate(request.check_prompt)
                    if "HEARTBEAT_OK" in result:
                        return "HEARTBEAT_OK"
                    return result
                return "HEARTBEAT_OK"
            
            task_config.handler = handler
            task_id = await self.scheduler._register_task(task_config)
            
            return {
                "task_id": task_id,
                "name": request.name,
                "interval": request.interval,
                "message": "Heartbeat任务已创建"
            }
        
        @app.post(f"{prefix}/tasks/event", response_model=dict)
        async def create_event_task(request: CreateEventTaskRequest):
            """创建Event任务"""
            task_config = TaskConfig(
                name=request.name,
                mode=ScheduleMode.EVENT,
                event=EventConfig(
                    webhook_path=request.webhook_path,
                ),
                description=request.description,
            )
            
            async def handler(ctx, payload):
                ctx.log.info(f"Event received: {payload}")
                return {"received": True, "payload": payload}
            
            task_config.handler = handler
            task_id = await self.scheduler._register_task(task_config)
            
            return {
                "task_id": task_id,
                "name": request.name,
                "webhook_path": request.webhook_path,
                "message": "Event任务已创建"
            }
        
        @app.get(f"{prefix}/tasks", response_model=list)
        async def list_tasks():
            """列出所有任务"""
            tasks = self.scheduler.list_tasks()
            return [task.to_dict() for task in tasks]
        
        @app.get(f"{prefix}/tasks/{{task_id}}", response_model=dict)
        async def get_task(task_id: str):
            """获取任务详情"""
            task = self.scheduler.get_task(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="Task not found")
            return task.to_dict()
        
        @app.post(f"{prefix}/tasks/{{task_id}}/trigger", response_model=dict)
        async def trigger_task(task_id: str, background_tasks: BackgroundTasks):
            """手动触发任务"""
            task = self.scheduler.get_task(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="Task not found")
            
            result = await self.scheduler.trigger_task(task_id)
            
            return {
                "execution_id": result.execution_id,
                "status": result.status.value,
                "duration_ms": result.duration_ms,
            }
        
        @app.post(f"{prefix}/tasks/{{task_id}}/pause")
        async def pause_task(task_id: str):
            """暂停任务"""
            await self.scheduler.pause_task(task_id)
            return {"message": "Task paused"}
        
        @app.post(f"{prefix}/tasks/{{task_id}}/resume")
        async def resume_task(task_id: str):
            """恢复任务"""
            await self.scheduler.resume_task(task_id)
            return {"message": "Task resumed"}
        
        @app.delete(f"{prefix}/tasks/{{task_id}}")
        async def delete_task(task_id: str):
            """删除任务"""
            await self.scheduler.remove_task(task_id)
            return {"message": "Task deleted"}
        
        # ===== Webhook接口 =====
        
        @app.post(f"{prefix}/webhooks/{{path:path}}")
        async def handle_webhook(path: str, payload: dict):
            """处理Webhook"""
            # 查找匹配的Event任务
            for task_id, config in self.scheduler._tasks.items():
                if config.mode == ScheduleMode.EVENT and config.event:
                    if config.event.webhook_path == f"/{path}":
                        result = await self.scheduler._execute_task(task_id, payload)
                        return {
                            "received": True,
                            "execution_id": result.execution_id,
                        }
            
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        # ===== 统计接口 =====
        
        @app.get(f"{prefix}/stats", response_model=StatsResponse)
        async def get_stats():
            """获取统计信息"""
            stats = self.scheduler.get_stats()
            return StatsResponse(**stats)
        
        @app.get("/health")
        async def health_check():
            """健康检查"""
            return {
                "status": "healthy",
                "service": "ai-scheduler",
                "version": "1.0.0"
            }
        
        @app.get("/")
        async def root():
            """API信息"""
            return {
                "name": "AI Scheduler API",
                "version": "1.0.0",
                "docs": "/docs",
                "health": "/health"
            }
        
        self.app = app
        return app
    
    async def start(self):
        """启动服务器"""
        import uvicorn
        
        if self.app is None:
            self.create_app()
        
        config = uvicorn.Config(
            self.app,
            host=self.config.api_host,
            port=self.config.api_port,
            log_level="info"
        )
        server = uvicorn.Server(config)
        await server.serve()


# 快捷启动函数
def main():
    """主入口"""
    import sys
    
    config_path = sys.argv[1] if len(sys.argv) > 1 else "scheduler.yaml"
    
    if not Path(config_path).exists():
        print(f"Config file not found: {config_path}")
        print("Creating default config...")
        
        # 创建默认配置
        config = SchedulerConfig()
        config.to_yaml(config_path)
    
    server = APIServer.from_config(config_path)
    
    import asyncio
    asyncio.run(server.start())


if __name__ == "__main__":
    main()

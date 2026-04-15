"""
AI Scheduler Skill 实现

提供自然语言接口创建和管理定时任务。
"""

import os
import sys
from typing import Optional, Dict, Any, List
from datetime import datetime

# 确保可以导入 scheduler_skill
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pathlib import Path
from pydantic import BaseModel, Field

# Skill 元数据
skill_metadata = {
    "id": "ai-scheduler",
    "name": "AI 定时任务调度器",
    "version": "1.0.0",
    "description": "通过自然语言创建和管理定时任务，支持 Cron 定时、Heartbeat 智能检查和 Event 事件驱动三种模式",
    "author": "AI Scheduler Team",
    "type": "native",
}


class SkillConfig(BaseModel):
    """Skill 配置"""
    api_key: Optional[str] = Field(None, description="API Key，默认从环境变量 MOONSHOT_API_KEY 读取")
    base_url: Optional[str] = Field("https://api.moonshot.cn/v1", description="API Base URL")
    default_model: str = Field("moonshot-v1-8k", description="默认使用的模型")
    timezone: str = Field("Asia/Shanghai", description="默认时区")
    notify_ui_enabled: bool = Field(True, description="是否启用通知界面")


class ScheduledTaskInfo(BaseModel):
    """任务信息"""
    id: str
    name: str
    mode: str  # cron, heartbeat, event
    schedule: str
    status: str  # idle, running, paused
    prompt: str
    created_at: str
    total_runs: int = 0
    enabled: bool = True


class SchedulerSkill:
    """
    AI Scheduler Skill 核心类

    提供完整的定时任务管理能力：
    - 创建定时任务（Cron 模式）
    - 创建智能检查任务（Heartbeat 模式）
    - 列出所有任务
    - 删除任务
    - 立即触发任务
    """

    def __init__(self, config: SkillConfig):
        self.config = config
        self._scheduler = None
        self._tasks: Dict[str, ScheduledTaskInfo] = {}

    async def initialize(self) -> bool:
        """初始化调度器"""
        try:
            from ..core.scheduler import HybridScheduler
            from ..core.config import SchedulerConfig, ModelConfig

            # 设置环境变量
            if self.config.api_key:
                os.environ["OPENAI_API_KEY"] = self.config.api_key
            if self.config.base_url:
                os.environ["OPENAI_BASE_URL"] = self.config.base_url

            # 创建配置
            scheduler_config = SchedulerConfig()
            scheduler_config.default_model = ModelConfig(
                model=self.config.default_model,
                api_key=self.config.api_key,
                base_url=self.config.base_url
            )
            scheduler_config.notify_ui = {
                "enabled": self.config.notify_ui_enabled,
                "port": 8765,
                "auto_open_browser": True
            }

            self._scheduler = HybridScheduler(scheduler_config)
            await self._scheduler.start()

            print(f"[SchedulerSkill] 调度器已启动，模型: {self.config.default_model}")
            return True

        except Exception as e:
            print(f"[SchedulerSkill] 初始化失败: {e}")
            return False

    async def destroy(self):
        """关闭调度器"""
        if self._scheduler:
            await self._scheduler.shutdown()
            print("[SchedulerSkill] 调度器已关闭")

    # ===== 工具方法 =====

    async def schedule_cron_task(
        self,
        name: str,
        schedule_description: str,
        prompt: str,
        timezone: Optional[str] = None
    ) -> str:
        """
        创建定时任务（Cron 模式）

        Args:
            name: 任务名称，如 "每日晨报", "下班提醒"
            schedule_description: 时间描述，如 "每天早上8点", "每周五下午6点", "每30分钟"
            prompt: AI 执行时使用的提示词
            timezone: 时区，默认为 Asia/Shanghai

        Returns:
            创建结果信息

        示例:
            "每天早上8点发送晨报" -> schedule_cron_task("晨报", "每天早上8点", "生成今日晨报...")
            "每小时检查一次邮件" -> schedule_cron_task("邮件检查", "每小时", "检查新邮件...")
        """
        # 将自然语言时间转换为 Cron 表达式
        cron_expr = self._parse_time_description(schedule_description)

        try:
            from ..core.config import TaskConfig, CronConfig, ModelConfig, ScheduleMode

            config = TaskConfig(
                name=name,
                mode=ScheduleMode.CRON,
                prompt=prompt,
                cron=CronConfig(
                    schedule=cron_expr,
                    timezone=timezone or self.config.timezone
                ),
                model=ModelConfig(model=self.config.default_model),
                enabled=True
            )

            # 创建处理器
            async def handler(ctx):
                # 支持变量替换
                processed_prompt = self._substitute_variables(prompt)
                result = await ctx.llm.generate(processed_prompt)
                ctx.log.info(f"任务执行完成: {result[:100]}...")
                return result

            config.handler = handler

            # 注册任务
            task_id = await self._scheduler._register_task(config)

            # 保存任务信息
            self._tasks[task_id] = ScheduledTaskInfo(
                id=task_id,
                name=name,
                mode="cron",
                schedule=cron_expr,
                status="idle",
                prompt=prompt,
                created_at=datetime.now().isoformat()
            )

            return f"✅ 定时任务已创建\n名称: {name}\n任务ID: {task_id}\n调度: {schedule_description} ({cron_expr})"

        except Exception as e:
            return f"❌ 创建任务失败: {str(e)}"

    async def schedule_heartbeat_task(
        self,
        name: str,
        check_interval: str,
        check_prompt: str,
        speak_condition: str = "有重要事项"
    ) -> str:
        """
        创建智能检查任务（Heartbeat 模式）

        Args:
            name: 任务名称，如 "邮件检查", "系统监控"
            check_interval: 检查间隔，如 "每5分钟", "每30分钟", "每小时"
            check_prompt: 检查时要执行的提示词
            speak_condition: 何时触发通知的条件描述

        Returns:
            创建结果信息

        示例:
            "每30分钟检查是否有紧急邮件" -> schedule_heartbeat_task("邮件检查", "每30分钟", "检查紧急邮件", "有紧急邮件")
        """
        # 解析间隔为秒数
        interval_seconds = self._parse_interval(check_interval)

        try:
            from ..core.config import TaskConfig, HeartbeatConfig, ScheduleMode

            config = TaskConfig(
                name=name,
                mode=ScheduleMode.HEARTBEAT,
                prompt=check_prompt,
                heartbeat=HeartbeatConfig(
                    interval=interval_seconds,
                    speak_conditions=[speak_condition],
                    silent_hours=(23, 7)
                ),
                enabled=True
            )

            async def handler(ctx):
                result = await ctx.llm.generate(check_prompt)
                # 如果结果包含条件关键词，则返回
                if speak_condition in result or "需要通知" in result:
                    return result
                return "HEARTBEAT_OK"

            config.handler = handler

            task_id = await self._scheduler._register_task(config)

            self._tasks[task_id] = ScheduledTaskInfo(
                id=task_id,
                name=name,
                mode="heartbeat",
                schedule=f"每{interval_seconds}秒",
                status="idle",
                prompt=check_prompt,
                created_at=datetime.now().isoformat()
            )

            return f"✅ Heartbeat 任务已创建\n名称: {name}\n任务ID: {task_id}\n检查间隔: {check_interval}"

        except Exception as e:
            return f"❌ 创建任务失败: {str(e)}"

    async def list_scheduled_tasks(self) -> str:
        """
        列出所有定时任务

        Returns:
            格式化的任务列表
        """
        try:
            tasks = self._scheduler.list_tasks()

            if not tasks:
                return "暂无定时任务"

            lines = [f"共 {len(tasks)} 个任务:\n"]

            for task in tasks:
                status_emoji = "🟢" if task.status == "idle" else "🟡" if task.status == "running" else "🔴"
                lines.append(
                    f"\n{status_emoji} {task.name}"
                    f"\n   ID: {task.id}"
                    f"\n   模式: {task.mode}"
                    f"\n   调度: {task.schedule or 'N/A'}"
                    f"\n   状态: {task.status}"
                    f"\n   执行次数: {task.total_runs}"
                )

            return "\n".join(lines)

        except Exception as e:
            return f"❌ 获取任务列表失败: {str(e)}"

    async def delete_scheduled_task(self, task_id: str) -> str:
        """
        删除指定任务

        Args:
            task_id: 任务ID

        Returns:
            删除结果
        """
        try:
            await self._scheduler.remove_task(task_id)
            if task_id in self._tasks:
                del self._tasks[task_id]
            return f"✅ 任务 {task_id} 已删除"
        except Exception as e:
            return f"❌ 删除任务失败: {str(e)}"

    async def trigger_task_now(self, task_id: str) -> str:
        """
        立即手动触发任务

        Args:
            task_id: 任务ID

        Returns:
            触发结果
        """
        try:
            result = await self._scheduler.trigger_task(task_id)
            return f"✅ 任务已手动触发\n执行ID: {result.execution_id}\n状态: {result.status.value}"
        except Exception as e:
            return f"❌ 触发任务失败: {str(e)}"

    async def pause_task(self, task_id: str) -> str:
        """暂停任务"""
        try:
            await self._scheduler.pause_task(task_id)
            return f"✅ 任务 {task_id} 已暂停"
        except Exception as e:
            return f"❌ 暂停任务失败: {str(e)}"

    async def resume_task(self, task_id: str) -> str:
        """恢复任务"""
        try:
            await self._scheduler.resume_task(task_id)
            return f"✅ 任务 {task_id} 已恢复"
        except Exception as e:
            return f"❌ 恢复任务失败: {str(e)}"

    # ===== 辅助方法 =====

    def _parse_time_description(self, description: str) -> str:
        """将自然语言时间描述转换为 Cron 表达式"""
        desc = description.lower().replace(" ", "").replace("每", "")

        # 常见模式匹配
        patterns = {
            # 每天固定时间
            "每天早上8点": "0 8 * * *",
            "每天早上9点": "0 9 * * *",
            "每天上午9点": "0 9 * * *",
            "每天下午6点": "0 18 * * *",
            "每天晚上8点": "0 20 * * *",
            "每天晚上10点": "0 22 * * *",

            # 每周固定时间
            "每周一早上8点": "0 8 * * 1",
            "每周五下午6点": "0 18 * * 5",
            "每周日早上9点": "0 9 * * 0",

            # 每小时
            "每小时": "0 * * * *",
            "每2小时": "0 */2 * * *",
            "每4小时": "0 */4 * * *",

            # 每分钟（测试用）
            "每分钟": "* * * * *",
            "每5分钟": "*/5 * * * *",
            "每10分钟": "*/10 * * * *",
            "每30分钟": "*/30 * * * *",
        }

        # 尝试直接匹配
        if desc in patterns:
            return patterns[desc]

        # 尝试提取时间
        import re

        # 匹配 "X点" 或 "X点Y分"
        time_match = re.search(r'(\d+)点(?:(\d+)分?)?', desc)
        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2)) if time_match.group(2) else 0

            # 判断是每天还是每周
            weekday_map = {
                "周一": 1, "周二": 2, "周三": 3, "周四": 4,
                "周五": 5, "周六": 6, "周日": 0, "周日": 0,
                "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4,
                "星期五": 5, "星期六": 6, "星期日": 0, "星期天": 0,
            }

            for cn_day, num in weekday_map.items():
                if cn_day in desc:
                    return f"{minute} {hour} * * {num}"

            # 默认每天
            return f"{minute} {hour} * * *"

        # 默认每分钟（测试用）
        return "* * * * *"

    def _parse_interval(self, description: str) -> int:
        """将间隔描述转换为秒数"""
        desc = description.lower().replace(" ", "").replace("每", "")

        intervals = {
            "1分钟": 60,
            "5分钟": 300,
            "10分钟": 600,
            "15分钟": 900,
            "30分钟": 1800,
            "小时": 3600,
            "1小时": 3600,
            "2小时": 7200,
            "4小时": 14400,
            "天": 86400,
        }

        for key, seconds in intervals.items():
            if key in desc:
                return seconds

        # 默认5分钟
        return 300

    def _substitute_variables(self, prompt: str) -> str:
        """替换提示词中的变量"""
        from datetime import datetime

        if "{{" not in prompt:
            return prompt

        now = datetime.now()
        weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

        variables = {
            "date": now.strftime("%Y年%m月%d日"),
            "weekday": weekdays[now.weekday()],
            "time": now.strftime("%H:%M"),
            "year": str(now.year),
            "month": str(now.month),
            "day": str(now.day),
        }

        result = prompt
        for key, value in variables.items():
            result = result.replace(f"{{{{{key}}}}}", value)

        return result


async def create_scheduler_skill(config_dict: Optional[Dict[str, Any]] = None):
    """
    创建 Scheduler Skill 实例

    Args:
        config_dict: 配置字典，可选

    Returns:
        Skill 实例或 None（如果初始化失败）

    示例:
        skill = await create_scheduler_skill({
            "api_key": "sk-xxxxx",
            "default_model": "moonshot-v1-8k",
            "notify_ui_enabled": True
        })
    """
    config = SkillConfig(**(config_dict or {}))

    # 从环境变量读取配置
    if not config.api_key:
        config.api_key = os.getenv("MOONSHOT_API_KEY") or os.getenv("OPENAI_API_KEY")

    skill = SchedulerSkill(config)
    success = await skill.initialize()

    if success:
        return skill
    return None

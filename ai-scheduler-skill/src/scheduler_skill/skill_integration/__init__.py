"""
AI Scheduler Skill - 定时任务调度 Skill

集成到 AI 智能体系统的 Skill 模块，支持通过自然语言创建和管理定时任务。

使用方式:
    from scheduler_skill.skill_integration import create_scheduler_skill

    skill = await create_scheduler_skill({
        "api_key": "your-moonshot-api-key",
        "base_url": "https://api.moonshot.cn/v1"
    })
"""

from .scheduler_skill import create_scheduler_skill, skill_metadata

__all__ = ["create_scheduler_skill", "skill_metadata"]

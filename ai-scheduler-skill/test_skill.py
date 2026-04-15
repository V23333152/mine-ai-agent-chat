#!/usr/bin/env python3
"""
AI Scheduler Skill 测试脚本

验证 Skill 集成功能是否正常工作。
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 到路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

async def test_skill():
    """测试 Skill 功能"""
    print("=" * 60)
    print("AI Scheduler Skill 功能测试")
    print("=" * 60)

    try:
        # 1. 导入 Skill
        print("\n1. 导入 Skill 模块...")
        from scheduler_skill.skill_integration import create_scheduler_skill, skill_metadata
        print(f"   ✅ 导入成功")
        print(f"   Skill ID: {skill_metadata['id']}")
        print(f"   Skill Name: {skill_metadata['name']}")
        print(f"   Version: {skill_metadata['version']}")

        # 2. 创建 Skill 实例
        print("\n2. 创建 Skill 实例...")
        skill = await create_scheduler_skill({
            "notify_ui_enabled": True
        })

        if not skill:
            print("   ❌ Skill 初始化失败（请检查 API Key）")
            return False

        print("   ✅ Skill 初始化成功")

        # 3. 创建定时任务
        print("\n3. 创建测试定时任务...")
        result = await skill.schedule_cron_task(
            name="测试任务",
            schedule_description="每分钟",
            prompt="这是一个测试任务，当前时间是 {{time}}"
        )
        print(f"   结果: {result}")

        # 4. 列出任务
        print("\n4. 列出所有任务...")
        tasks = await skill.list_scheduled_tasks()
        print(f"   {tasks}")

        # 5. 关闭 Skill
        print("\n5. 关闭 Skill...")
        await skill.destroy()
        print("   ✅ Skill 已关闭")

        print("\n" + "=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_skill())
    sys.exit(0 if success else 1)

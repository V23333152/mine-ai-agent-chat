"""
OpenClaw风格的Heartbeat示例

展示如何实现"沉默是金"的智能检查系统
关键概念：
- 大部分时间返回 HEARTBEAT_OK 保持沉默
- 只在真正需要时才说话
- 使用状态文件避免重复提醒
"""

import asyncio
import random
from datetime import datetime
from scheduler_skill import HybridScheduler, TaskContext


# 模拟数据存储（实际应用中从真实API获取）
_mock_emails = []
_mock_meetings = []


async def fetch_emails():
    """模拟获取邮件"""
    # 实际应用中使用IMAP API或邮件服务商API
    return _mock_emails


async def fetch_calendar():
    """模拟获取日历"""
    # 实际应用中使用Google Calendar API等
    return _mock_meetings


async def main():
    scheduler = HybridScheduler()
    await scheduler.start()
    
    # ========== Heartbeat任务：邮件监控 ==========
    @scheduler.heartbeat(
        interval=1800,  # 30分钟检查一次
        name="email-monitor",
        silent_hours=(23, 7),  # 夜间保持沉默
    )
    async def check_emails(ctx: TaskContext):
        """
        邮件Heartbeat检查 - OpenClaw风格
        
        规则：
        1. 只在有紧急邮件时说话
        2. 同一封邮件1小时内不重复提醒
        3. 夜间除非critical级别，否则保持沉默
        """
        emails = await fetch_emails()
        
        # 筛选紧急邮件
        urgent_emails = [
            e for e in emails 
            if e.get("priority") == "high" or "URGENT" in e.get("subject", "")
        ]
        
        if not urgent_emails:
            ctx.log.debug("没有紧急邮件，保持沉默")
            return "HEARTBEAT_OK"
        
        # 检查每封紧急邮件是否已经提醒过
        new_urgent = []
        for email in urgent_emails:
            email_id = email.get("id")
            # should_speak会检查这个邮件ID是否已经在remember_duration内提醒过
            if await ctx.should_speak(f"urgent_email_{email_id}", remember_duration=3600):
                new_urgent.append(email)
        
        if not new_urgent:
            ctx.log.debug("紧急邮件都已提醒过，保持沉默")
            return "HEARTBEAT_OK"
        
        # 有未提醒的紧急邮件，需要说话
        result = f"📧 发现 {len(new_urgent)} 封新的紧急邮件:\n"
        for email in new_urgent:
            result += f"  - [{email['from']}] {email['subject']}\n"
            # 标记已提醒
            await ctx.mark_spoke(f"urgent_email_{email['id']}", email)
        
        return result
    
    # ========== Heartbeat任务：日程提醒 ==========
    @scheduler.heartbeat(
        interval=900,  # 15分钟检查一次
        name="calendar-reminder",
        silent_hours=(22, 8),
    )
    async def check_calendar(ctx: TaskContext):
        """
        日程Heartbeat检查
        
        规则：
        1. 检查未来2小时内是否有会议
        2. 每个会议只提醒一次
        3. 会议开始前15分钟提醒
        """
        meetings = await fetch_calendar()
        now = datetime.now()
        
        upcoming = []
        for meeting in meetings:
            start_time = meeting.get("start_time")
            if not start_time:
                continue
            
            minutes_until = (start_time - now).total_seconds() / 60
            
            # 会议在2小时内开始，且还没提醒过
            if 0 < minutes_until <= 120:
                meeting_id = meeting.get("id")
                if await ctx.should_speak(f"meeting_{meeting_id}", remember_duration=7200):
                    upcoming.append({
                        **meeting,
                        "minutes_until": int(minutes_until)
                    })
        
        if not upcoming:
            return "HEARTBEAT_OK"
        
        # 生成提醒
        result = "📅 即将开始的会议:\n"
        for meeting in upcoming:
            result += f"  - {meeting['title']} (还有{meeting['minutes_until']}分钟)\n"
            await ctx.mark_spoke(f"meeting_{meeting['id']}", meeting)
        
        return result
    
    # ========== Heartbeat任务：智能助手 ==========
    @scheduler.heartbeat(
        interval=3600,  # 每小时检查一次
        name="smart-assistant",
    )
    async def smart_assistant(ctx: TaskContext):
        """
        智能助手Heartbeat
        
        综合多个检查，批量处理：
        1. 天气提醒（如果今天会下雨）
        2. 待办事项（如果有高优先级任务）
        3. 系统状态（如果CPU/内存异常）
        
        只有真正有重要事项时才说话
        """
        alerts = []
        
        # 检查1：天气
        condition = "weather_rain_today"
        if await ctx.should_speak(condition, remember_duration=43200):  # 12小时不重复
            # 模拟天气检查
            will_rain = random.random() < 0.3  # 30%概率下雨
            if will_rain:
                alerts.append("🌧️ 今天可能会下雨，记得带伞！")
                await ctx.mark_spoke(condition, {"rain": True})
        
        # 检查2：待办事项
        condition = "high_priority_tasks"
        if await ctx.should_speak(condition, remember_duration=14400):  # 4小时不重复
            # 模拟待办检查
            has_todos = random.random() < 0.2  # 20%概率有高优先级任务
            if has_todos:
                alerts.append("📋 你有高优先级待办事项需要处理")
                await ctx.mark_spoke(condition, {"has_todos": True})
        
        # 检查3：系统状态
        condition = "system_high_load"
        if await ctx.should_speak(condition, remember_duration=3600):  # 1小时不重复
            # 模拟系统检查
            cpu_high = random.random() < 0.1  # 10%概率CPU高
            if cpu_high:
                alerts.append("⚠️ 服务器CPU使用率超过80%")
                await ctx.mark_spoke(condition, {"cpu_high": True})
        
        # 综合判断
        if not alerts:
            return "HEARTBEAT_OK"
        
        # 有多个alert，合并发送
        if len(alerts) == 1:
            return alerts[0]
        
        return "⚡ 提醒:\n" + "\n".join(f"  {a}" for a in alerts)
    
    # ========== Cron任务：每日晨报 ==========
    @scheduler.cron("0 8 * * *", name="morning-briefing")
    async def morning_briefing(ctx: TaskContext):
        """
        每日晨报 - 使用Cron确保准时
        
        与Heartbeat的区别：
        - Cron: 准时8点发送，精确时间
        - Heartbeat: 检查异常，智能触发
        """
        ctx.log.info("生成每日晨报")
        
        # 这里可以调用LLM生成晨报
        # 例如：天气、日历、邮件摘要等
        
        briefing = """
🌅 早安！今日晨报：

🌤️ 天气：晴，15-25°C
📅 日程：今天有3个会议
📧 邮件：5封未读（1封重要）

💡 建议：下午可能有雨，记得带伞
        """.strip()
        
        return briefing
    
    print("=" * 50)
    print("OpenClaw风格Heartbeat示例已启动")
    print("=" * 50)
    print("\n特性：")
    print("  - 30分钟检查一次邮件（只报告紧急邮件）")
    print("  - 15分钟检查一次日程")
    print("  - 1小时综合检查（天气、待办、系统）")
    print("  - 每天早上8点准时发送晨报")
    print("\n按 Ctrl+C 停止")
    print("=" * 50)
    
    await scheduler.run_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n调度器已停止")
        print("\n查看状态文件了解运行情况：")
        print("  .scheduler_state/heartbeat/email-monitor.json")
        print("  .scheduler_state/heartbeat/calendar-reminder.json")

"""
快速开始示例

展示最基本的用法：创建一个定时任务
"""

import asyncio
from scheduler_skill import HybridScheduler


async def main():
    # 1. 创建调度器
    scheduler = HybridScheduler()
    
    # 2. 启动调度器
    await scheduler.start()
    
    # 3. 使用装饰器创建Cron任务（每天早上9点）
    @scheduler.cron("0 9 * * *", name="daily-greeting")
    async def daily_task(ctx):
        """每日问候任务"""
        ctx.log.info("执行每日问候任务")
        result = await ctx.llm.generate("生成一句早安问候语")
        ctx.log.info(f"生成结果: {result}")
        return result
    
    # 4. 使用装饰器创建Heartbeat任务（每30分钟检查一次）
    @scheduler.heartbeat(1800, name="smart-check")
    async def heartbeat_task(ctx):
        """智能检查任务"""
        ctx.log.info("执行Heartbeat检查")
        
        # 这里可以添加实际的检查逻辑
        # 例如：检查邮件、日历、服务器状态等
        
        # 如果没有异常，返回HEARTBEAT_OK保持沉默
        return "HEARTBEAT_OK"
    
    # 5. 保持运行
    print("调度器已启动，按 Ctrl+C 停止")
    await scheduler.run_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n调度器已停止")

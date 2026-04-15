"""
配置文件驱动示例

展示如何使用YAML配置文件管理任务
"""

import asyncio
from scheduler_skill import HybridScheduler


async def main():
    # 1. 从配置文件创建调度器
    scheduler = HybridScheduler.from_config("scheduler.yaml")
    
    # 2. 启动调度器（会自动加载配置文件中的所有任务）
    await scheduler.start()
    
    # 3. 保持运行
    print("配置驱动的调度器已启动")
    print(f"已加载 {len(scheduler.list_tasks())} 个任务")
    
    for task in scheduler.list_tasks():
        print(f"  - {task.name} ({task.mode}): {task.schedule}")
    
    await scheduler.run_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n调度器已停止")

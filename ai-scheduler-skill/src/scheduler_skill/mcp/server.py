"""
MCP服务器 - 将调度器作为MCP工具提供

支持Claude Desktop、Cursor等MCP客户端
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Sequence, Optional

from mcp.server import Server as MCPServerBase
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ServerCapabilities

from ..core.scheduler import HybridScheduler
from ..core.config import SchedulerConfig, TaskConfig, ScheduleMode, CronConfig
from ..core.models import TaskInfo

logger = logging.getLogger("scheduler_skill.mcp")


class MCPServer:
    """
    MCP服务器
    
    将HybridScheduler封装为MCP工具，支持：
    - Claude Desktop
    - Cursor
    - Cline
    - 其他MCP客户端
    
    使用方式:
        # 在claude_desktop_config.json中配置
        {
          "mcpServers": {
            "scheduler": {
              "command": "python",
              "args": ["-m", "scheduler_skill.mcp"],
              "env": {
                "OPENAI_API_KEY": "your-key",
                "SCHEDULER_CONFIG": "./scheduler.yaml"
              }
            }
          }
        }
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """
        初始化MCP服务器
        
        Args:
            config_path: 配置文件路径，默认从环境变量 SCHEDULER_CONFIG 读取
        """
        self.config_path = config_path or os.getenv("SCHEDULER_CONFIG", "scheduler.yaml")
        self.scheduler: Optional[HybridScheduler] = None
        self.app = MCPServerBase("ai-scheduler")
        
        # 调试：打印环境变量
        
        self._setup_handlers()
    
    def _setup_handlers(self):
        """设置MCP处理器"""
        
        @self.app.list_tools()
        async def list_tools() -> list[Tool]:
            """列出可用工具"""
            return [
                # 1. 创建Cron任务
                Tool(
                    name="schedule_cron_task",
                    description="创建一个新的定时任务（Cron模式），在指定时间自动执行",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "任务名称，如 'daily-report', 'morning-briefing'"
                            },
                            "schedule": {
                                "type": "string",
                                "description": "Cron表达式，如 '0 9 * * *' 表示每天早上9点"
                            },
                            "prompt": {
                                "type": "string",
                                "description": "AI提示词，任务执行时发送给AI模型"
                            },
                            "model": {
                                "type": "string",
                                "description": "模型名称，如 'gpt-4o-mini', 'gpt-4', 'claude-3-sonnet'",
                                "default": "gpt-4o-mini"
                            },
                            "description": {
                                "type": "string",
                                "description": "任务描述"
                            }
                        },
                        "required": ["name", "schedule", "prompt"]
                    }
                ),
                
                # 2. 创建Heartbeat任务
                Tool(
                    name="schedule_heartbeat_task",
                    description="创建一个Heartbeat智能检查任务，定期检查并根据条件触发",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "任务名称"
                            },
                            "interval": {
                                "type": "integer",
                                "description": "检查间隔（秒），如 1800 表示30分钟"
                            },
                            "check_prompt": {
                                "type": "string",
                                "description": "检查提示词，如 '检查是否有紧急邮件'"
                            },
                            "speak_condition": {
                                "type": "string",
                                "description": "何时说话的条件描述"
                            },
                            "silent_hours": {
                                "type": "array",
                                "description": "夜间静默时间段，如 [23, 7] 表示23:00-7:00",
                                "default": [23, 7]
                            }
                        },
                        "required": ["name", "interval", "check_prompt"]
                    }
                ),
                
                # 3. 列出所有任务
                Tool(
                    name="list_tasks",
                    description="列出所有定时任务及其状态",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                
                # 4. 获取任务详情
                Tool(
                    name="get_task",
                    description="获取指定任务的详细信息",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID"
                            }
                        },
                        "required": ["task_id"]
                    }
                ),
                
                # 5. 手动触发任务
                Tool(
                    name="trigger_task",
                    description="立即手动触发一个任务（用于测试）",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID"
                            }
                        },
                        "required": ["task_id"]
                    }
                ),
                
                # 6. 暂停/恢复任务
                Tool(
                    name="toggle_task",
                    description="暂停或恢复指定的任务",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID"
                            },
                            "pause": {
                                "type": "boolean",
                                "description": "true表示暂停，false表示恢复"
                            }
                        },
                        "required": ["task_id", "pause"]
                    }
                ),
                
                # 7. 删除任务
                Tool(
                    name="delete_task",
                    description="删除指定的任务",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID"
                            }
                        },
                        "required": ["task_id"]
                    }
                ),
                
                # 8. 获取调度器状态
                Tool(
                    name="get_stats",
                    description="获取调度器统计信息",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),

                # 9. 获取任务执行历史
                Tool(
                    name="get_task_history",
                    description="获取任务的执行历史记录",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID（可选，不传则返回所有历史）"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "最大返回条数",
                                "default": 50
                            }
                        }
                    }
                ),

                # 10. 快速创建晨报任务（预设模板）
                Tool(
                    name="create_morning_briefing",
                    description="快速创建一个晨报任务，每天早上自动汇总天气、日程、邮件",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "time": {
                                "type": "string",
                                "description": "发送时间，如 '8:00'",
                                "default": "8:00"
                            },
                            "timezone": {
                                "type": "string",
                                "description": "时区",
                                "default": "Asia/Shanghai"
                            },
                            "include_weather": {
                                "type": "boolean",
                                "description": "是否包含天气",
                                "default": True
                            },
                            "include_calendar": {
                                "type": "boolean",
                                "description": "是否包含日程",
                                "default": True
                            },
                            "include_email": {
                                "type": "boolean",
                                "description": "是否包含邮件",
                                "default": True
                            }
                        }
                    }
                ),

                # 10. 联网搜索 (scheduler专用，避免与其他web_search冲突)
                Tool(
                    name="scheduler_web_search",
                    description="使用Tavily API联网搜索互联网上的最新信息",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "搜索查询词"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "返回结果数量（1-10）",
                                "default": 5
                            },
                            "include_answer": {
                                "type": "boolean",
                                "description": "是否包含AI生成的答案摘要",
                                "default": True
                            }
                        },
                        "required": ["query"]
                    }
                ),
            ]
        
        @self.app.call_tool()
        async def call_tool(name: str, arguments: Any) -> Sequence[TextContent]:
            """处理工具调用"""
            try:
                if name == "schedule_cron_task":
                    return await self._handle_schedule_cron(arguments)
                elif name == "schedule_heartbeat_task":
                    return await self._handle_schedule_heartbeat(arguments)
                elif name == "list_tasks":
                    return await self._handle_list_tasks()
                elif name == "get_task":
                    return await self._handle_get_task(arguments)
                elif name == "trigger_task":
                    return await self._handle_trigger_task(arguments)
                elif name == "toggle_task":
                    return await self._handle_toggle_task(arguments)
                elif name == "delete_task":
                    return await self._handle_delete_task(arguments)
                elif name == "get_stats":
                    return await self._handle_get_stats()
                elif name == "get_task_history":
                    return await self._handle_get_task_history(arguments)
                elif name == "create_morning_briefing":
                    return await self._handle_create_morning_briefing(arguments)
                elif name == "scheduler_web_search":
                    return await self._handle_web_search(arguments)
                else:
                    return [TextContent(type="text", text=f"❌ 未知工具: {name}")]
            except Exception as e:
                logger.error(f"工具调用错误: {e}")
                return [TextContent(type="text", text=f"❌ 错误: {str(e)}")]
    
    async def _handle_schedule_cron(self, args: dict) -> Sequence[TextContent]:
        """处理创建Cron任务"""
        from ..core.config import ModelConfig
        from datetime import datetime

        logger.info(f"[MCP] Creating cron task: {args.get('name')}, schedule: {args.get('schedule')}")

        try:
            config = TaskConfig(
                name=args["name"],
                mode=ScheduleMode.CRON,
                prompt=args["prompt"],
                cron=CronConfig(
                    schedule=args["schedule"],
                    timezone=args.get("timezone", "UTC")
                ),
                model=ModelConfig(model=args.get("model") or self.scheduler.config.default_model.model),
                description=args.get("description"),
                webhook_url=os.getenv("AGENTS_WEBHOOK_URL"),
            )

            # 创建处理器（支持动态变量替换和联网搜索）
            async def handler(ctx):
                import time
                task_start = time.time()
                prompt = config.prompt
                ctx.log.info(f"[Task Handler] TASK START: task={config.name}, prompt_length={len(prompt)}")
                ctx.log.info(f"[Task Handler] Original prompt: {prompt[:100]}...")

                # 如果是晨报任务，填充动态数据
                if "{{" in prompt:
                    now = datetime.now()
                    weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

                    # 基础时间变量
                    variables = {
                        "date": now.strftime("%Y年%m月%d日"),
                        "weekday": weekdays[now.weekday()],
                        "time": now.strftime("%H:%M"),
                    }

                    ctx.log.info(f"[Task Handler] Base variables: {variables}")

                    # 尝试获取天气信息
                    try:
                        weather_info = await self._get_weather_info()
                        variables.update(weather_info)
                        ctx.log.info(f"[Task Handler] Weather info fetched: {weather_info}")
                    except Exception as e:
                        ctx.log.warning(f"[Task Handler] 获取天气信息失败: {e}")
                        variables.update({
                            "weather": "晴朗",
                            "temperature": "20-28°C",
                            "clothing_advice": "天气舒适，建议穿着轻便",
                            "travel_advice": "适合出行",
                            "festival": "无特殊节日"
                        })

                    # 替换变量
                    ctx.log.info(f"[Task Handler] Final variables: {variables}")
                    for key, value in variables.items():
                        old_prompt = prompt
                        prompt = prompt.replace(f"{{{{{key}}}}}", str(value))
                        if old_prompt != prompt:
                            ctx.log.info(f"[Task Handler] Replaced {{{{{key}}}}}: {value}")

                    ctx.log.info(f"[Task Handler] Processed prompt: {prompt[:200]}...")
                else:
                    ctx.log.info("[Task Handler] No template variables found")

                # 检测是否需要联网搜索
                # 只有当提示词明确包含"新闻"相关词汇时才触发搜索
                news_keywords = ["新闻", "热点", "头条", "资讯", "要闻"]
                needs_search = any(keyword in prompt for keyword in news_keywords)

                if needs_search:
                    ctx.log.info("[Task Handler] News keywords detected, performing web search...")
                    try:
                        from ..connectors.search import search_manager

                        # 针对新闻场景优化搜索查询
                        search_query = self._extract_search_query(prompt)
                        ctx.log.info(f"[Task Handler] Search query: {search_query}")

                        if search_manager.is_available():
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
                                f"{datetime.now().strftime('%Y年%m月%d日')} 重要事件",
                            ]
                            ctx.log.info(f"[Task Handler] Will perform {len(search_queries)} searches to get more results")

                            # 执行多次搜索并合并结果
                            import time
                            search_start_time = time.time()
                            all_results = []
                            search_stats = []

                            for idx, query in enumerate(search_queries, 1):
                                query_start = time.time()
                                try:
                                    ctx.log.info(f"[Task Handler] Search {idx}/{len(search_queries)} START: '{query}'")
                                    raw_result = await asyncio.wait_for(
                                        search_manager.search(
                                            query=query,
                                            max_results=5,
                                            include_answer=True,
                                            search_depth="basic",
                                            include_domains=official_domains
                                        ),
                                        timeout=30.0
                                    )
                                    query_elapsed = time.time() - query_start
                                    if raw_result and raw_result.get("results"):
                                        result_count = len(raw_result["results"])
                                        all_results.extend(raw_result["results"])
                                        search_stats.append({"query": query, "results": result_count, "time": f"{query_elapsed:.2f}s", "status": "success"})
                                        ctx.log.info(f"[Task Handler] Search {idx} SUCCESS: {result_count} results in {query_elapsed:.2f}s")
                                    else:
                                        search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": "empty"})
                                        ctx.log.warning(f"[Task Handler] Search {idx} EMPTY: no results in {query_elapsed:.2f}s")
                                except asyncio.TimeoutError:
                                    query_elapsed = time.time() - query_start
                                    search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": "timeout"})
                                    ctx.log.error(f"[Task Handler] Search {idx} TIMEOUT after {query_elapsed:.2f}s")
                                except Exception as e:
                                    query_elapsed = time.time() - query_start
                                    search_stats.append({"query": query, "results": 0, "time": f"{query_elapsed:.2f}s", "status": f"error:{str(e)[:50]}"})
                                    ctx.log.error(f"[Task Handler] Search {idx} ERROR after {query_elapsed:.2f}s: {e}")

                            total_search_time = time.time() - search_start_time
                            ctx.log.info(f"[Task Handler] ALL SEARCHES COMPLETE: {len(all_results)} total raw results in {total_search_time:.2f}s")
                            ctx.log.info(f"[Task Handler] Search stats: {search_stats}")

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

                            dedup_time = time.time() - dedup_start
                            ctx.log.info(f"[Task Handler] DEDUP COMPLETE: {len(unique_results)} unique, {duplicates} duplicates removed, took {dedup_time:.2f}s")

                            # 格式化合并后的结果（极简格式，避免敏感内容）
                            format_start = time.time()
                            if unique_results:
                                # 手动格式化结果，只保留标题和链接，不保留摘要
                                results_to_use = unique_results[:5]  # 最多取10条
                                lines = []
                                for i, result in enumerate(results_to_use, 1):
                                    title = result.get("title", "无标题")
                                    url = result.get("url", "")
                                    # 只保留标题和链接，避免摘要中的敏感内容
                                    lines.append(f"{i}. {title} - {url}")

                                search_results = "\n".join(lines)
                                format_time = time.time() - format_start
                                ctx.log.info(f"[Task Handler] FORMAT COMPLETE: {len(results_to_use)} entries formatted into {len(search_results)} chars, took {format_time:.2f}s")

                                # 构建增强提示词（要求快速输出）
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
                                search_results = "[搜索未返回结果]"
                                ctx.log.warning("[Task Handler] Search returned no results")
                                prompt = f"""【注意：搜索未返回结果，以下回答基于模型训练数据】

{prompt}"""
                        else:
                            ctx.log.warning("[Task Handler] Search not available: TAVILY_API_KEY not configured")
                            prompt = f"""【注意：联网搜索功能未配置，以下回答可能不包含最新信息】

{prompt}"""
                    except Exception as e:
                        ctx.log.error(f"[Task Handler] Search failed: {e}")

                # 使用 LLM 生成响应（带超时）
                llm_start = time.time()
                ctx.log.info(f"[Task Handler] LLM GENERATION START: prompt_length={len(prompt)} chars, timeout=120s")
                try:
                    result = await asyncio.wait_for(
                        ctx.llm.generate(prompt),
                        timeout=120.0
                    )
                    llm_elapsed = time.time() - llm_start
                    result_lines = result.strip().split('\n') if result else []
                    entry_count = sum(1 for line in result_lines if line.strip() and line.strip()[0].isdigit() and '. ' in line[:5])
                    ctx.log.info(f"[Task Handler] LLM GENERATION SUCCESS: {llm_elapsed:.2f}s, output={len(result)} chars, ~{entry_count} entries")
                    ctx.log.info(f"[Task Handler] Result preview: {result[:200]}...")
                    total_time = time.time() - task_start
                    ctx.log.info(f"[Task Handler] TASK COMPLETE: total_time={total_time:.2f}s")
                    return result
                except asyncio.TimeoutError:
                    llm_elapsed = time.time() - llm_start
                    total_time = time.time() - task_start
                    ctx.log.error(f"[Task Handler] LLM GENERATION TIMEOUT after {llm_elapsed:.2f}s, total={total_time:.2f}s")
                    return f"【错误】LLM生成超时（已等待{llm_elapsed:.1f}秒）"
                except Exception as e:
                    llm_elapsed = time.time() - llm_start
                    total_time = time.time() - task_start
                    ctx.log.error(f"[Task Handler] LLM GENERATION ERROR after {llm_elapsed:.2f}s, total={total_time:.2f}s: {e}")
                    return f"【错误】LLM生成失败: {str(e)[:100]}"

            config.handler = handler

            # 注册任务到调度器
            logger.info(f"[MCP] Registering task {config.name} to scheduler...")
            task_id = await self.scheduler._register_task(config)
            logger.info(f"[MCP] Task registered successfully: {task_id}")

            # 验证任务是否已注册
            registered_task = self.scheduler.get_task(task_id)
            if registered_task:
                logger.info(f"[MCP] Task verification: {registered_task.name} is in scheduler")
            else:
                logger.warning(f"[MCP] Task verification failed: {task_id} not found after registration")

            return [TextContent(type="text", text=
                f"✅ Cron任务已创建\n"
                f"名称: {config.name}\n"
                f"任务ID: {task_id}\n"
                f"调度: {config.cron.schedule}\n"
                f"模型: {config.model.model}"
            )]

        except Exception as e:
            logger.error(f"[MCP] Failed to create cron task: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return [TextContent(type="text", text=f"❌ 创建任务失败: {str(e)}")]

    
    async def _get_weather_info(self) -> dict:
        """获取天气信息（使用高德地图API）"""
        import os
        import aiohttp
        
        amap_key = os.getenv("AMAP_WEBSERVICE_KEY")
        if not amap_key:
            raise ValueError("AMAP_WEBSERVICE_KEY not set")
        
        # 默认使用北京坐标
        city_code = "110000"  # 北京市
        
        url = f"https://restapi.amap.com/v3/weather/weatherInfo?key={amap_key}&city={city_code}&extensions=all"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
                
                if data.get("status") == "1" and data.get("forecasts"):
                    forecast = data["forecasts"][0]["casts"][0]  # 今天
                    
                    weather = forecast.get("dayweather", "晴")
                    temp_high = forecast.get("daytemp", "25")
                    temp_low = forecast.get("nighttemp", "15")
                    
                    # 根据温度给出穿衣建议
                    temp_avg = (int(temp_high) + int(temp_low)) / 2
                    if temp_avg < 10:
                        clothing = "天气寒冷，建议穿厚外套、毛衣"
                    elif temp_avg < 20:
                        clothing = "天气较凉，建议穿长袖、薄外套"
                    elif temp_avg < 28:
                        clothing = "天气舒适，建议穿短袖、薄衫"
                    else:
                        clothing = "天气炎热，建议穿轻薄透气的衣物"
                    
                    # 根据天气给出出行建议
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

    def _extract_search_query(self, prompt: str) -> str:
        """从提示词中提取搜索查询"""
        from datetime import datetime
        today = datetime.now()
        today_str = today.strftime("%Y年%m月%d日")

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
            logger.info(f"[MCP] Enhanced news query with date: {query}")

        # 如果提取后为空，构建一个默认的查询
        if not query:
            query = f"{today_str} 重要事件 最新"

        return query if query else prompt

    async def _handle_schedule_heartbeat(self, args: dict) -> Sequence[TextContent]:
        """处理创建Heartbeat任务"""
        from ..core.config import HeartbeatConfig
        
        config = TaskConfig(
            name=args["name"],
            mode=ScheduleMode.HEARTBEAT,
            heartbeat=HeartbeatConfig(
                interval=args["interval"],
                speak_conditions=[args.get("speak_condition", "has_alert")],
                silent_hours=tuple(args.get("silent_hours", [23, 7])),
            ),
            webhook_url=os.getenv("AGENTS_WEBHOOK_URL"),
        )
        
        check_prompt = args["check_prompt"]
        
        # 创建处理器
        async def handler(ctx):
            # 使用LLM判断是否需要说话
            result = await ctx.llm.generate(check_prompt)
            
            # 简化判断：如果结果包含特定关键词则认为需要说话
            if "HEARTBEAT_OK" in result or not result.strip():
                return "HEARTBEAT_OK"
            return result
        
        config.handler = handler
        
        task_id = await self.scheduler._register_task(config)
        
        return [TextContent(type="text", text=
            f"✅ Heartbeat任务已创建\n"
            f"名称: {config.name}\n"
            f"任务ID: {task_id}\n"
            f"间隔: {config.heartbeat.interval}秒\n"
            f"静默时段: {config.heartbeat.silent_hours[0]}:00-{config.heartbeat.silent_hours[1]}:00"
        )]
    
    async def _handle_list_tasks(self) -> Sequence[TextContent]:
        """处理列出任务"""
        tasks = self.scheduler.list_tasks()

        logger.info(f"[MCP] list_tasks called, found {len(tasks)} tasks")
        for t in tasks:
            logger.info(f"[MCP]   - {t.name} ({t.id}): {t.status}")

        if not tasks:
            return [TextContent(type="text", text="暂无定时任务")]

        lines = [f"共 {len(tasks)} 个任务:\n"]
        
        for task in tasks:
            status_emoji = "🟢" if task.status == "idle" else "🟡" if task.status == "running" else "🔴"
            last_run_text = ""
            if task.last_run:
                last_run_text = f"\n   上次执行: {task.last_run.strftime('%Y-%m-%d %H:%M:%S')}"
            lines.append(
                f"\n{status_emoji} {task.name}\n"
                f"   ID: {task.id}\n"
                f"   模式: {task.mode}\n"
                f"   调度: {task.schedule or 'N/A'}\n"
                f"   状态: {task.status}\n"
                f"   执行次数: {task.total_runs}{last_run_text}"
            )
        
        return [TextContent(type="text", text="\n".join(lines))]
    
    async def _handle_get_task(self, args: dict) -> Sequence[TextContent]:
        """处理获取任务详情"""
        task = self.scheduler.get_task(args["task_id"])
        
        if not task:
            return [TextContent(type="text", text=f"❌ 任务 {args['task_id']} 不存在")]
        
        return [TextContent(type="text", text=json.dumps(
            task.to_dict(),
            ensure_ascii=False,
            indent=2
        ))]
    
    async def _handle_trigger_task(self, args: dict) -> Sequence[TextContent]:
        """处理手动触发任务"""
        task_id = args["task_id"]
        logger.info(f"[MCP] trigger_task called for: {task_id}")

        # 先检查任务是否存在
        task = self.scheduler.get_task(task_id)
        if not task:
            logger.error(f"[MCP] Task not found: {task_id}")
            return [TextContent(type="text", text=f"❌ 错误: 任务不存在: {task_id}")]

        logger.info(f"[MCP] Task found: {task.name}, triggering...")
        result = await self.scheduler.trigger_task(task_id)

        return [TextContent(type="text", text=
            f"✅ 任务已手动触发\n"
            f"任务ID: {task_id}\n"
            f"执行ID: {result.execution_id}\n"
            f"状态: {result.status.value}\n"
            f"耗时: {result.duration_ms:.2f}ms"
        )]
    
    async def _handle_toggle_task(self, args: dict) -> Sequence[TextContent]:
        """处理暂停/恢复任务"""
        if args["pause"]:
            await self.scheduler.pause_task(args["task_id"])
            status = "已暂停"
        else:
            await self.scheduler.resume_task(args["task_id"])
            status = "已恢复"
        
        return [TextContent(type="text", text=f"✅ 任务 {args['task_id']} {status}")]
    
    async def _handle_delete_task(self, args: dict) -> Sequence[TextContent]:
        """处理删除任务"""
        await self.scheduler.remove_task(args["task_id"])
        return [TextContent(type="text", text=f"✅ 任务 {args['task_id']} 已删除")]
    
    async def _handle_get_stats(self) -> Sequence[TextContent]:
        """处理获取统计信息"""
        stats = self.scheduler.get_stats()
        
        return [TextContent(type="text", text=json.dumps(
            stats,
            ensure_ascii=False,
            indent=2
        ))]
    
    async def _handle_create_morning_briefing(self, args: dict) -> Sequence[TextContent]:
        """处理创建晨报任务"""
        # 解析时间
        time_str = args.get("time", "8:00")
        hour, minute = map(int, time_str.split(":"))
        cron_expr = f"{minute} {hour} * * *"
        
        # 构建提示词
        sections = []
        if args.get("include_weather", True):
            sections.append("1. 查询今日天气（温度、降雨概率）")
        if args.get("include_calendar", True):
            sections.append("2. 列出今天的日历事件")
        if args.get("include_email", True):
            sections.append("3. 总结昨晚到现在的未读邮件")
        
        prompt = f"""你是Morning Briefing Agent。生成今日晨报：

{chr(10).join(sections)}

请用Markdown格式输出，包含：
- 天气（含穿衣建议）
- 日程（按时间排序）
- 邮件摘要（按重要性排序）
- 今日建议
"""
        
        config = TaskConfig(
            name="morning-briefing",
            mode=ScheduleMode.CRON,
            prompt=prompt,
            cron=CronConfig(
                schedule=cron_expr,
                timezone=args.get("timezone", "Asia/Shanghai")
            ),
            description="每日晨报",
        )
        
        async def handler(ctx):
            result = await ctx.llm.generate(prompt)
            ctx.log.info("晨报生成完成")
            return result
        
        config.handler = handler
        
        task_id = await self.scheduler._register_task(config)
        
        return [TextContent(type="text", text=
            f"✅ 晨报任务已创建\n"
            f"任务ID: {task_id}\n"
            f"发送时间: 每天 {time_str}\n"
            f"时区: {args.get('timezone', 'Asia/Shanghai')}\n"
            f"包含内容: 天气{'✅' if args.get('include_weather') else '❌'} 日程{'✅' if args.get('include_calendar') else '❌'} 邮件{'✅' if args.get('include_email') else '❌'}"
        )]

    async def _handle_web_search(self, args: dict) -> Sequence[TextContent]:
        """处理联网搜索"""
        from ..connectors.search import search_manager

        query = args.get("query", "")
        max_results = args.get("max_results", 5)
        include_answer = args.get("include_answer", True)

        if not query:
            return [TextContent(type="text", text="❌ 错误: 搜索查询不能为空")]

        logger.info(f"[WebSearch] Searching for: {query}")

        # 检查搜索是否可用
        if not search_manager.is_available():
            return [TextContent(type="text", text=
                "❌ 搜索功能未配置\n\n"
                "请设置 TAVILY_API_KEY 环境变量以启用联网搜索功能。"
            )]

        try:
            # 执行搜索
            result = await search_manager.search(
                query=query,
                max_results=max_results,
                include_answer=include_answer,
                search_depth="basic"
            )

            if not result:
                return [TextContent(type="text", text="❌ 搜索失败: 未能获取结果")]

            # 格式化搜索结果
            formatted_result = search_manager.tavily.format_results_for_llm(result)

            logger.info(f"[WebSearch] Search completed, result length: {len(formatted_result)} chars")

            return [TextContent(type="text", text=formatted_result)]

        except Exception as e:
            logger.error(f"[WebSearch] Search failed: {e}")
            return [TextContent(type="text", text=f"❌ 搜索失败: {str(e)}")]

    async def _handle_get_task_history(self, args: dict) -> Sequence[TextContent]:
        try:
            task_id = args.get("task_id")
            limit = args.get("limit", 50)
            history = await self.storage.get_task_history(task_id=task_id, limit=limit)
            if not history:
                return [TextContent(type="text", text="暂无执行历史记录")]
            lines = [f"共 {len(history)} 条执行记录:\n"]
            for record in history:
                status_emoji = "✅" if record.get("status") == "success" else "⏱️" if record.get("status") == "timeout" else "❌"
                lines.append(
                    f"\n{status_emoji} {record.get('task_id')}\n"
                    f"   状态: {record.get('status')}\n"
                    f"   开始: {record.get('started_at')}\n"
                    f"   结束: {record.get('finished_at')}\n"
                    f"   耗时: {record.get('duration_ms', 0)}ms"
                )
                if record.get("error"):
                    lines.append(f"   错误: {record.get('error')}")
            return [TextContent(type="text", text="\n".join(lines))]
        except Exception as e:
            logger.error(f"[MCP] Failed to get task history: {e}")
            return [TextContent(type="text", text=f"❌ 获取执行历史失败: {str(e)}")]

    async def run(self):
        """运行MCP服务器"""
        logger.info("正在启动MCP服务器...")

        # 调试：检查 notify_ui 配置
        try:
            from ..core.config import SchedulerConfig
            if Path(self.config_path).exists():
                config = SchedulerConfig.from_yaml(self.config_path)
                logger.info(f"[MCP] Notify UI config: {getattr(config, 'notify_ui', {})}")
            else:
                logger.info("[MCP] Config file not found, using defaults")
        except Exception as e:
            logger.warning(f"[MCP] Failed to load config for debug: {e}")

        # 初始化调度器
        if Path(self.config_path).exists():
            self.scheduler = HybridScheduler.from_config(self.config_path)
        else:
            self.scheduler = HybridScheduler()

        await self.scheduler.start()

        try:
            async with stdio_server() as (read_stream, write_stream):
                await self.app.run(
                    read_stream,
                    write_stream,
                    InitializationOptions(
                        server_name="ai-scheduler",
                        server_version="1.0.0",
                        capabilities=ServerCapabilities()
                    )
                )
        finally:
            await self.scheduler.shutdown()



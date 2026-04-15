"""
搜索连接器 - 提供联网搜索能力

支持:
- Tavily API (推荐，专为AI设计)
- 自定义搜索API
"""

import os
import json
from typing import Optional, Dict, Any, List
import logging

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    aiohttp = None

logger = logging.getLogger("scheduler_skill")


class SearchResult:
    """搜索结果"""

    def __init__(self, title: str, url: str, content: str, score: float = 0.0):
        self.title = title
        self.url = url
        self.content = content
        self.score = score

    def __repr__(self):
        return f"SearchResult(title={self.title[:50]}..., url={self.url})"


class TavilySearchClient:
    """
    Tavily 搜索客户端

    Tavily 是专为 AI 应用设计的搜索 API，提供高质量的搜索结果。

    使用方式:
        >>> client = TavilySearchClient(api_key="your-api-key")
        >>> results = await client.search("今日新闻", max_results=5)
        >>> for r in results:
        ...     print(f"{r.title}: {r.content}")
    """

    API_BASE = "https://api.tavily.com"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            logger.warning("TAVILY_API_KEY not found, search functionality will be disabled")

    async def search(
        self,
        query: str,
        max_results: int = 5,
        include_answer: bool = True,
        search_depth: str = "basic",  # basic or advanced
        include_domains: Optional[List[str]] = None,
        exclude_domains: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        执行搜索

        Args:
            query: 搜索查询
            max_results: 最大结果数 (1-10)
            include_answer: 是否包含AI生成的答案摘要
            search_depth: 搜索深度，basic 或 advanced
            include_domains: 只包含这些域名的结果
            exclude_domains: 排除这些域名的结果

        Returns:
            Tavily API 的完整响应
        """
        if not AIOHTTP_AVAILABLE:
            raise ImportError("aiohttp not installed, search functionality disabled")

        if not self.api_key:
            raise ValueError("TAVILY_API_KEY not configured")

        url = f"{self.API_BASE}/search"

        payload = {
            "api_key": self.api_key,
            "query": query,
            "max_results": min(max_results, 10),
            "include_answer": include_answer,
            "search_depth": search_depth,
        }

        if include_domains:
            payload["include_domains"] = include_domains
        if exclude_domains:
            payload["exclude_domains"] = exclude_domains

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                response.raise_for_status()
                return await response.json()

    async def extract_content(self, urls: List[str]) -> Dict[str, str]:
        """
        从指定 URL 提取内容

        Args:
            urls: 要提取内容的URL列表

        Returns:
            URL到内容的映射
        """
        if not AIOHTTP_AVAILABLE:
            raise ImportError("aiohttp not installed, search functionality disabled")

        if not self.api_key:
            raise ValueError("TAVILY_API_KEY not configured")

        url = f"{self.API_BASE}/extract"

        payload = {
            "api_key": self.api_key,
            "urls": urls,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                response.raise_for_status()
                return await response.json()

    def format_results_for_llm(self, search_response: Dict[str, Any]) -> str:
        """
        将搜索结果格式化为适合LLM使用的文本

        Args:
            search_response: Tavily API的响应

        Returns:
            格式化后的文本
        """
        lines = []

        # 添加搜索结果（优先显示结果）
        results = search_response.get("results", [])
        if results:
            lines.append(f"【搜索到 {len(results)} 条结果】")
            lines.append("")
            for i, result in enumerate(results, 1):
                title = result.get("title", "无标题")
                url = result.get("url", "")
                content = result.get("content", "")
                # 使用 Markdown 格式，让链接可点击
                lines.append(f"**{i}. [{title}]({url})**")
                lines.append(f"> {content[:400]}..." if len(content) > 400 else f"> {content}")
                lines.append("")

        # 添加AI生成的答案摘要（如果有）
        answer = search_response.get("answer")
        if answer:
            lines.append("---")
            lines.append("【AI摘要】")
            lines.append(answer)
            lines.append("")

        return "\n".join(lines)


class SearchManager:
    """
    搜索管理器

    统一管理搜索功能，支持多种搜索后端
    """

    def __init__(self):
        self._tavily: Optional[TavilySearchClient] = None

    @property
    def tavily(self) -> Optional[TavilySearchClient]:
        """获取 Tavily 客户端（延迟初始化）"""
        if self._tavily is None:
            api_key = os.getenv("TAVILY_API_KEY")
            if api_key:
                self._tavily = TavilySearchClient(api_key)
        return self._tavily

    def is_available(self) -> bool:
        """检查搜索功能是否可用"""
        if not AIOHTTP_AVAILABLE:
            logger.warning("Search not available: aiohttp not installed")
            return False
        return self.tavily is not None

    async def search(
        self,
        query: str,
        max_results: int = 5,
        include_answer: bool = True,
        search_depth: str = "basic",
        include_domains: Optional[List[str]] = None,
        exclude_domains: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        执行搜索

        Args:
            query: 搜索查询
            max_results: 最大结果数
            include_answer: 是否包含AI答案
            search_depth: 搜索深度，basic 或 advanced
            include_domains: 只包含这些域名的结果
            exclude_domains: 排除这些域名的结果

        Returns:
            搜索结果，如果搜索不可用则返回None
        """
        if not self.is_available():
            logger.warning("Search not available: TAVILY_API_KEY not configured")
            return None

        try:
            return await self.tavily.search(
                query=query,
                max_results=max_results,
                include_answer=include_answer,
                search_depth=search_depth,
                include_domains=include_domains,
                exclude_domains=exclude_domains,
            )
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return None

    async def search_and_format(self, query: str, max_results: int = 5) -> str:
        """
        执行搜索并返回格式化结果

        Args:
            query: 搜索查询
            max_results: 最大结果数

        Returns:
            格式化的搜索结果文本
        """
        if not self.is_available():
            return "[搜索功能未配置: 请设置 TAVILY_API_KEY]"

        try:
            result = await self.search(query, max_results, include_answer=True)
            if result:
                return self.tavily.format_results_for_llm(result)
            return "[搜索失败: 未能获取结果]"
        except Exception as e:
            logger.error(f"Search and format failed: {e}")
            return f"[搜索错误: {e}]"


# 全局搜索管理器实例
search_manager = SearchManager()

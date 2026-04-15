"""
HTTP客户端 - 统一的异步HTTP请求
"""

import json
from typing import Optional, Dict, Any
import aiohttp


class HTTPClient:
    """
    异步HTTP客户端
    
    示例:
        >>> async with HTTPClient() as client:
        ...     data = await client.get("https://api.example.com/data")
        ...     result = await client.post("https://api.example.com/submit", json={"key": "value"})
    """
    
    def __init__(self, timeout: int = 30):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def initialize(self):
        """初始化session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
    
    async def close(self):
        """关闭session"""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def _ensure_session(self):
        """确保session已初始化"""
        if self._session is None or self._session.closed:
            await self.initialize()
    
    async def get(
        self, 
        url: str, 
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """
        GET请求
        
        Args:
            url: 请求URL
            params: URL参数
            headers: 请求头
            **kwargs: 其他aiohttp参数
        
        Returns:
            响应数据（JSON或文本）
        """
        await self._ensure_session()
        
        async with self._session.get(url, params=params, headers=headers, **kwargs) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                return await response.json()
            return await response.text()
    
    async def post(
        self, 
        url: str, 
        json: Optional[Dict] = None,
        data: Optional[Any] = None,
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """
        POST请求
        
        Args:
            url: 请求URL
            json: JSON数据
            data: 表单数据
            headers: 请求头
            **kwargs: 其他aiohttp参数
        
        Returns:
            响应数据
        """
        await self._ensure_session()
        
        async with self._session.post(url, json=json, data=data, headers=headers, **kwargs) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                return await response.json()
            return await response.text()
    
    async def put(
        self, 
        url: str, 
        json: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """PUT请求"""
        await self._ensure_session()
        
        async with self._session.put(url, json=json, headers=headers, **kwargs) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                return await response.json()
            return await response.text()
    
    async def delete(
        self, 
        url: str, 
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """DELETE请求"""
        await self._ensure_session()
        
        async with self._session.delete(url, headers=headers, **kwargs) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                return await response.json()
            return await response.text()

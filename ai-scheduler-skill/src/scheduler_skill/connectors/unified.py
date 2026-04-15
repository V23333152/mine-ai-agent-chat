"""
统一LLM客户端 - 支持多种模型提供商

支持:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Ollama (本地模型)
- DeepSeek
"""

import os
from typing import Optional, Dict, Any
import logging

from .base import LLMConnector
from ..core.config import ModelConfig
from ..core.models import LLMProvider

logger = logging.getLogger("scheduler_skill")


class UnifiedLLMClient(LLMConnector):
    """
    统一LLM客户端
    
    自动根据provider选择对应的客户端
    
    示例:
        >>> config = ModelConfig(provider="openai", model="gpt-4o-mini")
        >>> client = UnifiedLLMClient(config)
        >>> result = await client.generate("你好")
    """
    
    def __init__(self, config: ModelConfig):
        self.config = config
        self._client: Optional[Any] = None
        self._provider: Optional[LLMProvider] = None
    
    async def initialize(self):
        """初始化对应提供商的客户端"""
        provider = self.config.provider.lower()
        
        if provider == "openai":
            self._provider = LLMProvider.OPENAI
            self._init_openai()
        elif provider in ["anthropic", "claude"]:
            self._provider = LLMProvider.ANTHROPIC
            self._init_anthropic()
        elif provider == "ollama":
            self._provider = LLMProvider.OLLAMA
            self._init_ollama()
        elif provider == "deepseek":
            self._provider = LLMProvider.DEEPSEEK
            self._init_deepseek()
        else:
            raise ValueError(f"Unsupported provider: {provider}")
    
    def _init_openai(self):
        """初始化OpenAI客户端"""
        try:
            from openai import AsyncOpenAI
            
            api_key = self.config.api_key or os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OpenAI API key not found")
            
            # 优先使用环境变量 OPENAI_BASE_URL，其次是配置中的 base_url
            base_url = os.getenv("OPENAI_BASE_URL") or self.config.base_url
            
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
            )
        except ImportError:
            raise ImportError("Please install openai: pip install openai")
    
    def _init_anthropic(self):
        """初始化Anthropic客户端"""
        try:
            from anthropic import AsyncAnthropic
            
            api_key = self.config.api_key or os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("Anthropic API key not found")
            
            self._client = AsyncAnthropic(
                api_key=api_key,
                base_url=self.config.base_url,
            )
        except ImportError:
            raise ImportError("Please install anthropic: pip install anthropic")
    
    def _init_ollama(self):
        """初始化Ollama客户端"""
        self._client = OllamaClient(
            base_url=self.config.base_url or os.getenv("OLLAMA_HOST", "http://localhost:11434"),
            model=self.config.model,
        )
    
    def _init_deepseek(self):
        """初始化DeepSeek客户端"""
        try:
            from openai import AsyncOpenAI
            
            api_key = self.config.api_key or os.getenv("DEEPSEEK_API_KEY")
            if not api_key:
                raise ValueError("DeepSeek API key not found")
            
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=self.config.base_url or "https://api.deepseek.com",
            )
        except ImportError:
            raise ImportError("Please install openai: pip install openai")
    
    async def close(self):
        """关闭客户端"""
        self._client = None
    
    async def generate(
        self, 
        prompt: str, 
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """生成文本"""
        if self._client is None:
            await self.initialize()
        
        model = model or self.config.model
        temperature = temperature if temperature is not None else self.config.temperature
        max_tokens = max_tokens if max_tokens is not None else self.config.max_tokens
        
        if self._provider == LLMProvider.OPENAI or self._provider == LLMProvider.DEEPSEEK:
            return await self._generate_openai(prompt, model, temperature, max_tokens, **kwargs)
        elif self._provider == LLMProvider.ANTHROPIC:
            return await self._generate_anthropic(prompt, model, temperature, max_tokens, **kwargs)
        elif self._provider == LLMProvider.OLLAMA:
            return await self._generate_ollama(prompt, model, temperature, max_tokens, **kwargs)
        
        raise ValueError(f"Unknown provider: {self._provider}")
    
    async def _generate_openai(
        self, 
        prompt: str, 
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """使用OpenAI生成"""
        response = await self._client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        return response.choices[0].message.content
    
    async def _generate_anthropic(
        self, 
        prompt: str, 
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """使用Anthropic生成"""
        response = await self._client.messages.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        return response.content[0].text
    
    async def _generate_ollama(
        self, 
        prompt: str, 
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """使用Ollama生成"""
        return await self._client.generate(prompt, model, temperature, max_tokens, **kwargs)
    
    async def count_tokens(self, text: str, model: Optional[str] = None) -> int:
        """计算token数（简化估算）"""
        # 简化估算：英文约4字符/token，中文约1.5字符/token
        # 实际应该使用各提供商的tokenizer
        import re
        
        # 中文字符
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        # 其他字符
        other_chars = len(text) - chinese_chars
        
        # 估算：中文字符按1 token/字，其他按4字符/token
        estimated = chinese_chars + (other_chars / 4)
        return int(estimated)


class OllamaClient:
    """Ollama客户端封装"""
    
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
    
    async def generate(
        self, 
        prompt: str, 
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """生成文本"""
        import aiohttp
        
        url = f"{self.base_url}/api/generate"
        
        data = {
            "model": model or self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data) as response:
                response.raise_for_status()
                result = await response.json()
                return result.get("response", "")

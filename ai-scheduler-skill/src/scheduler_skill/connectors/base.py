"""
连接器基类
"""

from abc import ABC, abstractmethod
from typing import Any, Optional, Dict


class Connector(ABC):
    """连接器抽象基类"""
    
    @abstractmethod
    async def initialize(self):
        """初始化连接器"""
        pass
    
    @abstractmethod
    async def close(self):
        """关闭连接器"""
        pass


class LLMConnector(Connector):
    """LLM连接器基类"""
    
    @abstractmethod
    async def generate(
        self, 
        prompt: str, 
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """
        生成文本
        
        Args:
            prompt: 提示词
            model: 模型名称
            temperature: 温度
            max_tokens: 最大token数
            **kwargs: 其他参数
        
        Returns:
            生成的文本
        """
        pass
    
    @abstractmethod
    async def count_tokens(self, text: str, model: Optional[str] = None) -> int:
        """计算token数"""
        pass

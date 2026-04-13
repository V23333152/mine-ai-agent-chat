"""LangGraph agent using Kimi API (OpenAI compatible).

To use this graph, update langgraph.json to point to this file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from langgraph.runtime import Runtime
from typing_extensions import TypedDict


class Context(TypedDict, total=False):
    """Context parameters for the agent."""

    model: str
    temperature: float


@dataclass
class State:
    """Input state for the agent."""

    messages: list = None

    def __post_init__(self):
        if self.messages is None:
            self.messages = []


# Initialize Kimi client (OpenAI compatible)
def get_llm(context: Context | None = None):
    """Get Kimi LLM instance."""
    ctx = context or {}
    return ChatOpenAI(
        model=ctx.get("model", "moonshot-v1-8k"),
        temperature=ctx.get("temperature", 0.7),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base=os.getenv("OPENAI_BASE_URL", "https://api.moonshot.cn/v1"),
    )


async def call_model(state: State, runtime: Runtime[Context]) -> Dict[str, Any]:
    """Process input with Kimi and return response."""
    llm = get_llm(runtime.context)
    
    # If no messages, create a welcome message
    if not state.messages:
        return {
            "messages": [{"role": "assistant", "content": "你好！我是基于 Kimi 的 AI 助手。有什么可以帮助你的吗？"}]
        }
    
    # Call Kimi API
    response = await llm.ainvoke(state.messages)
    
    return {
        "messages": state.messages + [{"role": "assistant", "content": response.content}]
    }


# Define the graph
graph = (
    StateGraph(State, context_schema=Context)
    .add_node("call_model", call_model)
    .add_edge("__start__", "call_model")
    .compile(name="Kimi Agent")
)

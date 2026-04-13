"""RAG-enabled LangGraph agent using Kimi API.

This module extends the basic Kimi agent with Retrieval-Augmented Generation
capabilities using ChromaDB as the vector store.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

from vector_store import get_vector_store, VectorStoreConfig
from document_processor import (
    get_document_processor, 
    processed_docs_to_langchain
)


class Context(TypedDict, total=False):
    """Context parameters for the agent."""
    
    model: str
    temperature: float
    user_id: str
    enable_rag: bool
    collection_name: str


@dataclass
class State:
    """State for the RAG agent."""
    
    messages: list = None
    retrieved_docs: List[Document] = None
    queries: List[str] = None
    
    def __post_init__(self):
        if self.messages is None:
            self.messages = []
        if self.retrieved_docs is None:
            self.retrieved_docs = []
        if self.queries is None:
            self.queries = []


def get_llm(context: Context | None = None):
    """Get Kimi LLM instance."""
    ctx = context or {}
    return ChatOpenAI(
        model=ctx.get("model", "moonshot-v1-8k"),
        temperature=ctx.get("temperature", 0.7),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base=os.getenv("OPENAI_BASE_URL", "https://api.moonshot.cn/v1"),
    )


async def retrieve_documents(
    state: State, 
    runtime: Runtime[Context]
) -> Dict[str, Any]:
    """Retrieve relevant documents from vector store.
    
    This node is called before generating a response to fetch
    relevant context from the vector database.
    """
    context = runtime.context or {}
    
    # Check if RAG is enabled
    if not context.get("enable_rag", True):
        return {"retrieved_docs": []}
    
    # Get the last user message as query
    if not state.messages:
        return {"retrieved_docs": []}
    
    last_message = state.messages[-1]
    if last_message.get("role") != "user":
        return {"retrieved_docs": []}
    
    query = last_message.get("content", "")
    if not query:
        return {"retrieved_docs": []}
    
    # Get user_id for document isolation
    user_id = context.get("user_id", "default")
    collection_name = context.get("collection_name", "default_collection")
    
    try:
        # Configure vector store
        config = VectorStoreConfig(
            collection_name=collection_name,
            persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        )
        vector_store = get_vector_store(config)
        
        # Search for relevant documents
        docs = await vector_store.similarity_search(query, user_id=user_id, k=5)
        
        return {
            "retrieved_docs": docs,
            "queries": state.queries + [query]
        }
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error retrieving documents: {e}")
        return {"retrieved_docs": []}


def format_retrieved_docs(docs: List[Document]) -> str:
    """Format retrieved documents for inclusion in prompt.
    
    Args:
        docs: List of retrieved documents.
        
    Returns:
        Formatted string with document contents.
    """
    if not docs:
        return ""
    
    formatted_docs = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("source", "Unknown")
        content = doc.page_content.strip()
        formatted_docs.append(f"[Document {i}] Source: {source}\n{content}")
    
    return "\n\n".join(formatted_docs)


async def generate_response(
    state: State, 
    runtime: Runtime[Context]
) -> Dict[str, Any]:
    """Generate response using retrieved context.
    
    This node generates a response using the LLM, incorporating
    any retrieved documents into the context.
    """
    llm = get_llm(runtime.context)
    
    # If no messages, create a welcome message
    if not state.messages:
        return {
            "messages": [{"role": "assistant", "content": "你好！我是基于 Kimi 的 AI 助手，支持RAG增强。有什么可以帮助你的吗？"}]
        }
    
    # Build messages with retrieved context
    messages = state.messages.copy()
    
    # Add retrieved documents to system message if available
    if state.retrieved_docs:
        docs_content = format_retrieved_docs(state.retrieved_docs)
        
        # Create enhanced system message
        system_content = f"""你是一个 helpful AI 助手。请根据以下检索到的相关文档来回答用户问题。
如果文档中没有相关信息，请基于你的知识回答。

---
检索到的相关文档：
{docs_content}
---

请根据上述文档内容回答用户问题。在回答时，如果使用了文档中的信息，请引用来源。"""
        
        # Insert system message at the beginning
        messages.insert(0, {"role": "system", "content": system_content})
    
    # Call Kimi API
    response = await llm.ainvoke(messages)
    
    # Build response with citations if documents were used
    response_content = response.content
    
    # Add citation information if RAG was used
    if state.retrieved_docs:
        sources = []
        for doc in state.retrieved_docs:
            source = doc.metadata.get("source", "Unknown")
            if source not in sources:
                sources.append(source)
        
        if sources:
            citation = f"\n\n---\n参考来源: {', '.join(sources)}"
            response_content = response_content + citation
    
    return {
        "messages": state.messages + [{"role": "assistant", "content": response_content}]
    }


def should_retrieve(state: State, runtime: Runtime[Context]) -> str:
    """Determine if we should retrieve documents.
    
    This router function decides whether to retrieve documents
    based on the current state and context.
    """
    context = runtime.context or {}
    
    # Check if RAG is enabled
    if not context.get("enable_rag", True):
        return "generate"
    
    # Check if there are any messages
    if not state.messages:
        return "generate"
    
    # Check if last message is from user
    last_message = state.messages[-1]
    if last_message.get("role") != "user":
        return "generate"
    
    # Get the query
    query = last_message.get("content", "")
    
    # Skip retrieval for very short queries (likely greetings)
    if len(query.strip()) < 10:
        return "generate"
    
    return "retrieve"


# Build the graph
builder = StateGraph(State, context_schema=Context)

# Add nodes
builder.add_node("retrieve", retrieve_documents)
builder.add_node("generate", generate_response)

# Add edges
builder.add_conditional_edges(
    "__start__",
    should_retrieve,
    {
        "retrieve": "retrieve",
        "generate": "generate",
    }
)
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", END)

# Compile the graph
graph = builder.compile(name="RAG Kimi Agent")


# Export for LangGraph
__all__ = ["graph", "State", "Context"]

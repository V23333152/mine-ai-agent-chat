"""Vector store implementation using ChromaDB for RAG.

This module provides vector database functionality for document storage
and retrieval using ChromaDB as the backend.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma


@dataclass
class VectorStoreConfig:
    """Configuration for vector store."""
    
    collection_name: str = "default_collection"
    persist_directory: str = "./chroma_db"
    # Local HuggingFace embedding model
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    search_k: int = 5
    
    @classmethod
    def from_env(cls) -> VectorStoreConfig:
        """Create config from environment variables."""
        return cls(
            collection_name=os.getenv("CHROMA_COLLECTION_NAME", "default_collection"),
            persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
            search_k=int(os.getenv("SEARCH_K", "5")),
        )


class VectorStore:
    """Vector store for document storage and retrieval."""
    
    def __init__(self, config: Optional[VectorStoreConfig] = None):
        """Initialize vector store.
        
        Args:
            config: Vector store configuration. Uses default if not provided.
        """
        self.config = config or VectorStoreConfig.from_env()
        self._embeddings: Optional[Embeddings] = None
        self._db: Optional[Chroma] = None
    
    @property
    def embeddings(self) -> Embeddings:
        """Get or create embeddings model using local HuggingFace model."""
        if self._embeddings is None:
            model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
            
            # Always use China mirror and local cache only to avoid network timeout
            os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
            os.environ["HF_HUB_OFFLINE"] = "1"  # Force offline mode - use local cache only
            os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"  # Also for transformers
            
            print(f"[VectorStore] Loading local embedding model: {model_name}")
            print(f"[VectorStore] Using offline mode (local cache only)")
            
            # Check if model exists in local cache
            cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
            model_slug = model_name.replace("/", "--")
            model_path = os.path.join(cache_dir, f"models--{model_slug}")
            
            if os.path.exists(model_path):
                print(f"[VectorStore] Found model in cache: {model_path}")
            else:
                print(f"[VectorStore] Warning: Model not found in cache at {model_path}")
                print(f"[VectorStore] Please run: python download_model.py")
            
            try:
                self._embeddings = HuggingFaceEmbeddings(
                    model_name=model_name,
                    model_kwargs={'device': 'cpu', 'local_files_only': True},  # Force local only
                    encode_kwargs={'normalize_embeddings': True}
                )
                print(f"[VectorStore] Local model loaded successfully")
            except Exception as e:
                print(f"[VectorStore] Failed to load model: {e}")
                raise RuntimeError(
                    f"Failed to load embedding model: {e}\n"
                    f"Please ensure the model is downloaded to: {model_path}\n"
                    f"Run: python download_model.py"
                )
        return self._embeddings
    
    @property
    def db(self) -> Chroma:
        """Get or create ChromaDB instance."""
        if self._db is None:
            # Ensure persist directory exists
            os.makedirs(self.config.persist_directory, exist_ok=True)
            
            self._db = Chroma(
                collection_name=self.config.collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.config.persist_directory,
            )
        return self._db
    
    async def add_documents(
        self, 
        documents: List[Document], 
        user_id: str = "default"
    ) -> List[str]:
        """Add documents to vector store.
        
        Args:
            documents: List of documents to add.
            user_id: User identifier for document isolation.
            
        Returns:
            List of document IDs.
        """
        # Add user_id to metadata
        for doc in documents:
            doc.metadata["user_id"] = user_id
            doc.metadata.setdefault("source", "unknown")
        
        return await self.db.aadd_documents(documents)
    
    async def similarity_search(
        self, 
        query: str, 
        user_id: str = "default",
        k: Optional[int] = None,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> List[Document]:
        """Search for similar documents.
        
        Args:
            query: Search query.
            user_id: User identifier for filtering.
            k: Number of results to return.
            filter_dict: Additional filters.
            
        Returns:
            List of similar documents.
        """
        k = k or self.config.search_k
        
        # Build filter
        search_filter = {"user_id": user_id}
        if filter_dict:
            search_filter.update(filter_dict)
        
        return await self.db.asimilarity_search(
            query, 
            k=k, 
            filter=search_filter
        )
    
    async def delete_documents(
        self, 
        document_ids: Optional[List[str]] = None,
        user_id: Optional[str] = None
    ) -> None:
        """Delete documents from vector store.
        
        Args:
            document_ids: List of document IDs to delete. If None and user_id is provided,
                         deletes all documents for that user.
            user_id: User identifier for deletion.
        """
        if document_ids:
            await self.db.adelete(document_ids)
        elif user_id:
            # Delete all documents for user
            await self.db.adelete(where={"user_id": user_id})
    
    def get_collection_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get collection statistics.
        
        Args:
            user_id: Optional user filter.
            
        Returns:
            Dictionary with collection statistics.
        """
        collection = self.db._collection
        total_count = collection.count()
        
        stats = {
            "total_documents": total_count,
            "collection_name": self.config.collection_name,
            "persist_directory": self.config.persist_directory,
        }
        
        if user_id:
            # Count documents for specific user
            user_docs = collection.get(where={"user_id": user_id})
            stats["user_documents"] = len(user_docs["ids"])
        
        return stats
    
    async def update_documents(
        self, 
        documents: List[Document],
        user_id: str = "default"
    ) -> None:
        """Update existing documents.
        
        Args:
            documents: List of documents to update.
            user_id: User identifier.
        """
        for doc in documents:
            doc.metadata["user_id"] = user_id
        
        await self.db.aupdate_documents(documents)


# Global vector store instance
_vector_store: Optional[VectorStore] = None


def get_vector_store(config: Optional[VectorStoreConfig] = None) -> VectorStore:
    """Get or create global vector store instance.
    
    Args:
        config: Optional configuration.
        
    Returns:
        VectorStore instance.
    """
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore(config)
    return _vector_store

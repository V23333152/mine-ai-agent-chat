"""FastAPI routes for vector database and file management.

This module provides REST API endpoints for:
- File upload and processing
- Vector database management
- Document indexing
"""

from __future__ import annotations

import os
from typing import List, Optional, Any, Dict
from pathlib import Path
import tempfile
import shutil

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from vector_store import get_vector_store, VectorStoreConfig
from document_processor import (
    get_document_processor,
    processed_docs_to_langchain
)


# Create FastAPI app
app = FastAPI(
    title="RAG Vector Database API",
    description="API for managing vector database and document indexing",
    version="1.0.0"
)

# Pre-load embedding model on startup
@app.on_event("startup")
async def startup_event():
    """Pre-load models on startup."""
    print("[Startup] Initializing vector store...")
    try:
        # This will trigger model loading
        config = VectorStoreConfig()
        vector_store = get_vector_store(config)
        # Access embeddings to trigger loading
        _ = vector_store.embeddings
        print("[Startup] Vector store initialized successfully")
    except Exception as e:
        print(f"[Startup] Warning: Failed to initialize vector store: {e}")
        print("[Startup] Will retry on first request")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle all unhandled exceptions."""
    import traceback
    error_detail = str(exc)
    traceback_str = traceback.format_exc()
    print(f"[API Error] {error_detail}\n{traceback_str}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {error_detail}"}
    )


# Pydantic models
class IndexRequest(BaseModel):
    """Request model for indexing documents."""
    user_id: str = "default"
    collection_name: Optional[str] = None


class SearchRequest(BaseModel):
    """Request model for searching documents."""
    query: str
    user_id: str = "default"
    collection_name: Optional[str] = None
    k: int = 5


class SearchResponse(BaseModel):
    """Response model for search results."""
    documents: List[Dict[str, Any]]
    total: int


class DeleteRequest(BaseModel):
    """Request model for deleting documents."""
    user_id: str = "default"
    collection_name: Optional[str] = None
    document_ids: Optional[List[str]] = None


class StatsResponse(BaseModel):
    """Response model for collection statistics."""
    total_documents: int
    collection_name: str
    persist_directory: str
    user_documents: Optional[int] = None


class UploadResponse(BaseModel):
    """Response model for file upload."""
    success: bool
    message: str
    documents_indexed: int
    filenames: List[str]
    errors: List[str]


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "RAG Vector Database API",
        "version": "1.0.0",
        "endpoints": {
            "upload": "/api/v1/upload",
            "search": "/api/v1/search",
            "stats": "/api/v1/stats",
            "delete": "/api/v1/delete",
        }
    }


@app.post("/api/v1/upload", response_model=UploadResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user_id: str = Form("default"),
    collection_name: Optional[str] = Form(None),
    chunk_size: int = Form(2000),
    chunk_overlap: int = Form(200),
):
    """Upload and index files to vector database.
    
    Args:
        files: List of files to upload.
        user_id: User identifier for document isolation.
        collection_name: Optional collection name override.
        chunk_size: Size of text chunks for splitting.
        chunk_overlap: Overlap between chunks.
        
    Returns:
        Upload response with indexing results.
    """
    print(f"[Upload API] Received {len(files)} files from user {user_id}")
    
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    # Get processor and vector store
    processor = get_document_processor()
    collection = collection_name or os.getenv("CHROMA_COLLECTION_NAME", "default_collection")
    
    print(f"[Upload API] Using collection: {collection}")
    
    config = VectorStoreConfig(
        collection_name=collection,
        persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
    )
    vector_store = get_vector_store(config)
    
    processed_files = []
    errors = []
    total_docs = 0
    
    # Process each file
    for upload_file in files:
        print(f"[Upload API] Processing file: {upload_file.filename}")
        try:
            # Read file content
            content = await upload_file.read()
            
            if not content:
                errors.append(f"Empty file: {upload_file.filename}")
                continue
            
            print(f"[Upload API] File {upload_file.filename} size: {len(content)} bytes")
            
            # Process the file
            processed_docs = processor.process_file(
                content,
                upload_file.filename,
                chunk_size=chunk_size,
                overlap=chunk_overlap
            )
            
            print(f"[Upload API] File {upload_file.filename} processed into {len(processed_docs)} chunks")
            
            # Convert to LangChain documents
            langchain_docs = processed_docs_to_langchain(processed_docs)
            
            # Add to vector store
            doc_ids = await vector_store.add_documents(langchain_docs, user_id=user_id)
            
            total_docs += len(doc_ids)
            processed_files.append(upload_file.filename)
            print(f"[Upload API] File {upload_file.filename} indexed with {len(doc_ids)} documents")
            
        except Exception as e:
            import traceback
            error_msg = f"{upload_file.filename}: {str(e)}"
            print(f"[Upload API] Error processing {upload_file.filename}: {error_msg}")
            print(traceback.format_exc())
            errors.append(error_msg)
        finally:
            await upload_file.close()
    
    print(f"[Upload API] Upload complete. Processed: {len(processed_files)}, Errors: {len(errors)}, Total docs: {total_docs}")
    
    return UploadResponse(
        success=len(processed_files) > 0,
        message=f"Successfully indexed {total_docs} document chunks from {len(processed_files)} files",
        documents_indexed=total_docs,
        filenames=processed_files,
        errors=errors
    )


@app.post("/api/v1/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """Search for documents in vector database.
    
    Args:
        request: Search request with query and filters.
        
    Returns:
        Search results with matching documents.
    """
    try:
        collection = request.collection_name or os.getenv(
            "CHROMA_COLLECTION_NAME", "default_collection"
        )
        
        config = VectorStoreConfig(
            collection_name=collection,
            persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        )
        vector_store = get_vector_store(config)
        
        # Search for documents
        docs = await vector_store.similarity_search(
            request.query,
            user_id=request.user_id,
            k=request.k
        )
        
        # Format results
        results = []
        for doc in docs:
            results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
            })
        
        return SearchResponse(
            documents=results,
            total=len(results)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/api/v1/stats", response_model=StatsResponse)
async def get_stats(
    user_id: str = "default",
    collection_name: Optional[str] = None
):
    """Get vector database statistics.
    
    Args:
        user_id: User identifier.
        collection_name: Optional collection name.
        
    Returns:
        Collection statistics.
    """
    try:
        collection = collection_name or os.getenv(
            "CHROMA_COLLECTION_NAME", "default_collection"
        )
        
        config = VectorStoreConfig(
            collection_name=collection,
            persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        )
        vector_store = get_vector_store(config)
        
        stats = vector_store.get_collection_stats(user_id=user_id)
        
        return StatsResponse(**stats)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@app.delete("/api/v1/documents")
async def delete_documents(request: DeleteRequest):
    """Delete documents from vector database.
    
    Args:
        request: Delete request with filters.
        
    Returns:
        Deletion result.
    """
    try:
        collection = request.collection_name or os.getenv(
            "CHROMA_COLLECTION_NAME", "default_collection"
        )
        
        config = VectorStoreConfig(
            collection_name=collection,
            persist_directory=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        )
        vector_store = get_vector_store(config)
        
        await vector_store.delete_documents(
            document_ids=request.document_ids,
            user_id=request.user_id if not request.document_ids else None
        )
        
        return {
            "success": True,
            "message": "Documents deleted successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


@app.get("/api/v1/supported-formats")
async def get_supported_formats():
    """Get list of supported file formats.
    
    Returns:
        List of supported file extensions.
    """
    processor = get_document_processor()
    return {
        "supported_extensions": processor.get_supported_extensions()
    }


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# For running with uvicorn directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

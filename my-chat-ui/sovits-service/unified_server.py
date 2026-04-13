"""
统一后端服务 - Unified AI Agent Backend
整合：TTS、实时语音、代码解释器、RAG向量数据库
"""
import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))
# 添加RAG模块路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "LangGraph/path/to/your/app/src/agent"))

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

# 导入各个模块
from main import (
    app as tts_app, text_to_speech, list_characters, 
    TTSRequest, TTSResponse, CharacterInfo, ServiceState
)
from qwen_tts import generate_qwen_tts
from code_interpreter import (
    CodeExecutor, ExecutionResult, 
    MAX_EXECUTION_TIME, ALLOWED_MODULES
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 配置 ====================
class ServerConfig:
    """服务器配置"""
    HOST = os.getenv("UNIFIED_SERVER_HOST", "0.0.0.0")
    PORT = int(os.getenv("UNIFIED_SERVER_PORT", "8888"))
    
    # API Keys
    MOONSHOT_API_KEY = os.getenv("MOONSHOT_API_KEY", "")
    QWEN_API_KEY = os.getenv("QWEN_API_KEY", "sk-e40494c523b74914aa9e40114a29032e")
    ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
    
    # RAG配置 - 使用旧数据目录
    CHROMA_PERSIST_DIR = os.getenv(
        "CHROMA_PERSIST_DIR", 
        str(Path(__file__).parent.parent.parent / "LangGraph/path/to/your/app/chroma_db")
    )
    RAG_ENABLED = os.getenv("RAG_ENABLED", "true").lower() == "true"

# ==================== 全局状态 ====================
class UnifiedServiceState:
    """统一服务状态"""
    def __init__(self):
        self.tts_state = ServiceState()
        self.code_executors: dict[str, CodeExecutor] = {}
        self.voice_sessions: dict[str, dict] = {}
        self.initialized = False
        
    async def initialize(self):
        """初始化所有服务"""
        logger.info("🚀 初始化统一服务...")
        
        # 初始化TTS
        logger.info("  ✓ TTS服务")
        self.tts_state.check_gsv_service()
        
        # 检查RAG
        if ServerConfig.RAG_ENABLED:
            logger.info("  ✓ RAG向量数据库")
            try:
                import chromadb
                self.chroma_client = chromadb.PersistentClient(
                    path=ServerConfig.CHROMA_PERSIST_DIR
                )
            except Exception as e:
                logger.warning(f"  ⚠ RAG初始化失败: {e}")
        
        self.initialized = True
        logger.info("✅ 统一服务初始化完成")
        
    def cleanup(self):
        """清理资源"""
        logger.info("🧹 清理资源...")
        # 清理代码执行器
        for session_id, executor in self.code_executors.items():
            try:
                executor.cleanup()
            except:
                pass
        self.code_executors.clear()

# 全局状态
service_state = UnifiedServiceState()

# ==================== 生命周期管理 ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动
    await service_state.initialize()
    yield
    # 关闭
    service_state.cleanup()

# ==================== 创建FastAPI应用 ====================
app = FastAPI(
    title="Unified AI Agent Backend",
    description="统一AI智能体后端服务 - 集成TTS、实时语音、代码解释器、RAG",
    version="2.0.0",
    lifespan=lifespan
)

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 数据模型 ====================
class HealthResponse(BaseModel):
    status: str
    version: str
    services: dict

class CodeExecuteRequest(BaseModel):
    code: str
    session_id: str = "default"

class CodeExecuteResponse(BaseModel):
    success: bool
    output: str
    error: Optional[str] = None
    figures: list[str] = []
    execution_time: float

class SearchRequest(BaseModel):
    query: str
    user_id: str = "default"
    k: int = 5
    collection_name: str = "default"

class SearchResponse(BaseModel):
    documents: list[dict]
    total: int

# ==================== 健康检查 ====================
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查端点"""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        services={
            "tts": True,
            "code_interpreter": True,
            "rag": ServerConfig.RAG_ENABLED,
            "realtime_voice": True,
        }
    )

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Unified AI Agent Backend",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# ==================== TTS服务 ====================
@app.post("/tts", response_model=TTSResponse)
@app.post("/api/tts", response_model=TTSResponse)
async def tts_endpoint(request: TTSRequest):
    """文本转语音"""
    # 复用原有TTS逻辑
    from fastapi import BackgroundTasks
    background_tasks = BackgroundTasks()
    
    # 这里简化处理，实际应该调用tts_app的端点
    # 或者将tts逻辑抽离为可复用的函数
    return await text_to_speech(request, background_tasks)

@app.post("/tts/qwen", response_model=TTSResponse)
@app.post("/api/tts/qwen", response_model=TTSResponse)
async def tts_qwen_endpoint(request: TTSRequest, background_tasks: BackgroundTasks):
    """通义千问TTS"""
    logger.info(f"[Qwen TTS] Request: {request.text[:50]}...")
    
    success, result, message = generate_qwen_tts(
        text=request.text,
        voice="zhimeng",
        speed=request.speed
    )
    
    if success:
        output_path = Path(result)
        audio_filename = output_path.name
        audio_url = f"/audio/{audio_filename}"
        
        background_tasks.add_task(lambda: None)  # 简化清理
        
        return TTSResponse(
            success=True,
            audio_url=audio_url,
            duration=len(request.text) * 0.3,
            message=message
        )
    else:
        raise HTTPException(status_code=500, detail=f"Qwen TTS failed: {result}")

@app.get("/characters", response_model=list[CharacterInfo])
@app.get("/api/tts/characters", response_model=list[CharacterInfo])
async def characters_endpoint():
    """获取可用音色列表"""
    return await list_characters()

@app.get("/tts/audio/{filename}")
@app.get("/audio/{filename}")
@app.get("/api/tts/audio/{filename}")
async def get_audio_endpoint(filename: str):
    """获取音频文件"""
    audio_path = Path("./temp") / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(
        audio_path,
        media_type="audio/wav",
        filename=filename
    )

# ==================== 代码解释器 ====================
@app.post("/code/execute", response_model=CodeExecuteResponse)
async def code_execute_endpoint(request: CodeExecuteRequest):
    """执行Python代码"""
    try:
        # 获取或创建执行器
        if request.session_id not in service_state.code_executors:
            service_state.code_executors[request.session_id] = CodeExecutor(request.session_id)
        
        executor = service_state.code_executors[request.session_id]
        
        # 在事件循环中执行
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, 
            lambda: asyncio.run(executor.execute(request.code))
        )
        
        return CodeExecuteResponse(
            success=result.success,
            output=result.output,
            error=result.error,
            figures=result.figures or [],
            execution_time=result.execution_time
        )
        
    except Exception as e:
        logger.error(f"代码执行失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/code/reset")
async def code_reset_endpoint(session_id: str = "default"):
    """重置代码执行会话"""
    if session_id in service_state.code_executors:
        service_state.code_executors[session_id].cleanup()
        del service_state.code_executors[session_id]
    return {"success": True, "message": "会话已重置"}

# ==================== RAG向量数据库 ====================
if ServerConfig.RAG_ENABLED:
    try:
        from vector_store import VectorStore, VectorStoreConfig
        from document_processor import DocumentProcessor
        
        # 创建配置
        rag_config = VectorStoreConfig(
            collection_name="default_collection",
            persist_directory=ServerConfig.CHROMA_PERSIST_DIR,
            search_k=5
        )
        vector_store = VectorStore(config=rag_config)
        doc_processor = DocumentProcessor()
        
        @app.post("/rag/upload")
        async def rag_upload_endpoint(
            files: list[UploadFile] = File(...),
            user_id: str = Form("default"),
            collection_name: str = Form("default")
        ):
            """上传文档到向量数据库"""
            from langchain_core.documents import Document
            
            results = []
            for file in files:
                try:
                    content = await file.read()
                    file_size_kb = len(content) / 1024
                    
                    # 文件大小检查
                    if file_size_kb > 2000:  # 2MB
                        results.append({
                            "filename": file.filename, 
                            "error": f"文件太大 ({file_size_kb:.0f}KB)，请压缩到 2MB 以下或分割文档"
                        })
                        continue
                    
                    # 警告大文件
                    if file_size_kb > 500:
                        logger.warning(f"[RAG] 大文件警告: {file.filename} ({file_size_kb:.0f}KB)，处理可能较慢")
                    
                    # 检查 .doc 旧格式
                    if file.filename.lower().endswith('.doc') and not file.filename.lower().endswith('.docx'):
                        results.append({
                            "filename": file.filename, 
                            "error": "不支持 .doc 旧格式，请用 Word 另存为 .docx 格式后重试"
                        })
                        continue
                    
                    # 在线程池中执行文档处理，避免阻塞
                    # 根据文件大小动态调整超时：基础 10 秒 + 每 100KB 增加 5 秒
                    process_timeout = min(10.0 + (file_size_kb / 100) * 5, 180.0)  # 最大 180 秒
                    logger.info(f"[RAG] 处理文件 {file.filename}, 大小: {file_size_kb:.1f}KB, 超时: {process_timeout:.1f}s")
                    
                    loop = asyncio.get_event_loop()
                    processed_docs = await asyncio.wait_for(
                        loop.run_in_executor(None, lambda: doc_processor.process_file(content, file.filename, user_id=user_id)),
                        timeout=process_timeout
                    )
                    
                    if processed_docs:
                        # 转换为 LangChain Document，添加集合信息
                        docs = [
                            Document(
                                page_content=pd.content,
                                metadata={
                                    **pd.metadata, 
                                    "source": pd.source, 
                                    "doc_type": pd.doc_type, 
                                    "user_id": user_id,
                                    "collection": collection_name
                                }
                            )
                            for pd in processed_docs
                        ]
                        await asyncio.wait_for(
                            vector_store.add_documents(docs, user_id=user_id),
                            timeout=30.0
                        )
                        results.append({"filename": file.filename, "chunks": len(docs)})
                    else:
                        results.append({"filename": file.filename, "error": "处理失败"})
                except asyncio.TimeoutError:
                    logger.error(f"[RAG] 处理文件 {file.filename} 超时")
                    results.append({"filename": file.filename, "error": "处理超时: 文件太大或格式复杂，请尝试更小的文件"})
                except ValueError as e:
                    # 友好提示格式错误
                    logger.error(f"[RAG] 处理文件 {file.filename} 格式错误: {e}")
                    results.append({"filename": file.filename, "error": str(e)})
                except Exception as e:
                    import traceback
                    error_detail = traceback.format_exc()
                    logger.error(f"[RAG] 处理文件 {file.filename} 失败: {e}\n{error_detail}")
                    results.append({"filename": file.filename, "error": f"处理失败 ({type(e).__name__}): {str(e)[:100]}"})
            
            return {
                "success": True,
                "documentsIndexed": sum(r.get("chunks", 0) for r in results),
                "filenames": [r["filename"] for r in results if "chunks" in r],
                "errors": [r["error"] for r in results if "error" in r]
            }
        
        @app.post("/rag/test-process")
        async def rag_test_process_endpoint(
            file: UploadFile = File(...),
            user_id: str = Form("default")
        ):
            """测试文档处理（不存入向量库）"""
            try:
                content = await file.read()
                file_size = len(content)
                
                # 检查 .doc 旧格式
                if file.filename.lower().endswith('.doc') and not file.filename.lower().endswith('.docx'):
                    return {
                        "success": False,
                        "stage": "format_check",
                        "error": "不支持 .doc 旧格式，请用 Word 另存为 .docx 格式后重试"
                    }
                
                # 测试处理 - 动态超时
                file_size_kb = file_size / 1024
                process_timeout = min(10.0 + (file_size_kb / 100) * 5, 120.0)
                
                loop = asyncio.get_event_loop()
                start_time = asyncio.get_event_loop().time()
                
                processed_docs = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: doc_processor.process_file(content, file.filename, user_id=user_id)),
                    timeout=process_timeout
                )
                
                process_time = asyncio.get_event_loop().time() - start_time
                
                if processed_docs:
                    return {
                        "success": True,
                        "stage": "process_complete",
                        "file_size_bytes": file_size,
                        "process_time_seconds": round(process_time, 2),
                        "chunks_count": len(processed_docs),
                        "first_chunk_preview": processed_docs[0].content[:200] + "..." if len(processed_docs[0].content) > 200 else processed_docs[0].content
                    }
                else:
                    return {
                        "success": False,
                        "stage": "empty_result",
                        "error": "文档处理返回空结果"
                    }
                    
            except asyncio.TimeoutError:
                return {
                    "success": False,
                    "stage": "process_timeout",
                    "error": f"处理超时: 文件大小 {file_size/1024:.1f} KB，超过 {process_timeout:.1f} 秒限制。建议压缩图片或分割文档"
                }
            except Exception as e:
                import traceback
                return {
                    "success": False,
                    "stage": "process_error",
                    "error": f"{type(e).__name__}: {str(e)}",
                    "traceback": traceback.format_exc()
                }
        
        @app.post("/rag/search", response_model=SearchResponse)
        async def rag_search_endpoint(request: SearchRequest):
            """搜索向量数据库"""
            try:
                # 先搜索该用户的所有文档（不过滤集合）
                docs = await asyncio.wait_for(
                    vector_store.similarity_search(
                        query=request.query,
                        user_id=request.user_id,
                        k=request.k * 2,  # 获取更多候选
                        filter_dict={}
                    ),
                    timeout=10.0
                )
                
                # 手动过滤结果：按集合名称
                # 对于 default 集合，包括 collection="default" 或没有 collection 字段的
                filtered_docs = []
                for doc in docs:
                    doc_collection = doc.metadata.get('collection', 'default')
                    if doc_collection == request.collection_name:
                        filtered_docs.append(doc)
                
                # 限制返回数量
                filtered_docs = filtered_docs[:request.k]
                
                return SearchResponse(
                    documents=[{"content": d.page_content, "metadata": d.metadata} for d in filtered_docs],
                    total=len(filtered_docs)
                )
            except asyncio.TimeoutError:
                logger.warning("[RAG] 搜索超时")
                return SearchResponse(documents=[], total=0)
        
        @app.get("/rag/stats")
        async def rag_stats_endpoint(
            user_id: str = "default",
            collection_name: str = "default"
        ):
            """获取统计信息"""
            try:
                collection = vector_store.db._collection
                
                # 获取该用户的所有文档
                user_docs = collection.get(where={"user_id": user_id})
                
                # 计算该用户的总文档数
                total_user_docs = len(user_docs.get('ids', []))
                
                # 统计指定集合的文档数
                # 对于 default 集合，包括：1) collection="default" 的，2) 没有 collection 字段的（旧数据）
                user_count = 0
                for metadata in user_docs.get('metadatas', []):
                    doc_collection = metadata.get('collection', 'default')  # 默认值为 'default'
                    if doc_collection == collection_name:
                        user_count += 1
                
                return {
                    "total_documents": total_user_docs,  # 该用户的总文档数
                    "user_documents": user_count,        # 当前集合的文档数
                    "collection_name": collection_name,
                    "persist_directory": ServerConfig.CHROMA_PERSIST_DIR,
                }
            except asyncio.TimeoutError:
                logger.warning("[RAG] 获取统计信息超时")
                return {
                    "total_documents": 0,
                    "user_documents": 0,
                    "collection_name": "default_collection",
                    "persist_directory": ServerConfig.CHROMA_PERSIST_DIR,
                    "error": "查询超时"
                }
        
        @app.delete("/rag/documents")
        async def rag_delete_endpoint(request: dict):
            """删除集合中用户的所有文档"""
            try:
                user_id = request.get("user_id", "default")
                collection_name = request.get("collection_name", "default")
                
                logger.info(f"[RAG] 清空集合请求: user={user_id}, collection={collection_name}")
                
                collection = vector_store.db._collection
                
                # 查询该用户的所有文档
                docs = collection.get(where={"user_id": user_id})
                
                # 手动筛选：匹配集合名称（对于 default 集合，包括没有 collection 字段的）
                matching_ids = []
                for i, metadata in enumerate(docs.get('metadatas', [])):
                    doc_collection = metadata.get('collection', 'default')
                    if doc_collection == collection_name:
                        matching_ids.append(docs['ids'][i])
                
                logger.info(f"[RAG] 找到 {len(matching_ids)} 个文档需要删除")
                
                if matching_ids:
                    collection.delete(ids=matching_ids)
                    return {
                        "success": True, 
                        "message": f"已删除 {len(matching_ids)} 个文档",
                        "deleted_count": len(matching_ids)
                    }
                else:
                    return {"success": True, "message": "没有可删除的文档", "deleted_count": 0}
            except Exception as e:
                logger.error(f"[RAG] 删除文档失败: {e}")
                return {"success": False, "error": str(e)}
        
        @app.post("/rag/documents/delete")
        async def rag_delete_single_document(request: dict):
            """删除单个文档（按来源）"""
            try:
                user_id = request.get("user_id", "default")
                source = request.get("source")
                collection_name = request.get("collection_name", "default")
                
                logger.info(f"[RAG] 删除单个文档请求: user={user_id}, collection={collection_name}, source={source}")
                
                if not source:
                    return {"success": False, "error": "缺少source参数"}
                
                collection = vector_store.db._collection
                
                # 先查询该用户的所有该来源文档
                docs = collection.get(
                    where={"$and": [{"user_id": user_id}, {"source": source}]}
                )
                
                logger.info(f"[RAG] 查询到 {len(docs.get('ids', []))} 个同来源文档")
                
                # 手动筛选：匹配集合名称（对于 default 集合，包括没有 collection 字段的）
                matching_ids = []
                for i, metadata in enumerate(docs.get('metadatas', [])):
                    doc_collection = metadata.get('collection', 'default')
                    logger.debug(f"[RAG] 检查文档: collection={doc_collection}, target={collection_name}")
                    if doc_collection == collection_name:
                        matching_ids.append(docs['ids'][i])
                
                logger.info(f"[RAG] 找到 {len(matching_ids)} 个匹配文档需要删除")
                
                if matching_ids:
                    collection.delete(ids=matching_ids)
                    return {
                        "success": True,
                        "message": f"已删除文档 '{source}'",
                        "deleted_count": len(matching_ids)
                    }
                else:
                    return {"success": False, "error": "未找到该文档"}
            except Exception as e:
                logger.error(f"[RAG] 删除单文档失败: {e}")
                return {"success": False, "error": str(e)}
        
        @app.get("/rag/collections")
        async def rag_list_collections(user_id: str = "default"):
            """获取用户的所有集合列表"""
            try:
                collection = vector_store.db._collection
                
                # 获取所有文档
                docs = collection.get()
                
                # 提取唯一的集合名称
                collections_map = {}
                for i, metadata in enumerate(docs.get('metadatas', [])):
                    if metadata.get('user_id') == user_id:
                        coll_name = metadata.get('collection', 'default')
                        if coll_name not in collections_map:
                            collections_map[coll_name] = 0
                        collections_map[coll_name] += 1
                
                # 构建响应
                collections = []
                for name, count in collections_map.items():
                    collections.append({
                        "name": name,
                        "documentCount": count,
                        "description": None
                    })
                
                # 如果没有集合，返回默认
                if not collections:
                    collections = [{"name": "default", "documentCount": 0, "description": "默认知识库"}]
                
                return {"collections": collections}
            except Exception as e:
                logger.error(f"[RAG] 获取集合列表失败: {e}")
                return {"collections": [{"name": "default", "documentCount": 0}]}
        
        @app.delete("/rag/collections/{collection_name}")
        async def rag_delete_collection(collection_name: str, user_id: str = "default"):
            """删除整个集合（删除该用户在该集合中的所有文档）"""
            try:
                if collection_name == "default":
                    return {"success": False, "error": "不能删除默认集合"}
                
                collection = vector_store.db._collection
                where_filter = {"$and": [{"user_id": user_id}, {"collection": collection_name}]}
                docs = collection.get(where=where_filter)
                
                if docs and docs['ids']:
                    collection.delete(ids=docs['ids'])
                    return {
                        "success": True,
                        "message": f"集合 '{collection_name}' 已删除",
                        "deleted_count": len(docs['ids'])
                    }
                else:
                    return {"success": True, "message": "集合为空或不存在"}
            except Exception as e:
                logger.error(f"[RAG] 删除集合失败: {e}")
                return {"success": False, "error": str(e)}
            
        logger.info("[INIT] RAG服务挂载成功")
    except ImportError as e:
        logger.warning(f"[INIT] RAG模块导入失败: {e}，RAG功能不可用")
    except Exception as e:
        logger.warning(f"[INIT] RAG初始化失败: {e}，RAG功能不可用")

# ==================== 实时语音WebSocket ====================
class VoiceWebSocketManager:
    """实时语音WebSocket管理"""
    
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
    async def send_message(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

voice_manager = VoiceWebSocketManager()

@app.websocket("/ws/voice/{client_id}")
async def voice_websocket_endpoint(websocket: WebSocket, client_id: str):
    """实时语音WebSocket"""
    await voice_manager.connect(websocket, client_id)
    
    try:
        while True:
            # 接收消息
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "audio":
                # 处理音频（简化版，实际应该调用完整流程）
                await voice_manager.send_message(client_id, {
                    "type": "status",
                    "status": "processing"
                })
                
                # TODO: 调用ASR -> LLM -> TTS流程
                # 这里简化处理
                await voice_manager.send_message(client_id, {
                    "type": "text",
                    "text": "实时语音功能正在开发中..."
                })
                
            elif msg_type == "ping":
                await voice_manager.send_message(client_id, {"type": "pong"})
                
    except WebSocketDisconnect:
        voice_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket错误: {e}")
        voice_manager.disconnect(client_id)

# ==================== 主入口 ====================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="统一AI后端服务")
    parser.add_argument("--host", default=ServerConfig.HOST, help="主机地址")
    parser.add_argument("--port", type=int, default=ServerConfig.PORT, help="端口")
    parser.add_argument("--reload", action="store_true", help="开发模式自动重载")
    args = parser.parse_args()
    
    logger.info(f"🚀 启动统一服务: http://{args.host}:{args.port}")
    logger.info(f"📚 API文档: http://{args.host}:{args.port}/docs")
    
    uvicorn.run(
        "unified_server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )

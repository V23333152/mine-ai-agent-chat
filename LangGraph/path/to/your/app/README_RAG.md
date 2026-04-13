# RAG-Enhanced LangGraph Agent

这个后端服务为 LangGraph Agent 添加了向量数据库和 RAG (检索增强生成) 功能。

## 功能特性

- **向量数据库**: 使用 ChromaDB 存储文档向量
- **文档处理**: 支持 PDF、Word、TXT、Markdown、HTML 等多种格式
- **文件上传 API**: RESTful API 用于上传和索引文档
- **RAG Agent**: 增强的 Agent 能够检索相关文档并生成带引用的回答
- **多用户支持**: 基于 user_id 的文档隔离

## 快速开始

### 1. 安装依赖

```bash
# 使用 uv (推荐)
uv sync

# 或使用 pip
pip install -e "."
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 Kimi API Key
```

### 3. 启动 API 服务器

```bash
python start_api.py
```

API 文档将可在 http://localhost:8000/docs 访问。

### 4. 运行 LangGraph Agent

```bash
# 使用 LangGraph CLI
langgraph dev

# 或部署
langgraph up
```

## API 端点

### 文件上传
```bash
POST /api/v1/upload
Content-Type: multipart/form-data

files: <文件列表>
user_id: <用户ID>
collection_name: <集合名称(可选)>
```

### 搜索文档
```bash
POST /api/v1/search
Content-Type: application/json

{
  "query": "搜索关键词",
  "user_id": "用户ID",
  "k": 5
}
```

### 获取统计信息
```bash
GET /api/v1/stats?user_id=<用户ID>
```

### 删除文档
```bash
DELETE /api/v1/documents
Content-Type: application/json

{
  "user_id": "用户ID"
}
```

## 支持的文件格式

- **文本文件**: .txt, .md, .markdown, .json, .csv
- **PDF**: .pdf
- **Word**: .docx, .doc
- **HTML**: .html, .htm

## Agent 配置

在 `langgraph.json` 中配置:

```json
{
  "graphs": {
    "agent": "./src/agent/graph_kimi.py:graph",
    "rag_agent": "./src/agent/rag_graph.py:graph"
  }
}
```

### RAG Agent 参数

调用 `rag_agent` 时,可以在 `configurable` 中传入:

- `user_id`: 用户标识 (默认: "default")
- `collection_name`: 集合名称 (默认: "default_collection")
- `enable_rag`: 是否启用 RAG (默认: true)
- `model`: Kimi 模型名称 (默认: "moonshot-v1-8k")
- `temperature`: 温度参数 (默认: 0.7)

## 项目结构

```
src/agent/
├── graph_kimi.py          # 基础 Kimi Agent
├── rag_graph.py           # RAG 增强 Agent
├── vector_store.py        # 向量数据库封装
├── document_processor.py  # 文档处理模块
└── api.py                 # FastAPI 路由
```

## 开发

### 添加新的文档加载器

```python
from agent.document_processor import BaseDocumentLoader, ProcessedDocument

class MyLoader(BaseDocumentLoader):
    supported_extensions = [".myext"]
    
    def load(self, file_content: bytes, filename: str, **kwargs):
        # 实现加载逻辑
        return [ProcessedDocument(
            content="...",
            metadata={"source": filename},
            source=filename,
            doc_type="mytype"
        )]

# 注册加载器
from agent.document_processor import get_document_processor
processor = get_document_processor()
processor.register_loader(MyLoader())
```

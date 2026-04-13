"""Simple script to run the RAG API server."""

import os
import sys
from pathlib import Path

# Set up paths correctly
project_root = Path(__file__).parent
src_path = project_root / "src"
src_agent_path = src_path / "agent"

sys.path.insert(0, str(src_agent_path))
sys.path.insert(0, str(src_path))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

# Set China mirror if needed (can also be set in .env)
if os.getenv("USE_CHINA_MIRROR", "").lower() == "true":
    os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    print("[Config] Using China mirror: https://hf-mirror.com")

# Now import and run
print("[Startup] Loading API modules...")
from api import app
import uvicorn

if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    
    print(f"=" * 50)
    print(f"Starting RAG API Server")
    print(f"=" * 50)
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"API Docs: http://{host}:{port}/docs")
    print(f"=" * 50)
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False
    )

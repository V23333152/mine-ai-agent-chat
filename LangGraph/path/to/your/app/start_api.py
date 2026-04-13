"""Script to start the RAG API server.

Usage:
    python start_api.py
    python start_api.py --port 8000 --host 0.0.0.0
"""

import argparse
import os
import sys
from pathlib import Path

# Add src/agent to path
sys.path.insert(0, str(Path(__file__).parent / "src" / "agent"))
sys.path.insert(0, str(Path(__file__).parent / "src"))

from api import app


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Start RAG API server")
    parser.add_argument(
        "--host",
        default=os.getenv("API_HOST", "0.0.0.0"),
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("API_PORT", "8000")),
        help="Port to bind to (default: 8000)"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development"
    )
    
    args = parser.parse_args()
    
    import uvicorn
    
    print(f"Starting RAG API server on {args.host}:{args.port}")
    print(f"API documentation: http://{args.host}:{args.port}/docs")
    
    uvicorn.run(
        "api:app",
        host=args.host,
        port=args.port,
        reload=args.reload
    )


if __name__ == "__main__":
    main()

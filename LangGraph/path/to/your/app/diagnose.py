"""Diagnostic script to check backend setup."""

import sys
from pathlib import Path

def check_python_version():
    """Check Python version."""
    print(f"Python version: {sys.version}")
    if sys.version_info < (3, 10):
        print("❌ Python 3.10+ required")
        return False
    print("✓ Python version OK")
    return True

def check_imports():
    """Check if all required packages are installed."""
    required = {
        "langchain_core": "LangChain Core",
        "langchain_openai": "LangChain OpenAI",
        "langchain_chroma": "LangChain Chroma",
        "chromadb": "ChromaDB",
        "fastapi": "FastAPI",
        "uvicorn": "Uvicorn",
        "pydantic": "Pydantic",
    }
    
    all_ok = True
    for module, name in required.items():
        try:
            __import__(module)
            print(f"✓ {name} installed")
        except ImportError as e:
            print(f"❌ {name} not installed: {e}")
            all_ok = False
    
    return all_ok

def check_optional_imports():
    """Check optional document processing packages."""
    optional = {
        "pypdf": "PyPDF (PDF support)",
        "docx": "python-docx (Word support)",
        "bs4": "BeautifulSoup4 (HTML support)",
    }
    
    for module, name in optional.items():
        try:
            __import__(module)
            print(f"✓ {name} installed")
        except ImportError:
            print(f"⚠ {name} not installed (optional)")

def check_env():
    """Check environment variables."""
    import os
    from dotenv import load_dotenv
    
    # Load .env file
    project_root = Path(__file__).parent
    load_dotenv(project_root / ".env")
    
    required_vars = ["OPENAI_API_KEY"]
    optional_vars = ["OPENAI_BASE_URL", "CHROMA_PERSIST_DIR", "CHROMA_COLLECTION_NAME"]
    
    all_ok = True
    for var in required_vars:
        value = os.getenv(var)
        if value:
            masked = value[:10] + "..." if len(value) > 10 else value
            print(f"✓ {var}: {masked}")
        else:
            print(f"❌ {var}: Not set")
            all_ok = False
    
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            print(f"✓ {var}: {value}")
        else:
            print(f"⚠ {var}: Not set (will use default)")
    
    return all_ok

def check_project_files():
    """Check if all required files exist."""
    project_root = Path(__file__).parent
    
    required_files = [
        "src/agent/api.py",
        "src/agent/vector_store.py",
        "src/agent/document_processor.py",
        "src/agent/rag_graph.py",
        ".env",
    ]
    
    all_ok = True
    for file in required_files:
        path = project_root / file
        if path.exists():
            print(f"✓ {file}")
        else:
            print(f"❌ {file} not found")
            all_ok = False
    
    return all_ok

def test_imports():
    """Test importing project modules."""
    import sys
    project_root = Path(__file__).parent
    sys.path.insert(0, str(project_root / "src" / "agent"))
    sys.path.insert(0, str(project_root / "src"))
    
    modules = [
        ("vector_store", "get_vector_store"),
        ("document_processor", "get_document_processor"),
        ("api", "app"),
    ]
    
    all_ok = True
    for module_name, attr in modules:
        try:
            module = __import__(module_name)
            getattr(module, attr)
            print(f"✓ {module_name}.{attr} can be imported")
        except Exception as e:
            print(f"❌ {module_name}.{attr} import failed: {e}")
            all_ok = False
    
    return all_ok

def main():
    print("=" * 50)
    print("RAG Backend Diagnostics")
    print("=" * 50)
    print()
    
    checks = [
        ("Python Version", check_python_version),
        ("Project Files", check_project_files),
        ("Dependencies", check_imports),
        ("Optional Dependencies", check_optional_imports),
        ("Environment Variables", check_env),
        ("Module Imports", test_imports),
    ]
    
    results = []
    for name, check_func in checks:
        print()
        print(f"--- {name} ---")
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"Error during {name} check: {e}")
            results.append((name, False))
    
    print()
    print("=" * 50)
    print("Summary")
    print("=" * 50)
    for name, result in results:
        status = "✓ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    if all(r for _, r in results):
        print()
        print("🎉 All checks passed! You can start the server with:")
        print("   python run_api.py")
    else:
        print()
        print("⚠ Some checks failed. Please fix the issues above.")
        print("   Install missing dependencies:")
        print("   pip install langchain-chroma chromadb fastapi uvicorn pypdf python-docx beautifulsoup4")

if __name__ == "__main__":
    main()

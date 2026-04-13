"""Download embedding model with China mirror support."""

import os
import sys

def download_model():
    """Download the embedding model."""
    model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    
    # Set China mirror if needed
    if os.getenv("USE_CHINA_MIRROR", "false").lower() == "true":
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        print(f"Using China mirror: https://hf-mirror.com")
    
    print(f"Downloading model: {model_name}")
    print(f"This will download ~22MB, please wait...")
    
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(model_name)
        print(f"✓ Model downloaded successfully!")
        print(f"  Cache location: {model.cache_folder}")
        return 0
    except Exception as e:
        print(f"✗ Download failed: {e}")
        print(f"\nTry one of these solutions:")
        print(f"1. Set USE_CHINA_MIRROR=true and retry")
        print(f"2. Manually download from https://hf-mirror.com/sentence-transformers/all-MiniLM-L6-v2")
        print(f"3. Use a VPN to access huggingface.co")
        return 1

if __name__ == "__main__":
    sys.exit(download_model())

"""Test script for file upload API."""

import requests
import sys
from pathlib import Path

API_URL = "http://localhost:8000"

def test_health():
    """Test if API is running."""
    try:
        response = requests.get(f"{API_URL}/health", timeout=5)
        print(f"✓ Health check: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False

def test_upload_markdown():
    """Test uploading a markdown file."""
    # Create a test markdown file
    test_content = """# Test Document

This is a test markdown file for debugging upload functionality.

## Section 1

Some content here.

## Section 2

More content here.
"""
    
    test_file = Path("test_upload.md")
    test_file.write_text(test_content, encoding="utf-8")
    
    try:
        print(f"\nUploading {test_file}...")
        with open(test_file, "rb") as f:
            files = {"files": ("test_upload.md", f, "text/markdown")}
            data = {"user_id": "test_user"}
            
            print("Sending request (timeout: 120s, first run may download model)...")
            response = requests.post(
                f"{API_URL}/api/v1/upload",
                files=files,
                data=data,
                timeout=120  # Increased timeout for model download
            )
            
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"\n✓ Upload successful!")
                print(f"  - Documents indexed: {result.get('documents_indexed', 0)}")
                print(f"  - Files: {result.get('filenames', [])}")
                print(f"  - Errors: {result.get('errors', [])}")
                return True
            else:
                print(f"\n✗ Upload failed: {response.status_code}")
                return False
                
    except Exception as e:
        print(f"\n✗ Upload error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Cleanup
        if test_file.exists():
            test_file.unlink()

def main():
    print("=" * 50)
    print("File Upload API Test")
    print("=" * 50)
    
    # Test health
    if not test_health():
        print("\n⚠ API is not running. Please start it first:")
        print("   python run_api.py")
        return 1
    
    # Test upload
    if test_upload_markdown():
        print("\n✓ All tests passed!")
        return 0
    else:
        print("\n✗ Tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())

"""Script to start the FastAPI server."""

import os
import sys

import uvicorn

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Starting DecisionTrace API on http://{host}:{port}...")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)

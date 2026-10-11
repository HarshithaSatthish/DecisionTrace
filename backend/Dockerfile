# syntax=docker/dockerfile:1
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for rapid, deterministic dependency installation
RUN pip install --no-cache-dir uv

# Copy project definition
COPY pyproject.toml README.md ./

# Install project dependencies
RUN uv pip install --system -e .

# Copy application source code
COPY . .

# Set environment defaults
ENV PORT=8000
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Default command starts FastAPI API
CMD ["python", "scripts/start_api.py"]

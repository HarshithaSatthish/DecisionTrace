# syntax=docker/dockerfile:1

FROM python:3.12-slim

# Prevent Python from buffering logs or creating .pyc files
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv package manager
RUN pip install --no-cache-dir uv

# Copy the full backend source before installation
COPY . .

# Install Python dependencies and application
RUN uv pip install --system .

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI (Railway supplies PORT dynamically)
CMD ["python", "scripts/start_api.py"]

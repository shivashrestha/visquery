FROM python:3.11-slim

WORKDIR /app

# System dependencies for psycopg2, Pillow, and faiss-cpu
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .

# Install dependencies before copying source so Docker layer caches them
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

COPY app/ ./app/

# FAISS and images volumes are mounted at runtime
RUN mkdir -p /data/faiss /data/images

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

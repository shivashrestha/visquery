FROM python:3.11-slim

WORKDIR /app

# System dependencies for psycopg2, Pillow, and faiss-cpu
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 appuser

COPY pyproject.toml .

# Install dependencies before copying source so Docker layer caches them
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

COPY app/ ./app/

# Runtime data directories (bind-mounted in docker-compose)
RUN mkdir -p /data/sqlite /data/images /data/metadata /data/vectors /data/faiss
RUN chown -R appuser:appuser /app /data
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--reload"]

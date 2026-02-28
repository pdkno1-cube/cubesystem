FROM python:3.10-slim-bookworm

# System dependencies for PaddleOCR (OpenCV, image libs, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (pip cache helps on rebuilds)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Railway injects PORT env var; default to 8866 for local dev
ENV PORT=8866
EXPOSE 8866

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8866/health')" || exit 1

CMD ["python", "main.py"]

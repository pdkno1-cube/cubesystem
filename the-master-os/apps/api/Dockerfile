# =============================================================================
# The Master OS — FastAPI Orchestration Engine
# Multi-stage build | Non-root user | Health check included
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install dependencies
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build essentials for compiled dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# Install production dependencies into /build/venv
RUN python -m venv /build/venv \
    && /build/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /build/venv/bin/pip install --no-cache-dir .

# ---------------------------------------------------------------------------
# Stage 2: Runtime — minimal image with app code
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# Security: create non-root user (P0 security requirement)
RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid appuser --shell /bin/false --create-home appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /build/venv /app/venv

# Copy application code
COPY app/ /app/app/

# Set PATH so the venv python is used
ENV PATH="/app/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Switch to non-root user
USER appuser

# Expose port (internal only — use Docker `expose`, not `ports`, in compose)
EXPOSE 8000

# Health check (P0-12 aligned: internal-only health probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import httpx; r = httpx.get('http://localhost:8000/orchestrate/health'); r.raise_for_status()"]

# Run with uvicorn (use python -m to avoid venv shebang path issues in multi-stage build)
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

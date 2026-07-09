# ─── Stage 1: Build Frontend SPA ──────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production Python Backend & Static SPA Host ─────────────────────
FROM python:3.11-slim AS production
WORKDIR /app

# H-15: Non-root user for container security
RUN addgroup --system --gid 1000 aegis && \
    adduser --system --uid 1000 --ingroup aegis aegis

# Install required system dependencies for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgles2 \
    libegl1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies (production only — no dev/test deps)
COPY backend-cv/requirements.prod.txt ./backend-cv/
RUN pip install --no-cache-dir -r backend-cv/requirements.prod.txt

# Copy backend source code
COPY backend-cv/ ./backend-cv/

# Copy built frontend SPA from Stage 1 into /app/frontend/dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Ownership for non-root user
RUN chown -R aegis:aegis /app
USER aegis

# Set environment variables for production
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV UVICORN_HOST=0.0.0.0
ENV ALLOWED_HOSTS=*

WORKDIR /app/backend-cv

# L-8: Container health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/api/health')" || exit 1

# Start Uvicorn (L-7: exec-form CMD — H-15: no 0.0.0.0 hardcode, uses ENV)
CMD python -m uvicorn main:app --host $UVICORN_HOST --port $PORT

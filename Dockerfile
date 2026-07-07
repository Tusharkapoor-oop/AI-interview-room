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

# Install Python backend dependencies
COPY backend-cv/requirements.txt ./backend-cv/
RUN pip install --no-cache-dir -r backend-cv/requirements.txt

# Copy backend source code
COPY backend-cv/ ./backend-cv/

# Copy built frontend SPA from Stage 1 into /app/frontend/dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Set environment variables for production
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV ALLOWED_HOSTS=*

WORKDIR /app/backend-cv

# Start Uvicorn listening on $PORT (dynamically assigned by Render/Railway)
CMD sh -c "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"

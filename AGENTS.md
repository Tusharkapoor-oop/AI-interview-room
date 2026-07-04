# Aegis Interview Platform — Dev Commands

## Backend (Python/FastAPI)

```bash
# Install dependencies
cd backend-cv
pip install -r requirements.txt

# Run dev server (with auto-reload)
python -m uvicorn main:app --reload --port 8000

# Run tests
python -m pytest

# Run linting
python -m ruff check .

# Initialize DB (creates tables)
python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"
```

## Frontend (React/Vite)

```bash
# Install dependencies
cd frontend
npm install

# Run dev server
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Build for production
npm run build
```

## Docker

```bash
# Build and run
docker build -t aegis-platform .
docker run -p 8000:8000 aegis-platform
```

## Environment

- Copy `.env.example` to `.env` in `backend-cv/`
- Set `SKIP_AUTH=1` for local dev (bypasses JWT auth)
- Default frontend: `http://localhost:5173`
- Default backend: `http://localhost:8000`
- WebSocket CV endpoint: `ws://localhost:8000/ws/cv`
- WebSocket Interview endpoint: `ws://localhost:8000/ws/interview`

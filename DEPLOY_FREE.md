# 🌐 How to Deploy AEGIS v4.0 for FREE (Render & Railway)

Your project is fully configured for **free containerized hosting** on both **Render.com** and **Railway.app**. 

We have created a unified, multi-stage **`Dockerfile`** that builds the React frontend and serves it directly from the FastAPI Python backend. This means **only one web service** runs in the cloud—completely bypassing cross-domain CORS issues, WebSocket proxy errors, and multi-container memory limits.

---

## 🚀 Option 1: Render.com (Recommended Free Hosting)

Render provides a 100% free web service tier that supports WebSockets and Docker containers out of the box.

### Step 1: Push your project to GitHub
If you haven't already, commit and push your project to a GitHub repository:
```bash
git add .
git commit -m "Deploy AEGIS v4.0"
git push origin main
```

### Step 2: Deploy via Render Dashboard
1. Sign up or log in at [render.com](https://render.com).
2. Click the **New +** button and select **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect the **`render.yaml`** blueprint file in your project root and configure everything for you.
5. Click **Apply Blueprint**.

Within ~3 minutes, your build will finish and Render will give you a live public HTTPS URL (e.g., `https://aegis-ai-interview.onrender.com`).

---

## 🚄 Option 2: Railway.app (Fast 1-Click Docker Hosting)

Railway offers fast builds and zero-config Docker deployments.

### Step 1: Deploy via Railway
1. Sign up or log in at [railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select this repository.
4. Railway will automatically detect **`railway.json`** and use our **`Dockerfile`** to build the application.
5. Once deployed, go to your service settings → **Networking** → Click **Generate Domain** to get your public HTTPS link.

---

## 💡 What Happens Inside the Cloud Container?

1. **Frontend Build**: Node 20 compiles all Vite/React JSX components into optimized production assets inside `/app/frontend/dist`.
2. **Backend Setup**: Python 3.11 installs MediaPipe, OpenCV headless, and FastAPI.
3. **Unified Server**: Uvicorn boots up on port `$PORT`. When a visitor goes to your site, FastAPI serves the UI and initializes real-time computer vision WebSocket proctoring (`wss://your-app-domain/ws/cv`) directly on the same connection!

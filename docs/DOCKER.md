# 🐳 Docker Deployment Guide

Discord Terminator can be run with a single Docker command - no need to install Node.js or any dependencies!

## 🚀 Quick Start (Recommended)

### Option 1: Docker Compose (Easiest)

1. **Clone or download this repository**
2. **Run the application:**
   ```bash
   docker-compose up -d
   ```
3. **Open your browser:**
   ```
   http://localhost:8000
   ```

That's it! The app is now running.

To stop the app:
```bash
docker-compose down
```

---

### Option 2: Docker Run (Single Command)

If you don't have Docker Compose, use this single command:

```bash
docker build -t discord-terminator . && docker run -d -p 8000:8000 --name discord-terminator discord-terminator
```

Then open: `http://localhost:8000`

To stop:
```bash
docker stop discord-terminator
docker rm discord-terminator
```

---

## 📦 Pre-built Image (Coming Soon)

We'll publish pre-built images to Docker Hub so you won't even need to build:

```bash
docker run -d -p 8000:8000 yourusername/discord-terminator:latest
```

---

## 🔧 Advanced Configuration

### Custom Port

To run on a different port (e.g., 3000):

**Docker Compose:**
Edit `docker-compose.yml` and change:
```yaml
ports:
  - "3000:8000"  # Change 3000 to your desired port
```

**Docker Run:**
```bash
docker run -d -p 3000:8000 --name discord-terminator discord-terminator
```

### View Logs

```bash
docker logs -f discord-terminator
```

### Restart the Container

```bash
docker restart discord-terminator
```

---

## 🌐 Deploying to Cloud

### Railway.app (Free Tier Available)

1. Fork this repository
2. Go to [Railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your forked repository
5. Railway will automatically detect the Dockerfile and deploy
6. You'll get a public URL like `https://your-app.railway.app`

### Render.com (Free Tier Available)

1. Fork this repository
2. Go to [Render.com](https://render.com)
3. Click "New" → "Web Service"
4. Connect your GitHub repository
5. Render will auto-detect the Dockerfile
6. Click "Create Web Service"
7. You'll get a public URL like `https://your-app.onrender.com`

### Fly.io

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Deploy: `fly launch`
4. Follow the prompts

---

## 🛠️ Development Mode

For development with hot-reload:

```bash
# Backend
cd src/backend
npm run dev

# Frontend (in another terminal)
cd src/frontend
npm run dev
```

---

## ❓ Troubleshooting

### "Port 8000 already in use"

Something else is using port 8000. Either:
- Stop the other application
- Use a different port (see Custom Port above)

### "Cannot connect to Docker daemon"

Make sure Docker is installed and running:
- **Windows/Mac:** Open Docker Desktop
- **Linux:** `sudo systemctl start docker`

### Frontend shows "Frontend not built" error

The Docker build should handle this automatically. If you see this error:

```bash
cd src/frontend
npm install
npm run build
```

Then rebuild the Docker image:
```bash
docker-compose build
```

---

## 🔒 Security Notes

- Your bot tokens are stored in your browser's localStorage (client-side only)
- Tokens are never sent to any external server
- The app runs entirely on your machine (or your chosen cloud provider)
- All communication between Discord/Stoat happens directly from the backend

---

## 📊 Resource Usage

- **Image Size:** ~400MB (fully minimized Node.js runtime)
- **Memory:** ~200-500MB during migration
- **CPU:** Minimal (mostly waiting for API responses)

---

## 🆘 Need Help?

- Check the [main README](README.md) for feature documentation
- See [usage.md](usage.md) for migration guides
- Open an issue on GitHub for bugs or questions

# 🚀 Quick Start Reference Card

## For Non-Technical Users

### 🐳 Docker Method (Easiest)
```bash
# One command to rule them all:
docker-compose up -d

# Open browser to:
http://localhost:8000

# To stop:
docker-compose down
```

### 💻 Script Method (No Docker)
**Windows:** Double-click `start.bat`  
**Mac/Linux:** Run `./start.sh` in Terminal

---

## For Developers

### Local Development
```bash
# Backend (Terminal 1)
python -m uvicorn web.backend.main:app --reload --port 8000

# Frontend (Terminal 2)
cd web/frontend && npm run dev
```

### Production Build
```bash
# Build frontend
cd web/frontend
npm run build

# Run backend (serves built frontend)
cd ../..
python -m uvicorn web.backend.main:app --host 0.0.0.0 --port 8000
```

### Docker Commands
```bash
# Build image
docker build -t discord-terminator .

# Run container
docker run -d -p 8000:8000 --name discord-terminator discord-terminator

# View logs
docker logs -f discord-terminator

# Stop and remove
docker stop discord-terminator && docker rm discord-terminator
```

---

## Cloud Deployment

### Railway.app
1. Fork repo → Connect to Railway → Auto-deploy ✅

### Render.com
1. New Web Service → Connect repo → Auto-deploy ✅

### Fly.io
```bash
fly launch
fly deploy
```

---

## Getting Bot Tokens

### Discord
1. [Discord Developer Portal](https://discord.com/developers/applications)
2. New Application → Bot → Reset Token
3. Enable: Message Content Intent + Server Members Intent
4. OAuth2 → URL Generator → `bot` + `Administrator`
5. Invite to server

### Stoat
1. Stoat Settings → Bots → Create Bot
2. Copy token
3. Invite to server

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 8000 in use | Change port in `docker-compose.yml` or stop other app |
| Can't connect | Check Docker is running / firewall settings |
| Frontend not built | Run `cd web/frontend && npm run build` |
| Slow migration | Normal! Discord rate limits ~50 msg/sec |

---

## File Structure
```
discord-terminator/
├── Dockerfile              # Docker build instructions
├── docker-compose.yml      # One-command deployment
├── start.sh / start.bat    # Easy startup scripts
├── requirements.txt        # Python dependencies
├── web/
│   ├── backend/
│   │   ├── main.py        # FastAPI server
│   │   └── engine.py      # Migration logic
│   └── frontend/
│       ├── src/
│       │   └── App.jsx    # React UI
│       └── dist/          # Built frontend (after npm build)
├── DOCKER.md              # Docker guide
├── NON-TECHNICAL-GUIDE.md # User-friendly guide
└── README.md              # Main documentation
```

---

**Access the app:** `http://localhost:8000`  
**Need help?** See [NON-TECHNICAL-GUIDE.md](NON-TECHNICAL-GUIDE.md)

# Discord Terminator 🛡️🚀

Discord Terminator is the ultimate tool for migrating your community from Discord to **Stoat**. It doesn't just copy messages; it recreates your server's soul.

## ✨ Key Features
- **Total Server Cloning**: Recreate roles, categories, and channels with one click.
- **Deep History Migration**: Copy years of messages, including:
  - 📎 **Attachments**: Full file migration to Stoat CDN.
  - 💬 **Rich Formatting**: Preserves replies, forwards, and snapshot embeds.
  - 👤 **Discord Masquerade**: Messages appear with their original Discord names, avatars, and **timestamps**.
- **Modern Web UI**: A guided 3-step wizard for effortless migration.
- **Precision Control**: Start migration from any specific Discord message link.
- **Real-time Monitoring**: Live progress bars and detailed log streaming.

## 🛠️ Architecture
- **Backend**: FastAPI & Discord.py
- **Frontend**: React & Vite
- **Engine**: Robust, asynchronous migration core with retry logic and rate-limit handling.

## 🚀 Quick Start
1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   cd web/frontend && npm install
   ```
2. **Launch the Dashboard**:
   ```bash
   # Start Backend
   python -m uvicorn web.backend.main:app --port 8000
   
   # Start Frontend
   cd web/frontend && npm run dev
   ```
3. **Follow the Wizard**: Paste your tokens, select your server, and start the "Terminator" sequence.

## 📖 Documentation
- [Usage Guide](usage.md): Detailed steps for a successful migration.
- [AI Context](ai.txt): Developer notes for LLM-assisted contributions.

---
*Built for the Stoat community. Secure. Fast. Precise.*

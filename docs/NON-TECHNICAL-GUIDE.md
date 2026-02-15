# 🎯 For Non-Technical Users

**Want to migrate from Discord to Stoat but not tech-savvy? We've got you covered!**

## 🚀 Easiest Method: Docker (Recommended)

### What is Docker?
Docker is like a "ready-to-go box" that contains everything needed to run Discord Terminator. You don't need to install Python, Node.js, or anything else!

### Step-by-Step Guide

#### 1️⃣ Install Docker (One-time setup)

**Windows:**
- Download [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- Run the installer
- Restart your computer
- Open Docker Desktop (it should start automatically)

**Mac:**
- Download [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- Drag Docker to Applications folder
- Open Docker from Applications
- Follow the setup wizard

**Linux:**
- Open Terminal and run:
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  ```

#### 2️⃣ Download Discord Terminator

**Option A: Download ZIP (Easiest)**
1. Click the green "Code" button on GitHub
2. Click "Download ZIP"
3. Extract the ZIP file to your Desktop or Documents folder

**Option B: Use Git (If you have it)**
```bash
git clone https://github.com/yourusername/discord-terminator.git
cd discord-terminator
```

#### 3️⃣ Run Discord Terminator

**Windows:**
1. Open the `discord-terminator` folder
2. Double-click `start.bat`
3. Wait for the setup to complete (first time takes 2-3 minutes)
4. Your browser will open automatically to `http://localhost:8000`

**Mac/Linux:**
1. Open Terminal
2. Navigate to the folder:
   ```bash
   cd ~/Desktop/discord-terminator  # or wherever you extracted it
   ```
3. Run:
   ```bash
   ./start.sh
   ```
4. Open your browser to `http://localhost:8000`

**Or use Docker Compose (All platforms):**
1. Open Terminal (Mac/Linux) or Command Prompt (Windows)
2. Navigate to the discord-terminator folder
3. Run:
   ```bash
   docker-compose up
   ```
4. Open your browser to `http://localhost:8000`

---

## 🎓 Using the App

### Step 1: Get Your Bot Tokens

#### Discord Bot Token:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give it a name (e.g., "Migration Bot")
4. Go to "Bot" tab → Click "Add Bot"
5. Under "Privileged Gateway Intents", enable:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
6. Click "Reset Token" → Copy the token
7. **Save this token somewhere safe!**

#### Invite Discord Bot to Your Server:
1. Go to "OAuth2" → "URL Generator"
2. Select scopes: `bot`
3. Select permissions: `Administrator` (or at minimum: Read Messages, Read Message History, Send Messages)
4. Copy the generated URL and open it in your browser
5. Select your Discord server and authorize

#### Stoat Bot Token:
1. Go to your Stoat instance
2. Navigate to bot settings (ask your Stoat admin if unsure)
3. Create a new bot or use an existing one
4. Copy the bot token
5. Invite the bot to your Stoat server with appropriate permissions

### Step 2: Use the Web Interface

Once the app is running at `http://localhost:8000`:

1. **Authentication Tab:**
   - Paste your Discord bot token
   - Paste your Stoat bot token
   - You'll see the bot names appear if tokens are valid ✅

2. **Server Setup Tab:**
   - Enter your Discord Server ID (right-click server → Copy ID)
   - Enter your Stoat Server ID
   - (Optional) Click "Clone Structure" to copy all channels/categories

3. **Migration Tab:**
   - Select source Discord channel
   - Select target Stoat channel (or create new)
   - Check "Run a Test" to preview without actually copying
   - Click "Start Migration"
   - Watch the progress bar!

---

## ❓ Frequently Asked Questions

### "I don't see my Discord Server ID option"
Enable Developer Mode in Discord:
- Settings → Advanced → Developer Mode (toggle ON)
- Now you can right-click servers/channels and see "Copy ID"

### "The app says port 8000 is in use"
Something else is using that port. Either:
- Close other applications
- Or edit `docker-compose.yml` and change `8000:8000` to `3000:8000` (then use `http://localhost:3000`)

### "How long does migration take?"
- Small channels (100 messages): ~1 minute
- Medium channels (1,000 messages): ~5-10 minutes
- Large channels (10,000+ messages): ~30-60 minutes

The app handles rate limits automatically, so just leave it running!

### "Is this safe? Will it delete my Discord messages?"
- ✅ **100% Safe**: This tool only READS from Discord and WRITES to Stoat
- ✅ **No Deletion**: Your Discord messages remain untouched
- ✅ **Local Processing**: Your tokens stay on your computer
- ✅ **Test Mode**: Always try "dry run" first to see what will happen

### "Can I stop and resume a migration?"
Currently, migrations run in one session. If you need to stop:
- You can restart and use the "Start from specific message" option
- Paste a Discord message link to resume from that point

---

## 🆘 Troubleshooting

### Docker won't start
- **Windows/Mac**: Make sure Docker Desktop is running (check system tray)
- **Linux**: Run `sudo systemctl start docker`

### "Frontend not built" error
Run this in the discord-terminator folder:
```bash
cd web/frontend
npm install
npm run build
cd ../..
```

Then restart the app.

### Browser shows "Can't connect"
- Make sure the app is running (check the terminal window)
- Try `http://127.0.0.1:8000` instead of `localhost`
- Check if your firewall is blocking port 8000

### Migration is very slow
This is normal! Discord has rate limits:
- ~50 messages per second maximum
- The app automatically handles this
- Large channels will take time - be patient!

---

## 🎉 Success! What's Next?

After migration:
1. Check your Stoat channels to verify messages copied correctly
2. Verify attachments/images loaded properly
3. If everything looks good, run again without "Test Mode" if you used it
4. Celebrate! 🎊

---

## 📞 Need More Help?

- 📖 Read the [full documentation](README.md)
- 🐛 Found a bug? [Open an issue](https://github.com/yourusername/discord-terminator/issues)
- 💬 Questions? Check existing issues or create a new one

---

**Made with ❤️ for the Stoat community**

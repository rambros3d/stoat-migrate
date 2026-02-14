from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiohttp
import asyncio
import uuid
import time
from typing import Optional, Dict, List
from .engine import MigrationEngine

app = FastAPI(title="Stoat Migrate API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class MigrationConfig(BaseModel):
    discord_token: str
    stoat_token: str
    source_server_id: int
    target_server_id: str
    source_channel_id: Optional[int] = None
    target_channel_id: Optional[str] = None
    dry_run: bool = True

class CloneConfig(BaseModel):
    discord_token: str
    stoat_token: str
    source_server_id: int
    target_server_id: str
    dry_run: bool = True

# Store active log streams
log_streams = {}

async def run_engine_task(task_type: str, config: dict, task_id: str):
    async def log_callback(msg: str):
        if task_id in log_streams:
            # We need to send to all connected clients for this task
            # Use a copy of the set to avoid modification during iteration
            for ws in list(log_streams[task_id]):
                try:
                    await ws.send_text(msg)
                except:
                    pass

    engine = MigrationEngine({"dry_run": config.get('dry_run', True)}, log_callback)
    
    if task_type == "clone":
        await engine.run_clone(
            config['discord_token'], 
            config['stoat_token'], 
            config['source_server_id'], 
            config['target_server_id']
        )
        await log_callback("TASK_COMPLETE")
    elif task_type == "migrate":
        await engine.run_migration(
            config['discord_token'],
            config['stoat_token'],
            config['source_channel_id'],
            config['target_channel_id']
        )
        # run_migration already sends TASK_COMPLETE/FAILED internally now

class TokenInput(BaseModel):
    token: str

@app.post("/api/bot-info/discord")
async def get_discord_bot_info(data: TokenInput):
    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": f"Bot {data.token}"}
        async with session.get("https://discord.com/api/v10/users/@me", headers=headers) as resp:
            if resp.status == 200:
                user = await resp.json()
                avatar_url = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.png" if user.get('avatar') else None
                return {"name": user['username'], "avatar": avatar_url}
            return {"error": "Invalid token"}

@app.post("/api/bot-info/stoat")
async def get_stoat_bot_info(data: TokenInput):
    async with aiohttp.ClientSession() as session:
        headers = {"X-Bot-Token": data.token}
        async with session.get("https://api.stoat.chat/users/@me", headers=headers) as resp:
            if resp.status == 200:
                user = await resp.json()
                # Revolt uses an object for avatars
                avatar = user.get('avatar')
                avatar_url = None
                if avatar:
                    tag = avatar.get('tag', 'attachments')
                    avatar_url = f"https://cdn.stoatusercontent.com/{tag}/{avatar['_id']}/{avatar['filename']}"
                return {"name": user['username'], "avatar": avatar_url}
            return {"error": "Invalid token"}

class ServerInfoInput(BaseModel):
    token: str
    server_id: str

@app.post("/api/server-info/discord")
async def get_discord_server_info(data: ServerInfoInput):
    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": f"Bot {data.token}"}
        async with session.get(f"https://discord.com/api/v10/guilds/{data.server_id}", headers=headers) as resp:
            if resp.status == 200:
                guild = await resp.json()
                icon_url = f"https://cdn.discordapp.com/icons/{guild['id']}/{guild['icon']}.png" if guild.get('icon') else None
                return {"name": guild['name'], "icon": icon_url}
            return {"error": "Invalid server ID or token privileges"}

@app.post("/api/server-info/stoat")
async def get_stoat_server_info(data: ServerInfoInput):
    async with aiohttp.ClientSession() as session:
        # Stoat uses X-Bot-Token for bot auth
        headers = {"X-Bot-Token": data.token}
        async with session.get(f"https://api.stoat.chat/servers/{data.server_id}", headers=headers) as resp:
            if resp.status == 200:
                server = await resp.json()
                icon = server.get('icon')
                icon_url = None
                if icon:
                    tag = icon.get('tag', 'attachments')
                    icon_url = f"https://cdn.stoatusercontent.com/{tag}/{icon['_id']}/{icon['filename']}"
                return {"name": server['name'], "icon": icon_url}
            return {"error": "Invalid server ID or token privileges"}

class ServerChannelsInput(BaseModel):
    token: str
    server_id: str

@app.post("/api/list-channels/discord")
async def list_discord_channels(data: ServerChannelsInput):
    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": f"Bot {data.token}"}
        async with session.get(f"https://discord.com/api/v10/guilds/{data.server_id}/channels", headers=headers) as resp:
            if resp.status == 200:
                channels = await resp.json()
                # Filter for text channels (type 0) and threads if applicable
                return [{"id": c['id'], "name": c['name'], "type": c['type']} for c in channels if c['type'] in [0, 5]]
            return {"error": "Failed to fetch Discord channels"}

class ChannelPreviewInput(BaseModel):
    token: str
    channel_id: str

@app.post("/api/channel-preview/discord")
async def get_discord_channel_preview(data: ChannelPreviewInput):
    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": f"Bot {data.token}"}
        # Fetch first message of the channel
        params = {"limit": 1, "after": "0"} 
        async with session.get(f"https://discord.com/api/v10/channels/{data.channel_id}/messages", headers=headers, params=params) as resp:
            if resp.status == 200:
                msgs = await resp.json()
                if msgs:
                    msg = msgs[0]
                    return {
                        "date": msg['timestamp'],
                        "author": msg['author']['username'],
                        "content": msg['content'][:100],
                        "link": f"https://discord.com/channels/@me/{data.channel_id}/{msg['id']}"
                    }
                return {"error": "Channel is empty"}
            return {"error": f"Discord API Error {resp.status}"}

@app.post("/api/list-channels/stoat")
async def list_stoat_channels(data: ServerChannelsInput):
    async with aiohttp.ClientSession() as session:
        headers = {"X-Bot-Token": data.token}
        async with session.get(f"https://api.stoat.chat/servers/{data.server_id}/channels", headers=headers) as resp:
            if resp.status == 200:
                channels = await resp.json()
                if not isinstance(channels, list):
                    print(f"[STOAT] Error: Channels response is not a list: {channels}")
                    return []
                filtered = [{"id": c['id'], "name": c['name']} for c in channels if str(c.get('channel_type', '')).lower() == 'text']
                print(f"[STOAT] Found {len(filtered)} text channels out of {len(channels)} total.")
                return filtered
            print(f"[STOAT] API Error {resp.status} fetching channels for {data.server_id}")
            return {"error": f"Stoat API Error {resp.status}"}

@app.post("/api/clone")
async def start_clone(config: CloneConfig, background_tasks: BackgroundTasks):
    task_id = f"clone_{int(time.time())}"
    background_tasks.add_task(run_engine_task, "clone", config.dict(), task_id)
    return {"task_id": task_id, "status": "started"}

@app.post("/api/migrate")
async def start_migrate(config: MigrationConfig, background_tasks: BackgroundTasks):
    task_id = f"migrate_{int(time.time())}"
    background_tasks.add_task(run_engine_task, "migrate", config.dict(), task_id)
    return {"task_id": task_id, "status": "started"}

@app.websocket("/ws/logs/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    await websocket.accept()
    if task_id not in log_streams:
        log_streams[task_id] = []
    log_streams[task_id].append(websocket)
    try:
        while True:
            # Just keep the connection alive, we don't expect input
            await websocket.receive_text()
    except WebSocketDisconnect:
        if task_id in log_streams:
            log_streams[task_id].remove(websocket)

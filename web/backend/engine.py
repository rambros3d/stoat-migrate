import discord
import aiohttp
import asyncio
import logging
import uuid
import datetime
from typing import Dict, List, Optional, Callable

class QueueHandler(logging.Handler):
    def __init__(self, callback: Callable[[str], None]):
        super().__init__()
        self.callback = callback

    def emit(self, record):
        try:
            msg = self.format(record)
            if asyncio.get_event_loop().is_running():
                asyncio.create_task(self.callback(msg))
        except Exception:
            self.handleError(record)

class MigrationEngine:
    def __init__(self, config: dict, log_callback: Callable[[str], None]):
        self.config = config
        self.log_callback = log_callback
        
        self.logger = logging.getLogger(f"engine_{uuid.uuid4().hex[:8]}")
        self.logger.setLevel(logging.INFO)
        # Avoid duplicate logs if engine is reused in same process
        self.logger.handlers = []
        handler = QueueHandler(log_callback)
        handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        self.logger.addHandler(handler)
        
        self.role_map = {}
        self.channel_map = {}
        self.message_author_cache = {}

    async def stoat_request(self, token: str, method: str, path: str, json_data: dict = None) -> Optional[dict]:
        url = f"https://api.stoat.chat{path}"
        headers = {"X-Bot-Token": token}
        
        for attempt in range(3):
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=json_data, headers=headers) as resp:
                    if resp.status in [200, 201]:
                        return await resp.json()
                    elif resp.status == 429:
                        retry_after = (await resp.json()).get('retry_after', 1000) / 1000.0
                        self.logger.warning(f"Rate limited. Waiting {retry_after}s...")
                        await asyncio.sleep(retry_after + 0.1)
                        continue
                    else:
                        error = await resp.text()
                        self.logger.error(f"Stoat API Error ({method} {path}): {resp.status} - {error}")
                        return None
        return None

    def map_permissions(self, discord_perms: discord.Permissions) -> int:
        stoat_bits = 0
        if discord_perms.view_channel: stoat_bits |= (1 << 20)
        if discord_perms.send_messages: stoat_bits |= (1 << 22)
        if discord_perms.manage_messages: stoat_bits |= (1 << 24)
        if discord_perms.manage_channels: stoat_bits |= (1 << 2)
        if discord_perms.manage_roles: stoat_bits |= (1 << 3)
        if discord_perms.connect: stoat_bits |= (1 << 30)
        if discord_perms.speak: stoat_bits |= (1 << 31)
        return stoat_bits

    async def get_existing_structure(self, token: str, server_id: str):
        server = await self.stoat_request(token, "GET", f"/servers/{server_id}")
        if not server: return {}, {}
        roles = {r['name'].lower(): id for id, r in server.get('roles', {}).items()}
        channels_res = await self.stoat_request(token, "GET", f"/servers/{server_id}/channels")
        channels = {c['name'].lower(): c['_id'] for c in channels_res} if channels_res else {}
        return roles, channels

    async def run_clone(self, discord_token: str, stoat_token: str, source_id: int, target_id: str):
        self.logger.info(f"Starting cloning task for server {source_id} to {target_id}")
        client = discord.Client(intents=discord.Intents.default())
        
        @client.event
        async def on_ready():
            try:
                guild = client.get_guild(source_id)
                if not guild:
                    self.logger.error("Discord Guild not found.")
                    return

                existing_roles, existing_channels = await self.get_existing_structure(stoat_token, target_id)
                
                # 1. Roles
                for role in sorted(guild.roles, key=lambda r: r.position):
                    if role.is_default(): continue
                    name_lower = role.name.lower()
                    if name_lower in existing_roles:
                        self.role_map[role.id] = existing_roles[name_lower]
                        continue
                    
                    if self.config.get('dry_run'):
                        self.logger.info(f"[DRY RUN] Would create role: {role.name}")
                        self.role_map[role.id] = f"dry_role_{role.id}"
                        continue
                        
                    res = await self.stoat_request(stoat_token, "POST", f"/servers/{target_id}/roles", {
                        "name": role.name,
                        "permissions": [self.map_permissions(role.permissions), 0],
                        "colour": f"#{role.color.value:06x}" if role.color.value else None,
                        "hoist": role.hoist
                    })
                    if res and res.get('id'):
                        self.role_map[role.id] = res.get('id')
                        self.logger.info(f"Created role: {role.name}")

                # 2. Channels & Categories
                stoat_categories = []
                for category in sorted(guild.categories, key=lambda c: c.position):
                    cat_channels = []
                    for channel in sorted(category.channels, key=lambda ch: ch.position):
                        if not isinstance(channel, (discord.TextChannel, discord.VoiceChannel)): continue
                        
                        name_lower = channel.name.lower()
                        if name_lower in existing_channels:
                            chan_id = existing_channels[name_lower]
                            self.channel_map[channel.id] = chan_id
                            cat_channels.append(chan_id)
                            continue

                        if self.config.get('dry_run'):
                            self.logger.info(f"[DRY RUN] Would create channel: {channel.name} in {category.name}")
                            chan_id = f"dry_chan_{channel.id}"
                            self.channel_map[channel.id] = chan_id
                            cat_channels.append(chan_id)
                            continue

                        res = await self.stoat_request(stoat_token, "POST", f"/servers/{target_id}/channels", {
                            "name": channel.name,
                            "type": "Text" if isinstance(channel, discord.TextChannel) else "Voice",
                            "description": getattr(channel, 'topic', None)
                        })
                        if res and res.get('_id'):
                            chan_id = res.get('_id')
                            self.channel_map[channel.id] = chan_id
                            cat_channels.append(chan_id)
                            self.logger.info(f"Created channel: {channel.name}")

                    if cat_channels:
                        stoat_categories.append({"id": str(uuid.uuid4())[:8], "title": category.name, "channels": cat_channels})

                if stoat_categories and not self.config.get('dry_run'):
                    await self.stoat_request(stoat_token, "PATCH", f"/servers/{target_id}", {"categories": stoat_categories})

                self.logger.info("Server structure cloning finished.")
            except Exception as e:
                self.logger.error(f"Error in cloning: {e}")
            finally:
                await client.close()

        try:
            await client.start(discord_token)
        except Exception as e:
            self.logger.error(f"Failed to start Discord client: {e}")

    async def run_migration(self, discord_token: str, stoat_token: str, source_chan: int, target_chan: str):
        self.logger.info(f"Starting message migration from {source_chan} to {target_chan}")
        client = discord.Client(intents=discord.Intents.default())

        @client.event
        async def on_ready():
            try:
                channel = client.get_channel(source_chan)
                if not channel:
                    self.logger.error("Discord channel not found.")
                    return

                # Fetch all messages
                messages = []
                async for msg in channel.history(limit=None, oldest_first=True):
                    messages.append(msg)
                
                self.logger.info(f"Found {len(messages)} messages to migrate.")
                
                for msg in messages:
                    author_name = msg.author.display_name or msg.author.name
                    content = msg.clean_content
                    # Basic masquerade
                    masquerade = {"name": author_name, "avatar": str(msg.author.display_avatar.url)}
                    
                    if self.config.get('dry_run'):
                        self.logger.info(f"[DRY RUN] Would migrate message from {author_name}")
                        continue

                    await self.stoat_request(stoat_token, "POST", f"/channels/{target_chan}/messages", {
                        "content": content if content else "*(Attachment/Embed)*",
                        "masquerade": masquerade
                    })
                
                self.logger.info("Message migration finished.")
            except Exception as e:
                self.logger.error(f"Error in migration: {e}")
            finally:
                await client.close()

        await client.start(discord_token)

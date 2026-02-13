import discord
import aiohttp
import asyncio
import json
import logging
from typing import Dict, List, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('cloning.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class CloneBot:
    def __init__(self, config_path: str = "config.json"):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        self.discord_client = discord.Client(intents=discord.Intents.default())
        self.stoat_api = self.config['stoat']['api_url']
        self.stoat_token = self.config['stoat']['token']
        self.stoat_server_id = self.config['stoat']['target_server_id']
        
        # Mappings
        self.role_map = {} # Discord Role ID -> Stoat Role ID
        self.channel_map = {} # Discord Channel ID -> Stoat Channel ID
        self.category_map = {} # Discord Category ID -> Stoat Category Structure

    async def stoat_request(self, method: str, path: str, json_data: dict = None) -> Optional[dict]:
        url = f"{self.stoat_api}{path}"
        headers = {"X-Bot-Token": self.stoat_token}
        
        for attempt in range(self.config['migration'].get('retry_attempts', 3)):
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=json_data, headers=headers) as resp:
                    if resp.status in [200, 201]:
                        return await resp.json()
                    elif resp.status == 429:
                        try:
                            retry_data = await resp.json()
                            wait_ms = retry_data.get('retry_after', 1000)
                            wait_sec = (wait_ms / 1000.0) + 0.5
                            logger.warning(f"Rate limited (429). Waiting {wait_sec:.2f}s...")
                            await asyncio.sleep(wait_sec)
                            continue
                        except:
                            await asyncio.sleep(2)
                            continue
                    elif resp.status == 403:
                        error = await resp.text()
                        logger.error(f"Stoat Permission Error (403): The bot lacks required permissions for {path}")
                        return None
                    else:
                        error = await resp.text()
                        logger.error(f"Stoat API Error ({method} {path}): {resp.status} - {error}")
                        return None
        return None

    def map_permissions(self, discord_perms: discord.Permissions) -> int:
        """Map Discord permissions to Stoat (Revolt) bitmask"""
        # Stoat/Revolt bitmasks (partial list based on research)
        # ViewChannel = 1 << 20
        # SendMessage = 1 << 22
        # ManageMessages = 1 << 24
        # ManageChannels = 1 << 2
        # ManageRoles = 1 << 3
        
        stoat_bits = 0
        if discord_perms.view_channel: stoat_bits |= (1 << 20)
        if discord_perms.send_messages: stoat_bits |= (1 << 22)
        if discord_perms.manage_messages: stoat_bits |= (1 << 24)
        if discord_perms.manage_channels: stoat_bits |= (1 << 2)
        if discord_perms.manage_roles: stoat_bits |= (1 << 3)
        if discord_perms.connect: stoat_bits |= (1 << 30)
        if discord_perms.speak: stoat_bits |= (1 << 31)
        
        return stoat_bits

    async def get_existing_structure(self):
        """Fetch existing roles and channels to avoid duplicates"""
        server = await self.stoat_request("GET", f"/servers/{self.stoat_server_id}")
        if not server: return {}, []
        
        roles = {r['name'].lower(): id for id, r in server.get('roles', {}).items()}
        
        channels_res = await self.stoat_request("GET", f"/servers/{self.stoat_server_id}/channels")
        channels = {c['name'].lower(): c['_id'] for c in channels_res} if channels_res else {}
        
        return roles, channels

    async def clone_roles(self, guild: discord.Guild, existing_roles: Dict[str, str]):
        logger.info(f"Cloning {len(guild.roles)} roles...")
        # Sort roles by position to maintain hierarchy
        sorted_roles = sorted(guild.roles, key=lambda r: r.position)
        
        for role in sorted_roles:
            if role.is_default(): continue # Skip @everyone for now or handle specifically
            
            name_lower = role.name.lower()
            if name_lower in existing_roles:
                logger.info(f"Role {role.name} already exists, skipping creation.")
                self.role_map[role.id] = existing_roles[name_lower]
                continue

            if self.config['migration'].get('dry_run'):
                logger.info(f"[DRY RUN] Would create role: {role.name} with color {role.color}")
                # Mock a role ID for dry run mapping
                self.role_map[role.id] = f"dry_run_role_{role.id}"
                continue

            logger.info(f"Creating role: {role.name}")
            payload = {
                "name": role.name,
                "permissions": [self.map_permissions(role.permissions), 0], # [allow, deny]
                "colour": f"#{role.color.value:06x}" if role.color.value else None,
                "hoist": role.hoist
            }
            
            # Note: Revolt role creation is usually part of server management
            # Endpoint: POST /servers/{id}/roles
            res = await self.stoat_request("POST", f"/servers/{self.stoat_server_id}/roles", payload)
            if res:
                # Stoat usually returns the role ID either in response or as a key
                # Assuming simple return of { "id": "..." } or similar
                role_id = res.get("id")
                if role_id:
                    self.role_map[role.id] = role_id
                    logger.info(f"Successfully created role {role.name} with ID {role_id}")

    async def clone_channels(self, guild: discord.Guild, existing_channels: Dict[str, str]):
        logger.info(f"Cloning hierarchy (Categories and Channels)...")
        
        # 1. First, identify categories
        categories = sorted(guild.categories, key=lambda c: c.position)
        
        # 2. Create channels and group them by category
        stoat_categories = []
        
        for category in categories:
            cat_channels = []
            logger.info(f"Processing category: {category.name}")
            
            # Sort channels within category
            sorted_channels = sorted(category.channels, key=lambda ch: ch.position)
            
            for channel in sorted_channels:
                if not isinstance(channel, (discord.TextChannel, discord.VoiceChannel)):
                    continue
                
                name_lower = channel.name.lower()
                if name_lower in existing_channels:
                    logger.info(f"Channel {channel.name} already exists, skipping creation.")
                    chan_id = existing_channels[name_lower]
                    self.channel_map[channel.id] = chan_id
                    cat_channels.append(chan_id)
                    continue

                if self.config['migration'].get('dry_run'):
                    logger.info(f"[DRY RUN] Would create channel: {channel.name} ({'Text' if isinstance(channel, discord.TextChannel) else 'Voice'}) in category {category.name}")
                    # Mock a channel ID
                    chan_id = f"dry_run_chan_{channel.id}"
                    self.channel_map[channel.id] = chan_id
                    cat_channels.append(chan_id)
                    continue

                logger.info(f"Creating channel: {channel.name} in {category.name}")
                
                # Basic payload
                payload = {
                    "name": channel.name,
                    "description": getattr(channel, 'topic', None),
                    "type": "Text" if isinstance(channel, discord.TextChannel) else "Voice",
                    "nsfw": channel.nsfw if hasattr(channel, 'nsfw') else False
                }
                
                res = await self.stoat_request("POST", f"/servers/{self.stoat_server_id}/channels", payload)
                if res and res.get("_id"):
                    chan_id = res.get("_id")
                    self.channel_map[channel.id] = chan_id
                    cat_channels.append(chan_id)
                    logger.info(f"Created channel {channel.name}")
            
            if cat_channels:
                stoat_categories.append({
                    "id": str(category.id), # Use Discord ID as temp Stoat category ID key if needed, or generate
                    "title": category.name,
                    "channels": cat_channels
                })

        # 3. Handle channels without categories
        lonely_channels = [ch for ch in guild.channels if ch.category is None and isinstance(ch, (discord.TextChannel, discord.VoiceChannel))]
        if lonely_channels:
            logger.info("Processing non-categorized channels...")
            other_channels = []
            for channel in sorted(lonely_channels, key=lambda ch: ch.position):
                name_lower = channel.name.lower()
                if name_lower in existing_channels:
                    logger.info(f"Lonely channel {channel.name} already exists, skipping.")
                    other_channels.append(existing_channels[name_lower])
                    continue

                if self.config['migration'].get('dry_run'):
                    logger.info(f"[DRY RUN] Would create uncategorized channel: {channel.name}")
                    other_channels.append(f"dry_run_chan_{channel.id}")
                    continue

                payload = {
                    "name": channel.name,
                    "type": "Text" if isinstance(channel, discord.TextChannel) else "Voice"
                }
                res = await self.stoat_request("POST", f"/servers/{self.stoat_server_id}/channels", payload)
                if res and res.get("_id"):
                    other_channels.append(res.get("_id"))
            
            if other_channels:
                stoat_categories.append({
                    "id": "uncategorized",
                    "title": "Channels",
                    "channels": other_channels
                })

        # 4. Update Server Categories structure
        if stoat_categories:
            if self.config['migration'].get('dry_run'):
                logger.info(f"[DRY RUN] Would sync {len(stoat_categories)} categories with Stoat server.")
                return

            logger.info("Syncing server category structure...")
            # We need to generate unique IDs for categories for Stoat
            import uuid
            for cat in stoat_categories:
                cat['id'] = str(uuid.uuid4())[:8] # Short unique ID
                
            await self.stoat_request("PATCH", f"/servers/{self.stoat_server_id}", {"categories": stoat_categories})

    async def run_clone(self):
        try:
            guild_id = self.config['discord']['source_server_id']
            guild = self.discord_client.get_guild(guild_id)
            if not guild:
                logger.error(f"Could not find Discord server with ID {guild_id}")
                return

            logger.info(f"Starting clone of server: {guild.name}")
            
            # Fetch existing structure
            existing_roles, existing_channels = await self.get_existing_structure()
            
            # Overview
            logger.info("\n" + "="*60)
            logger.info("CLONING PLAN OVERVIEW")
            logger.info("="*60)
            logger.info(f"SOURCE (Discord):    {guild.name}")
            logger.info(f"DESTINATION (Stoat): {self.stoat_server_id}")
            logger.info(f"Roles to clone:      {len(guild.roles)}")
            logger.info(f"Channels found in Stoat: {len(existing_channels)}")
            logger.info("="*60 + "\n")
            
            confirm = await asyncio.to_thread(input, "Would you like to proceed with cloning structure? (Y/N): ")
            if confirm.lower() != 'y':
                logger.info("Cloning cancelled by user.")
                return

            if self.config['migration'].get('dry_run'):
                logger.info("DRY RUN MODE ENABLED. Proceeding with plan verification...")
            
            # 1. Clone Roles
            await self.clone_roles(guild, existing_roles)
            
            # 2. Clone Categories and Channels
            await self.clone_channels(guild, existing_channels)
            
            logger.info("Cloning complete!")
            
        except Exception as e:
            logger.error(f"Error during cloning: {e}", exc_info=True)
        finally:
            await self.discord_client.close()

    def start(self):
        @self.discord_client.event
        async def on_ready():
            logger.info(f"Logged in as {self.discord_client.user}")
            await self.run_clone()

        self.discord_client.run(self.config['discord']['token'])

if __name__ == "__main__":
    try:
        bot = CloneBot()
        bot.start()
    except Exception as e:
        print(f"FATAL ERROR AT STARTUP: {e}")
        import traceback
        traceback.print_exc()

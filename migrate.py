import discord
import aiohttp
import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from tqdm import tqdm
from typing import Optional, List

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('migration.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class MigrationBot:
    def __init__(self, config_path: str = "config.json"):
        """Initialize the migration bot with configuration"""
        self.config = self.load_config(config_path)
        
        # Stoat API and CDN setup
        self.stoat_api = self.config['stoat']['api_url'].rstrip('/')
        self.stoat_cdn = None  # Will be fetched from API root
        
        # Use only required intents instead of all intents
        intents = discord.Intents.default()
        intents.guilds = True
        intents.messages = True
        intents.message_content = True
        
        self.discord_client = discord.Client(intents=intents)
        self.avatar_cache = {}  # Cache uploaded avatars to avoid re-uploading
        
        # Setup Discord event handler
        @self.discord_client.event
        async def on_ready():
            await self.run_migration()
    
    def load_config(self, config_path: str) -> dict:
        """Load configuration from JSON file"""
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            logger.info(f"Configuration loaded from {config_path}")
            return config
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {config_path}")
            logger.info("Please copy config.example.json to config.json and fill in your credentials")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in configuration file: {e}")
            raise
    
    async def get_stoat_cdn_url(self) -> str:
        """Fetch the Autumn CDN URL from Stoat API root or fallback to default"""
        if self.stoat_cdn:
            return self.stoat_cdn
            
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.stoat_api, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        cdn_url = data.get('features', {}).get('autumn', {}).get('url')
                        if cdn_url:
                            self.stoat_cdn = cdn_url.rstrip('/')
                            logger.info(f"Detected Stoat CDN URL: {self.stoat_cdn}")
                            return self.stoat_cdn
        except Exception as e:
            logger.warning(f"Failed to fetch CDN URL from API root: {e}")
            
        # Fallback to known default or config
        fallback = self.config['stoat'].get('cdn_url') or "https://cdn.stoatusercontent.com"
        self.stoat_cdn = fallback.rstrip('/')
        logger.info(f"Using fallback Stoat CDN URL: {self.stoat_cdn}")
        return self.stoat_cdn

    async def upload_to_stoat(self, file_url: str, filename: str, tag: str = "attachments") -> Optional[str]:
        """Download Discord attachment and upload to Stoat CDN with retry logic"""
        if self.config['migration']['dry_run']:
            logger.info(f"[DRY RUN] Would upload {filename} to Stoat CDN ({tag})")
            return "dry-run-file-id"
            
        cdn_base = await self.get_stoat_cdn_url()
        
        for attempt in range(self.config['migration']['retry_attempts']):
            try:
                async with aiohttp.ClientSession() as session:
                    # Download from Discord CDN
                    async with session.get(file_url) as resp:
                        if resp.status != 200:
                            logger.warning(f"Failed to download {filename}: HTTP {resp.status}")
                            continue
                        file_data = await resp.read()
                    
                    # Upload to Stoat Autumn CDN
                    # The endpoint is POST /<tag> (verified: https://cdn.stoatusercontent.com/attachments)
                    form = aiohttp.FormData()
                    form.add_field('file', file_data, filename=filename)
                    
                    async with session.post(
                        f"{cdn_base}/{tag}",
                        data=form,
                        headers={"X-Bot-Token": self.config['stoat']['token']}
                    ) as resp:
                        if resp.status == 200:
                            result = await resp.json()
                            logger.debug(f"Uploaded {filename} to Stoat CDN ({tag}): {result['id']}")
                            return result['id']
                        else:
                            error_text = await resp.text()
                            logger.warning(f"Stoat CDN upload failed ({tag}) (attempt {attempt + 1}): {resp.status} - {error_text}")
            
            except Exception as e:
                logger.warning(f"Error uploading {filename} (attempt {attempt + 1}): {e}")
            
            if attempt < self.config['migration']['retry_attempts'] - 1:
                await asyncio.sleep(self.config['migration']['retry_delay'] * (attempt + 1))
        
        logger.error(f"Failed to upload {filename} after {self.config['migration']['retry_attempts']} attempts")
        return None
    
    async def upload_avatar(self, avatar_url: str) -> Optional[str]:
        """Upload Discord avatar to Stoat CDN and cache the result"""
        if not self.config['migration']['upload_avatars']:
            return avatar_url
        
        # Check cache
        if avatar_url in self.avatar_cache:
            return self.avatar_cache[avatar_url]
        
        # Upload avatar
        try:
            cdn_base = await self.get_stoat_cdn_url()
            filename = f"avatar_{avatar_url.split('/')[-1].split('?')[0]}.png"
            avatar_id = await self.upload_to_stoat(avatar_url, filename, tag="avatars")
            if avatar_id:
                # Construct Stoat CDN URL for display
                stoat_avatar_url = f"{cdn_base}/avatars/{avatar_id}"
                self.avatar_cache[avatar_url] = stoat_avatar_url
                return stoat_avatar_url
        except Exception as e:
            logger.warning(f"Failed to upload avatar: {e}")
        
        return avatar_url  # Fallback to original URL
    
    async def send_to_stoat(self, content: str, attachments: List[str] = None) -> bool:
        """Send message to Stoat and retry logic"""
        if self.config['migration']['dry_run']:
            logger.info(f"[DRY RUN] Would send: {content[:50]}...")
            return True
        
        payload = {
            "content": content
        }
        
        # Add attachments if any
        if attachments:
            payload["attachments"] = attachments
        
        # Retry logic
        for attempt in range(self.config['migration']['retry_attempts']):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.stoat_api}/channels/{self.config['stoat']['target_channel_id']}/messages",
                        json=payload,
                        headers={"X-Bot-Token": self.config['stoat']['token']}
                    ) as resp:
                        if resp.status in [200, 201]:
                            return True
                        else:
                            error_text = await resp.text()
                            if "MissingPermission" in error_text:
                                logger.error(f"Stoat PERMISSION ERROR: Bot lacks 'SendMessage' permission in channel {self.config['stoat']['target_channel_id']}")
                                logger.error(f"Response: {error_text}")
                                return False # Don't bother retrying on permission errors
                            logger.warning(f"Failed to send message (attempt {attempt + 1}): {resp.status} - {error_text}")
            
            except Exception as e:
                logger.warning(f"Error sending message (attempt {attempt + 1}): {e}")
            
            if attempt < self.config['migration']['retry_attempts'] - 1:
                await asyncio.sleep(self.config['migration']['retry_delay'] * (attempt + 1))
        
        logger.error(f"Failed to send message after {self.config['migration']['retry_attempts']} attempts")
        return False
    
    async def run_migration(self):
        """Main migration logic"""
        try:
            logger.info(f"Discord bot logged in as {self.discord_client.user}")
            
            # Get source channel
            channel = self.discord_client.get_channel(self.config['discord']['source_channel_id'])
            if not channel:
                logger.error(f"Could not find Discord channel {self.config['discord']['source_channel_id']}")
                await self.discord_client.close()
                return
            
            logger.info(f"Fetching messages from Discord channel: {channel.name}")
            
            # Fetch all messages
            messages = []
            async for message in channel.history(limit=None, oldest_first=True):
                messages.append(message)
            
            logger.info(f"Found {len(messages)} messages. Starting migration...")
            
            if self.config['migration']['dry_run']:
                logger.info("DRY RUN MODE - No messages will be posted to Stoat")
            
            # Migrate messages with progress bar
            success_count = 0
            failed_count = 0
            
            for msg in tqdm(messages, desc="Migrating messages", unit="msg"):
                try:
                    logger.debug(f"Processing message from {msg.author.name} ({msg.created_at})")
                    # Format timestamp
                    timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                    author_name = msg.author.display_name or msg.author.name
                    
                    # Simplified content format: **[Author]** ([Timestamp])\n[Content]
                    content_header = f"**{author_name}** ({timestamp})"
                    if msg.content:
                        content = f"{content_header}\n{msg.content}"
                    else:
                        content = content_header
                    
                    # Handle attachments
                    stoat_attachments = []
                    if msg.attachments:
                        for att in msg.attachments:
                            logger.debug(f"Processing attachment: {att.filename}")
                            file_id = await self.upload_to_stoat(att.url, att.filename)
                            if file_id:
                                stoat_attachments.append(file_id)
                            else:
                                logger.warning(f"Skipping attachment {att.filename} due to upload failure")
                    
                    # Send to Stoat
                    success = await self.send_to_stoat(
                        content=content,
                        attachments=stoat_attachments if stoat_attachments else None
                    )
                    
                    if success:
                        success_count += 1
                    else:
                        failed_count += 1
                        logger.error(f"Failed to migrate message from {msg.author.name}")
                    
                    # Rate limiting
                    await asyncio.sleep(self.config['migration']['rate_limit_delay'])
                
                except Exception as e:
                    failed_count += 1
                    logger.error(f"Error processing message: {e}")
            
            # Summary
            logger.info("=" * 50)
            logger.info("Migration Complete!")
            logger.info(f"Total messages: {len(messages)}")
            logger.info(f"Successfully migrated: {success_count}")
            logger.info(f"Failed: {failed_count}")
            logger.info("=" * 50)
            
        except Exception as e:
            logger.error(f"Fatal error during migration: {e}", exc_info=True)
        
        finally:
            await self.discord_client.close()
    
    def start(self):
        """Start the migration bot"""
        logger.info("Starting Discord to Stoat migration bot...")
        self.discord_client.run(self.config['discord']['token'])

if __name__ == "__main__":
    bot = MigrationBot()
    bot.start()

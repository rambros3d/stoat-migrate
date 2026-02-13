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
        self.message_author_map = {}  # Cache author names for replies (msg_id -> author_name)
        
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
                            if resp.status == 429:
                                try:
                                    error_data = json.loads(error_text)
                                    retry_after = error_data.get("retry_after", self.config['migration']['retry_delay'])
                                    logger.warning(f"Rate limited! Waiting {retry_after} seconds...")
                                    await asyncio.sleep(retry_after)
                                    continue # Retry after waiting
                                except:
                                    pass
                                    
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
    
    def _format_message_content(self, msg: discord.Message) -> str:
        """Format message content including replies, forwards, and embeds"""
        parts = []
        
        # 1. Handle Replies (only if not a forward/snapshot)
        snapshots = getattr(msg, 'message_snapshots', [])
        
        if msg.reference and msg.reference.message_id and not snapshots:
             ref_id = msg.reference.message_id
             reply_user = self.message_author_map.get(ref_id)
             if reply_user:
                 parts.append(f"> *Replying to {reply_user}*")
             else:
                 parts.append(f"> *Replying to a message*")

        # 2. Handle Forwarded Messages (Snapshots)
        # Note: discord.py 2.6.4 might use 'message_snapshots' attribute
        # snapshots = getattr(msg, 'message_snapshots', []) # Moved up
        if snapshots:
            for snapshot in snapshots:
                # Snapshot is a MessageSnapshot object, usually containing a tuple (message, list of objects)
                # The structure can vary, but typically it behaves like a partial message
                try:
                    # Try to extract content from the snapshot
                    # In some versions, snapshot might be a dict or object
                    forwarded_content = getattr(snapshot, 'content', '')
                    if forwarded_content:
                        parts.append(f"> **Forwarded Message**:\n> {forwarded_content}")
                    
                    # Handle attachments in forwards (urls only for now)
                    if hasattr(snapshot, 'attachments'):
                         for att in snapshot.attachments:
                             parts.append(f"> *Attachment: {att.url}*")
                except Exception as e:
                    logger.warning(f"Failed to process snapshot: {e}")

        # 3. Handle Rich Embeds (User requested to suppress verbose description, just keep link)
        if msg.embeds:
            for embed in msg.embeds:
                # If content exists, skip auto-generated embeds (link, video, etc) to avoid duplication
                # This fixes the issue where youtube.com in content vs youtu.be in embed caused double links.
                if (msg.clean_content or "").strip() and embed.type in ['link', 'video', 'article', 'image', 'gifv']:
                    continue
                
                # If the embed has a URL and it's not already in the content, add it.
                # This handles cases where a bot sends an embed with a link but no content.
                if embed.url and embed.url not in (msg.clean_content or ""):
                     parts.append(embed.url)

        # 4. Main Content (using clean_content to resolve mentions like <@123>)
        if msg.clean_content:
            parts.append(msg.clean_content)
            
        return "\n".join(parts)

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
            
            if messages:
                # Get Stoat metadata
                stoat_channel_name = "Unknown"
                stoat_server_name = "Unknown"
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"{self.stoat_api}/channels/{self.config['stoat']['target_channel_id']}",
                            headers={"X-Bot-Token": self.config['stoat']['token']}
                        ) as resp:
                            if resp.status == 200:
                                c_data = await resp.json()
                                stoat_channel_name = c_data.get('name', 'Unknown')
                                server_id = c_data.get('server')
                                if server_id:
                                    async with session.get(
                                        f"{self.stoat_api}/servers/{server_id}",
                                        headers={"X-Bot-Token": self.config['stoat']['token']}
                                    ) as s_resp:
                                        if s_resp.status == 200:
                                            s_data = await s_resp.json()
                                            stoat_server_name = s_data.get('name', 'Unknown')
                except Exception as e:
                    logger.warning(f"Failed to fetch Stoat metadata: {e}")

                first_msg = messages[0]
                last_msg = messages[-1]
                logger.info(f"\n" + "="*60)
                logger.info(f"MIGRATION PLAN OVERVIEW")
                logger.info(f"="*60)
                logger.info(f"SOURCE (Discord)")
                logger.info(f"  Server:         {channel.guild.name}")
                logger.info(f"  Channel:        {channel.name}")
                logger.info(f"")
                logger.info(f"DESTINATION (Stoat)")
                logger.info(f"  Server:         {stoat_server_name}")
                logger.info(f"  Channel:        {stoat_channel_name}")
                logger.info(f"")
                logger.info(f"MESSAGE STATISTICS")
                logger.info(f"  Total Messages: {len(messages)}")
                logger.info(f"  First Message:  {first_msg.created_at}")
                logger.info(f"  Last Message:   {last_msg.created_at}")
                logger.info(f"")
                logger.info(f"FIRST MESSAGE PREVIEW")
                logger.info(f"  Author:         {first_msg.author.name}")
                logger.info(f"  Link:           {first_msg.jump_url}")
                logger.info(f"="*60 + "\n")
                
                confirm = input("Would you like to proceed? (Y/N): ")
                if confirm.lower() != 'y':
                    logger.info("Migration cancelled by user.")
                    await self.discord_client.close()
                    return
            
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
                    
                    # Store author name in cache for future replies
                    self.message_author_map[msg.id] = author_name
                    
                    # Generate formatted content (handling forwards/embeds/replies)
                    formatted_body = self._format_message_content(msg)
                    
                    # Simplified content format: **[Author]** ([Timestamp])\n[Content]
                    content_header = f"**{author_name}** ({timestamp})"
                    
                    if formatted_body:
                        content = f"{content_header}\n{formatted_body}"
                    else:
                        content = f"{content_header}\n*(Clean message via migration)*" # Fallback if empty
                    
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

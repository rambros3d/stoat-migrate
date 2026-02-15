import discord
import asyncio
import json
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MessageInspector:
    def __init__(self, config_path: str = "config.json"):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        intents = discord.Intents.default()
        intents.guilds = True
        intents.messages = True
        intents.message_content = True
        
        self.client = discord.Client(intents=intents)

        @self.client.event
        async def on_ready():
            logger.info(f"Logged in as {self.client.user}")
            await self.inspect_channel()

    async def inspect_channel(self):
        try:
            channel_id = self.config['discord']['source_channel_id']
            channel = self.client.get_channel(channel_id)
            if not channel:
                logger.error(f"Channel {channel_id} not found")
                return

            logger.info(f"Inspecting channel: {channel.name}")
            
            messages_data = []
            async for msg in channel.history(limit=100):
                msg_data = {
                    "id": msg.id,
                    "author": f"{msg.author.name}#{msg.author.discriminator} (bot={msg.author.bot})",
                    "content": msg.content,
                    "type": str(msg.type),
                    "embeds": [e.to_dict() for e in msg.embeds],
                    "attachments": [a.url for a in msg.attachments],
                    "reference": str(msg.reference) if msg.reference else None,
                    "flags": str(msg.flags)
                }
                messages_data.append(msg_data)
            
            with open('inspection_output.json', 'w') as f:
                json.dump(messages_data, f, indent=2, default=str)
            logger.info("Dumped messages to inspection_output.json")
            
        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            await self.client.close()


if __name__ == "__main__":
    inspector = MessageInspector()
    try:
        inspector.client.run(inspector.config['discord']['token'])
    except Exception as e:
        print(f"Failed to run client: {e}")

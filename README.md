# Discord to Stoat Migration Bot

A one-time migration utility that transfers complete message history from Discord channels to Stoat channels while preserving original usernames, timestamps, formatting, and media attachments.

## Features

✅ **Complete History Migration** - Fetches all historical messages from Discord channels  
✅ **Identity Preservation** - Uses Stoat masquerade to display original author names and avatars  
✅ **Timestamp Preservation** - Includes formatted timestamps in message content  
✅ **Media Migration** - Downloads and re-uploads attachments (images, videos, files) to Stoat's Autumn CDN  
✅ **Markdown Support** - Preserves text formatting (bold, italics, code blocks)  
✅ **Rate Limiting** - Respects API limits on both platforms with automatic retry  
✅ **Progress Tracking** - Real-time progress bar and detailed logging  
✅ **Dry Run Mode** - Test migration without actually posting messages  

## Use Cases

- Server migrations from Discord to Stoat
- Platform transitions with historical context
- Archiving Discord channels to Stoat
- One-time data transfers (no ongoing synchronization)

## Prerequisites

- Python 3.8 or higher
- Discord bot token with message read permissions
- Stoat bot token with message send permissions
- Access to both source Discord channel and target Stoat channel

## Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create configuration file**
   ```bash
   cp config.example.json config.json
   ```

4. **Edit `config.json` with your credentials**
   ```json
   {
     "discord": {
       "token": "YOUR_DISCORD_BOT_TOKEN",
       "source_channel_id": 1234567890123456789
     },
     "stoat": {
       "api_url": "https://api.stoat.chat",
       "token": "YOUR_STOAT_BOT_TOKEN",
       "target_channel_id": "01XXXXXXXXXXXXXXXXXXXXXXXXX"
     },
     "migration": {
       "rate_limit_delay": 0.1,
       "retry_attempts": 3,
       "retry_delay": 2,
       "dry_run": false,
       "upload_avatars": true
     }
   }
   ```

## Configuration

### Discord Settings

- **token**: Your Discord bot token (from Discord Developer Portal)
- **source_channel_id**: The Discord channel ID to migrate from (right-click channel → Copy ID)

### Stoat Settings

- **api_url**: Stoat API endpoint (default: `https://api.stoat.chat`)
- **token**: Your Stoat bot token
- **target_channel_id**: The Stoat channel ID to migrate to

### Migration Settings

- **rate_limit_delay**: Delay between messages in seconds (default: 0.1)
- **retry_attempts**: Number of retry attempts for failed API calls (default: 3)
- **retry_delay**: Delay between retries in seconds (default: 2)
- **dry_run**: If `true`, fetches messages but doesn't post to Stoat (default: false)
- **upload_avatars**: If `true`, uploads Discord avatars to Stoat CDN for masquerade (default: true)

## Usage

### Basic Migration

```bash
python migrate.py
```

### 1. Clone Server Structure (Roles, Channels, Categories)
If you want to mirror your Discord server structure (without messages), run:
```bash
./venv/bin/python clone.py
```
This will recreate your roles, categories, and channels on Stoat.

### 2. Migrate Message History
After the structure is set up, run the main migration script for individual channels:
```bash
./venv/bin/python migrate.py
```

### Dry Run (Test Mode)

Set `"dry_run": true` in `config.json` to test without posting:

```bash
python migrate.py
```

This will fetch all Discord messages and show what would be migrated without actually posting to Stoat.

## How It Works

1. **Connect** - Bot logs into Discord using provided token
2. **Fetch** - Retrieves all messages from source channel (oldest first)
3. **Process** - For each message:
   - Downloads any attachments from Discord CDN
   - Uploads attachments to Stoat's Autumn CDN
   - Formats timestamp and content
   - Uploads author avatar (if enabled)
   - Posts to Stoat with masquerade (original author identity)
4. **Complete** - Bot terminates after all messages are migrated

## Rate Limits

- **Discord**: ~50 requests per second (handled automatically by discord.py)
- **Stoat**: Configurable via `rate_limit_delay` (default: 10 messages/second)
- **Retry Logic**: Automatic exponential backoff on API errors

## Troubleshooting

### "Forbidden" or "Unauthorized" Errors

- Verify bot tokens are correct
- Ensure Discord bot has "Read Message History" permission
- Ensure Stoat bot has "Send Messages" permission in target channel

### Missing Attachments

- Check that attachments are publicly accessible
- Verify Stoat CDN upload permissions
- Check file size limits (Stoat may have upload size restrictions)

### Rate Limit Errors

- Increase `rate_limit_delay` in config.json
- Reduce concurrent operations
- Wait and retry (bot will automatically retry with backoff)

### Avatar Not Showing

- Set `upload_avatars: true` in config.json
- Verify Stoat bot has CDN upload permissions
- Some users may not have avatars (will use default)

## Limitations

- **One-time execution**: Not a live bridge, runs once and terminates
- **No message editing**: Edited Discord messages appear as original version
- **No reactions**: Reactions are not migrated
- **No threads**: Thread messages are not included (main channel only)
- **No embeds**: Rich embeds may not transfer perfectly

## Security Notes

⚠️ **Never commit `config.json` to version control** - it contains sensitive tokens  
⚠️ **Keep bot tokens secure** - treat them like passwords  
⚠️ **Use `.gitignore`** - included to prevent accidental token exposure  

## License

This is a utility script provided as-is for migration purposes.

## Support

For issues with:
- **Discord API**: See [Discord Developer Documentation](https://discord.com/developers/docs)
- **Stoat API**: See Stoat API documentation or support channels

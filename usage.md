# Usage Guide: Migrating with Discord Terminator

Follow these steps to migrate your Discord server to Stoat seamlessly.

## Prerequisites
1. **Discord Bot Token**: Create a bot in the Discord Developer Portal with `Message Content` and `Server Members` intents enabled.
2. **Stoat Bot Token**: Obtain a bot token from your Stoat instance.
3. **Permissions**: Ensure both bots are invited to their respective servers with full administrator (or appropriate manage) permissions.

## Step 1: Authentication
- Enter your **Discord Bot Token** and **Stoat Bot Token**.
- The tool will automatically detect the bot names and avatars to verify connectivity.

## Step 2: Server Setup
- Provide the **Source Server ID** (Discord) and **Target Server ID** (Stoat).
- Use the **Auto-Discovery** links to find IDs via your browser's address bar.
- (Optional) Use the **Cloning** feature to recreate the entire Discord category/channel structure on Stoat first.

## Step 3: Migration
1. **Channel Selection**: Select the source Discord channel and the target Stoat channel from the searchable dropdowns.
2. **Inclusive Offset (Optional)**: If you want to continue a previous migration or start from a specific point, paste a Discord message link. The migration will start **from that message (inclusive)**.
3. **Run a Test**: Toggle "**Run a Test without copying**" to simulate the migration and check logs without posting to Stoat.
4. **Start Migration**: Hit the button and watch the live progress bar.

## Pro Tips
- **Masquerade**: Leave this enabled to keep the original Discord usernames and avatars visible on Stoat.
- **Rate Limits**: If you have thousands of messages, the tool will automatically handle rate limits. Do not close the browser tab until the progress reaches 100%.
- **Validation**: The tool validates message links to ensure you don't accidentally migrate messages into the wrong channel.

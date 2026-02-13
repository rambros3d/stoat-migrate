import discord
import sys

with open("version.txt", "w") as f:
    f.write(f"Discord.py Version: {discord.__version__}\n")
    f.write(f"Has snapshots: {hasattr(discord.Message, 'snapshots')}\n")
    f.write(f"Has message_snapshots: {hasattr(discord.Message, 'message_snapshots')}\n")
    f.write(f"Has reference: {hasattr(discord.Message, 'reference')}\n")

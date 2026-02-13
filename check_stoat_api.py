import aiohttp
import asyncio
import json
import sys

async def check_api():
    print("Connecting to Stoat API...")
    sys.stdout.flush()
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get("https://api.stoat.chat/", timeout=10) as resp:
                print(f"Status: {resp.status}")
                sys.stdout.flush()
                data = await resp.json()
                print("--- API ROOT ---")
                print(json.dumps(data, indent=2))
                sys.stdout.flush()
        except Exception as e:
            print(f"Error: {e}")
            sys.stdout.flush()

if __name__ == "__main__":
    asyncio.run(check_api())

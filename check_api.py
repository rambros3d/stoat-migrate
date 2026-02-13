import aiohttp, asyncio, json; async def f(): async with aiohttp.ClientSession() as s: async with s.get("https://api.stoat.chat/") as r: print(json.dumps(await r.json(), indent=2)); asyncio.run(f())

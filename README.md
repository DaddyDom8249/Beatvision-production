# BeatVision

**Every Song Has a World. BeatVision Reveals It.**

Ground-zero rebuild. One Cloudflare Worker, D1 and Workers AI, Pixazo, and Shotstack. The only external provider secrets are `PIXAZO_API_KEY` and `SHOTSTACK_API_KEY`. No Gemini, OpenAI, Supabase, Firebase, external LLM gateway, second Worker, or provider bridge.

Provider keys never reach the browser. AI output is schema-validated before persistence. `song_summary` is mandatory. Failed provider calls are never reported as success.

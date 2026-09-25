# BeatVision

Every Song Has a World. BeatVision Reveals It.

Ground-zero architecture: one Cloudflare Worker, D1, Workers AI, Pixazo and Shotstack. No Gemini, OpenAI API, Supabase, Firebase or Arena gateway.

First vertical slice: account -> project -> song upload -> Visual World Report -> Pixazo hero image -> Shotstack render.

Provider secrets are server-side only:
- PIXAZO_API_KEY
- SHOTSTACK_API_KEY

Run npm install, npm run typecheck, npm test, then npx wrangler deploy --dry-run.

Cloudflare Workers AI supports model execution through an AI binding, D1 provides native serverless SQL, Shotstack provides ingest/edit APIs, and Pixazo documents the Flux 1 Schnell endpoint used here.
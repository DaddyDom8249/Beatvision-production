# BeatVision — Vercel Deployment Guide

> **Tagline:** Every Song Has a World. BeatVision Reveals It.

---

## Quick Reference — Vercel Project Settings

| Setting | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `.` (repository root) |
| **Install Command** | `pnpm install` |
| **Build Command** | `pnpm run build` |
| **Output Directory** | `dist` |

---

## Step-by-Step Deployment

### 1. Fork / push the repository to GitHub (or GitLab / Bitbucket)

```bash
git add .
git commit -m "ready for Vercel deployment"
git push
```

### 2. Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select your repo
3. Vercel will detect the framework as **Vite** automatically
4. Confirm the settings match the table above — change them if needed

### 3. Add Environment Variables

In Vercel → **Settings → Environment Variables**, add:

| Variable | Value / Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon/public key |
| `VITE_CREDIT_SAFE_MODE` | `true` — keeps all AI providers disabled until you're ready |
| `VITE_REAL_AI_PROVIDERS_ENABLED` | `false` — prevents real AI calls on first deploy |

> Arena and provider credentials belong in **Supabase Edge Function secrets** or the **Arena Worker secrets**, not in Vercel environment variables and never in frontend code:
> ```bash
> supabase secrets set ARENA_GATEWAY_URL=https://your-arena-worker.example.com
> supabase secrets set ARENA_GATEWAY_TOKEN=your-arena-token
> supabase secrets set BEATVISION_ALLOWED_ORIGINS=https://your-production-domain.example
> ```

### 4. Deploy

Click **Deploy**. Vercel will run:

```
pnpm install
pnpm run build   # → vite build → outputs to dist/
```

The `dist/` folder is served as the static site.

### 5. SPA Routing

BeatVision uses React Router with `BrowserRouter`. The `vercel.json` in the
repository root already configures the required catch-all rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This ensures deep links (`/project/abc`, `/dashboard`) load correctly.

---

## Local Development

```bash
# 1. Install dependencies (Node.js ≥ 20 required)
pnpm install

# 2. Copy env template and fill in your values
cp .env.example .env
# Edit .env — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start the dev server
pnpm run dev
# → http://localhost:5173 (also accessible on LAN)

# 4. Production build (same command Vercel runs)
pnpm run build
# → outputs to dist/

# 5. Preview the production build locally
pnpm run preview   # or: pnpm run start
# → http://localhost:4173
```

---

## Supabase Configuration

BeatVision uses Supabase for:
- **Auth** — user accounts and sessions
- **Database** — projects, scenes, images, video segments
- **Storage** — scene images, motion clips, render manifests, songs
- **Edge Functions** — AI provider calls (LLM, image gen, video gen)

### Apply database migrations

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Apply all migrations
supabase db push
```

### Deploy Edge Functions

```bash
# Deploy the functions present in this repository
supabase functions deploy beatvision-generate
supabase functions deploy beatvision-arena
```

### Set Edge Function secrets

Edge Function credentials are stored server-side — **not** in `.env`:

```bash
supabase secrets set ARENA_GATEWAY_URL=https://your-arena-worker.example.com
supabase secrets set ARENA_GATEWAY_TOKEN=your-arena-token
supabase secrets set BEATVISION_ALLOWED_ORIGINS=https://your-production-domain.example
```

---

## Environment Variables Reference

### Vercel Environment Variables (browser-safe)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | — | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | — | Supabase anon/public key |
| `VITE_CREDIT_SAFE_MODE` | ✅ | `true` | Disable all AI providers until explicitly enabled |
| `VITE_REAL_AI_PROVIDERS_ENABLED` | ✅ | `false` | Prevent real AI calls on first deploy |

### Supabase Edge Function Secrets (server-side only — never in Vercel or `.env`)

| Secret | Description |
|---|---|
| `ARENA_GATEWAY_URL` | Public URL of the deployed Arena Worker |
| `ARENA_GATEWAY_TOKEN` | Shared secret used by Edge Functions to authenticate to Arena |
| `BEATVISION_ALLOWED_ORIGINS` | Comma-separated browser origins allowed by the Edge Functions |

> ⚠️ **Arena and provider tokens must never be added as Vercel env vars or committed to Git.** Set them exclusively through Supabase secrets or Wrangler secrets.

---

## Important Notes

- **`miaodaDevPlugin`** is a Miaoda platform dev tool — it is not included in
  `vite.config.ts` and is not needed for Vercel builds.
- **Node.js ≥ 20** and **pnpm** are required.
- **Do not commit `.env`** — it is listed in `.gitignore`.
- The build does **not** call any paid AI providers — all AI features run at
  runtime via Supabase Edge Functions, triggered by the user.
- The app intentionally fails fast if `VITE_SUPABASE_URL` or
  `VITE_SUPABASE_ANON_KEY` are missing; do not deploy without both values.

### Deploy the Arena Worker

The production execution layer is `worker/src/arena-validated-entry.ts`.
Deploy it from the `worker` directory after configuring the required secrets:

```bash
cd worker
wrangler secret put GATEWAY_TOKEN
wrangler secret put PIXAZO_API_KEY
wrangler secret put SHOTSTACK_API_KEY
wrangler deploy
```

Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to the exact production browser
origin or comma-separated origins. The Worker fails closed for authenticated
provider operations when `GATEWAY_TOKEN` is absent and rejects disallowed CORS
preflight requests.

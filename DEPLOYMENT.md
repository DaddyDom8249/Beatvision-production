# BeatVision production deployment

## Required external secrets

Only these two provider secrets are required:

- PIXAZO_API_KEY
- SHOTSTACK_API_KEY

Set them with Wrangler secret commands. Do not put them in Git, the browser, HTML, JavaScript, D1 rows, or URLs. Cloudflare recommends Worker secrets for sensitive values. Shotstack uses x-api-key and Pixazo uses its subscription-key header.

## Cloudflare resources

1. Create a D1 database named beatvision.
2. Put its returned database ID in wrangler.jsonc.
3. Deploy the D1 schema.
4. Set the two provider secrets.
5. Deploy the Worker.

Example:

    npx wrangler d1 create beatvision
    npx wrangler d1 execute beatvision --remote --file=schema.sql
    npx wrangler secret put PIXAZO_API_KEY
    npx wrangler secret put SHOTSTACK_API_KEY
    npm run typecheck
    npm test
    npm run deploy

The ratelimit namespace IDs in wrangler.jsonc are account-local identifiers. Keep them unique in the Cloudflare account.

## Provider behavior

Pixazo image generation is server-side only.

Shotstack audio direct upload uses a short-lived signed upload URL returned by the server. The Shotstack API key is never sent to the browser. After upload, BeatVision polls the Shotstack ingest source until it is ready, then stores the provider source URL in D1 for rendering.

Shotstack render URLs are treated as provider outputs, not as permanent BeatVision storage.

## Release gate

A release is not considered production-ready until all of these pass in the deployed environment:

- GET /api/health
- account registration
- account login/logout
- project creation
- World Report generation
- required-field validation including song_summary
- world approval
- audio signed upload and ingest completion
- Pixazo image generation
- Shotstack render submission
- render status polling
- unauthorized project access rejection
- rate-limit behavior
- secret-leak scan
- mobile browser smoke test


## Production remediation

The current media pipeline requires the remote D1 schema migration in `migrations/0002-production-remediation.sql`.

Run this from a trusted machine with the Cloudflare account authenticated:

```bash
npx wrangler d1 execute beatvision --remote --file=./migrations/0002-production-remediation.sql
```

Then verify the schema:

```bash
npx wrangler d1 execute beatvision --remote --command="PRAGMA table_info(projects)"
npx wrangler d1 execute beatvision --remote --command="PRAGMA table_info(scenes)"
```

The Worker uses the documented Shotstack production API bases:

- Ingest: `https://api.shotstack.io/ingest/v1`
- Edit: `https://api.shotstack.io/edit/v1`

Shotstack ingest reports the uploaded audio duration, which BeatVision stores and uses to build the storyboard timeline. The renderer refuses to render until every generated scene has an image and the song audio is ready.

The only external provider secrets required by the Worker are:

- `PIXAZO_API_KEY`
- `SHOTSTACK_API_KEY`

No provider API key is required for the language engine because it uses the Cloudflare Workers AI binding.

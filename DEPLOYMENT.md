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


## Database migrations

The repository currently includes the canonical `schema.sql`. Cloudflare's D1 documentation supports applying schema SQL remotely with Wrangler, while versioned migrations should be used as the project grows. Do not reference removed legacy migrations in production runbooks.

For the current ground-zero deployment, apply the canonical schema once to the remote database before the first production workload:

    npx wrangler d1 execute beatvision --remote --file=./schema.sql

After the database is established, future schema changes should be added as numbered files under `migrations/` and applied in order. Cloudflare documents D1 migrations as versioned SQL files tracked in the repository.

## Current release gate

The repository CI verifies TypeScript, tests, and a Wrangler deployment dry-run. Cloudflare Workers Builds can automatically deploy the connected Git repository on pushes to the configured production branch. A real production release still requires the Cloudflare deployment and provider credentials to be present.

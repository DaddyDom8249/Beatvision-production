# Production readiness checklist

## Source verified

- [x] One Worker backend.
- [x] Workers AI language layer, no external LLM key.
- [x] D1 persistence.
- [x] Static SPA.
- [x] Pixazo is the only image provider secret.
- [x] Shotstack is the only video/media provider secret.
- [x] No Gemini/OpenAI/Supabase/Firebase/provider-gateway references in the current source tree.
- [x] World Report explicitly requires song_summary.
- [x] AI JSON is validated before persistence.
- [x] Project ownership is checked server-side.
- [x] Authentication is server-side with HttpOnly sessions.
- [x] PBKDF2 uses 600,000 HMAC-SHA-256 iterations.
- [x] Authentication and generation rate limits are configured.
- [x] Shotstack direct-upload signed URLs keep the API key server-side.
- [x] Provider failures are explicit errors.
- [x] Existing legacy implementation preserved on legacy-before-rebuild branch.

## Not honestly verified yet

- [ ] npm typecheck on a real runtime.
- [ ] Vitest execution on a real runtime.
- [ ] Cloudflare D1 provisioning.
- [ ] Cloudflare Worker deployment.
- [ ] Workers AI live response.
- [ ] Pixazo live response with the user's key.
- [ ] Shotstack live ingest/render with the user's key.
- [ ] Full mobile smoke test.
- [ ] Production custom domain and TLS.
- [ ] Observability/alerting configuration.
- [ ] Account recovery flow.

These are intentionally marked incomplete rather than being declared green because a Git repository cannot prove the behavior of infrastructure that has not been deployed.

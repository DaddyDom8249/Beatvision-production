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
- [x] PBKDF2 uses the Cloudflare-compatible 100,000 HMAC-SHA-256 iteration ceiling.
- [x] Authentication and generation rate limits are configured using Cloudflare Rate Limit bindings.
- [x] Shotstack direct-upload signed URLs keep the API key server-side.
- [x] Provider failures are explicit errors.
- [x] Existing legacy implementation preserved on legacy-before-rebuild branch.

## Known hardening completed in source\n\n- [x] JSON request bodies are size-limited by actual body bytes, not only Content-Length.\n- [x] Render submission creates a durable D1 record before calling Shotstack.\n- [x] Concurrent render requests are rejected per project.\n- [x] Failed render submission releases the project render lock.\n- [x] Expired sessions are cleaned up during session creation.\n- [x] Workers AI model uses the current FP8 Llama 3.1 8B identifier.\n\n## Not honestly verified yet

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

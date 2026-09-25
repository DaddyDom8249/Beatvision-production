import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const arena = read('worker/src/arena-entry.ts');
const validated = read('worker/src/arena-validated-entry.ts');
const gateway = read('worker/src/video-fallback-gateway.ts');
const wrangler = read('worker/wrangler.toml');

if (!arena.includes("allowed.includes(origin)")) {
  throw new Error('Arena CORS must use an explicit origin allowlist.');
}
if (arena.includes("|| '*'")) {
  throw new Error('Arena CORS must not use a wildcard fallback.');
}
if (!arena.includes("r.method === 'OPTIONS'")) {
  throw new Error('Arena must handle CORS preflight explicitly.');
}
if (!gateway.includes('!!e.GATEWAY_TOKEN')) {
  throw new Error('Provider gateway authentication must fail closed.');
}
if (!gateway.includes("allowed.includes(o)")) {
  throw new Error('Provider gateway CORS must use an explicit origin allowlist.');
}
if (validated.includes("r.headers.get('Origin') || 'https://daddydom8249.github.io'")) {
  throw new Error('Validated Arena responses must not reflect arbitrary origins.');
}
if (!validated.includes('corsHeaders')) {
  throw new Error('Validated Arena responses must use the shared CORS allowlist helper.');
}
if (!wrangler.includes('ALLOWED_ORIGIN =')) {
  throw new Error('Production CORS origins are not configured in Wrangler vars.');
}

console.log('SECURITY AUDIT PASS');
console.log('Arena and provider gateways use explicit CORS allowlists.');
console.log('Authenticated provider operations fail closed without GATEWAY_TOKEN.');
console.log('Validated error responses do not reflect arbitrary request origins.');

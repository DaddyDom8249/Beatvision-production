import arena from './arena-entry';
import providerGateway from './video-fallback-gateway';
import { BeatVisionAnimationJob } from './animation-jobs';
export { BeatVisionAnimationJob } from './animation-jobs';
import { validateStoryboard } from './storyboard-validator';
import { timelineGuardian, validateMediaRecord } from './skills';
import { detectVisualReuse } from './visual-reuse-detector';

const corsHeaders = (r: Request, env: any): Record<string, string> => {
  const origin = r.headers.get('Origin') || '';
  const allowed = String(env.BEATVISION_ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-BeatVision-Contract,Authorization,X-BeatVision-Request',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

const json = (r: Request, env: any, data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders(r, env),
  }
});

export default {
  async fetch(r: Request, env: any, ctx: ExecutionContext) {
    if (r.method === 'OPTIONS') return arena.fetch(r, env, ctx);
    const token = String(env.GATEWAY_TOKEN || '').trim();
    const path = new URL(r.url).pathname;

    if (path === '/health') {
      return json(r, env, {
        ok: true,
        service: 'beatvision-provider-arena',
        entrypoint: 'arena-validated-entry',
        contract_version: '1.1',
        configuration: {
          gateway_token: Boolean(token),
          pixazo_api_key: Boolean(String(env.PIXAZO_API_KEY || '').trim()),
          language_provider_token: Boolean(String(env.LANGUAGE_PROVIDER_TOKEN || '').trim()),
          shotstack_api_key: Boolean(String(env.SHOTSTACK_API_KEY || '').trim()),
        },
      });
    }

    if (path !== '/' && !token) {
      return json(r, env, { ok: false, error: 'Gateway authentication is not configured; refusing provider operation.' }, 503);
    }
    if (path !== '/' && path !== '/health' && r.headers.get('Authorization') !== `Bearer ${token}`) {
      return json(r, env, { ok: false, error: 'Unauthorized' }, 401);
    }

    // Persistent animation status is a GET with no JSON body. Route the job
    // endpoint before the generic POST/body validation in arena-entry so the
    // poll request cannot be rejected as an empty/invalid JSON request.
    if (path.startsWith('/v1/video/animate/jobs/')) {
      return providerGateway.fetch(r, env);
    }

    if (r.method === 'POST') {
      let body: any = null;
      try { body = await r.clone().json(); } catch { return json(r, env, { ok: false, error: 'Invalid JSON body.' }, 400); }
      const operation = String(body?.operation || '');
      const payload = body?.payload || {};
      const storyboard = payload?.storyboard;
      if (storyboard && ['sceneImages', 'assemble'].includes(operation)) {
        const target = Number(payload?.song_duration_seconds ?? payload?.songDuration ?? storyboard?.songDuration ?? storyboard?.song_duration ?? 0);
        const partial = operation === 'sceneImages';
        const validation = validateStoryboard(storyboard, target > 0 ? target : undefined, partial);
        const timeline = timelineGuardian(storyboard, partial ? undefined : (target > 0 ? target : undefined));
        const timelineIssues = partial ? [] : timeline.issues.map((message: string) => ({ code: 'TIMELINE_GUARDIAN', severity: 'error' as const, message }));
        const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : Array.isArray(storyboard?.visual_beats) ? storyboard.visual_beats : [];
        const reuseIssues = partial ? [] : detectVisualReuse(scenes)
          .filter(finding => !finding.intentional && finding.reason === 'semantic_similarity')
          .map(finding => ({
            code: 'VISUAL_REUSE',
            severity: 'error' as const,
            message: `Unapproved semantic visual reuse: ${finding.shot_id} resembles ${finding.compared_to} (${finding.score}).`
          }));
        const issues = [...validation.issues, ...timelineIssues, ...reuseIssues];
        if (issues.some(issue => issue.severity === 'error')) {
          return json(r, env, { ok: false, contract_version: body?.contract_version || '1.1', status: 'storyboard_integrity_rejected', error: 'Storyboard failed deterministic integrity validation.', issues }, 422);
        }
      }

      const mediaRecords = Array.isArray(payload?.media_records) ? payload.media_records : [];
      if (mediaRecords.length) {
        const mediaIssues = mediaRecords.flatMap((media: any, index: number) => {
          const result = validateMediaRecord(media);
          return result.errors.map((message: string) => ({ code: 'MEDIA_INTEGRITY', severity: 'error' as const, scene: index + 1, message }));
        });
        if (mediaIssues.length) {
          return json(r, env, { ok: false, contract_version: body?.contract_version || '1.1', status: 'media_integrity_rejected', error: 'Media records failed provenance validation.', issues: mediaIssues }, 422);
        }
      }
    }

    return arena.fetch(r, env, ctx);
  }
};

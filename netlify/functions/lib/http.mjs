// -------- cors allowlist --------
// Reflect the caller Origin only when it matches the deployed site URL (prod +
// branch/deploy previews) or localhost for dev; otherwise omit the header. We
// never emit Access-Control-Allow-Credentials, so a missing ACAO simply blocks
// the cross-origin read rather than leaking it.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const siteOrigins = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].filter(Boolean);
  if (siteOrigins.includes(origin)) return true;
  return /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function corsResponse(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function jsonResponse(body, origin, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: Object.assign(corsHeaders(origin), extraHeaders),
  });
}

export function errorResponse(message, status, origin) {
  return jsonResponse({ error: message }, origin, status);
}

export async function readJson(request, maxBytes = 1_048_576) {
  // Reject oversized bodies before parsing so a large/deeply-nested payload can't
  // spike memory. Netlify caps requests ~6MB; this is a tighter per-call guard.
  const len = Number(request.headers.get('content-length') || 0);
  if (len && len > maxBytes) return null;
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

export function sameOriginWriteGuard(request) {
  const reqOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin) return origin === reqOrigin;
  // No Origin header: fail closed, but accept a same-origin Referer as a fallback
  // (some same-origin browser requests omit Origin) and allow localhost for dev
  // tooling / server-to-server calls that send neither.
  const referer = request.headers.get('referer');
  if (referer) {
    try { return new URL(referer).origin === reqOrigin; } catch (_) { return false; }
  }
  return /^http:\/\/localhost(:\d+)?$/.test(reqOrigin);
}

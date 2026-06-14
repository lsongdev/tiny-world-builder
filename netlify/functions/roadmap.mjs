import { getSql, isDatabaseUnavailable, isMissingRelation } from './lib/db.mjs';
import { corsResponse, errorResponse, jsonResponse, readJson } from './lib/http.mjs';

export const config = { path: '/api/roadmap' };

// Hardcoded fallback — shown when the DB is unavailable or the table doesn't exist yet.
const FALLBACK_MILESTONES = [
  { id: 1, status: 'done',    title: 'Tinyverse',           description: 'Buy, manage, and publish worlds on-chain. Explore as an avatar, harvest resources, and meet other players.', sort_order: 10 },
  { id: 2, status: 'done',    title: 'Flight sim',           description: 'Place the stunt-plane stamp, click to board, and fly your world from a rear chase-cam.', sort_order: 20 },
  { id: 3, status: 'done',    title: 'Mesh terrain sculptor',description: 'Paint per-voxel materials and push/pull flat-topped blocks to shape cliffs, rivers, and landscapes.', sort_order: 30 },
  { id: 4, status: 'done',    title: '3D model import',      description: 'Drag-drop GLB, FBX, OBJ, MagicaVoxel VOX, and VDB frame-sequence files directly into the scene.', sort_order: 40 },
  { id: 5, status: 'done',    title: 'Multiplayer rooms',    description: 'Join a world room via PartyKit. See other players as sprites and chat in real time.', sort_order: 50 },
  { id: 6, status: 'done',    title: 'Performance pass',     description: 'Shadow cadence at 30 Hz, scoped frustum culling, and static engine batching cut draw calls by 42%.', sort_order: 60 },
  { id: 7, status: 'active',  title: 'Battleworlds',         description: 'PvP arena mode built on top of the Tinyverse infrastructure.', sort_order: 70 },
  { id: 8, status: 'active',  title: 'Mesh bake',            description: 'Merge static ground tiles into region draw calls for a further 70% reduction in render overhead.', sort_order: 80 },
  { id: 9, status: 'active',  title: 'Day / night cycle',    description: 'Wire atmosphere time-progression to a UI scrubber and real-time sky colour transitions.', sort_order: 90 },
  { id: 10, status: 'planned', title: 'Pets',                description: 'Companion animals that follow your avatar and can be customised via the open-pets provider system.', sort_order: 100 },
  { id: 11, status: 'planned', title: 'World marketplace',   description: 'Browse, buy, and remix worlds created by the community directly from the tinyverse map.', sort_order: 110 },
  { id: 12, status: 'planned', title: 'Mobile',              description: 'Touch-first controls and a responsive layout so worlds can be built on any device.', sort_order: 120 },
];

function envValue(name) {
  try {
    if (globalThis.Netlify && Netlify.env && typeof Netlify.env.get === 'function') {
      const value = Netlify.env.get(name);
      if (value) return value;
    }
  } catch (_) {}
  return process.env[name] || '';
}

function isAdmin(request) {
  // Admin actions are LOCAL-DEV ONLY. Never grant admin on a non-local host —
  // this keeps the admin toolbar off production for every client, including
  // cached browsers that still hold a stored secret.
  try {
    const host = (request.headers.get('host') || '').toLowerCase();
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  } catch (_) { return false; }
  const secret = envValue('TINYWORLD_ADMIN_SECRET');
  if (!secret) return false;
  const provided = request.headers.get('x-admin-secret') || '';
  return provided === secret;
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS roadmap_milestones (
      id           SERIAL PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('done','active','planned')),
      title        TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      sort_order   INT  NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function seedTable(sql) {
  const existing = await sql`SELECT COUNT(*)::int AS n FROM roadmap_milestones`;
  if (Number(existing[0].n) > 0) return;
  for (const m of FALLBACK_MILESTONES) {
    await sql`
      INSERT INTO roadmap_milestones (id, status, title, description, sort_order)
      VALUES (${m.id}, ${m.status}, ${m.title}, ${m.description}, ${m.sort_order})
      ON CONFLICT DO NOTHING
    `;
  }
  await sql`SELECT setval('roadmap_milestones_id_seq', (SELECT MAX(id) FROM roadmap_milestones))`;
}

function milestoneDto(row) {
  return {
    id:          row.id,
    status:      row.status,
    title:       row.title,
    description: row.description,
    sort_order:  row.sort_order,
  };
}

export default async function roadmapFunction(request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return corsResponse(origin);

  // ---- GET — public ----
  if (request.method === 'GET') {
    try {
      const sql = getSql();
      await ensureTable(sql);
      await seedTable(sql);
      const rows = await sql`SELECT * FROM roadmap_milestones ORDER BY sort_order ASC, id ASC LIMIT 500`;
      return jsonResponse({ milestones: rows.map(milestoneDto), source: 'db', admin: isAdmin(request) }, origin);
    } catch (err) {
      if (isDatabaseUnavailable(err) || isMissingRelation(err, 'roadmap_milestones')) {
        return jsonResponse({ milestones: FALLBACK_MILESTONES, source: 'fallback' }, origin);
      }
      console.error('[roadmap] GET error:', err);
      return jsonResponse({ milestones: FALLBACK_MILESTONES, source: 'fallback' }, origin);
    }
  }

  // ---- writes require admin ----
  if (!isAdmin(request)) return errorResponse('Forbidden', 403, origin);

  // ---- POST — create ----
  if (request.method === 'POST') {
    const body = await readJson(request);
    const title = String(body && body.title || '').slice(0, 200).trim();
    const description = String(body && body.description || '').slice(0, 1000).trim();
    const status = ['done', 'active', 'planned'].includes(body && body.status) ? body.status : 'planned';
    const sort_order = Number.isFinite(Number(body && body.sort_order)) ? Math.round(Number(body.sort_order)) : 0;
    if (!title) return errorResponse('title is required', 400, origin);
    try {
      const sql = getSql();
      await ensureTable(sql);
      const rows = await sql`
        INSERT INTO roadmap_milestones (status, title, description, sort_order)
        VALUES (${status}, ${title}, ${description}, ${sort_order})
        RETURNING *
      `;
      return jsonResponse({ milestone: milestoneDto(rows[0]) }, origin, 201);
    } catch (err) {
      console.error('[roadmap] POST error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  // ---- PATCH — update ----
  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get('id'));
    if (!id) return errorResponse('id is required', 400, origin);
    const body = await readJson(request);
    const updates = {};
    if (body && body.title != null) updates.title = String(body.title).slice(0, 200).trim();
    if (body && body.description != null) updates.description = String(body.description).slice(0, 1000).trim();
    if (body && body.status != null && ['done', 'active', 'planned'].includes(body.status)) updates.status = body.status;
    if (body && body.sort_order != null && Number.isFinite(Number(body.sort_order))) updates.sort_order = Math.round(Number(body.sort_order));
    if (!Object.keys(updates).length) return errorResponse('No fields to update', 400, origin);
    try {
      const sql = getSql();
      const rows = await sql`
        UPDATE roadmap_milestones
        SET
          title       = COALESCE(${updates.title ?? null}, title),
          description = COALESCE(${updates.description ?? null}, description),
          status      = COALESCE(${updates.status ?? null}, status),
          sort_order  = COALESCE(${updates.sort_order ?? null}, sort_order),
          updated_at  = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return errorResponse('Not found', 404, origin);
      return jsonResponse({ milestone: milestoneDto(rows[0]) }, origin);
    } catch (err) {
      console.error('[roadmap] PATCH error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  // ---- DELETE ----
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get('id'));
    if (!id) return errorResponse('id is required', 400, origin);
    try {
      const sql = getSql();
      await sql`DELETE FROM roadmap_milestones WHERE id = ${id}`;
      return jsonResponse({ ok: true }, origin);
    } catch (err) {
      console.error('[roadmap] DELETE error:', err);
      return errorResponse('Database error', 500, origin);
    }
  }

  return errorResponse('Method not allowed', 405, origin);
}

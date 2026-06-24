import { requireAuthUser } from './lib/auth.mjs';
import { ensureProfile } from './lib/profiles.mjs';
import { getSql, isDatabaseUnavailable, isMissingRelations } from './lib/db.mjs';
import { corsResponse, errorResponse, jsonResponse, readJson, sameOriginWriteGuard } from './lib/http.mjs';
import { reduceGoldLedger, spendGold, currentCycleId } from '../../packages/tinyworld-mmo-core/src/index.js';

export const config = { path: '/api/me/gold/spend' };

// E3 — the single server-authoritative GOLD debit path.
// Spendable GOLD = ledger-derived `available` for the CURRENT cycle
// (ALLOWANCE_RECALCULATED − GOLD_SPENT + GOLD_REFUNDED), NEVER a live wallet-balance
// projection. Concurrency-safe via a per-wallet advisory lock inside a transaction;
// idempotent via a client key stored in reference_id (+ the uq_gold_spent_wallet_ref
// partial unique index). See plans/production-line/specs/E3-gold-spend.md.
//
// HELD behind the economy launch gate. Consumed by template-remix, paid-AI, etc.

const MAX_SPEND_PER_REQUEST = 1_000_000;
const ACTION_ALLOWLIST = new Set([
  'template-remix', 'upgrade', 'cosmetic', 'speedup', 'ai-generation', 'misc',
]);
const isMissingSchema = (err) => isMissingRelations(err, ['gold_ledger_events']);

function badRequest(reason, origin, status = 400) {
  return jsonResponse({ ok: false, reason }, origin, status);
}

export default async function goldSpend(request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return corsResponse(origin);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, origin);
  if (!sameOriginWriteGuard(request)) return errorResponse('Forbidden', 403, origin);

  const auth = await requireAuthUser(request, origin);
  if (auth.response) return auth.response;

  let body;
  try { body = await readJson(request); } catch (_) { return badRequest('invalid-json', origin); }
  body = body || {};

  // Validate the spend request. The wallet is ALWAYS derived from auth, never the body.
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_SPEND_PER_REQUEST) {
    return badRequest('invalid-amount', origin);
  }
  const action = String(body.action || '').trim();
  if (!ACTION_ALLOWLIST.has(action)) return badRequest('action-not-allowed', origin);
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return badRequest('invalid-idempotency-key', origin);
  const domainRef = body.referenceId == null ? '' : String(body.referenceId).slice(0, 120);
  const reason = domainRef ? `${action} ${domainRef}` : action;

  try {
    const sql = getSql();
    const profile = await ensureProfile(auth.user);
    const wallet = 'profile:' + profile.id;
    const cycleId = currentCycleId(new Date());

    const result = await sql.begin(async (tx) => {
      // Serialize all spends for THIS wallet so two concurrent requests cannot both
      // read the same `available` and overspend. Released at COMMIT/ROLLBACK.
      await tx`SELECT pg_advisory_xact_lock(hashtext(${wallet})::bigint)`;

      // Idempotent replay: a prior spend with the same key returns the same outcome.
      const prior = await tx`
        SELECT amount FROM gold_ledger_events
        WHERE wallet = ${wallet} AND type = 'GOLD_SPENT' AND reference_id = ${idempotencyKey}
        LIMIT 1
      `;
      if (prior.length) {
        const events = await tx`
          SELECT type, wallet, cycle_id AS "cycleId", amount FROM gold_ledger_events
          WHERE wallet = ${wallet} AND cycle_id = ${cycleId}
        `;
        const summary = reduceGoldLedger(events, { wallet, cycleId });
        return { ok: true, replayed: true, spent: Number(prior[0].amount), available: summary.available, cycleId };
      }

      // Compute authoritative available from the ledger and attempt the spend.
      const events = await tx`
        SELECT type, wallet, cycle_id AS "cycleId", amount FROM gold_ledger_events
        WHERE wallet = ${wallet} AND cycle_id = ${cycleId}
      `;
      const summary = reduceGoldLedger(events, { wallet, cycleId });
      const spend = spendGold(summary, amount, { wallet, action: reason, referenceId: idempotencyKey });
      if (!spend.ok) return { ok: false, reason: spend.reason, available: summary.available, cycleId };

      const inserted = await tx`
        INSERT INTO gold_ledger_events (wallet, cycle_id, type, amount, reason, reference_id)
        VALUES (${wallet}, ${cycleId}, 'GOLD_SPENT', ${amount}, ${reason}, ${idempotencyKey})
        ON CONFLICT (wallet, reference_id) WHERE type = 'GOLD_SPENT' AND reference_id IS NOT NULL
        DO NOTHING
        RETURNING id
      `;
      // If the conflict path hit (lost an idempotency race despite the lock), treat as replay.
      const eventId = inserted.length ? inserted[0].id : null;
      return { ok: true, replayed: !eventId, spent: amount, available: spend.available, cycleId, eventId };
    });

    if (!result.ok) {
      const status = result.reason === 'insufficient-gold' ? 402 : 400;
      return jsonResponse(result, origin, status);
    }
    return jsonResponse(result, origin);
  } catch (err) {
    if (isDatabaseUnavailable(err) || isMissingSchema(err)) {
      return errorResponse('gold-spend-unavailable: schema or DB not ready', 503, origin);
    }
    return errorResponse('gold-spend-failed: ' + (err.message || err), 500, origin);
  }
}

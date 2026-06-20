import { requireAuthUser } from "./lib/auth.mjs";
import { getSql } from "./lib/db.mjs";
import { corsResponse, errorResponse, jsonResponse } from "./lib/http.mjs";
import { calculateGoldAllowance, DEFAULT_ECONOMY_POLICY } from "../../packages/tinyworld-mmo-core/src/index.js";

export const config = { path: "/api/me/gold" };

export default async function meGold(request) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return corsResponse(origin);
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, origin);

  try {
    const user = await requireAuthUser(request);
    if (!user) return errorResponse("Unauthorized", 401, origin);

    const sql = getSql();

    // Real-ish inputs (wallet balance would come from wallet.mjs patterns)
    // For now use stored profile + owned islands count as demo of package integration
    let tinyworldHeld = 0n;
    let islandCount = 0;

    try {
      // Best effort: read from existing wallet or profile data if present
      const wallets = await sql`SELECT public_key FROM wallet_accounts WHERE profile_id = ${user.profile.id} LIMIT 5`;
      // In full impl we would RPC balance here. For working today we use 0 + island ownership.
    } catch (e) {}

    try {
      const owned = await sql`SELECT COUNT(*)::int as cnt FROM worlds WHERE owner_profile_id = ${user.profile.id} AND status = published`;
      islandCount = owned[0] ? owned[0].cnt || 0 : 0;
    } catch (e) {}

    const allowance = calculateGoldAllowance({
      tinyworldHeld: tinyworldHeld.toString(),
      islandCount,
      spentThisCycle: 0,
      now: new Date(),
    }, DEFAULT_ECONOMY_POLICY);

    return jsonResponse({
      ...allowance,
      note: "MVP: uses mmo-core package. Full wallet $TINYWORLD balance + ledger coming in next burst.",
    }, origin);
  } catch (err) {
    return errorResponse("gold-calc-failed: " + (err.message || err), 500, origin);
  }
}

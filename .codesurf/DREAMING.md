# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-15

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor on Three.js r128. Shell lives in `tiny-world-builder.html` (~1.4k lines); logic is split across approximately **63 modules** under `engine/world/` (numbered 00–59 + 99, with `09b` and two `46-` files). Styles in `styles/tiny-world.css` (~5.2k lines). Deployed via Vercel and Netlify from `dist/` via `./publish.sh`. Port 8888 is the Netlify dev server; must be running with local `tinyworld` Postgres before any Worlds MMO features can be browser-tested.

A separate **landing/marketing page** (`index.html`) is also in the repo with its own build/publish pipeline — distinct from `tiny-world-builder.html`.

---

## Durable Facts

**Architecture**
- Shell: `tiny-world-builder.html` — HTML, boot config, ordered `<script src>` tags only
- Engine modules: ~63 `.js` files sharing one global scope + `flight-combat-math.mjs` (ES module companion to `34-flight-sim.js`); classic scripts, not ES modules
- Non-sequential extras: `09b-voxel-build-factories.js` (between 09 and 10); two files share the `46-` prefix (`46-mesh-terrain.js`, `46-worlds-universe.js`) — load order between them not formally documented
- Skybound additions (modules 53–59) added after the core 00–52 inventory; `99-late-boot.js` is the final late-init module
- Duplicate top-level identifiers silently kill the declaring module without affecting others; prefix module-local scratch globals (e.g. `_fl…` for flight)
- Three.js pinned to r128; MeshLambertMaterial, ExtrudeGeometry, and shadow setup assume r128 semantics — do not bump
- Materials in `M.*` are shared across meshes — clone before mutating color; `disposeGroup` disposes geometries but NOT materials
- `setCell(x, z, opts)` is the only sanctioned way to mutate world state; never write `world[x][z]` directly outside of init
- No bundler, no npm runtime dependencies; `npm test` for static checks, `./publish.sh` for dist
- Edits auto-commit to main and Netlify prod deploys immediately — branches do not guarantee isolation

**Skill directories**
- `.codex/skills/` — 23 skill files for core engine systems (tinyworld-single-file, tinyworld-render-performance, tinyworld-flight-sim, etc.)
- `.agents/skills/` — 5 additional skills: `3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`
- AGENTS.md lists only `.codex/skills/` routing; `.agents/skills/` entries are not yet referenced there

**Module reference — modules 34–52**
- `34-flight-sim.js` — flyable plane via `stunt-plane` model-stamp; click-to-Enter/Fly, rear chase-cam, Escape exits; `flight-combat-math.mjs` is its ES module companion; static body parts merged into single BufferGeometry via `threeStdlib.mergeGeometries`; only engine node keeps `frustumCulled=false`
- `38-multiplayer-partykit.js` — multiplayer via PartyKit
- `39-atmosphere-effects.js` — atmosphere/day-night effects; time-progression not wired to any UI control
- `40-shield-system.js` — VoxelShield materials are Lambert; per-mesh glow material clones are explicitly disposed on teardown
- `41-flight-combat.js` — missiles/projectiles fully implemented; player hit detection stub removed 2026-06-12 (empty `if (hit) {}` block remains — health/damage not implemented); altitude ceiling enforcement removed 2026-06-12
- `42-account-wallet-players.js` — JWT/cloud-save; subscription system fully removed 2026-05-31
- `43-drag-drop-import.js` — GLB/FBX/OBJ/VOX/VDB drag-drop pipeline
- `44-sub-object-edit.js` — part-level selection, hover hulls, transform delegation
- `45-shader-fx.js` — `window.TinyShaderFX`; GLSL effects via `onBeforeCompile`
- `46-mesh-terrain.js` — opt-in voxel-block landscape sculptor; persists under `tinyworld:meshTerrain:*`; no `setCell` bake
- `46-worlds-universe.js` — Worlds MMO universe map, world buying (USDC), management/publish; dispatches `tinyworld:worlds-ready` and exposes `window.__tinyworldWorldsReady` promise
- `47-worlds-room.js` — Worlds MMO room client (PartyKit `world-<slug>`); sprite system uses `Without_shadow` sheets; exposes `WS.enterRoom/leaveRoom/harvest/setAvatarClass`; `createAvatar` routes through `window.makeVoxelAvatar` for self + peers + bots
- `48-worlds-harvest-hud.js` — Worlds MMO in-world HUD (hearts, resources, harvest actions, cooldowns, reward popups); SVG glyphs only
- `49-worlds-avatar-picker.js` — avatar picker gallery; drives `WS.setAvatarClass`; extensible via `WS.registerAvatarProvider`
- `50-worlds-play-chat.js` — play-mode chat panel; wires to `47` events; reuses `mp-chat-*` CSS classes + `tw-play-chat-*` glassmorphism overrides; IIFE-wrapped
- `51-worlds-bots.js` — localhost-only bot simulation; 3 deterministic bots via seeded LCG PRNG; **localhost/127.0.0.1 only — never runs in production**
- `52-worlds-demo-seed.js` — localhost-only demo resource seeder; **localhost/127.0.0.1 only — never runs in production**
- `99-late-boot.js` — late boot finalization; `?meshbake=1` URL param activates early-prototype terrain bake; `window.runTerrainBake` exposed for console/settings invocation

**Skybound modules (53–59)**
- `53-voxel-avatar.js` — `window.makeVoxelAvatar`; replaces 2.5D sprite "stripes" for self + peers + bots; FK rig with named limb groups (`armL_sh`/`armR_sh`, `armL_elbow`/`armR_elbow`, `legL_hip`/`legR_hip`, `legL_knee`/`legR_knee`, chest, `head`); material MUST be `side:THREE.DoubleSide` (voxGeo winding inconsistent); `AVATAR_HEIGHT=0.5`
- `54-fly-down.js` — fly-down mechanic (key `j`); `window.__tinyworldFlyDown.{descend,ascend,toggle,isDown}`; eases camera to planet underlay; sets `window.__flyDownActive`; calls `window.__setPlanetLandscapeNearView(true/false)`; shows/hides home-island proxy (~4 draws) and force-hides the full board via `window.__hideHomeLayer`
- `55-stargate.js` — stargate object (key `G`); `window.__tinyworldStargate`; styles: nested/voyager/portal/rings; `nested` = voxel stone casing + recessed ring + white energy centre, sunk at ground level
- `56-gate-transit.js` — gate transit mechanic (key `h`); `window.__tinyworldGateTransit.{placeGate,enter,isOnSurface}`; `placeLobbyGates()` scatters 3 paired gates on enter; auto-travel loop every ~4–8s; CYBERGATE sign (`buildSign`) + maintenance climb rig + `climb-ladder` marker live on the lobby screen (58)
- `57-poser-surface.js` — `window.__tinyworldPoserSurface.{show,hide,build}`; VERBATIM lift of voxel-poser.html's SATS/ISLE/groundH geometry + banded water shader + foam ribbons; scaled (SCALE 1.6 / Y_BOOST 9) at y=−60 under home board; fly-down (54) shows/hides on descend/ascend; sea animates on its own rAF; **do NOT reimplement — extract verbatim per feedback-extract-dont-reinvent**; perf fix committed (5160cc8): G 0.2→0.4, sea plane 80x80→8x8
- `58-lobby-presentation.js` — `window.__tinyworldLobby`; framed in-world screen at `z = -(GRID/2)-1`; 6×3.375 canvas-rendered slide deck (MeshBasicMaterial, unlit); built/shown on `WS.on('enter')`, hidden on `'leave'`; `[`/`]` keys + DOM bar for Prev/Next; multiplayer slide sync via `WS.present(idx)` → PartyKit `present` handler → broadcast to all admitted → `applySlide` (no echo loop — apply is local-only)
- `59-gate-travel-fx.js` — 5-stage gate-travel visual effect: magnetic pull → particle dissolve-in → portal flash → back-extrude → receiving edge-light+flash+emerge; THREE.Points (one draw call each); companion to `56-gate-transit.js`; particles read subtle at gameplay scale — tuning lever: bigger gates / particle size

**Skybound roadmap lives at `plans/ROADMAP-skybound.md`; Phase 1 shipped local-only.**

**Flooded planet (distant backdrop)**: LandscapeEngine flood config at `27-landscape-engine.js ~562`: `{waterLevel:150, heightScale:0.45, freqScale:6}` ≈ 13% land. Levers: waterLevel ↑ = less land; freqScale ↑ = smaller/more islands.

**Descended view (ground-up)**: reframed to low near-sea vantage gazing up (DESCEND_POLAR 1.5, VIEW_SIZE 26, toTargetY −drop×0.5). Home board is force-hidden via `window.__hideHomeLayer` (orbit-centred, never frustum-culls; descended draws ~1610→49 with proxy). Note: skybound-systems memory references `58-island-proxy.js` but filesystem shows `58-lobby-presentation.js` — proxy logic is likely inline in `54-fly-down.js` or `57-poser-surface.js`; verify before descended-view work.

**LandscapeEngine**
- `LandscapeEngine.js` is superseded monolith; `getHeight`/chunk-building live in `engine/landscape/*.js` mixins — edit the mixins, not the monolith
- Constructor stays live (hence `VOXEL:true` but old method body)

**Worlds MMO namespace**
- `window.__tinyworldWorlds` (alias `WS`) shared across all Worlds modules; all IIFE-wrapped — no top-level globals leak
- `/api/worlds` lives at `netlify/functions/worlds.mjs`
- Worlds gameplay runs on PartyKit room server (separate from Netlify); Netlify-only deploy does NOT update room behavior — use `partykit deploy` for server changes
- `party/index.js` now has: (1) `present` handler for slide sync (rate-limited, clamped 0–999, broadcast to all admitted); (2) `grassCells` included in `world.state` snapshot (bots/joiners know standable cells); water removed from `rebuildBlocked`; lava + stone still blocked

**30-ui-boot-wiring.js**
- 3,434 lines — NOT a thin delegation file; contains full cloud sync logic (`twCloudAccessToken`, `twCloudApiCall`, `twCloudSyncLocalWorldsToCloud`, `twCloudBootstrapSync`, etc.)
- Key welcome-dialog functions: `initWelcomeDialog`, `openTinyverse` (async, waits for `window.__tinyworldWorlds.open`), `openBattleworlds` (sync stub, falls back to `chooseWelcomeMode('play')` if `window.__tinyworldBattleworlds.open` absent)
- `waitForWorldsFrontend()` polls every 50 ms for up to 2 s; also listens to `tinyworld:worlds-ready` event and `window.__tinyworldWorldsReady` promise as dual signals

**Avatar animations**
- Voxel avatar states: `walk` (poser strideCore natural gait, NOT robotic — pow-1.3 chest bob, lateral sway, forward lean, 2× head bob, counter-arm swing, planar law-of-cosines IK `legIK`), `jump`, `crouch`, `sit` (POSES.Sit — direct angles, NOT legIK), `climb` (face rungs: `setHeading(0)`), `attack` (3 cycling sword swings), `blink`
- Walk GOTCHA (cost hours twice): rig hinge convention is **+hip.rotation.x → foot −z**; wrong fore/aft sign = MOONWALK. Verify via foot-trajectory measurement on ONE foot while planted; do not average — alternating feet corrupt per-frame deltas
- Adding a state requires whitelisting it in `setState` or it silently collapses to idle
- Drive (in `47-worlds-room.js`, local-self only, gated `ent===selfEnt`): c=crouch-hold, x=sit-toggle, W-into-`climb-ladder`=climb (up/down W/S), f=attack, j=fly-down; heading from `setHeadingFromDelta(dxw,dzw)`
- Water is WALKABLE (deliberate, confirmed): `rebuildBlocked` and server `setWorldStateFromData` both exclude water; do NOT revert to grass-only
- Gate travel: walk avatar onto lobby-gate cell → `47` `tryEnterGate()` → `56.travelPlayer(cell, selfEnt.voxel, onArrive)` → dissolve→emerge at paired gate; `animVoxel` cedes during `_traveling`
- Peer-sync of crouch/sit/climb deferred — `move` carries only x,z

**AI bots (`tools/ai-bots.mjs`)**
- Run: `npm run bots:ai -- --slug <world> --bots 3 --mode both`
- Spawns LLM-driven play peers over same WS protocol as humans; verified: 3 bots joined role=play, made ~24 grass-validated moves each, generated in-persona haiku, reacted to each other's chat
- Default brain: Anthropic Messages API with `claude-haiku-4-5`; `--provider openai --model gpt-5-mini` branch built-in; `ANTHROPIC_API_KEY` from `.env`
- `--mode ambient|react|both` toggles ambient chatter vs replies-to-nearby-chat; per-bot 12s cooldown + probability gate
- Requires openMode (`WORLDS_JOIN_SECRET=` empty) — otherwise bots drop to observe
- Canned `51-worlds-bots.js` still auto-spawns on localhost alongside LLM bots — retirement deferred

**Internationalization (i18n)**
- 4 locales: English (`en`), French (`fr`), Simplified Chinese (`zh`), Spanish (`es`)
- Locale data ships as IIFE JS files under `engine/i18n/`; `en.js` is authoritative key source; `engine/i18n/i18n-core.js` provides `t(key, params)` global, `TWI18N.setLocale(code)` (persist + reload), `TWI18N.apply(root)` translates `data-i18n*` attributes
- Language switching is reload-on-switch; home grid survives via `tinyworld:v1` autosave
- `tools/i18n-check.js` key parity checker runs inside `npm run check` / `publish.sh`

---

## Performance Findings (Committed)

- Frame is **render-bound not logic-bound** — `render.direct` ≈65ms/frame dominates, JS ticks <0.2ms; measure via `?perf=1&stats=1` + `renderer.info.render.calls/.triangles`; headless Chromium is SwiftShader (fill-rate-bound, ~10–17fps) — not representative; trust structural draw-call/transparent-count metrics
- **Shipped 2026-06-03**: merged engine static body + scoped frustum culling → draw calls 2880→1673 (−42%), frustum-cull-disabled 1360→61
- **Shipped 2026-06-09/10**: shadow map 30Hz cadence (`shadowMap.autoUpdate=false`); VoxelShield flicker via intensity only — toggling `.visible` per-frame causes r128 shader recompile cascade (progs 27→260 measured); Shield materials Standard→Lambert; fog in-place; waterFoam opaque; ghost-board cells skip surface-detail instancing
- **Shipped (commit 5160cc8)**: poser planet surface G 0.2→0.4, sea plane 80x80→8x8 → descended tris 673k→407k, render 66.8ms→19.9ms; lesson: close-up tool mesh at native tessellation is over-detailed at world scale — always coarsen
- **Shipped (commit f11350f)**: cloud-sea veil fix — `cloudSeaMesh.visible` gates on opacity>0.003 so `frustumCulled=false` transparent mesh stops drawing at opacity 0
- **Remaining unshipped lever**: per-region terrain mesh bake. Measured: 144-cell world 399→117 draws (−70%). KEY BLOCKER: `prepareFadeable` keeps `transparent:true` on tiles even at opacity 1 (`keepFadeAtOpacity`); bake must swap each mesh to `userData.baseMat` first before `canMergeStaticBaseMesh` accepts them; `?meshbake=1` is flag-gated prototype only
- **Descended view**: home island still renders ~1600 draw calls (orbit-centred, frustum culling cannot remove); explicit hide/LOD-on-descend is the remaining fix; UX tradeoff: you stop seeing your island above while on surface

---

## Active Workflows and Capabilities

- **Publish flow**: edit source → `./publish.sh` → `dist/` updated → Netlify serves updated prod; skipping publish.sh means changes are invisible in the browser
- **PartyKit deploy**: `partykit deploy` for `party/index.js` server changes — does NOT go through `./publish.sh`; locally the workerd on :1999 hot-reloads on save
- **Admin gate**: `TINYWORLD_ADMIN_SECRET` env var must be set and `netlify dev` restarted; without it, roadmap drag and features admin silently 403
- **Cluso widget**: injected by dev-server at runtime only; `cluso/` gitignored; build guards forbid it in shipped HTML; never commit Cluso code
- **Shell/checkout traps**: `rm` is aliased interactive (scripted `rm` silently no-ops; use `command rm -f` and verify); cwd drifts into `~/clawd` mirror where edits auto-commit to main — always use absolute paths
- **Worlds MMO local dev**: port 8888 Netlify dev server + local `tinyworld` Postgres; `openMode` required for local peers or signed play token; without it bots/clients are observers only
- **CodeSurf multi-agent**: register with `mcp__contex__peer_set_state` + `peer_get_state` on every session start; coordinate before editing shared files via `peer_send_message`
- **Lobby presentation deploy**: `58-lobby-presentation.js` client ships via `./publish.sh`; `party/index.js` `present` handler ships via `partykit deploy`

---

## Open Threads

- `.agents/skills/` entries (`3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`) not yet referenced in AGENTS.md skill routing table
- Player hit detection in `41-flight-combat.js`: empty `if (hit) {}` stub — health/damage system not implemented
- Time-progression in `39-atmosphere-effects.js` not wired to any UI control
- `46-worlds-universe.js` and `46-mesh-terrain.js` share the `46-` prefix — load order not formally documented in AGENTS.md
- PartyKit `party/index.js` changes (`grassCells` in state snapshot, `present` handler) verified locally but NOT yet deployed to prod — need `partykit deploy`
- On-foot surface-camera is still orbit-not-free-roam after fly-down lands the player; free-roam avatar control on surface not built
- `openBattleworlds` in `30-ui-boot-wiring.js` is a sync stub (falls back to `chooseWelcomeMode('play')`) — Battleworlds mode not yet fully wired
- Avatar state drive keys (crouch/sit/climb/attack) verified via rig-measurement + unit test but **live in-room keypress NOT yet confirmed** (worlds-room is openMode/role-gated)
- Peer-sync of crouch/sit/climb states deferred — `move` carries only x,z; peer avatars do not mirror these states
- Gate-travel FX (59) particles read subtle at gameplay scale — open tuning: bigger gates / scaled particle size
- Lobby presentation: any admitted peer can advance slides (no owner-only gate); potential follow-up via `ownerProfileId`
- Canned `51-worlds-bots.js` still auto-spawns on localhost alongside LLM bots (`tools/ai-bots.mjs`) — retirement decision deferred
- Per-region terrain mesh bake unshipped: `userData.baseMat` swap prerequisite not automated; `?meshbake=1` is prototype only
- Descended view: home island still renders ~1600 calls; explicit hide/LOD-on-descend is the remaining fix
- Home-island proxy on descend: skybound-systems memory references `58-island-proxy.js` but filesystem shows `58-lobby-presentation.js` — proxy logic likely inline in `54-fly-down.js` or `57-poser-surface.js`; verify before next descended-view work

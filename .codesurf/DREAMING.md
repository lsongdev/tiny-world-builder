# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-17

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor on Three.js r128. Shell lives in `tiny-world-builder.html` (~1.4k lines); logic is split across approximately **68+ modules** under `engine/world/` (numbered 00–68 + 99, with `09b` and two `46-` files). Styles in `styles/tiny-world.css` (~5.2k lines). Deployed via Vercel and Netlify from `dist/` via `./publish.sh`. Port 8888 is the Netlify dev server; local Postgres required before any Worlds MMO features can be browser-tested.

A separate **landing/marketing page** (`index.html`) is in the repo with its own build/publish pipeline — distinct from `tiny-world-builder.html`.

---

## Durable Facts

**Architecture**
- Shell: `tiny-world-builder.html` — HTML, boot config, ordered `<script src>` tags only
- Engine modules: 68+ `.js` files sharing one global scope + `flight-combat-math.mjs` (ES module companion to `34-flight-sim.js`); classic scripts, not ES modules
- Non-sequential extras: `09b-voxel-build-factories.js` (between 09 and 10); two files share the `46-` prefix (`46-mesh-terrain.js`, `46-worlds-universe.js`) — load order between them not formally documented
- Skybound additions (modules 53–60) added after core 00–52; extended modules 61–68 ongoing; `99-late-boot.js` is the final late-init module
- Duplicate top-level identifiers silently kill the declaring module without affecting others — prefix module-local scratch globals (e.g. `_fl…` flight, `_sr…` surface-roam, `_sf…` skyfall)
- Three.js pinned to r128; MeshLambertMaterial, ExtrudeGeometry, and shadow setup assume r128 semantics — do not bump
- Materials in `M.*` are shared across meshes — clone before mutating color; `disposeGroup` disposes geometries but NOT materials
- `setCell(x, z, opts)` is the only sanctioned way to mutate world state; never write `world[x][z]` directly outside of init
- No bundler, no npm runtime dependencies; `npm test` for static checks, `./publish.sh` for dist
- Edits auto-commit to main and Netlify prod deploys immediately — branches do not guarantee isolation

**Skill directories**
- `.codex/skills/` — 24 skill files for core engine systems (tinyworld-single-file, tinyworld-render-performance, tinyworld-flight-sim, tinyworld-tinyverse-race-track, tinyworld-surface-roam, tinyworld-cctv-truman, etc.)
- `.agents/skills/` — 5 additional skills: `3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`
- AGENTS.md lists only `.codex/skills/` routing; `.agents/skills/` entries are not yet referenced there

---

## Module Reference

**Core + Advanced (00–52)**
- `34-flight-sim.js` — flyable plane via `stunt-plane` model-stamp; click-to-Enter/Fly, rear chase-cam, Escape exits; `flight-combat-math.mjs` ES module companion; static body parts merged into single BufferGeometry via `threeStdlib.mergeGeometries`; server relays `entity` transforms for shared-build rooms, but `onWorldMessage` in 47 has no `entity` branch — plane sync is broken in Tinyverse world rooms (open thread)
- `38-multiplayer-partykit.js` — multiplayer via PartyKit
- `39-atmosphere-effects.js` — atmosphere/day-night effects; time-progression not wired to any UI control
- `40-shield-system.js` — VoxelShield; Lambert mats; per-mesh glow material clones explicitly disposed on teardown
- `41-flight-combat.js` — missiles/projectiles implemented; **player hit detection stub removed 2026-06-12**; **altitude ceiling enforcement removed 2026-06-12**; health/damage not implemented; fog provides visual-only altitude boundary
- `42-account-wallet-players.js` — JWT/cloud-save; **subscription system fully removed 2026-05-31**; no replacement monetisation wired; `playerName()` checks `profile.displayName`/`profile.username` only — fallback is literal `"Player"` if profile shape mismatches
- `43-drag-drop-import.js` — GLB/FBX/OBJ/VOX/VDB drag-drop pipeline
- `44-sub-object-edit.js` — part-level selection, hover hulls, transform delegation
- `45-shader-fx.js` — `window.TinyShaderFX`; GLSL effects via `onBeforeCompile`
- `46-mesh-terrain.js` — opt-in voxel-block landscape sculptor; persists under `tinyworld:meshTerrain:*`; no `setCell` bake; **hidden by default** via inline `style.display='none'` at line ~877 + dropped from flyout toolIds; surfaced only for lobby admin via `body.tw-admin-fulledit.tw-worlds-play #mesh-terrain-toggle{display:inline-flex !important}`
- `46-worlds-universe.js` — Worlds MMO universe map, world buying (USDC), management/publish; dispatches `tinyworld:worlds-ready`; exposes `window.__tinyworldWorldsReady` promise; adds `body.tw-worlds-play` on room enter via `WS.setPlayChrome(true)` — this class STAYS ON during admin editing
- `47-worlds-room.js` — Worlds MMO room client (PartyKit `world-<slug>`); `createAvatar` routes through `window.makeVoxelAvatar`; owns skyfall ring meshes + camera follow + steering; runs SEPARATE avatar rAF — do NOT add a third rAF; dispatches `tinyworld:skyfall-start`; **owns `_sr*` surface-roam controller**; **surface roam physics fixed 2026-06-15**: `_srVel` is `THREE.Vector3`; gravity/friction corrected; `sampleWorld` null-guarded; **dynamic camera height 2026-06-15**: camera Y tracks `sampleWorld(x,z)` floor height + 1.2 eye offset; **FP camera wired via `WS._fpMode` flag**; new PartyKit world message handlers go in `onWorldMessage`, NOT `onMessage` (world rooms early-return past the main `onMessage` — this trap caused the chat-emote relay to ship dead in prod); contains debug 'k' key (`startSkyfall(0,1)` from anywhere) — **remove once skyfall is live-tuned**
- `48-worlds-harvest-hud.js` — in-world HUD (hearts, resources, harvest, cooldowns, reward popups); SVG glyphs only
- `49-worlds-avatar-picker.js` — avatar picker gallery; drives `WS.setAvatarClass`; extensible via `WS.registerAvatarProvider`
- `50-worlds-play-chat.js` — play-mode chat panel; IIFE-wrapped; `mp-chat-*` CSS + `tw-play-chat-*` overrides; handles `@username` mentions and `@lobby` big-screen broadcast
- `51-worlds-bots.js` — localhost-only bot simulation; seeded LCG PRNG; **never runs in production**
- `52-worlds-demo-seed.js` — localhost-only demo resource seeder; **never runs in production**
- `99-late-boot.js` — late boot finalization; `?meshbake=1` activates terrain bake; `window.runTerrainBake` exposed for console

**Skybound (53–60)**
- `53-voxel-avatar.js` — `window.makeVoxelAvatar`; FK rig with named limb groups (`armL_sh`/`armR_sh`, `armL_elbow`/`armR_elbow`, `legL_hip`/`legR_hip`, `legL_knee`/`legR_knee`, chest, `head`); material MUST be `side:THREE.DoubleSide`; `AVATAR_HEIGHT=0.5`; **API added 2026-06-15**: `setFirstPerson(on)` hides `head` group (Minecraft-style), `getEyeWorldPosition(out)` via head group world matrix + `(0, AVATAR_HEIGHT*0.4, 0)` offset; `setRocketVisible(on)` / `setThrusting(on)` for rocket-pack visuals
- `54-fly-down.js` — fly-down mechanic (key `j`); `window.__tinyworldFlyDown.{descend,ascend,toggle,isDown,state}`; eases camera to planet underlay; shows/hides home-island proxy + force-hides full board via `window.__hideHomeLayer`
- `55-stargate.js` — stargate object (key `G`); styles: nested/voyager/portal/rings; `nested` = voxel stone casing + recessed ring + white energy centre, sunk at ground level
- `56-gate-transit.js` — gate transit (key `h`); `window.__tinyworldGateTransit`; `placeLobbyGates()` scatters 3 paired gates on enter; auto-travel loop every ~4–8s; CYBERGATE/GROUND LEVEL signs; **accessors added 2026-06-15**: `skyGateCell/ensureSkyGate/flashSky/ensureLandGate/flashLand/landGateWorldPos`; sky-edge gate relabeled "GROUND LEVEL" with `rotation.y=Math.PI`; **FP trigger 2026-06-15**: proximity in surface-roam auto-activates FP camera; `window.__tinyworldGateTransit.setFirstPerson(on)`/`isFirstPerson()`; `_fpCam` internal state; objects parented to the stretched surface group (57) inherit Y_BOOST stretch — counter with `landGate.group.scale.set(NET/gs.x, NET/gs.y, NET/gs.z)`
- `57-poser-surface.js` — `window.__tinyworldPoserSurface.{show,hide,build}`; VERBATIM lift of voxel-poser.html SATS/ISLE/groundH geometry + banded water shader + foam ribbons; scaled (SCALE 1.6 / **Y_BOOST 1** — reduced from 3 on 2026-06-15) at y=−60; `sampleWorld(wx,wz)` returns `{walkWorldY,localH,water}` — must read `group.position.x/z` (stable), NOT `target.x/z` (camera rewrites it every frame); **do NOT reimplement — extract verbatim**
- `58-lobby-screen.js` — lobby/title screen at `y=+100`; slide-sync via PartyKit `present` event (no echo loop); `party/index.js` deploys via `partykit`, not `publish.sh`
- `59-avatar-animations.js` — avatar state machine: walk=`strideCore` natural gait, jump/crouch/sit/climb/attack/blink + skydive/rocket freefall postures w/ `setBodyPitch` controller contract; drive keys c/x/W/f/j; moonwalk + climb-facing gotchas; adding a state requires whitelisting in `setState` or it silently collapses to idle; **top-of-update neutralize** zeroes extra axes every frame so pose state doesn't leak into the next
- `60-skyfall.js` — `window.__tinyworldSkyfall`; ring-dodge minigame; seeded LCG PRNG; pure sim (no THREE/DOM), headless-testable; **REWARD = ROCKET PACK** (not parachute): earn by flying through `earnThreshold` rings, then HOLD SPACE to thrust; `CFG.fuel=2.5s` depletes while thrusting; never hover forever (empty pack → you land); HUD `#tw-skyfall-hud`; **walk-off-edge RETIRED 2026-06-15**: islands now have solid edges; descend via stargate/J only; `startSkyfall` early-returns false (sim/ring code kept but unreachable); `startSkyfall` calls `window.__tinyworldPoserSurface.build()+show()` so surface islands appear during fall at `groundDrop=58`

**Extended modules (61–68)**
- `61-tinyverse-race-track.js` — Tinyverse ground-surface perimeter rally loop; poser-surface show/hide hook; static road/bridge merging; local kart race HUD; skill: `tinyworld-tinyverse-race-track`
- `62-cctv-truman.js` — CCTV / "Truman Show" surveillance cameras: render-to-texture B&W CRT/VHS monitor feeds with captions; lobby/pumpkin/tree camera placement; moving-subject tracking; lobby screen cuts to hottest live feed; skill: `tinyworld-cctv-truman`
- `63-cctv-placement.js` — CCTV camera placement companion to 62
- `64-lobby-chat-bridge.js` — lobby chat bridge (function not yet documented)
- `65-lobby-benches.js` — lobby benches (function not yet documented)
- `66-lobby-admin.js` — god-admin live-lobby editor; clicking **Edit Lobby** adds `body.tw-admin-editing` + calls `__tinyworldMode.setBuild()`; lobby-only, gated by `_laIsLobby()` comparing world slug to `window.__TW_LOBBY_WORLD_SLUG || 'tidewater-bay'`; adds `body.tw-admin-fulledit` which unlocks full builder (toolbar, palette, flyouts, inspector, radial menu, layers, stamp library); **`tw-worlds-play` stays ON** (deliberate) — its `.controls` trim + `#world-pill` hide keep import/export/reset/clear out; CSS specificity: builder surfaces hidden by ID selectors `display:none !important` (specificity 1,1,1); override must be `body.tw-admin-fulledit.tw-worlds-play #id` (1,2,1); Stamps button hidden by chained `:not(#id)` — needs matching `:not(#…)` padding on override; toggle panels (`[hidden]`) override with `:not([hidden])`; `#agent-panel` override with `:not(.collapsed)` — don't force permanently open; Mesh terrain sculptor surfaced via stylesheet `!important` (beats non-important inline); underside edit uses existing pyramid inspector in `#agent-panel` (09b + 14 + 28) — no new code needed
- `67-cctv-view.js` — per-room live CCTV via `?view=cctv` world mode; ortho video-wall of `monitorMaterialFor` planes; headless browse has no WebGL so wall is deploy-verify-only; room `world_slug`/`editRoom` backend wired
- `68-notifications.js` — join/leave/chat/bot toasts + web notifications; opt-in bell in minimap header; implicit-join seeding gotcha: no join message emitted when seeding (diff peer ids — seed silently on `world.state`)

---

## Active Subsystems

| System | Key module(s) | Entry point / key globals |
|---|---|---|
| Core world build | `00–33` | `setCell`, `world[][]`, `cellMeshes` |
| Flight sim | `34`, `flight-combat-math.mjs` | `stunt-plane` stamp → Enter/Fly menu |
| Worlds MMO | `46-worlds-universe.js`, `47–52` | `WS.*`, `window.__tinyworldWorldsReady` |
| Chat emotes | `47`, `50`, `party/index.js` | `/wave /jump /dance /sit /crouch /attack` via `WS.sendChat` intercept |
| Voxel avatars | `53` | `window.makeVoxelAvatar` |
| Fly-down | `54` | `window.__tinyworldFlyDown.*` |
| Stargate | `55` | `window.__tinyworldStargate` |
| Gate transit + FP cam | `56` | `window.__tinyworldGateTransit.*` |
| Poser surface | `57` | `window.__tinyworldPoserSurface.*` |
| Lobby screen | `58` | PartyKit `present` event |
| Avatar animations | `59` | `setBodyPitch`, avatar state machine |
| Skyfall + rocket pack | `60` | `window.__tinyworldSkyfall`, ring LCG |
| Race track | `61` | poser-surface hook; kart HUD |
| CCTV / Truman | `62`, `63`, `67` | render-to-texture feeds; `?view=cctv` |
| Lobby admin full-edit | `66` | `body.tw-admin-fulledit`; `_laIsLobby()` |
| World notifications | `68` | join/leave/chat/bot toasts; web notif opt-in |
| Mesh terrain (opt-in) | `46-mesh-terrain.js` | `window.runTerrainBake`, `?meshbake=1` |
| Shader FX | `45` | `window.TinyShaderFX` |
| Sub-object edit | `44` | transform delegation, hover hulls |
| Surface roam | `47` (`_sr*` vars) | WASD+mouse-look; `j` descend/ascend; wheel-zoom; V=FP toggle |
| Name labels | `47` | `makeNameSprite`; billboard Sprite +1.46Y above avatars |

---

## Stable Workflows

- **Publish flow**: edit source → `./publish.sh` → `dist/` rebuilt → Netlify deploys to prod (auto-push to main also triggers deploy)
- **Static checks**: `npm test` before declaring done
- **Browser verify**: load on port 8888 (Netlify dev); MMO features need local Postgres; admin features need `TINYWORLD_ADMIN_SECRET` set + restart netlify dev
- **Module naming**: prefix scratch globals with module-local prefix to avoid silent identifier collisions
- **Poser surface**: extract verbatim from `voxel-poser.html` — never reimplement/approximate
- **Skill update**: when a change creates a durable pattern, update/create the matching `.codex/skills/*/SKILL.md` in the same turn
- **Icon policy**: SVG glyphs only — never reintroduce PNG baked-icon system
- **Shell/checkout trap**: `rm` is aliased interactive — scripted `rm` silently no-ops; use `command rm -f` and verify; cwd may drift into `~/clawd` mirror where edits auto-commit to main
- **World message handlers**: new PartyKit worlds handlers go in `onWorldMessage` (not `onMessage` — world rooms early-return past it); add to `RATE_LIMITS` bucket; test the world path
- **LandscapeEngine**: `LandscapeEngine.js` is a superseded monolith; `getHeight`/chunk-building live in `engine/landscape/*.js` mixins — always edit the mixins, not the monolith
- **Local peer testing**: local peers need `openMode` (no `WORLDS_JOIN_SECRET`/`SERVICE_TOKEN`) or a signed play token, else bots/clients are observers and never render as peers; client masks own role as `'play'`

---

## Open Threads

- **Multiplayer plane sync (Tinyverse mode)** — investigated 2026-06-17 (read-only): server already relays `entity` transforms for shared-build rooms, but `onWorldMessage` in `47-worlds-room.js` has no `entity` branch → flight-sim plane positions cannot sync to world-room peers; needs an `entity` handler added to `onWorldMessage` (not `onMessage`); also: `playerName()` only checks `profile.displayName`/`profile.username` → every join falls back to `"Player"` if profile shape differs
- **Debug 'k' key in 47**: `startSkyfall(0,1)` shortcut added for testing — remove once skyfall ring/camera/posture is live-tuned
- `39-atmosphere-effects.js` time-progression has no UI control wired
- `41-flight-combat.js` health/damage not implemented; hit detection stub removed; fog is visual-only altitude boundary
- `.agents/skills/` (5 files) not yet referenced in AGENTS.md routing table
- **Modules 64 and 65 undocumented**: `64-lobby-chat-bridge.js` and `65-lobby-benches.js` exist on disk but their purpose/API is unrecorded; read before editing
- Lobby gate repositioning: user wants an "inner gate" moved "up toward the tree" in lobby — lobby gates are randomly scattered by `placeLobbyGates`, needs user to specify position before implementing
- Surface-roam FP eye-height/zoom-step/jump-height are design-guessed (`_srEyeH×`, wheel 0.9/notch, `SR_JUMP_H`) — need live feel-tune from user playing directly
- Distant sea hazes at grazing angles during surface roam (cosmetic, not blocking)
- Skyfall ring visibility/placement, steering feel, posture-in-motion — live-unconfirmed; browser automation too flaky; user is the live channel
- Race track surface-roam integration: full kart race HUD from `tinyworld-tinyverse-race-track` skill — integration status unclear
- Peer-sync of skyfall (peers see cell freeze till landing); persistent rocket-pack unlock (v1 earns per-run); walking on poser surface after skyfall landing (v1 settles back on lobby)

---

*This file is auto-generated by the CodeSurf dreaming daemon. Do not hand-edit.*

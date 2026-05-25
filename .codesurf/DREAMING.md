# tinyworld — CodeSurf Generated Memory

_Generated 2026-05-24. Do not edit by hand — overwritten on each dreaming run._

---

## Overview

**tinyworld** is a single-file browser app (`tiny-world-builder.html`) — a low-poly infinite-canvas 3D world builder on Three.js r128. No bundler, no npm runtime dependencies. All CSS and JS inline (~16k LoC). Static deploy via `publish.sh` → `dist/`, served by both Vercel (`vercel.json`) and Netlify (`netlify.toml`).

The workspace runs inside **CodeSurf** canvas with an **OpenClaw** agent infrastructure managing scheduled crons and heartbeat polling.

---

## Durable Facts

### App Architecture

- **Single source of truth**: `tiny-world-builder.html` — all code lives here
- **Two parallel data structures** (never mix):
  - `world[x][z]` — intent layer: `{ terrain, terrainFloors, kind, floors }`
  - `cellMeshes['x,z']` — render layer: `{ tile: Group, object: Group|null }`
- **Only mutate via `setCell(x, z, opts)`** — direct writes to `world[x][z]` desync intent from rendering
- Three.js r128 pinned — `vendor/three/` self-hosted; do not bump version
- Materials in `M.*` are **shared**; never mutate `M.foo.color` in place — clone first
- `disposeGroup(group)` disposes geometries but **not** shared materials
- `userData.landing` checks guard drop-in animations — do not remove them
- Grid range: 8×8 default, up to 48×48 via settings; avoid broad synchronous rebuilds at large sizes
- Storage key: `tinyworld:v1`, schema version 4

### Procedural Material System (committed 2026-05-24)

- **Seeded RNG**: `makeMulberry32()` replaces `Math.random()` for texture generation — materials are stable across reloads
- Deterministic procedural pixel textures: `planks`, `stone`, `hay`, `dirt`
- **`voxelBuildMaterial(hex, textureKind)`** — infers and routes procedural texture maps for generated/custom voxel-build colors
- Trim geometry preferred over global outline passes for imported/custom voxel builds
- Skill file update for this pattern **blocked by Codex sandbox** (`.codex/skills/` treated as outside project in GPT-5.5 sessions) — pattern is live in code only; `.codex/skills/tinyworld-lowpoly-stylized-3d` needs manual update

### Pre-flight Checklist

- `npm test` passes (`npm run check` + `npm run smoke`)
- Page loads with no console errors
- Tool keyboard shortcuts `1`–`9`, `E` work
- `R`/`F` raise/lower hovered terrain; reset restores preset village; `C` clears to grass
- Perspective ↔ ortho toggles cleanly
- Fence placement updates neighbor geometry
- House clusters render as L/T/+/square where appropriate
- Smoke spawns from chimneys after landing

---

## Active Subsystem: LandscapeEngine (pending browser visual QA)

`npm test` passes; browser QA not yet verified. Persists across multiple dreaming cycles.

### What was built

- **`LandscapeEngine.js`** — separate module; `landscapeMeshMode` flag gates the feature throughout `tiny-world-builder.html`
- `landscapeHeightAtCell(x, z)` is the canonical height lookup for objects, overlays, crowd, hover, and picking in landscape mode
- Clip planes from `landscapeMeshEngine._clipPlanes` copy to `pixelState.normalMaterial.clippingPlanes` in `renderScene` (prevents outline-pass ghosting)
- Camera panning unlocked in landscape mode; dynamic bounds expand up to 48×48 on first pan
- Switching away from Landscape disposes engine and rebuilds normal tile/object world
- Soft gradient edge fading applied to all terrain/water materials near clip boundaries
- Skills updated: `.codex/skills/tinyworld-tile-variation`, `.codex/skills/tinyworld-render-performance`, `.codex/skills/tinyworld-opacity-torch`
- Additional fixes: placement snaps aligned to landscape height; vehicle hill travel; weather collision projection; ghost board restore; `scratch/visual_qa.js` + `chrome_debugger.js` + `chrome_debugger_autoexpand.js` + `test_unit.js` added

### Visual QA still needed (browser)

- Fixed boards: no hidden base/helper outlines
- Auto-expand while panning: terrain streams, no ghost/base boards
- Low-poly and voxel styles: legacy generation unaffected
- Low-poly Landscape: cel-shaded appearance preserved
- Realistic Landscape: shadows and fog active
- Pixel outline "Normal": no ghost outlines for clipped tiles/rocks/trees
- Clip boundaries: soft gradient fade into background sky/fog

---

## Active Investigation: Auto-Generate Panning Regression

Root cause identified; fix not yet applied.

### Root cause in `maxRenderVisibleSizeForGrid` (line 5082)

- When `isLandscapeMeshActive()` is true, returns `Math.max(48, g * 4)` — for grid ≥ 18 this produces 72, hitting the slider's hard `max="72"` ceiling
- When `renderAutoExpand` is true (non-landscape path), `(1 + 2 * maxPreloadRadius) * g` may also push to 72
- **Only affects non-realistic/non-landscape terrain modes**
- Fix not applied — prior session was read-only with existing uncommitted texture/material edits to preserve

---

## Adjacent Project Activity

### Hermes Agent / hermes-agent-core-rs (`/Users/jkneen/Documents/GitHub/hermes-agent/agent-core-rs`)

- Parity test suite passing: `HERMES_PARITY_RUN_OK`, `HERMES_PARITY_CHAT_OK`, `HERMES_PARITY_ONESHOT_OK`
- Memory recall probe ("ultraviolet" / "remembered") confirmed correct
- Backend: OpenAI-compatible at `POST 127.0.0.1:8642/v1/chat/completions`
- Three Codex sessions opened 2026-05-24T18:52–18:56 UTC; all were initialization only — agents oriented to AGENTS.md rules but received no task instructions and produced no changes
- AGENTS.md rules: verify model names from local codebase; no emoji unless explicitly requested; keep dashboard chat inside the embedded TUI

### SmallHarness / Hermes Migration (`/Users/jkneen/Documents/GitHub/SmallHarness`)

- Rust CLI; TUI uses crossterm raw-mode prompt + JSONL input history + bordered/plain input styles + streaming renderer
- Key files: `src/input.rs`, `src/renderer.rs`, `src/main.rs`, `src/config.rs` — all have local edits
- Migration plan exists: port TUI to hermes-agent; add `hermes` backend suppressing SmallHarness tool schemas; renderer blank-line fix; schema suppression
- Application of migration plan **not confirmed** in session evidence

### ideation-canvas (`/Users/jkneen/Documents/GitHub/ideation-canvas`)

- Realtime drawing smoothing: Catmull-Rom cubic SVG curves in `ScribbleNode.tsx`
- `scribbleToPath()` shared between live overlay and saved strokes
- `npm run build` passes

### openclicky (`/Users/jkneen/Documents/GitHub/openclicky`)

- Keychain-backed secret storage, bridge token gate, proxy feature flags implemented
- Live build verification still pending

---

## Active Agent Infrastructure (OpenClaw)

### Healthy

- **Lead agent Ava** (`c3f78d0c-abf3-45d5-898e-27cd1d95c0d1`) — heartbeating `HEARTBEAT_OK`; `AGENT_ID: 9f5f3df9-2ed7-4efe-9d97-2114fe460a35`; no board task work this cycle
- **Urgent Email Alert cron** — first two attempts each cycle fail (assistant turn failure before content), third attempt recovers with `HEARTBEAT_OK`; functionally operational but flaky
- **VibeClaw Article Generator** — articles published with verified content; DGX server was down so no locally-generated hero images; recent articles: "The Invisible Architecture: How Context Windows Are Reshaping AI Reasoning" and "Neural Architecture Search: Teaching AI to Design Itself"
- **VibeClaw Skills Scout** — ran successfully at 19:00 UTC and 02:00 UTC

### Degraded / Broken (persistent across multiple dreaming cycles)

- **MC Gateway** (`894a3d5b-7faa-4c0a-a40f-69fbdee7b78d`) — "connection refused" on every poll; target `localhost:19789`; multiple assistant turn failures before content; requires manual process restart
- **Tom Doerr Tweet Tracker** — browser gateway protocol mismatch with newer OpenClaw version; cron runs but produces no results; tweets not checked

---

## Open Threads

1. **Browser visual QA for LandscapeEngine** — `npm test` passes but no browser session opened across multiple Codex sessions; human or browser-capable agent needed
2. **Auto-generate panning regression fix** — `maxRenderVisibleSizeForGrid` root cause known (line 5082); targeted fix not yet applied
3. **Procedural-material skill file** — `.codex/skills/tinyworld-lowpoly-stylized-3d` needs seeded RNG and `voxelBuildMaterial()` documented; blocked by Codex sandbox; requires manual update
4. **MC Gateway down** — `localhost:19789` connection refused; process restart needed; unresolved and recurring
5. **Tom Doerr Tweet Tracker** — browser gateway protocol mismatch; requires fix or alternative scraping approach
6. **SmallHarness → Hermes migration** — plan exists; application not confirmed in session evidence; hermes-agent sessions in this cycle were idle/initialization only
7. **openclicky build verification** — implementation committed; live build verification pending
8. **VibeClaw DGX image gen** — DGX server was down during article generation; server status unknown; articles published without local hero images
9. **2 unpushed commits on `main`** — working tree clean but not pushed to `origin/main` (last confirmed state)

---

_Last updated: 2026-05-24_

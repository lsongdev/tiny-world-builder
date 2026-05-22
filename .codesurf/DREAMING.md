Now I'll write the updated DREAMING.md incorporating all findings:

# Workspace Overview

**Project**: Tiny World Builder — a single-file browser app (`tiny-world-builder.html`) for painting low-poly 3D voxel worlds on a Three.js r128 scene. No bundler, no npm runtime dependencies. Deployed to Vercel/Netlify from `dist/` via `publish.sh`. App is large (~16k+ LoC).

---

# Durable Facts

## App Architecture
- **Intent layer**: `world[x][z]` — `{ terrain, terrainFloors, kind, floors, buildingType, fenceSide, extras }`
- **Render layer**: `cellMeshes['x,z']` — `{ tile: Group, object: Group|null }`
- **Central mutation path**: `setCell(x, z, opts)` — normalizes, writes world, rebuilds meshes, refreshes adjacency neighbors, autosaves, fires webhooks. Never write `world[x][z]` directly outside of init.
- **Grid**: home grid starts 8×8, configurable up to 48×48. `HOME_GRID_MAX` is the ceiling constant.
- **Storage**: key `tinyworld:v1`, schema version 4. Cells serialized sparsely. `applyState()` accepts both tuple export and object-form schema cells.
- **Three.js**: r128 pinned. `MeshLambertMaterial`, `ExtrudeGeometry`, shadow setup all assume r128 semantics — do not bump.
- **Shared materials**: `M.*` are shared across many meshes. Clone before mutating color. `disposeGroup()` disposes geometries, not materials (shared).
- **Deploy**: `npm run build` → `publish.sh` → `dist/`. `npm test` = `check` (syntax) + `smoke`.

## Procedural Pixel-Art Textures (Added 2026-05-22)
New section `// -------- procedural pixel-art textures --------` in `tiny-world-builder.html`:
- `createPixelTexture(type, scale = 16)` — generates a `THREE.CanvasTexture` from a 2D canvas for types: `checkered`, `noise`, `brick`, `shingles`, `ripples`
- `applyWorldUVs(material, texture, textureScale = 1.0)` — applies texture to a shared material with RepeatWrapping/NearestFilter
- Instances created at init: `texCheckered`, `texNoise`, `texBrick`, `texShingles`, `texRipples`
- Applied to shared `M.*` materials: grass/edge/hi → checkered; path/dirt/dirtRich → noise; water/waterDk → ripples; wallCream/wallTrim → brick
- **Pattern tension**: AGENTS.md says don't mutate shared materials in place. `applyWorldUVs` writes `.map`/`.needsUpdate`/repeat/wrap directly onto shared materials. Appears safe only because it runs once at init before any clones — treat as an intentional one-shot exception, not a general pattern.

## Repo Skills (`.codex/skills/`)
- `tinyworld-single-file` — repo workflow, single-file constraints
- `tinyworld-auto-batching` — auto palette inference/cache behavior
- `tinyworld-opacity-torch` — ghost boards, panning, opacity torch
- `tinyworld-tile-variation` — repeat-click levels, terrain/object variation (updated with LandscapeEngine notes)
- `tinyworld-visual-qa` — browser checks, visual QA
- `tinyworld-render-performance` — renderer, shadows, clouds, GPU budget (updated with shadow/fog and low-poly shader preservation)
- `tinyworld-webxr` — WebXR AR/VR desk placement, floating boards, headset input
- `tinyworld-crowd-layer` — 2.5D people sprites at 3D map coordinates
- `tinyworld-lowpoly-world-prompt` — model prompting for coherent low-poly worlds
- `tinyworld-lowpoly-stylized-3d` — low-poly/stylized 3D asset design, imports, materials, scale, animation
- `tinyworld-integrations` — API, webhook, SSE, MCP, plugin, automation examples
- `tinyworld-ghost-world-gen` — ghost world generation
- `threejs-primitive-reconstructor` — Three.js scene reconstruction from primitives

## Known Schema / Docs Gaps
- `README.md` and `AGENTS.md` still describe ~1600-line app and 8×8-only assumptions; actual file is 16k+ lines with up to 48×48 grid.
- `world.schema.json` is stricter than runtime: no `gridSize`, tuple cells, `extras`, `transform`, `cameraMode: 'soft'/'fp'`, negative coordinates — all accepted at runtime.
- `publish.sh` does not copy `cluso/` directory; deployed `dist/` may 404 `cluso/cluso-embed.js`.
- Optional cloud profile/build save calls `/api/profile` and `/api/builds` — no API source in repo; hidden unless `window.TinyWorldAuth` is present.

---

# Active Subsystems

## LandscapeEngine
A continuous terrain rendering mode (opt-in via `Terrain style = Landscape`). Key properties:
- Hidden logical board; no discrete base tile meshes render in this mode.
- `updateLandscapeClipBounds()` drives a clip window around camera target, linked to `renderVisibleDistance` setting.
- Auto-expand bounds on first pan (up to 48×48), reset on new generation/load via `applyState`.
- Legacy ghost/cheap preview boards suppressed when active (`landscapeGhostBoardsSuppressed`).
- Hover, selection overlays, ghost preview, picking, crowd height, objects, and extras all projected via `landscapeHeightAtCell(...)`.
- **Realistic mode**: native vertex-color Lambert material; near terrain/rocks/flora cast/receive shadows; far LOD stays non-shadowed for GPU budget; `scene.fog` atmosphere.
- **Low-poly mode**: original `sandMatLowPoly` cel shader preserved (shadow fix regression corrected).
- Gradient edge fading: `sandMatLowPoly`, `sandMat`, `terrainMat` (via `onBeforeCompile`), and `waterMat` all fade color/opacity near clip boundaries into sky/fog.
- Pixel outline normal-pass fix: `landscapeMeshEngine._clipPlanes` copied to `pixelState.normalMaterial.clippingPlanes` inside `renderScene`.
- Free camera panning enabled when `landscapeMeshMode` active.

## Scratch Dev Tooling (`scratch/` directory — added 2026-05-22)
Node.js scripts for visual QA and debugging, not part of the build:
- `scratch/chrome_debugger.js` — launches headless Chrome via CDP (port 9222), connects to `http://localhost:3000/tiny-world-builder` for automated inspection
- `scratch/chrome_debugger_autoexpand.js` — variant focused on testing `renderAutoExpand` behavior
- `scratch/test_unit.js` — unit test harness with mocked `localStorage`, `THREE`, and core globals (`GRID`, `HOME_GRID_MAX`, etc.) for testing pure logic functions without a browser

## OpenClaw Cron Jobs (as of 2026-05-22 12:00 UTC)
- **Heartbeat** (`89c73c3d`, hourly): `HEARTBEAT_OK` — all critical components functioning, email alert script verified
- **Urgent Email Alert** (`4e55bac5`, hourly): `HEARTBEAT_OK`
- **Tom Doerr Tweet Tracker** (`59fa3a02` / `cebd05e0`): **BLOCKED** — browser tool unavailable due to OpenClaw CLI version mismatch (CLI v2026.4.29 vs service v2026.5.16). State: 20 tweets seen, tracking since 2025-11-25. Script: `/Users/jkneen/clawd/scripts/tom-doerr-tweet-tracker.sh`
- **VibeClaw Skills Scout** (`c44fa8a6`, hourly): Running. 10:00 UTC run found 9 new items (Anthropic Opus 4/Sonnet 4/Haiku 4, Copilot Extensions GA, Cursor Rules repo, Windsurf Wave 9, MMLU-Pro, AutoCoder v3, GPT-4.1, Cursor background agents). All 6 Nitter instances down — Twitter RSS fallback unavailable.

## Lead Agent / Canvas Board
- Agent name: **Ava**, ID `9f5f3df9-2ed7-4efe-9d97-2114fe460a35`
- Board ID: `c3f78d0c-abf3-45d5-898e-27cd1d95c0d1`
- Gateway: `localhost:19789`, heartbeat polls passing (`HEARTBEAT_OK`)
- MC Gateway (`894a3d5b-7faa-4c0a-a40f-69fbdee7b78d`): Recurring connection refused / `[assistant turn failed before producing content]` — instability, root cause unknown

---

# Open Threads

## Visual QA Pending — LandscapeEngine + Pixel Textures
Both LandscapeEngine and the new pixel-art textures pass `npm test` but need browser confirmation:
- Fixed boards: no hidden base/helper mesh outlines visible in Landscape mode
- Auto-expand while panning: terrain streams correctly, no ghost/base boards appear
- Low-poly Landscape: looks cel-shaded (not realistic)
- Realistic Landscape: receives shadows and fog
- Pixel outline normal pass: no ghost outlines on clipped landscape tiles/rocks/trees
- Clip boundary gradient: terrain and water fade softly into sky/fog
- Pixel-art textures (new): verify grass/path/water/wall textures visible and don't break cel-shaded look; confirm brick texture on walls at various camera zoom levels

## Shared-Materials Pattern Question — `applyWorldUVs`
AGENTS.md rule: "Don't mutate `M.foo.color` in place; clone first." The new `applyWorldUVs` writes `.map`/`.needsUpdate`/repeat/wrap directly onto shared `M.*` materials. Currently safe because it runs once at init before any mesh is created. If any future code calls `applyWorldUVs` after meshes exist, all instances sharing that material will be affected. Either document this as an intentional one-shot init pattern or update AGENTS.md to note the exception.

## OpenClaw CLI Version Mismatch — Action Required
- **CLI**: v2026.4.29 — **Service**: v2026.5.16
- Blocks all browser automation (tweet tracker, any future browser-based cron tasks)
- Fix: upgrade OpenClaw CLI to v2026.5.16 or higher

## MC Gateway Stability
- Session `mc-gateway-894a3d5b` producing repeated `[assistant turn failed before producing content]` and "connection refused" errors as of 2026-05-22
- Root cause unknown; escalate if persists

---

# Key File Locations
- Main app: `tiny-world-builder.html` (inline CSS + JS, 16k+ LoC)
- Landscape engine module: `LandscapeEngine.js`
- Build script: `publish.sh`
- Static checks: `npm test` (`npm run check` + `npm run smoke`)
- Dist output: `dist/`
- Skills: `.codex/skills/*/SKILL.md`
- Scratch/dev tooling: `scratch/` (chrome_debugger.js, chrome_debugger_autoexpand.js, test_unit.js)
- Cron scripts: `/Users/jkneen/clawd/scripts/`
- Tweet tracker state: `/Users/jkneen/clawd/memory/tom-doerr-seen.json`
- Generated memory (this file): `.codesurf/DREAMING.md`

---
name: tinyworld-render-performance
description: Use when changing Tiny World Builder renderer setup, post-processing, shadows, smoke, ghost board render cost, frame loop, or GPU performance.
---

# Tiny World Render Performance

Keep post-processing lightweight.

Current renderer contract:

- Single full-screen post pass only: scene render target, then shader to screen.
- No EffectComposer dependency or bundler.
- Cap DPR; do not return to uncapped `devicePixelRatio`.
- Main WebGL context uses `antialias: false`; the post shader handles mild smoothing.
- Use `WebGLMultisampleRenderTarget` when WebGL2 is available to avoid jagged post-processed edges.

GPU caches (introduced for low-end GPU + visible-distance scaling):

- `geomCache` memoizes `roundedSlab` / `roundedBox` ExtrudeGeometries by their numeric args. Geometries are tagged `userData.cached = true` and shared across every mesh that asks for the same shape. Disposal goes through `safeDisposeGeometry(geo)` — never call `geo.dispose()` directly on these. If you add a new geometry helper that's called more than a handful of times, cache it the same way.
- `fadeMatCache` shares fade materials in `FADE_BUCKETS = 16` opacity buckets keyed by (base material UUID, grayscale flag, bucket). `prepareFadeable` and `applyElementOpacity` look up via `pickFadeMaterial(baseMat, grayscale, displayOpacity)` instead of cloning per mesh. Cached materials are tagged `userData.cachedFade = true` and must never be mutated or disposed — they're shared by every mesh in their bucket. If you need a per-instance opacity (e.g. squash anim), clone the material yourself and tag it so it gets disposed individually.
- Ghost boards are built incrementally via `pendingGhostBoards` queue, drained inside `animate()` by `processGhostBoardQueue(budgetMs)` with a small per-frame budget. `ensureGhostBoardsAroundTarget` only enqueues — it must never build synchronously, or load/reset/visible-distance changes hitch the main thread.
- Stats overlay (`?stats=1` or backtick key) reads `renderer.info` and reports FPS, draws, tris, geoms, mats, programs, textures, ghost-board count + queue depth. Use it to measure any rendering change.
- Default color grade should stay neutral: saturation 1, contrast 1, warmth 0, mild vignette only.
- Render settings are user-adjustable and persisted in `localStorage` under `tinyworld:render:*`.
- Scene/screen controls must keep working with post-processing disabled: resolution, shadow quality, lighting, visible distance, visible size, clouds, tilt-shift blur/focus, and ghost opacity.
- Visible size is the fully opaque torch square in tile-width units; default is 8x8 and the control may expand it up to 20x20. Do not subtract half a tile from this radius, or the board edge starts fading inside the requested size.
- Ghost opacity 100% means the ghost-strength control itself is maxed, not that the visible-size boundary expands. Outside the visible-size square must still be visibly weaker than the fully rendered center.
- Post-processing-only controls are shader uniforms: brightness, saturation, contrast, vignette, and warmth.
- Shadow maps should stay modest unless a visual defect proves otherwise.
- Ghost boards should not cast shadows, and usually should not receive shadows either.
- Smoke particles must be capped and must not cast/receive shadows.

Validation:

- Run the inline script syntax check.
- Open `http://localhost:3000/tiny-world-builder`.
- Confirm `renderer.getPixelRatio()` is at or below the cap.
- Confirm post target dimensions match canvas size times DPR and samples are enabled on WebGL2.
- Confirm no console errors after reload.

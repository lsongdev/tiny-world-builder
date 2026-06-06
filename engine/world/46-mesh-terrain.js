  // -------- mesh terrain sculptor (voxel paint + soft-handle sculpt) --------
  // A self-contained, opt-in landscape designer. Instead of stacking per-tile
  // terrain levels, you lay a fine voxel mesh over the whole home board, paint
  // materials (grass/sand/water/stone/dirt/snow/lava) per voxel, then grab the
  // surface and pull it up/down. The grabbed point moves fully while its
  // neighbours follow with a smoothstep "tension" falloff, so you push and pull
  // the land into shape. "Apply" bakes the design back into the normal
  // world[x][z] terrain (dominant material + quantised height per tile) through
  // setCell(), so the result renders, saves, and can be built on like any other
  // terrain.
  //
  // Everything here lives inside one IIFE: its inner names never reach the
  // 2-space top-level scope, so they cannot collide with other modules and they
  // do not need to be globally unique. State persists under its own localStorage
  // key (the world schema is untouched), and all CSS is injected from JS. When
  // the mode is off, nothing is attached and the editor has zero impact.
  (function meshTerrainSculptorBoot() {
    const STORE_KEY = 'tinyworld:meshTerrain:v1';
    const PREF_KEY = 'tinyworld:meshTerrain:prefs:v1';
    const MAX_N = 128;            // hard cap on voxels-per-side across the board
    const VPT_OPTIONS = [4, 6, 8, 10];

    // Editor palette. ids match real terrain names so the bake maps 1:1.
    const MATERIALS = [
      { id: 'grass', label: 'Grass', color: 0x6fae4f },
      { id: 'sand',  label: 'Sand',  color: 0xe2cf95 },
      { id: 'water', label: 'Water', color: 0x4d8fd6 },
      { id: 'stone', label: 'Stone', color: 0x9a9ea6 },
      { id: 'dirt',  label: 'Dirt',  color: 0x9c6b43 },
      { id: 'snow',  label: 'Snow',  color: 0xeaf2f6 },
      { id: 'lava',  label: 'Lava',  color: 0xe2592a },
    ];

    // ---- editor state ----
    let active = false;
    let vpt = 8;
    let toolMode = 'sculpt';     // 'sculpt' | 'paint'
    let paintMatIndex = 0;
    let brushRadius = 1.5;       // world units (tiles)

    let gridAtEnter = 8;
    let half = 4;
    let N = 0;                   // voxels per side across the whole board
    let spacing = 1;            // world units per voxel = TILE / vpt
    let surfaceY = 0.18;

    let heights = null;          // Float32Array (N+1)^2 vertex Y deltas
    let mats = null;             // Uint8Array N^2 per-voxel material index
    let positions = null, colors = null, normals = null; // reused buffers

    let surfaceMesh = null, brushRing = null, grabHandle = null;
    let geom = null;
    let ray = null;

    let drag = null;             // { kind, c0, r0, startY, perPixel, startHeights }
    const hiddenMeshes = [];     // [mesh, prevVisible] pairs hidden while editing

    // ---- DOM ----
    let toggleBtn = null, panel = null, builtUI = false;
    let resSeg = null, modeSeg = null, swatchWrap = null, brushInput = null, brushVal = null;

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function loadPrefs() {
      try {
        const raw = localStorage.getItem(PREF_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (VPT_OPTIONS.includes(p.vpt)) vpt = p.vpt;
        if (p.toolMode === 'sculpt' || p.toolMode === 'paint') toolMode = p.toolMode;
        if (Number.isFinite(p.brushRadius)) brushRadius = clamp(p.brushRadius, 0.3, 12);
        if (Number.isInteger(p.paintMatIndex) && MATERIALS[p.paintMatIndex]) paintMatIndex = p.paintMatIndex;
      } catch (_) {}
    }
    function savePrefs() {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify({ vpt, toolMode, brushRadius, paintMatIndex }));
      } catch (_) {}
    }

    function saveMesh() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          v: 1, gridSize: gridAtEnter, vpt,
          heights: Array.from(heights),
          mats: Array.from(mats),
        }));
      } catch (_) {}
    }
    function loadMeshInto() {
      // Returns true if a compatible saved design was restored into heights/mats.
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        if (!s || s.gridSize !== gridAtEnter || s.vpt !== vpt) return false;
        if (!Array.isArray(s.heights) || s.heights.length !== heights.length) return false;
        if (!Array.isArray(s.mats) || s.mats.length !== mats.length) return false;
        heights.set(s.heights);
        mats.set(s.mats);
        return true;
      } catch (_) { return false; }
    }

    // ---- geometry sizing ----
    function recomputeDims() {
      gridAtEnter = (typeof GRID === 'number' && GRID > 0) ? GRID : 8;
      half = gridAtEnter / 2;
      surfaceY = (typeof TOP_H === 'number') ? TOP_H : 0.18;
      // Clamp voxels-per-tile so the whole-board mesh never exceeds MAX_N a side.
      let effVpt = vpt;
      while (effVpt > 2 && gridAtEnter * effVpt > MAX_N) effVpt -= 1;
      N = gridAtEnter * effVpt;
      spacing = gridAtEnter / N; // == TILE / effVpt
    }

    function vIdx(c, r) { return r * (N + 1) + c; }
    function vYat(c, r) { return surfaceY + heights[vIdx(c, r)]; }

    // ---- buffers ----
    function allocBuffers() {
      heights = new Float32Array((N + 1) * (N + 1));
      mats = new Uint8Array(N * N);          // defaults to 0 = grass
      const quadCount = N * N;
      positions = new Float32Array(quadCount * 18); // 2 tris * 3 verts * 3
      colors = new Float32Array(quadCount * 18);
      normals = new Float32Array(quadCount * 18);
    }

    function matColor(i) {
      const c = new THREE.Color(MATERIALS[i] ? MATERIALS[i].color : 0x6fae4f);
      return c;
    }

    function rebuildColors() {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const c = matColor(mats[j * N + i]);
          const base = (j * N + i) * 18;
          for (let k = 0; k < 6; k++) {
            colors[base + k * 3] = c.r;
            colors[base + k * 3 + 1] = c.g;
            colors[base + k * 3 + 2] = c.b;
          }
        }
      }
      if (geom) geom.attributes.color.needsUpdate = true;
    }

    function writeTri(off, ax, ay, az, bx, by, bz, cx, cy, cz) {
      positions[off] = ax; positions[off + 1] = ay; positions[off + 2] = az;
      positions[off + 3] = bx; positions[off + 4] = by; positions[off + 5] = bz;
      positions[off + 6] = cx; positions[off + 7] = cy; positions[off + 8] = cz;
      // flat normal, oriented up
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (let k = 0; k < 3; k++) {
        normals[off + k * 3] = nx;
        normals[off + k * 3 + 1] = ny;
        normals[off + k * 3 + 2] = nz;
      }
    }

    function rebuildPositions() {
      for (let j = 0; j < N; j++) {
        const z0 = j * spacing - half, z1 = (j + 1) * spacing - half;
        for (let i = 0; i < N; i++) {
          const x0 = i * spacing - half, x1 = (i + 1) * spacing - half;
          const y00 = vYat(i, j), y10 = vYat(i + 1, j), y11 = vYat(i + 1, j + 1), y01 = vYat(i, j + 1);
          const base = (j * N + i) * 18;
          // triangle A: (x0,z0) -> (x0,z1) -> (x1,z1)
          writeTri(base, x0, y00, z0, x0, y01, z1, x1, y11, z1);
          // triangle B: (x0,z0) -> (x1,z1) -> (x1,z0)
          writeTri(base + 9, x0, y00, z0, x1, y11, z1, x1, y10, z0);
        }
      }
      if (geom) {
        geom.attributes.position.needsUpdate = true;
        geom.attributes.normal.needsUpdate = true;
      }
    }

    function buildMesh() {
      allocBuffers();
      rebuildPositions();
      rebuildColors();
      geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      // Broad-phase bound covers the board plus a tall sculpt range so raycasts
      // never get culled when peaks/valleys grow.
      geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, surfaceY, 0), gridAtEnter * 0.95 + 60);
      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true, flatShading: true, side: THREE.DoubleSide,
      });
      surfaceMesh = new THREE.Mesh(geom, mat);
      surfaceMesh.userData = { kind: 'mesh-terrain-surface' };
      surfaceMesh.renderOrder = 1;
      scene.add(surfaceMesh);

      const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffe27a, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide,
      });
      brushRing = new THREE.Mesh(ringGeo, ringMat);
      brushRing.renderOrder = 30;
      brushRing.visible = false;
      scene.add(brushRing);

      const handleGeo = new THREE.SphereGeometry(1, 14, 10);
      const handleMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4, depthTest: false });
      grabHandle = new THREE.Mesh(handleGeo, handleMat);
      grabHandle.renderOrder = 31;
      grabHandle.visible = false;
      scene.add(grabHandle);
    }

    function disposeMesh() {
      for (const m of [surfaceMesh, brushRing, grabHandle]) {
        if (!m) continue;
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      }
      surfaceMesh = brushRing = grabHandle = geom = null;
      heights = mats = positions = colors = normals = null;
    }

    // ---- picking ----
    function pointerNDC(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
    }
    function raycastSurface(clientX, clientY) {
      if (!surfaceMesh) return null;
      if (!ray) ray = new THREE.Raycaster();
      ray.setFromCamera(pointerNDC(clientX, clientY), camera);
      const hits = ray.intersectObject(surfaceMesh, false);
      return hits.length ? hits[0].point : null;
    }
    function nearestVertex(point) {
      const c = clamp(Math.round((point.x + half) / spacing), 0, N);
      const r = clamp(Math.round((point.z + half) / spacing), 0, N);
      return { c, r };
    }

    function falloff(d) {
      const t = 1 - d / brushRadius;
      if (t <= 0) return 0;
      return t * t * (3 - 2 * t);
    }

    function showBrushAt(point) {
      if (!brushRing) return;
      const s = brushRadius;
      brushRing.scale.set(s, 1, s);
      brushRing.position.set(point.x, surfaceY + 0.02, point.z);
      brushRing.visible = true;
      const nv = nearestVertex(point);
      const hs = clamp(spacing * 0.42, 0.04, 0.4);
      grabHandle.scale.set(hs, hs, hs);
      grabHandle.position.set(nv.c * spacing - half, vYat(nv.c, nv.r), nv.r * spacing - half);
      grabHandle.visible = (toolMode === 'sculpt');
    }
    function hideBrush() {
      if (brushRing) brushRing.visible = false;
      if (grabHandle) grabHandle.visible = false;
    }

    // ---- edits ----
    function applySculpt(worldDy) {
      const gx = drag.c0 * spacing - half, gz = drag.r0 * spacing - half;
      const reach = Math.ceil(brushRadius / spacing) + 1;
      for (let dr = -reach; dr <= reach; dr++) {
        const r = drag.r0 + dr;
        if (r < 0 || r > N) continue;
        for (let dc = -reach; dc <= reach; dc++) {
          const c = drag.c0 + dc;
          if (c < 0 || c > N) continue;
          const vx = c * spacing - half, vz = r * spacing - half;
          const w = falloff(Math.hypot(vx - gx, vz - gz));
          if (w <= 0) continue;
          const idx = vIdx(c, r);
          heights[idx] = drag.startHeights[idx] + worldDy * w;
        }
      }
      rebuildPositions();
      grabHandle.position.y = vYat(drag.c0, drag.r0);
    }

    function applyPaint(point) {
      const ci = clamp(Math.floor((point.x + half) / spacing), 0, N - 1);
      const cj = clamp(Math.floor((point.z + half) / spacing), 0, N - 1);
      const reach = Math.ceil(brushRadius / spacing) + 1;
      let changed = false;
      for (let dj = -reach; dj <= reach; dj++) {
        const j = cj + dj;
        if (j < 0 || j >= N) continue;
        for (let di = -reach; di <= reach; di++) {
          const i = ci + di;
          if (i < 0 || i >= N) continue;
          // distance from voxel centre to the brush centre point
          const vx = (i + 0.5) * spacing - half, vz = (j + 0.5) * spacing - half;
          if (Math.hypot(vx - point.x, vz - point.z) > brushRadius) continue;
          if (mats[j * N + i] !== paintMatIndex) { mats[j * N + i] = paintMatIndex; changed = true; }
        }
      }
      if (changed) rebuildColors();
    }

    function perPixelWorldY(atPoint) {
      const h = renderer.domElement.clientHeight || window.innerHeight || 800;
      if (camera.isOrthographicCamera) {
        return ((camera.top - camera.bottom) / (camera.zoom || 1)) / h;
      }
      const dist = camera.position.distanceTo(atPoint);
      const fov = (camera.fov || 45) * Math.PI / 180;
      return (2 * dist * Math.tan(fov / 2)) / h;
    }

    // ---- pointer handlers (window capture phase) ----
    function inPanel(target) {
      return (panel && panel.contains(target)) || (toggleBtn && toggleBtn.contains(target));
    }
    function onDown(e) {
      if (!active || inPanel(e.target)) return;
      // Only engage on the 3D canvas itself; never hijack a click that landed on
      // toolbar/settings/other chrome that overlaps the canvas.
      if (e.target !== renderer.domElement) return;
      if (e.button !== 0) return;
      const point = raycastSurface(e.clientX, e.clientY);
      if (!point) return; // missed the surface -> let the camera orbit
      e.stopPropagation();
      e.preventDefault();
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
      if (toolMode === 'sculpt') {
        const nv = nearestVertex(point);
        drag = {
          kind: 'sculpt', c0: nv.c, r0: nv.r,
          startClientY: e.clientY,
          perPixel: perPixelWorldY(point),
          startHeights: heights.slice(),
        };
        showBrushAt(point);
      } else {
        drag = { kind: 'paint' };
        applyPaint(point);
        showBrushAt(point);
      }
    }
    function onMove(e) {
      if (!active || inPanel(e.target)) return;
      if (drag) {
        e.stopPropagation();
        e.preventDefault();
        if (drag.kind === 'sculpt') {
          const worldDy = (drag.startClientY - e.clientY) * drag.perPixel;
          applySculpt(worldDy);
          brushRing.position.set(drag.c0 * spacing - half, surfaceY + 0.02, drag.r0 * spacing - half);
        } else {
          const point = raycastSurface(e.clientX, e.clientY);
          if (point) { applyPaint(point); showBrushAt(point); }
        }
        return;
      }
      // hover preview (do not block — keeps orbit/zoom responsive)
      if (e.target !== renderer.domElement) { hideBrush(); return; }
      const point = raycastSurface(e.clientX, e.clientY);
      if (point) showBrushAt(point); else hideBrush();
    }
    function onUp(e) {
      if (!active) return;
      if (drag) {
        e.stopPropagation();
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
        drag = null;
        saveMesh();
      }
    }
    function attachPointer() {
      window.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    }
    function detachPointer() {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    }

    // ---- hide / restore the underlying home board while editing ----
    function hideHomeMeshes() {
      hiddenMeshes.length = 0;
      if (typeof cellMeshes !== 'object' || !cellMeshes) return;
      for (let x = 0; x < gridAtEnter; x++) {
        for (let z = 0; z < gridAtEnter; z++) {
          const m = cellMeshes[x + ',' + z];
          if (!m) continue;
          if (m.tile) { hiddenMeshes.push([m.tile, m.tile.visible]); m.tile.visible = false; }
          if (m.object) { hiddenMeshes.push([m.object, m.object.visible]); m.object.visible = false; }
        }
      }
    }
    function restoreHomeMeshes() {
      for (const [mesh, vis] of hiddenMeshes) { try { mesh.visible = vis; } catch (_) {} }
      hiddenMeshes.length = 0;
    }

    // ---- bake into the world ----
    function bake() {
      if (typeof setCell !== 'function') return;
      const MAXF = (typeof MAX_FLOORS === 'number') ? MAX_FLOORS : 8;
      const vCount = N / gridAtEnter; // voxels per tile side
      for (let tx = 0; tx < gridAtEnter; tx++) {
        for (let tz = 0; tz < gridAtEnter; tz++) {
          // dominant painted material over this tile's voxels
          const tally = new Array(MATERIALS.length).fill(0);
          for (let j = 0; j < vCount; j++) {
            for (let i = 0; i < vCount; i++) {
              const vi = tx * vCount + i, vj = tz * vCount + j;
              tally[mats[vj * N + vi]]++;
            }
          }
          let best = 0;
          for (let k = 1; k < tally.length; k++) if (tally[k] > tally[best]) best = k;
          const terrain = MATERIALS[best].id;
          // average vertex height across the tile -> quantised level
          let sum = 0, n = 0;
          for (let r = tz * vCount; r <= (tz + 1) * vCount; r++) {
            for (let c = tx * vCount; c <= (tx + 1) * vCount; c++) { sum += heights[vIdx(c, r)]; n++; }
          }
          const avg = n ? sum / n : 0;
          const level = clamp(Math.round(avg / 0.20) + 1, 1, MAXF);
          // preserve any existing object on this tile; only retarget terrain + height
          const prev = (typeof world === 'object' && world[tx] && world[tx][tz]) ? world[tx][tz] : {};
          setCell(tx, tz, {
            terrain, terrainFloors: level,
            kind: prev.kind || null, floors: prev.floors,
            buildingType: prev.buildingType, fenceSide: prev.fenceSide,
            extras: prev.extras, rotationY: prev.rotationY,
            offsetX: prev.offsetX, offsetY: prev.offsetY, offsetZ: prev.offsetZ,
            appearance: prev.appearance, waterFlow: prev.waterFlow,
            forceTile: true, animate: false, userEdited: true,
          });
        }
      }
      try { window.dispatchEvent(new Event('tinyworld:world-changed')); } catch (_) {}
      if (typeof saveState === 'function') { try { saveState(); } catch (_) {} }
    }

    // ---- enter / exit ----
    function enter() {
      if (active) return;
      if (typeof scene === 'undefined' || typeof camera === 'undefined' || typeof renderer === 'undefined') return;
      recomputeDims();
      buildMesh();
      if (!loadMeshInto()) { /* start flat on grass (already the default) */ }
      rebuildPositions();
      rebuildColors();
      hideHomeMeshes();
      attachPointer();
      active = true;
      document.body.classList.add('mesh-terrain-active');
      if (panel) panel.hidden = false;
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
      if (typeof renderScene === 'function') { try { renderScene(); } catch (_) {} }
    }
    function exit(commit) {
      if (!active) return;
      detachPointer();
      drag = null;
      restoreHomeMeshes();
      if (commit) { saveMesh(); bake(); }
      disposeMesh();
      active = false;
      document.body.classList.remove('mesh-terrain-active');
      if (panel) panel.hidden = true;
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
      if (typeof renderScene === 'function') { try { renderScene(); } catch (_) {} }
    }

    function resetFlat() {
      if (!heights || !mats) return;
      heights.fill(0);
      mats.fill(0);
      rebuildPositions();
      rebuildColors();
      saveMesh();
    }

    function changeResolution(newVpt) {
      if (!VPT_OPTIONS.includes(newVpt) || newVpt === vpt) return;
      // resample existing design into the new resolution so work is not lost
      const oldN = N, oldHeights = heights, oldMats = mats, oldGrid = gridAtEnter;
      vpt = newVpt;
      savePrefs();
      recomputeDims();
      allocBuffers();
      if (oldHeights && oldGrid === gridAtEnter) {
        for (let r = 0; r <= N; r++) {
          for (let c = 0; c <= N; c++) {
            const oc = clamp(Math.round(c / N * oldN), 0, oldN);
            const orr = clamp(Math.round(r / N * oldN), 0, oldN);
            heights[vIdx(c, r)] = oldHeights[orr * (oldN + 1) + oc];
          }
        }
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const oi = clamp(Math.floor(i / N * oldN), 0, oldN - 1);
            const oj = clamp(Math.floor(j / N * oldN), 0, oldN - 1);
            mats[j * N + i] = oldMats[oj * oldN + oi];
          }
        }
      }
      // rebuild the mesh with the new buffer sizes
      disposeMeshKeepData();
      buildMeshFromData();
      saveMesh();
    }
    // Rebuild geometry from the already-populated heights/mats (used by resize).
    function disposeMeshKeepData() {
      for (const m of [surfaceMesh, brushRing, grabHandle]) {
        if (!m) continue;
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      }
      surfaceMesh = brushRing = grabHandle = geom = null;
    }
    function buildMeshFromData() {
      const savedH = heights, savedM = mats;
      buildMesh();           // reallocs buffers + fresh meshes
      heights.set(savedH);
      mats.set(savedM);
      rebuildPositions();
      rebuildColors();
    }

    // ---- UI ----
    function injectStyles() {
      if (document.getElementById('mesh-terrain-styles')) return;
      const css = `
.mesh-terrain-toggle{position:fixed;right:14px;top:50%;transform:translateY(-178px);z-index:60;
  display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:12px;cursor:pointer;
  font:600 12px/1 system-ui,sans-serif;color:#143878;background:rgba(232,241,255,.96);
  border:1.5px solid #143878;box-shadow:inset 0 0 0 1px #fff, 0 4px 14px rgba(0,0,0,.18);}
.mesh-terrain-toggle[aria-pressed="true"]{background:#143878;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4),0 4px 14px rgba(0,0,0,.25);}
.mesh-terrain-toggle .glyph{font-size:14px;line-height:1;}
.mesh-terrain-panel{position:fixed;right:14px;top:50%;transform:translateY(-90px);z-index:61;width:236px;
  background:rgba(244,248,255,.98);color:#143878;border:1.5px solid #143878;border-radius:14px;
  box-shadow:inset 0 0 0 1px #fff,0 10px 30px rgba(0,0,0,.28);font:500 12px/1.35 system-ui,sans-serif;
  padding:10px 12px 12px;}
.mesh-terrain-panel[hidden]{display:none;}
.mesh-terrain-panel h4{margin:0 0 8px;font-size:13px;display:flex;align-items:center;justify-content:space-between;}
.mesh-terrain-panel .mt-close{cursor:pointer;border:none;background:none;color:#143878;font-size:16px;line-height:1;padding:0 2px;}
.mesh-terrain-panel .mt-row{margin:8px 0;}
.mesh-terrain-panel .mt-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;margin-bottom:4px;}
.mesh-terrain-seg{display:flex;gap:4px;flex-wrap:wrap;}
.mesh-terrain-seg button{flex:1 1 auto;min-width:34px;padding:5px 6px;border-radius:8px;cursor:pointer;
  border:1.5px solid #143878;background:#fff;color:#143878;font:600 11px/1 system-ui,sans-serif;}
.mesh-terrain-seg button.on{background:#143878;color:#fff;}
.mesh-terrain-swatches{display:flex;flex-wrap:wrap;gap:5px;}
.mesh-terrain-swatches button{width:26px;height:26px;border-radius:7px;cursor:pointer;border:2px solid rgba(20,56,120,.35);}
.mesh-terrain-swatches button.on{border-color:#143878;box-shadow:0 0 0 2px rgba(20,56,120,.25);}
.mesh-terrain-panel input[type=range]{width:100%;}
.mesh-terrain-actions{display:flex;gap:6px;margin-top:10px;}
.mesh-terrain-actions button{flex:1;padding:7px 6px;border-radius:9px;cursor:pointer;font:700 11px/1 system-ui,sans-serif;border:1.5px solid #143878;}
.mesh-terrain-actions .mt-apply{background:#1f7a3d;border-color:#0f4a24;color:#fff;}
.mesh-terrain-actions .mt-reset{background:#fff;color:#143878;}
.mesh-terrain-actions .mt-cancel{background:#fff;color:#8a2b2b;border-color:#8a2b2b;}
.mesh-terrain-hint{margin-top:8px;font-size:10.5px;opacity:.72;line-height:1.4;}
@media (max-width:700px){.mesh-terrain-toggle,.mesh-terrain-panel{top:auto;bottom:90px;transform:none;}
  .mesh-terrain-panel{right:8px;left:8px;width:auto;}}
`;
      const style = document.createElement('style');
      style.id = 'mesh-terrain-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    function makeSeg(options, getActive, onPick) {
      const wrap = document.createElement('div');
      wrap.className = 'mesh-terrain-seg';
      options.forEach(opt => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = opt.label;
        b.dataset.val = String(opt.val);
        b.addEventListener('click', () => { onPick(opt.val); syncSeg(wrap, getActive); });
        wrap.appendChild(b);
      });
      syncSeg(wrap, getActive);
      return wrap;
    }
    function syncSeg(wrap, getActive) {
      const cur = String(getActive());
      wrap.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === cur));
    }

    function buildUI() {
      if (builtUI) return;
      builtUI = true;
      injectStyles();

      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'mesh-terrain-toggle';
      toggleBtn.className = 'mesh-terrain-toggle';
      toggleBtn.setAttribute('aria-pressed', 'false');
      toggleBtn.title = 'Mesh Terrain — sculpt & paint a voxel landscape';
      toggleBtn.innerHTML = '<span class="glyph">◰</span><span>Mesh Terrain</span>';
      toggleBtn.addEventListener('click', () => { active ? exit(false) : enter(); });
      document.body.appendChild(toggleBtn);

      panel = document.createElement('div');
      panel.id = 'mesh-terrain-panel';
      panel.className = 'mesh-terrain-panel';
      panel.hidden = true;

      const head = document.createElement('h4');
      head.innerHTML = '<span>Mesh Terrain</span>';
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'mt-close'; close.textContent = '×';
      close.title = 'Close (discard)';
      close.addEventListener('click', () => exit(false));
      head.appendChild(close);
      panel.appendChild(head);

      // resolution
      const resRow = document.createElement('div'); resRow.className = 'mt-row';
      const resLab = document.createElement('div'); resLab.className = 'mt-label'; resLab.textContent = 'Voxels / tile';
      resSeg = makeSeg(VPT_OPTIONS.map(v => ({ label: v + '²', val: v })), () => vpt, v => changeResolution(v));
      resRow.appendChild(resLab); resRow.appendChild(resSeg); panel.appendChild(resRow);

      // tool mode
      const modeRow = document.createElement('div'); modeRow.className = 'mt-row';
      const modeLab = document.createElement('div'); modeLab.className = 'mt-label'; modeLab.textContent = 'Tool';
      modeSeg = makeSeg([{ label: 'Sculpt', val: 'sculpt' }, { label: 'Paint', val: 'paint' }], () => toolMode, v => {
        toolMode = v; savePrefs(); syncPaintVisibility();
      });
      modeRow.appendChild(modeLab); modeRow.appendChild(modeSeg); panel.appendChild(modeRow);

      // material swatches (paint)
      const swRow = document.createElement('div'); swRow.className = 'mt-row mt-paint-only';
      const swLab = document.createElement('div'); swLab.className = 'mt-label'; swLab.textContent = 'Material';
      swatchWrap = document.createElement('div'); swatchWrap.className = 'mesh-terrain-swatches';
      MATERIALS.forEach((m, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = m.label;
        b.style.background = '#' + m.color.toString(16).padStart(6, '0');
        b.classList.toggle('on', i === paintMatIndex);
        b.addEventListener('click', () => {
          paintMatIndex = i; savePrefs();
          swatchWrap.querySelectorAll('button').forEach((el, k) => el.classList.toggle('on', k === i));
        });
        swatchWrap.appendChild(b);
      });
      swRow.appendChild(swLab); swRow.appendChild(swatchWrap); panel.appendChild(swRow);

      // brush size
      const brushRow = document.createElement('div'); brushRow.className = 'mt-row';
      const brushLab = document.createElement('div'); brushLab.className = 'mt-label';
      brushLab.innerHTML = 'Brush size <span id="mt-brush-val"></span>';
      brushInput = document.createElement('input');
      brushInput.type = 'range'; brushInput.min = '0.3'; brushInput.max = '6'; brushInput.step = '0.1';
      brushInput.value = String(brushRadius);
      brushVal = brushLab.querySelector('#mt-brush-val');
      brushVal.textContent = '(' + brushRadius.toFixed(1) + ')';
      brushInput.addEventListener('input', () => {
        brushRadius = parseFloat(brushInput.value) || 1.5;
        brushVal.textContent = '(' + brushRadius.toFixed(1) + ')';
        savePrefs();
      });
      brushRow.appendChild(brushLab); brushRow.appendChild(brushInput); panel.appendChild(brushRow);

      // actions
      const actions = document.createElement('div'); actions.className = 'mesh-terrain-actions';
      const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'mt-apply'; apply.textContent = 'Apply';
      apply.title = 'Bake this design into the world terrain';
      apply.addEventListener('click', () => exit(true));
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'mt-reset'; reset.textContent = 'Flatten';
      reset.title = 'Reset the mesh to flat grass';
      reset.addEventListener('click', resetFlat);
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'mt-cancel'; cancel.textContent = 'Cancel';
      cancel.title = 'Discard and leave';
      cancel.addEventListener('click', () => exit(false));
      actions.appendChild(apply); actions.appendChild(reset); actions.appendChild(cancel);
      panel.appendChild(actions);

      const hint = document.createElement('div'); hint.className = 'mesh-terrain-hint';
      hint.textContent = 'Sculpt: drag the land up/down — neighbours follow with tension. Paint: drag to lay material. Drag empty space to orbit. Apply bakes it into the world to build on.';
      panel.appendChild(hint);

      document.body.appendChild(panel);
      syncPaintVisibility();
    }

    function syncPaintVisibility() {
      if (!panel) return;
      panel.querySelectorAll('.mt-paint-only').forEach(el => { el.style.display = (toolMode === 'paint') ? '' : 'none'; });
      if (grabHandle) grabHandle.visible = grabHandle.visible && toolMode === 'sculpt';
    }

    function boot() {
      loadPrefs();
      buildUI();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }

    // expose a tiny control surface for tooling / console
    window.__tinyworldMeshTerrain = {
      enter, exit, isActive: () => active,
      setTool: (m) => { if (m === 'sculpt' || m === 'paint') { toolMode = m; if (modeSeg) syncSeg(modeSeg, () => toolMode); syncPaintVisibility(); } },
    };
  })();

  // -------- mesh terrain sculptor (voxel paint + flat-top block sculpt) --------
  // An opt-in landscape designer. Lay a fine voxel grid over the home board,
  // paint per-voxel materials (grass/sand/water/stone/dirt/snow/lava), then grab
  // the surface and pull voxels up/down. Each voxel keeps a FLAT horizontal top
  // at its own height; vertical step-walls form between neighbours of different
  // heights, so the result reads as small flat-topped blocks depicting the
  // layout — never a smooth/curved surface. Pulling one voxel up drags its
  // neighbours up too, with a smoothstep "tension" falloff over the brush.
  //
  // "Apply" keeps the block mesh as the rendered terrain (persisted under its own
  // localStorage key) and hides the underlying flat home tiles — it does NOT bake
  // back into per-tile terrain, so there are no full tiles afterwards.
  //
  // Self-contained: one IIFE (no top-level names -> no cross-file decl clashes),
  // own localStorage keys (world schema untouched), CSS injected from JS, and
  // zero scene/listener footprint until the editor is opened.
  (function meshTerrainSculptorBoot() {
    const STORE_KEY = 'tinyworld:meshTerrain:v2';
    const PREF_KEY = 'tinyworld:meshTerrain:prefs:v1';
    const MAX_N = 96;            // hard cap on voxels-per-side across the board
    const VPT_OPTIONS = [4, 6, 8, 10];
    const FLOATS_PER_VOXEL = 90; // top quad + 4 wall quads, 2 tris each, 3 verts, 3 floats
    const WALL_SHADE = 0.78;     // side walls a touch darker than the top
    const BASE_SKIRT = 0.25;     // how far boundary walls drop below the lowest block

    // Editor palette. ids match real terrain names.
    const MATERIALS = [
      { id: 'grass', label: 'Grass', color: 0x6fae4f },
      { id: 'sand',  label: 'Sand',  color: 0xe2cf95 },
      { id: 'water', label: 'Water', color: 0x4d8fd6 },
      { id: 'stone', label: 'Stone', color: 0x9a9ea6 },
      { id: 'dirt',  label: 'Dirt',  color: 0x9c6b43 },
      { id: 'snow',  label: 'Snow',  color: 0xeaf2f6 },
      { id: 'lava',  label: 'Lava',  color: 0xe2592a },
    ];

    // ---- editor prefs ----
    let vpt = 8;
    let toolMode = 'sculpt';     // 'sculpt' | 'paint'
    let paintMatIndex = 0;
    let brushRadius = 1.5;       // world units (tiles)

    // ---- session state ----
    let editing = false;         // pointer handlers attached, brush shown
    let applied = false;         // a committed block design is being displayed
    let gridAtEnter = 8;
    let half = 4;
    let N = 0;                   // voxels per side across the whole board
    let spacing = 1;             // world units per voxel = TILE / effVpt
    let surfaceY = 0.18;

    let cellH = null;            // Float32Array(N*N) per-voxel top height delta
    let mats = null;             // Uint8Array(N*N) per-voxel material index
    let positions = null, colors = null, normals = null;

    let surfaceMesh = null, brushRing = null, grabHandle = null, geom = null;
    let ray = null;
    let drag = null;             // { kind, i0, j0, startClientY, perPixel, startH }
    let tmpColor = null;

    // ---- DOM ----
    let toggleBtn = null, panel = null, builtUI = false;
    let modeSeg = null, swatchWrap = null, brushInput = null, brushVal = null;

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function shown() { return !!surfaceMesh; }

    // ---- prefs persistence ----
    function loadPrefs() {
      try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
        if (!p) return;
        if (VPT_OPTIONS.includes(p.vpt)) vpt = p.vpt;
        if (p.toolMode === 'sculpt' || p.toolMode === 'paint') toolMode = p.toolMode;
        if (Number.isFinite(p.brushRadius)) brushRadius = clamp(p.brushRadius, 0.3, 12);
        if (Number.isInteger(p.paintMatIndex) && MATERIALS[p.paintMatIndex]) paintMatIndex = p.paintMatIndex;
      } catch (_) {}
    }
    function savePrefs() {
      try { localStorage.setItem(PREF_KEY, JSON.stringify({ vpt, toolMode, brushRadius, paintMatIndex })); } catch (_) {}
    }

    // ---- design persistence (its own key; world schema untouched) ----
    function saveDesign() {
      if (!cellH || !mats) return;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          v: 2, gridSize: gridAtEnter, vpt, applied,
          cellH: Array.from(cellH), mats: Array.from(mats),
        }));
      } catch (_) {}
    }
    function readDesign() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { return null; }
    }
    function clearDesign() { try { localStorage.removeItem(STORE_KEY); } catch (_) {} }

    function loadDesignInto(d) {
      if (!d || d.gridSize !== gridAtEnter || d.vpt !== vpt) return false;
      if (!Array.isArray(d.cellH) || d.cellH.length !== cellH.length) return false;
      if (!Array.isArray(d.mats) || d.mats.length !== mats.length) return false;
      cellH.set(d.cellH);
      mats.set(d.mats);
      return true;
    }

    // ---- sizing / buffers ----
    function recomputeDims() {
      gridAtEnter = (typeof GRID === 'number' && GRID > 0) ? GRID : 8;
      half = gridAtEnter / 2;
      surfaceY = (typeof TOP_H === 'number') ? TOP_H : 0.18;
      let effVpt = vpt;
      while (effVpt > 2 && gridAtEnter * effVpt > MAX_N) effVpt -= 1;
      N = gridAtEnter * effVpt;
      spacing = gridAtEnter / N;
    }
    function allocBuffers() {
      cellH = new Float32Array(N * N);
      mats = new Uint8Array(N * N);
      const f = N * N * FLOATS_PER_VOXEL;
      positions = new Float32Array(f);
      colors = new Float32Array(f);
      normals = new Float32Array(f);
    }
    function matColor(i) {
      if (!tmpColor) tmpColor = new THREE.Color();
      tmpColor.setHex(MATERIALS[i] ? MATERIALS[i].color : 0x6fae4f);
      return tmpColor;
    }

    // Write one vertex (position + normal + color) at float offset `o`.
    function wv(o, x, y, z, nx, ny, nz, r, g, b) {
      positions[o] = x; positions[o + 1] = y; positions[o + 2] = z;
      normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
    }
    // Write one quad (2 triangles a-b-c, a-c-d) from scalar corners — no
    // per-call array allocation, since this runs for every voxel on each edit.
    function quad(o, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, r, g, b) {
      wv(o, ax, ay, az, nx, ny, nz, r, g, b);
      wv(o + 3, bx, by, bz, nx, ny, nz, r, g, b);
      wv(o + 6, cx, cy, cz, nx, ny, nz, r, g, b);
      wv(o + 9, ax, ay, az, nx, ny, nz, r, g, b);
      wv(o + 12, cx, cy, cz, nx, ny, nz, r, g, b);
      wv(o + 15, dx, dy, dz, nx, ny, nz, r, g, b);
    }
    function writeDegenerate(o) {
      for (let k = 0; k < 18; k++) positions[o + k] = 0;
    }

    // Rebuild the whole block mesh from cellH + mats: each voxel = flat top + the
    // vertical walls needed where a neighbour (or the board edge) is lower.
    function rebuildGeometry() {
      let gmin = Infinity;
      for (let k = 0; k < cellH.length; k++) if (cellH[k] < gmin) gmin = cellH[k];
      if (!isFinite(gmin)) gmin = 0;
      const baseY = surfaceY + Math.min(0, gmin) - BASE_SKIRT;
      for (let j = 0; j < N; j++) {
        const z0 = j * spacing - half, z1 = (j + 1) * spacing - half;
        for (let i = 0; i < N; i++) {
          const idx = j * N + i;
          const x0 = i * spacing - half, x1 = (i + 1) * spacing - half;
          const topY = surfaceY + cellH[idx];
          const c = matColor(mats[idx]);
          const cr = c.r, cg = c.g, cb = c.b;
          const wr = cr * WALL_SHADE, wg = cg * WALL_SHADE, wb = cb * WALL_SHADE;
          let o = idx * FLOATS_PER_VOXEL;
          // flat top
          quad(o, x0, topY, z0, x0, topY, z1, x1, topY, z1, x1, topY, z0, 0, 1, 0, cr, cg, cb); o += 18;
          // east wall (x = x1)
          const nE = (i + 1 < N) ? surfaceY + cellH[idx + 1] : baseY;
          if (topY > nE + 1e-6) quad(o, x1, nE, z0, x1, nE, z1, x1, topY, z1, x1, topY, z0, 1, 0, 0, wr, wg, wb); else writeDegenerate(o); o += 18;
          // west wall (x = x0)
          const nW = (i - 1 >= 0) ? surfaceY + cellH[idx - 1] : baseY;
          if (topY > nW + 1e-6) quad(o, x0, nW, z1, x0, nW, z0, x0, topY, z0, x0, topY, z1, -1, 0, 0, wr, wg, wb); else writeDegenerate(o); o += 18;
          // south wall (z = z1)
          const nS = (j + 1 < N) ? surfaceY + cellH[idx + N] : baseY;
          if (topY > nS + 1e-6) quad(o, x0, nS, z1, x1, nS, z1, x1, topY, z1, x0, topY, z1, 0, 0, 1, wr, wg, wb); else writeDegenerate(o); o += 18;
          // north wall (z = z0)
          const nN = (j - 1 >= 0) ? surfaceY + cellH[idx - N] : baseY;
          if (topY > nN + 1e-6) quad(o, x1, nN, z0, x0, nN, z0, x0, topY, z0, x1, topY, z0, 0, 0, -1, wr, wg, wb); else writeDegenerate(o); o += 18;
        }
      }
      if (geom) {
        geom.attributes.position.needsUpdate = true;
        geom.attributes.color.needsUpdate = true;
        geom.attributes.normal.needsUpdate = true;
      }
    }

    function buildMesh() {
      allocBuffers();
    }
    function buildMeshMeshes() {
      rebuildGeometry();
      geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, surfaceY, 0), gridAtEnter * 1.1 + 80);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      surfaceMesh = new THREE.Mesh(geom, mat);
      surfaceMesh.userData = { kind: 'mesh-terrain-surface' };
      surfaceMesh.renderOrder = 1;
      scene.add(surfaceMesh);

      const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
      ringGeo.rotateX(-Math.PI / 2);
      brushRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
      brushRing.renderOrder = 30; brushRing.visible = false; scene.add(brushRing);

      grabHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff2c4, depthTest: false }));
      grabHandle.renderOrder = 31; grabHandle.visible = false; scene.add(grabHandle);
    }
    function disposeMeshes() {
      for (const m of [surfaceMesh, brushRing, grabHandle]) {
        if (!m) continue;
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      }
      surfaceMesh = brushRing = grabHandle = geom = null;
    }

    // ---- picking ----
    function pointerNDC(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    }
    function raycastSurface(clientX, clientY) {
      if (!surfaceMesh) return null;
      if (!ray) ray = new THREE.Raycaster();
      ray.setFromCamera(pointerNDC(clientX, clientY), camera);
      const hits = ray.intersectObject(surfaceMesh, false);
      return hits.length ? hits[0].point : null;
    }
    function voxelAt(point) {
      return {
        i: clamp(Math.floor((point.x + half) / spacing), 0, N - 1),
        j: clamp(Math.floor((point.z + half) / spacing), 0, N - 1),
      };
    }
    function voxelCenter(i, j) { return { x: (i + 0.5) * spacing - half, z: (j + 0.5) * spacing - half }; }
    function falloff(d) { const t = 1 - d / brushRadius; return t <= 0 ? 0 : t * t * (3 - 2 * t); }

    function showBrushAt(point) {
      if (!brushRing) return;
      brushRing.scale.set(brushRadius, 1, brushRadius);
      brushRing.position.set(point.x, surfaceY + 0.02, point.z);
      brushRing.visible = true;
      const v = voxelAt(point), ctr = voxelCenter(v.i, v.j);
      const hs = clamp(spacing * 0.45, 0.05, 0.45);
      grabHandle.scale.set(hs, hs, hs);
      grabHandle.position.set(ctr.x, surfaceY + cellH[v.j * N + v.i] + hs, ctr.z);
      grabHandle.visible = (toolMode === 'sculpt');
    }
    function hideBrush() { if (brushRing) brushRing.visible = false; if (grabHandle) grabHandle.visible = false; }

    // ---- edits ----
    function applySculpt(worldDy) {
      const gc = voxelCenter(drag.i0, drag.j0);
      const reach = Math.ceil(brushRadius / spacing) + 1;
      for (let dj = -reach; dj <= reach; dj++) {
        const j = drag.j0 + dj; if (j < 0 || j >= N) continue;
        for (let di = -reach; di <= reach; di++) {
          const i = drag.i0 + di; if (i < 0 || i >= N) continue;
          const ctr = voxelCenter(i, j);
          const w = falloff(Math.hypot(ctr.x - gc.x, ctr.z - gc.z));
          if (w <= 0) continue;
          const idx = j * N + i;
          cellH[idx] = drag.startH[idx] + worldDy * w;
        }
      }
      rebuildGeometry();
      grabHandle.position.y = surfaceY + cellH[drag.j0 * N + drag.i0] + grabHandle.scale.y;
    }
    function applyPaint(point) {
      const reach = Math.ceil(brushRadius / spacing) + 1;
      const v = voxelAt(point);
      let changed = false;
      for (let dj = -reach; dj <= reach; dj++) {
        const j = v.j + dj; if (j < 0 || j >= N) continue;
        for (let di = -reach; di <= reach; di++) {
          const i = v.i + di; if (i < 0 || i >= N) continue;
          const ctr = voxelCenter(i, j);
          if (Math.hypot(ctr.x - point.x, ctr.z - point.z) > brushRadius) continue;
          if (mats[j * N + i] !== paintMatIndex) { mats[j * N + i] = paintMatIndex; changed = true; }
        }
      }
      if (changed) rebuildGeometry();
    }
    function perPixelWorldY(atPoint) {
      const h = renderer.domElement.clientHeight || window.innerHeight || 800;
      if (camera.isOrthographicCamera) return ((camera.top - camera.bottom) / (camera.zoom || 1)) / h;
      const dist = camera.position.distanceTo(atPoint);
      const fov = (camera.fov || 45) * Math.PI / 180;
      return (2 * dist * Math.tan(fov / 2)) / h;
    }

    // ---- pointer handlers (window capture phase) ----
    function inPanel(t) { return (panel && panel.contains(t)) || (toggleBtn && toggleBtn.contains(t)); }
    function onDown(e) {
      if (!editing || inPanel(e.target)) return;
      if (e.target !== renderer.domElement) return; // never hijack chrome clicks
      if (e.button !== 0) return;
      const point = raycastSurface(e.clientX, e.clientY);
      if (!point) return; // missed surface -> let the camera orbit
      e.stopPropagation(); e.preventDefault();
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
      if (toolMode === 'sculpt') {
        const v = voxelAt(point);
        drag = { kind: 'sculpt', i0: v.i, j0: v.j, startClientY: e.clientY, perPixel: perPixelWorldY(point), startH: cellH.slice() };
        showBrushAt(point);
      } else {
        drag = { kind: 'paint' };
        applyPaint(point); showBrushAt(point);
      }
    }
    function onMove(e) {
      if (!editing || inPanel(e.target)) return;
      if (drag) {
        e.stopPropagation(); e.preventDefault();
        if (drag.kind === 'sculpt') {
          applySculpt((drag.startClientY - e.clientY) * drag.perPixel);
          const ctr = voxelCenter(drag.i0, drag.j0);
          brushRing.position.set(ctr.x, surfaceY + 0.02, ctr.z);
        } else {
          const p = raycastSurface(e.clientX, e.clientY);
          if (p) { applyPaint(p); showBrushAt(p); }
        }
        return;
      }
      if (e.target !== renderer.domElement) { hideBrush(); return; }
      const p = raycastSurface(e.clientX, e.clientY);
      if (p) showBrushAt(p); else hideBrush();
    }
    function onUp(e) {
      if (!editing) return;
      if (drag) {
        e.stopPropagation();
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
        drag = null;
        saveDesign();
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

    // ---- hide/show the flat home tiles under the block terrain ----
    function setHomeMeshesVisible(visible) {
      if (typeof cellMeshes !== 'object' || !cellMeshes) return;
      for (let x = 0; x < gridAtEnter; x++) {
        for (let z = 0; z < gridAtEnter; z++) {
          const m = cellMeshes[x + ',' + z];
          if (!m) continue;
          if (m.tile) m.tile.visible = visible;
          if (m.object) m.object.visible = visible;
        }
      }
    }
    function applyDisplayHiding() { if (shown()) setHomeMeshesVisible(false); }

    function repaint() { if (typeof renderScene === 'function') { try { renderScene(); } catch (_) {} } }

    // ---- open / commit / cancel / remove ----
    function openEditor() {
      if (editing) return;
      if (typeof scene === 'undefined' || typeof camera === 'undefined' || typeof renderer === 'undefined') return;
      if (!shown()) {
        recomputeDims();
        buildMesh();
        const d = readDesign();
        if (d) { applied = !!d.applied; if (!loadDesignInto(d)) applied = false; }
        buildMeshMeshes();
      }
      setHomeMeshesVisible(false);
      attachPointer();
      editing = true;
      document.body.classList.add('mesh-terrain-active');
      if (panel) panel.hidden = false;
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
      repaint();
    }
    function leaveEditOnly() {
      detachPointer();
      drag = null;
      hideBrush();
      editing = false;
      document.body.classList.remove('mesh-terrain-active');
      if (panel) panel.hidden = true;
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
    }
    function applyDesign() {
      // Keep the block terrain displayed; persist it. No bake into world tiles.
      applied = true;
      saveDesign();
      setHomeMeshesVisible(false);
      leaveEditOnly();
      repaint();
    }
    function cancelEdit() {
      const d = readDesign();
      if (d && d.applied && d.gridSize === gridAtEnter && d.vpt === vpt && loadDesignInto(d)) {
        // revert to the last applied design and keep it displayed
        applied = true;
        rebuildGeometry();
        setHomeMeshesVisible(false);
        leaveEditOnly();
      } else {
        // nothing committed -> tear the editor down and restore the flat tiles
        leaveEditOnly();
        disposeMeshes();
        cellH = mats = positions = colors = normals = null;
        setHomeMeshesVisible(true);
        applied = false;
      }
      repaint();
    }
    function removeDesign() {
      leaveEditOnly();
      disposeMeshes();
      cellH = mats = positions = colors = normals = null;
      setHomeMeshesVisible(true);
      applied = false;
      clearDesign();
      repaint();
    }
    function flatten() {
      if (!cellH) return;
      cellH.fill(0); mats.fill(0);
      rebuildGeometry();
      saveDesign();
    }

    function changeResolution(newVpt) {
      if (!VPT_OPTIONS.includes(newVpt) || newVpt === vpt) return;
      const oldN = N, oldH = cellH, oldM = mats, oldGrid = gridAtEnter, wasShown = shown();
      vpt = newVpt; savePrefs();
      recomputeDims();
      allocBuffers();
      if (oldH && oldGrid === gridAtEnter) {
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const oi = clamp(Math.floor(i / N * oldN), 0, oldN - 1);
            const oj = clamp(Math.floor(j / N * oldN), 0, oldN - 1);
            cellH[j * N + i] = oldH[oj * oldN + oi];
            mats[j * N + i] = oldM[oj * oldN + oi];
          }
        }
      }
      if (wasShown) { disposeMeshes(); buildMeshMeshes(); }
      saveDesign();
      repaint();
    }

    // ---- boot-time restore of an applied design ----
    function restoreApplied() {
      const d = readDesign();
      if (!d || !d.applied) return;
      if (typeof GRID !== 'number') return;
      gridAtEnter = GRID;
      if (d.gridSize !== gridAtEnter) return;
      if (VPT_OPTIONS.includes(d.vpt)) vpt = d.vpt;
      recomputeDims();
      buildMesh();
      if (!loadDesignInto(d)) return;
      applied = true;
      buildMeshMeshes();
      setHomeMeshesVisible(false);
      // The world tiles may render slightly after us; re-hide a couple of times.
      setTimeout(applyDisplayHiding, 600);
      setTimeout(applyDisplayHiding, 1800);
      repaint();
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
  box-shadow:inset 0 0 0 1px #fff,0 10px 30px rgba(0,0,0,.28);font:500 12px/1.35 system-ui,sans-serif;padding:10px 12px 12px;}
.mesh-terrain-panel[hidden]{display:none;}
.mesh-terrain-panel h4{margin:0 0 8px;font-size:13px;display:flex;align-items:center;justify-content:space-between;}
.mesh-terrain-panel .mt-close{cursor:pointer;border:none;background:none;color:#143878;font-size:16px;line-height:1;padding:0 2px;}
.mesh-terrain-panel .mt-row{margin:8px 0;}
.mesh-terrain-panel .mt-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;margin-bottom:4px;}
.mesh-terrain-seg{display:flex;gap:4px;flex-wrap:wrap;}
.mesh-terrain-seg button{flex:1 1 auto;min-width:34px;padding:5px 6px;border-radius:8px;cursor:pointer;border:1.5px solid #143878;background:#fff;color:#143878;font:600 11px/1 system-ui,sans-serif;}
.mesh-terrain-seg button.on{background:#143878;color:#fff;}
.mesh-terrain-swatches{display:flex;flex-wrap:wrap;gap:5px;}
.mesh-terrain-swatches button{width:26px;height:26px;border-radius:7px;cursor:pointer;border:2px solid rgba(20,56,120,.35);}
.mesh-terrain-swatches button.on{border-color:#143878;box-shadow:0 0 0 2px rgba(20,56,120,.25);}
.mesh-terrain-panel input[type=range]{width:100%;}
.mesh-terrain-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.mesh-terrain-actions button{flex:1 1 46%;padding:7px 6px;border-radius:9px;cursor:pointer;font:700 11px/1 system-ui,sans-serif;border:1.5px solid #143878;}
.mesh-terrain-actions .mt-apply{background:#1f7a3d;border-color:#0f4a24;color:#fff;}
.mesh-terrain-actions .mt-reset{background:#fff;color:#143878;}
.mesh-terrain-actions .mt-cancel{background:#fff;color:#8a2b2b;border-color:#8a2b2b;}
.mesh-terrain-actions .mt-remove{background:#fff;color:#8a2b2b;border-color:#8a2b2b;}
.mesh-terrain-hint{margin-top:8px;font-size:10.5px;opacity:.72;line-height:1.4;}
@media (max-width:700px){.mesh-terrain-toggle,.mesh-terrain-panel{top:auto;bottom:90px;transform:none;}.mesh-terrain-panel{right:8px;left:8px;width:auto;}}
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
        b.type = 'button'; b.textContent = opt.label; b.dataset.val = String(opt.val);
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
    function syncPaintVisibility() {
      if (!panel) return;
      panel.querySelectorAll('.mt-paint-only').forEach(el => { el.style.display = (toolMode === 'paint') ? '' : 'none'; });
    }

    function buildUI() {
      if (builtUI) return;
      builtUI = true;
      injectStyles();

      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button'; toggleBtn.id = 'mesh-terrain-toggle'; toggleBtn.className = 'mesh-terrain-toggle';
      toggleBtn.setAttribute('aria-pressed', 'false');
      toggleBtn.title = 'Mesh Terrain — sculpt & paint a voxel-block landscape';
      toggleBtn.innerHTML = '<span class="glyph">◰</span><span>Mesh Terrain</span>';
      toggleBtn.addEventListener('click', () => { editing ? cancelEdit() : openEditor(); });
      document.body.appendChild(toggleBtn);

      panel = document.createElement('div');
      panel.id = 'mesh-terrain-panel'; panel.className = 'mesh-terrain-panel'; panel.hidden = true;

      const head = document.createElement('h4');
      head.innerHTML = '<span>Mesh Terrain</span>';
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'mt-close'; close.textContent = '×'; close.title = 'Close (revert this edit)';
      close.addEventListener('click', cancelEdit);
      head.appendChild(close); panel.appendChild(head);

      const resRow = document.createElement('div'); resRow.className = 'mt-row';
      const resLab = document.createElement('div'); resLab.className = 'mt-label'; resLab.textContent = 'Voxels / tile';
      resRow.appendChild(resLab);
      resRow.appendChild(makeSeg(VPT_OPTIONS.map(v => ({ label: v + '²', val: v })), () => vpt, v => changeResolution(v)));
      panel.appendChild(resRow);

      const modeRow = document.createElement('div'); modeRow.className = 'mt-row';
      const modeLab = document.createElement('div'); modeLab.className = 'mt-label'; modeLab.textContent = 'Tool';
      modeSeg = makeSeg([{ label: 'Sculpt', val: 'sculpt' }, { label: 'Paint', val: 'paint' }], () => toolMode, v => { toolMode = v; savePrefs(); syncPaintVisibility(); });
      modeRow.appendChild(modeLab); modeRow.appendChild(modeSeg); panel.appendChild(modeRow);

      const swRow = document.createElement('div'); swRow.className = 'mt-row mt-paint-only';
      const swLab = document.createElement('div'); swLab.className = 'mt-label'; swLab.textContent = 'Material';
      swatchWrap = document.createElement('div'); swatchWrap.className = 'mesh-terrain-swatches';
      MATERIALS.forEach((m, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.title = m.label;
        b.style.background = '#' + m.color.toString(16).padStart(6, '0');
        b.classList.toggle('on', i === paintMatIndex);
        b.addEventListener('click', () => { paintMatIndex = i; savePrefs(); swatchWrap.querySelectorAll('button').forEach((el, k) => el.classList.toggle('on', k === i)); });
        swatchWrap.appendChild(b);
      });
      swRow.appendChild(swLab); swRow.appendChild(swatchWrap); panel.appendChild(swRow);

      const brushRow = document.createElement('div'); brushRow.className = 'mt-row';
      const brushLab = document.createElement('div'); brushLab.className = 'mt-label';
      brushLab.innerHTML = 'Brush size <span id="mt-brush-val"></span>';
      brushInput = document.createElement('input');
      brushInput.type = 'range'; brushInput.min = '0.3'; brushInput.max = '6'; brushInput.step = '0.1'; brushInput.value = String(brushRadius);
      brushVal = brushLab.querySelector('#mt-brush-val'); brushVal.textContent = '(' + brushRadius.toFixed(1) + ')';
      brushInput.addEventListener('input', () => { brushRadius = parseFloat(brushInput.value) || 1.5; brushVal.textContent = '(' + brushRadius.toFixed(1) + ')'; savePrefs(); });
      brushRow.appendChild(brushLab); brushRow.appendChild(brushInput); panel.appendChild(brushRow);

      const actions = document.createElement('div'); actions.className = 'mesh-terrain-actions';
      const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'mt-apply'; apply.textContent = 'Apply'; apply.title = 'Keep these blocks as the terrain'; apply.addEventListener('click', applyDesign);
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'mt-reset'; reset.textContent = 'Flatten'; reset.title = 'Reset to flat grass blocks'; reset.addEventListener('click', flatten);
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'mt-cancel'; cancel.textContent = 'Cancel'; cancel.title = 'Revert this edit'; cancel.addEventListener('click', cancelEdit);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mt-remove'; remove.textContent = 'Remove'; remove.title = 'Delete the block terrain and restore flat tiles'; remove.addEventListener('click', removeDesign);
      actions.appendChild(apply); actions.appendChild(reset); actions.appendChild(cancel); actions.appendChild(remove);
      panel.appendChild(actions);

      const hint = document.createElement('div'); hint.className = 'mesh-terrain-hint';
      hint.textContent = 'Sculpt: drag a voxel up/down — flat-topped blocks, neighbours follow with tension. Paint: drag to lay material. Drag empty space to orbit. Apply keeps the blocks as the terrain.';
      panel.appendChild(hint);

      document.body.appendChild(panel);
      syncPaintVisibility();
    }

    function boot() {
      loadPrefs();
      buildUI();
      try { restoreApplied(); } catch (_) {}
      window.addEventListener('tinyworld:world-changed', applyDisplayHiding);
    }
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();

    window.__tinyworldMeshTerrain = {
      open: openEditor, apply: applyDesign, cancel: cancelEdit, remove: removeDesign,
      isEditing: () => editing, isApplied: () => applied,
      setTool: (m) => { if (m === 'sculpt' || m === 'paint') { toolMode = m; if (modeSeg) syncSeg(modeSeg, () => toolMode); syncPaintVisibility(); } },
    };
  })();

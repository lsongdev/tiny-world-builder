  // -------- layers panel --------
  (function initLayersPanel() {
    const panel = document.getElementById('layers-panel');
    const toggleBtn = document.getElementById('layers-toggle');
    const closeBtn = document.getElementById('layers-close');
    const refreshBtn = document.getElementById('layers-refresh');
    const treeEl = document.getElementById('layers-tree');
    const summaryEl = document.getElementById('layers-summary');
    const searchEl = document.getElementById('layers-search');
    if (!panel || !toggleBtn || !treeEl) return;

    // --- Layers / Properties tabs (Properties relocates the shared selection
    // properties panel into this dialog) ---
    const layersTabBtns = Array.from(panel.querySelectorAll('.layers-tab'));
    const layersPanelLayers = document.getElementById('layers-panel-layers');
    const layersPanelProps = document.getElementById('layers-panel-properties');
    const layersPropsHost = document.getElementById('layers-props-host');
    const layersPropsEmpty = document.getElementById('layers-props-empty');
    let layersActiveTab = 'layers';
    let selPropsHome = null;
    function selPropsEl() { return document.getElementById('agent-selection-properties'); }
    function captureSelPropsHome() {
      const el = selPropsEl();
      if (el && !selPropsHome) selPropsHome = { parent: el.parentNode, next: el.nextSibling };
    }
    function moveSelPropsIntoLayers() {
      const el = selPropsEl();
      if (!el || !layersPropsHost) return;
      captureSelPropsHome();
      if (el.parentNode !== layersPropsHost) layersPropsHost.appendChild(el);
      el.hidden = false;
      if (layersPropsEmpty) layersPropsEmpty.hidden = el.childNodes.length > 0;
    }
    function restoreSelProps() {
      const el = selPropsEl();
      if (!el || !selPropsHome || !selPropsHome.parent) return;
      if (el.parentNode === layersPropsHost) {
        if (selPropsHome.next && selPropsHome.next.parentNode === selPropsHome.parent) {
          selPropsHome.parent.insertBefore(el, selPropsHome.next);
        } else {
          selPropsHome.parent.appendChild(el);
        }
      }
    }
    function setLayersTab(name) {
      layersActiveTab = (name === 'properties') ? 'properties' : 'layers';
      layersTabBtns.forEach(b => {
        const on = b.getAttribute('data-layers-tab') === layersActiveTab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (layersPanelLayers) layersPanelLayers.hidden = layersActiveTab !== 'layers';
      if (layersPanelProps) layersPanelProps.hidden = layersActiveTab !== 'properties';
      if (layersActiveTab === 'properties') moveSelPropsIntoLayers();
      else restoreSelProps();
    }
    layersTabBtns.forEach(b => b.addEventListener('click', () => setLayersTab(b.getAttribute('data-layers-tab'))));

    const OPEN_KEY = 'tinyworld:layers-panel-open.v1';
    const POS_KEY = 'tinyworld:layers-panel-pos.v1';
    let activeLayerId = null;
    let refreshTimer = null;
    let panelDrag = null;
    // Tracks per-cell expand/collapse state so it survives full innerHTML rebuilds.
    const cellOpen = new Map();

    function fenceSideLabel(side) {
      return ({ n: 'N', e: 'E', s: 'S', w: 'W', 'center-x': 'Center X', 'center-z': 'Center Z' })[side] || titleCase(side);
    }

    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    function titleCase(value) {
      return String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function toolLabelFor(type, value) {
      try {
        if (Array.isArray(TOOLS)) {
          const tool = TOOLS.find(t => t && t[type] === value);
          if (tool && tool.label) return tool.label;
        }
      } catch (_) {}
      return titleCase(value || 'Empty');
    }

    function iconFor(kind, terrain) {
      const key = kind || terrain;
      return ({
        grass: '▦', path: '▤', dirt: '▥', water: '≈', stone: '◼', lava: '◆', sand: '▧', snow: '✦',
        house: '⌂', tree: '♣', fence: '╫', rock: '●', flower: '✿', bush: '♣', tuft: '⋱',
        bridge: '═', crop: '▥', corn: '▥', wheat: '▥', pumpkin: '◉', carrot: '▾', sunflower: '✹',
        model: '◇', 'model-stamp': '◇', 'voxel-build': '⬡', ripple: '≈', waterfall: '⇣', vehicle: '▻',
      })[key] || '◌';
    }

    function selectedWorldCoordSet() {
      const out = new Set();
      try {
        const sel = window.__tinyworldSelection;
        if (sel && typeof sel.worldCoords === 'function') {
          sel.worldCoords().forEach(c => out.add(Math.round(c.x) + ',' + Math.round(c.z)));
        }
      } catch (_) {}
      return out;
    }

    function cellLayerId(type, x, z, extraIndex) {
      return type + ':' + x + ':' + z + (Number.isFinite(extraIndex) ? ':' + extraIndex : '');
    }

    function terrainDetail(cell) {
      const parts = [];
      const level = typeof terrainLevelForCell === 'function' ? terrainLevelForCell(cell) : (cell.terrainFloors || 1);
      if (level && level !== 1) parts.push('level ' + level);
      if (cell.waterFlow && cell.waterFlow !== 'auto') parts.push('flow ' + cell.waterFlow);
      return parts.join(' · ');
    }

    function objectDetail(cell) {
      const parts = [];
      if (cell.buildingType) parts.push(titleCase(cell.buildingType));
      if (cell.floors && cell.floors !== 1) parts.push(cell.floors + ' floors');
      if (cell.fenceSide) parts.push('side ' + cell.fenceSide);
      if (cell.rotationY) parts.push('rot ' + Math.round((cell.rotationY || 0) * 180 / Math.PI) + '°');
      if (cell.offsetX || cell.offsetY || cell.offsetZ) parts.push('offset');
      const app = cell.appearance || null;
      if (app && (app.modelStampId || app.voxelStampId || app.material || app.bodyColor || app.topColor)) parts.push('styled');
      return parts.join(' · ');
    }

    // Build one entry per occupied cell. The cell's terrain is the parent node;
    // its object (kind) and any extras are stacked as children, matching the
    // "Grass > Fence / Cottage" hierarchy requested for the layers tree.
    function islandBoards() {
      const list = [{ id: 'home', label: 'Home Island', icon: '\u2302', boardX: 0, boardZ: 0 }];
      if (typeof editableIslands !== 'undefined' && Array.isArray(editableIslands)) {
        editableIslands.forEach((isl, i) => {
          if (!isl) return;
          list.push({ id: isl.id, label: 'Island ' + (i + 1), icon: '\u25C7', boardX: isl.boardX || 0, boardZ: isl.boardZ || 0 });
        });
      }
      return list;
    }
    function collectIslandCells(board) {
      const cells = [];
      const size = Number.isFinite(GRID) ? GRID : 0;
      for (let lx = 0; lx < size; lx++) {
        for (let lz = 0; lz < size; lz++) {
          const x = (board.boardX || 0) * size + lx;
          const z = (board.boardZ || 0) * size + lz;
          const cell = getWorldCell(x, z);
          if (!cell) continue;
          const terrain = cell.terrain || 'grass';
          const level = typeof terrainLevelForCell === 'function' ? terrainLevelForCell(cell) : (cell.terrainFloors || 1);
          const terrainOverride = (terrain && terrain !== 'grass') || level !== 1 || (cell.waterFlow && cell.waterFlow !== 'auto');
          const children = [];
          if (cell.kind) {
            const base = toolLabelFor('kind', cell.kind);
            const side = cell.kind === 'fence' && cell.fenceSide ? ' (' + fenceSideLabel(cell.fenceSide) + ')' : '';
            children.push({
              id: cellLayerId('object', x, z),
              type: 'object',
              label: base + side,
              detail: objectDetail(cell) || 'placed object',
              icon: iconFor(cell.kind),
              search: [cell.kind, base, objectDetail(cell)].join(' '),
            });
          }
          if (Array.isArray(cell.extras)) {
            cell.extras.forEach((extra, index) => {
              if (!extra || !extra.kind) return;
              const base = toolLabelFor('kind', extra.kind);
              const side = extra.kind === 'fence' && extra.fenceSide ? ' (' + fenceSideLabel(extra.fenceSide) + ')' : '';
              const detail = [extra.fenceSide && extra.kind !== 'fence' ? 'side ' + extra.fenceSide : '', extra.floors && extra.floors !== 1 ? extra.floors + ' floors' : ''].filter(Boolean).join(' · ') || 'decorative layer';
              children.push({
                id: cellLayerId('extra', x, z, index),
                type: 'extra',
                label: base + side,
                detail,
                icon: iconFor(extra.kind),
                search: [extra.kind, base, detail].join(' '),
              });
            });
          }
          if (!children.length && !terrainOverride) continue;
          const tDetail = terrainDetail(cell);
          cells.push({
            id: cellLayerId('cell', x, z),
            x, z,
            terrainLabel: toolLabelFor('terrain', terrain),
            terrainIcon: iconFor(null, terrain),
            terrainDetail: tDetail,
            children,
            search: [terrain, toolLabelFor('terrain', terrain), x, z, tDetail].concat(children.map(c => c.search)).join(' '),
          });
        }
      }
      return cells;
    }
    function collectIslands() {
      return islandBoards().map(b => ({ board: b, cells: collectIslandCells(b) }));
    }

    function filterRows(rows, query) {
      if (!query) return rows;
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return rows.filter(row => {
        const hay = String(row.search || '').toLowerCase();
        return terms.every(term => hay.includes(term));
      });
    }

    function renderChildRow(child, x, z) {
      const isSelected = activeLayerId === child.id;
      return '<button type="button" class="layers-row' + (isSelected ? ' is-selected' : '') + '" role="treeitem" data-layer-id="' + esc(child.id) + '" data-layer-type="' + esc(child.type) + '" data-x="' + x + '" data-z="' + z + '">'
        + '<span class="layers-row-icon" aria-hidden="true">' + esc(child.icon) + '</span>'
        + '<span class="layers-row-main"><strong>' + esc(child.label) + '</strong><em>' + esc(child.detail) + '</em></span>'
        + '</button>';
    }

    function renderCell(cell, selectedCoords) {
      const coordKey = cell.x + ',' + cell.z;
      const isSelected = activeLayerId === cell.id || selectedCoords.has(coordKey);
      const coordPill = '<span class="layers-row-coord">' + coordKey + '</span>';
      if (!cell.children.length) {
        // Terrain-only override: render as a directly selectable leaf row.
        return '<button type="button" class="layers-row layers-cell-leaf' + (isSelected ? ' is-selected' : '') + '" role="treeitem" data-layer-id="' + esc(cell.id) + '" data-layer-type="cell" data-x="' + cell.x + '" data-z="' + cell.z + '">'
          + '<span class="layers-row-icon" aria-hidden="true">' + esc(cell.terrainIcon) + '</span>'
          + '<span class="layers-row-main"><strong>' + esc(cell.terrainLabel) + '</strong><em>' + esc(cell.terrainDetail || 'terrain tile') + '</em></span>'
          + coordPill
          + '</button>';
      }
      const open = cellOpen.has(cell.id) ? cellOpen.get(cell.id) : true;
      return '<details class="layers-cell' + (isSelected ? ' is-selected' : '') + '"' + (open ? ' open' : '') + ' data-cell-id="' + esc(cell.id) + '" data-x="' + cell.x + '" data-z="' + cell.z + '">'
        + '<summary>'
        + '<span class="layers-row-icon" aria-hidden="true">' + esc(cell.terrainIcon) + '</span>'
        + '<span class="layers-cell-main"><strong>' + esc(cell.terrainLabel) + '</strong>' + (cell.terrainDetail ? '<em>' + esc(cell.terrainDetail) + '</em>' : '') + '</span>'
        + coordPill
        + '<span class="layers-count">' + cell.children.length + '</span>'
        + '</summary>'
        + '<div class="layers-branch">' + cell.children.map(c => renderChildRow(c, cell.x, cell.z)).join('') + '</div>'
        + '</details>';
    }

    function clampLayersPanel(left, top) {
      const w = panel.offsetWidth || 360;
      const h = panel.offsetHeight || 420;
      return {
        left: Math.max(8, Math.min(window.innerWidth - w - 8, left)),
        top: Math.max(8, Math.min(window.innerHeight - h - 8, top)),
      };
    }

    function applySavedLayersPanelPosition() {
      let pos = null;
      try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) {}
      if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
      const clamped = clampLayersPanel(pos.left, pos.top);
      panel.style.left = clamped.left + 'px';
      panel.style.top = clamped.top + 'px';
      panel.style.right = 'auto';
    }

    function renderLayersPanel() {
      const islands = collectIslands();
      const query = searchEl ? searchEl.value.trim() : '';
      const selectedCoords = selectedWorldCoordSet();
      const prevScroll = treeEl.scrollTop;
      let anyContent = false;
      const html = islands.map(group => {
        const filtered = filterRows(group.cells, query);
        const total = group.cells.length;
        if (query && !filtered.length) return ''; // hide empty islands while searching
        anyContent = anyContent || total > 0;
        const open = cellOpen.has('island:' + group.board.id) ? cellOpen.get('island:' + group.board.id) : true;
        const body = total
          ? (filtered.length ? filtered.map(c => renderCell(c, selectedCoords)).join('') : '<p class="layers-empty">No matching layers.</p>')
          : '<p class="layers-empty">Default grass — place terrain or objects.</p>';
        return '<details class="layers-root layers-island"' + (open ? ' open' : '') + ' data-island-id="' + esc(group.board.id) + '">'
          + '<summary><span class="layers-row-icon" aria-hidden="true">' + esc(group.board.icon) + '</span>'
          + '<span class="layers-cell-main"><strong>' + esc(group.board.label) + '</strong></span>'
          + '<span class="layers-count">' + filtered.length + (query ? '/' + total : '') + '</span></summary>'
          + '<div class="layers-branch layers-cell-list">' + body + '</div>'
          + '</details>';
      }).join('');
      treeEl.innerHTML = html || '<p class="layers-empty">No islands yet.</p>';
      // Re-bind toggle tracking on island + cell nodes.
      treeEl.querySelectorAll('details.layers-island').forEach(d => {
        d.addEventListener('toggle', () => cellOpen.set('island:' + d.getAttribute('data-island-id'), d.open));
      });
      treeEl.querySelectorAll('details.layers-cell').forEach(d => {
        d.addEventListener('toggle', () => cellOpen.set(d.getAttribute('data-cell-id'), d.open));
      });
      treeEl.scrollTop = prevScroll;
    }

    function scheduleLayersRefresh() {
      if (panel.hidden) return;
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        renderLayersPanel();
      }, 80);
    }

    function setLayersOpen(open) {
      panel.hidden = !open;
      toggleBtn.classList.toggle('on', open);
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (_) {}
      if (open) {
        applySavedLayersPanelPosition();
        renderLayersPanel();
        setLayersTab(layersActiveTab);
      } else {
        restoreSelProps();
      }
    }

    function focusLayerCell(x, z) {
      try {
        const p = tilePos(x, z);
        target.x = p.x;
        target.z = p.z;
        viewSize = Math.max(MIN_VIEW_SIZE, Math.min(viewSize, 6.2));
        updateCamera();
        if (typeof requestMinimapRepaint === 'function') requestMinimapRepaint();
      } catch (_) {}
    }

    function selectLayerCell(x, z) {
      const sel = window.__tinyworldSelection;
      if (sel && typeof sel.replaceWorldCoords === 'function') {
        sel.replaceWorldCoords([{ x, z }]);
      }
      focusLayerCell(x, z);
    }

    toggleBtn.addEventListener('click', () => setLayersOpen(panel.hidden));
    if (closeBtn) closeBtn.addEventListener('click', () => setLayersOpen(false));
    if (refreshBtn) refreshBtn.addEventListener('click', renderLayersPanel);
    if (searchEl) searchEl.addEventListener('input', scheduleLayersRefresh);

    const head = panel.querySelector('.layers-panel-head');
    if (head) {
      head.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a')) return;
        const r = panel.getBoundingClientRect();
        panelDrag = {
          startX: e.clientX,
          startY: e.clientY,
          leftAtStart: r.left,
          topAtStart: r.top,
          moved: false,
        };
        try { panel.setPointerCapture(e.pointerId); } catch (_) {}
      });
    }

    panel.addEventListener('pointermove', e => {
      if (!panelDrag) return;
      const dx = e.clientX - panelDrag.startX;
      const dy = e.clientY - panelDrag.startY;
      if (!panelDrag.moved && Math.hypot(dx, dy) < 4) return;
      panelDrag.moved = true;
      panel.classList.add('dragging');
      const pos = clampLayersPanel(panelDrag.leftAtStart + dx, panelDrag.topAtStart + dy);
      panel.style.left = pos.left + 'px';
      panel.style.top = pos.top + 'px';
      panel.style.right = 'auto';
    });

    function endPanelDrag() {
      if (!panelDrag) return;
      const moved = panelDrag.moved;
      panelDrag = null;
      panel.classList.remove('dragging');
      if (moved) {
        const r = panel.getBoundingClientRect();
        try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (_) {}
      }
    }
    panel.addEventListener('pointerup', endPanelDrag);
    panel.addEventListener('pointercancel', endPanelDrag);
    window.addEventListener('resize', () => {
      if (panel.hidden) return;
      const r = panel.getBoundingClientRect();
      const pos = clampLayersPanel(r.left, r.top);
      panel.style.left = pos.left + 'px';
      panel.style.top = pos.top + 'px';
      panel.style.right = 'auto';
    });

    treeEl.addEventListener('click', e => {
      const summary = e.target.closest('summary');
      if (summary) {
        const details = summary.parentElement;
        if (details && details.classList.contains('layers-cell')) {
          const x = Number(details.getAttribute('data-x'));
          const z = Number(details.getAttribute('data-z'));
          if (Number.isFinite(x) && Number.isFinite(z)) {
            activeLayerId = details.getAttribute('data-cell-id') || null;
            selectLayerCell(x, z);
            setLayersTab('properties');
            // Debounced (not synchronous): the same click also fires the native toggle,
            // whose `toggle` event runs async — a sync rebuild would read stale open state
            // and undo the user's expand/collapse. The 80ms refresh lands after the toggle.
            scheduleLayersRefresh();
          }
        }
        return; // let the native disclosure toggle proceed (keyboard + pointer)
      }
      const row = e.target.closest('.layers-row');
      if (!row) return;
      const x = Number(row.getAttribute('data-x'));
      const z = Number(row.getAttribute('data-z'));
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      activeLayerId = row.getAttribute('data-layer-id') || null;
      selectLayerCell(x, z);
      renderLayersPanel();
      setLayersTab('properties');
    });

    window.addEventListener('tinyworld:selection-changed', scheduleLayersRefresh);
    window.addEventListener('tinyworld:world-changed', scheduleLayersRefresh);
    window.addEventListener('tinyworld:grid-changed', scheduleLayersRefresh);

    try {
      if (localStorage.getItem(OPEN_KEY) === '1') setLayersOpen(true);
    } catch (_) {}
  }());

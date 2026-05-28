  // -------- cloud sea + soft sprite clouds --------
  // Sprite-puff cloud system ported from the three.js r55 "webgl_clouds" demo
  // (clouds-mrdoob/) to r128: merged BufferGeometry, vertex-shader billboarding
  // (the demo only flew straight down -Z so it never needed it), tinted to the
  // live sky and faded by distance. Two consumers share one shader/texture:
  //   - cloud sea   : a wide thin band far below the islands (own toggle)
  //   - soft clouds : small drifting clumps at cloud height, an alternative to
  //                   the blocky voxel clouds (the "cloud style" toggle hides
  //                   cloudGroup and shows these instead)
  // depthTest ON (islands occlude clouds behind them), depthWrite OFF
  // (overlapping puffs blend by draw order — fine for soft clouds, avoids hard
  // transparency-sort popping).

  let _cloudTex = null;
  function cloudPuffTexture() {
    if (_cloudTex) return _cloudTex;
    _cloudTex = new THREE.TextureLoader().load('engine/world/assets/cloud-sea.png');
    _cloudTex.minFilter = THREE.LinearMipMapLinearFilter;
    _cloudTex.magFilter = THREE.LinearFilter;
    return _cloudTex;
  }

  // Build a merged-quad billboard mesh from puff placements.
  // placements: array of { x, y, z, scale, rot }.
  // fadeInner/fadeOuter: radial (XZ) distance fade to horizon; pass a huge
  // fadeInner to disable the fade (soft clouds want full opacity everywhere).
  function buildPuffMesh(placements, tint, opacity, fadeInner, fadeOuter) {
    const n = placements.length;
    const corners = new Float32Array(n * 4 * 2);
    const uvs = new Float32Array(n * 4 * 2);
    const centers = new Float32Array(n * 4 * 3);
    const scaleRot = new Float32Array(n * 4 * 2);
    const indices = new Uint32Array(n * 6);
    const CORNER = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

    for (let i = 0; i < n; i++) {
      const p = placements[i];
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        corners[v * 2] = CORNER[c][0];
        corners[v * 2 + 1] = CORNER[c][1];
        uvs[v * 2] = UV[c][0];
        uvs[v * 2 + 1] = UV[c][1];
        centers[v * 3] = p.x;
        centers[v * 3 + 1] = p.y;
        centers[v * 3 + 2] = p.z;
        scaleRot[v * 2] = p.scale;
        scaleRot[v * 2 + 1] = p.rot;
      }
      const o = i * 4, idx = i * 6;
      indices[idx] = o; indices[idx + 1] = o + 1; indices[idx + 2] = o + 2;
      indices[idx + 3] = o; indices[idx + 4] = o + 2; indices[idx + 5] = o + 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3));
    geo.setAttribute('aScaleRot', new THREE.BufferAttribute(scaleRot, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), (fadeOuter || 100) + 40);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudPuffTexture() },
        tint: { value: tint },
        opacity: { value: opacity },
        fadeInner: { value: fadeInner },
        fadeOuter: { value: fadeOuter },
      },
      vertexShader: [
        'attribute vec2 aCorner;',
        'attribute vec3 aCenter;',
        'attribute vec2 aScaleRot;',
        'varying vec2 vUv;',
        'varying float vFade;',
        'uniform float fadeInner;',
        'uniform float fadeOuter;',
        'void main() {',
        '  vUv = uv;',
        '  float s = aScaleRot.x; float a = aScaleRot.y;',
        '  float cs = cos(a), sn = sin(a);',
        '  vec2 cor = vec2(aCorner.x * cs - aCorner.y * sn, aCorner.x * sn + aCorner.y * cs) * s;',
        '  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);',
        '  mv.xy += cor;',                                  // billboard in view space
        '  float r = length(aCenter.xz);',
        '  vFade = 1.0 - smoothstep(fadeInner, fadeOuter, r);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D map; uniform vec3 tint; uniform float opacity;',
        'varying vec2 vUv; varying float vFade;',
        'void main() {',
        '  vec4 t = texture2D(map, vUv);',
        '  float alpha = t.a * opacity * vFade;',
        '  if (alpha < 0.01) discard;',
        '  vec3 col = mix(t.rgb, tint, 0.35 * (1.0 - vFade));',
        '  gl_FragColor = vec4(col, alpha);',
        '}',
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    mesh.raycast = function () {};
    mesh.userData.cloudTint = tint;
    return mesh;
  }

  function _puffRand(seed) {
    return (typeof makeMulberry32 === 'function') ? makeMulberry32(seed) : Math.random;
  }

  // ===== Cloud sea (wide band far below the islands) =====
  const cloudSeaGroup = new THREE.Group();
  cloudSeaGroup.name = 'cloud-sea';
  xrWorldRoot.add(cloudSeaGroup);
  cloudSeaGroup.visible = false;
  let cloudSeaMesh = null;
  const CLOUD_SEA_Y = -8, CLOUD_SEA_BAND = 3.2, CLOUD_SEA_COUNT = 1800;

  function buildCloudSea() {
    if (cloudSeaMesh) return;
    const rand = _puffRand('cloud-sea');
    const innerR = GRID * TILE * 0.9, outerR = GRID * TILE * 9.0;
    const placements = [];
    for (let i = 0; i < CLOUD_SEA_COUNT; i++) {
      const ang = rand() * Math.PI * 2;
      const rr = innerR + (outerR - innerR) * Math.sqrt(rand());
      placements.push({
        x: Math.cos(ang) * rr,
        y: CLOUD_SEA_Y + (rand() - 0.5) * 2 * CLOUD_SEA_BAND,
        z: Math.sin(ang) * rr,
        scale: (3.5 + rand() * rand() * 9) * (0.7 + rr / outerR),
        rot: rand() * Math.PI,
      });
    }
    cloudSeaMesh = buildPuffMesh(placements, new THREE.Color(0xb9dcf4), 0.9, innerR, outerR);
    cloudSeaGroup.add(cloudSeaMesh);
  }

  function setCloudSeaEnabled(on) {
    renderCloudSea = !!on;
    try { localStorage.setItem(RENDER_LS.cloudSea, renderCloudSea ? '1' : '0'); } catch (_) {}
    if (renderCloudSea) buildCloudSea();
    cloudSeaGroup.visible = renderCloudSea;
  }

  // ===== Soft sky clouds (small drifting clumps at cloud height) =====
  const skyCloudsGroup = new THREE.Group();
  skyCloudsGroup.name = 'sky-clouds-soft';
  xrWorldRoot.add(skyCloudsGroup);
  skyCloudsGroup.visible = false;
  let skyCloudsMesh = null;

  function buildSkyClouds() {
    // Rebuild on demand so cloud amount/height changes take effect.
    if (skyCloudsMesh) {
      skyCloudsGroup.remove(skyCloudsMesh);
      if (skyCloudsMesh.geometry) skyCloudsMesh.geometry.dispose();
      if (skyCloudsMesh.material) skyCloudsMesh.material.dispose();
      skyCloudsMesh = null;
    }
    const rand = _puffRand('sky-clouds');
    const amount = Math.max(0, Math.min(1, (typeof renderCloudAmount === 'number') ? renderCloudAmount : 0.6));
    const clusters = Math.round(amount * 14) + 2;
    const spread = GRID * TILE * 1.6;        // how far clouds wander from centre
    const baseY = (typeof renderCloudHeight === 'number') ? renderCloudHeight : 6;
    const placements = [];
    for (let cl = 0; cl < clusters; cl++) {
      const ca = rand() * Math.PI * 2;
      const cr = spread * (0.25 + 0.75 * rand());
      const cx = Math.cos(ca) * cr, cz = Math.sin(ca) * cr;
      const cy = baseY + (rand() - 0.5) * 2.4;
      const puffs = 6 + Math.floor(rand() * 9);
      for (let p = 0; p < puffs; p++) {
        // Clumps are wider than tall, so they read as cloud, not a ball.
        placements.push({
          x: cx + (rand() - 0.5) * 6,
          y: cy + (rand() - 0.5) * 1.4,
          z: cz + (rand() - 0.5) * 6,
          scale: 1.6 + rand() * rand() * 2.8,
          rot: rand() * Math.PI,
        });
      }
    }
    // fadeInner huge -> vFade == 1 everywhere (no horizon dissolve for sky clouds)
    skyCloudsMesh = buildPuffMesh(placements, new THREE.Color(0xffffff), 0.95, 1e9, 1e9 + 1);
    skyCloudsGroup.add(skyCloudsMesh);
  }

  // Cloud style: 'voxel' (blocky cloudGroup) or 'soft' (these sprites).
  function setCloudStyle(style) {
    renderCloudStyle = (style === 'soft') ? 'soft' : 'voxel';
    try { localStorage.setItem(RENDER_LS.cloudStyle, renderCloudStyle); } catch (_) {}
    const soft = renderCloudStyle === 'soft';
    if (soft) buildSkyClouds();
    skyCloudsGroup.visible = soft;
    // Hide/show the voxel clouds (module 23). updateClouds keeps ticking but
    // the groups are simply not drawn while soft mode is active. Hide both the
    // overhead clouds AND the under-island clouds so soft mode fully replaces
    // the blocky cloud look.
    if (typeof cloudGroup !== 'undefined' && cloudGroup) cloudGroup.visible = !soft;
    if (typeof underIslandCloudGroup !== 'undefined' && underIslandCloudGroup) underIslandCloudGroup.visible = !soft;
  }

  // Rebuild soft clouds when their driving settings change (called from the
  // render-settings apply path; safe no-op when not in soft mode).
  function refreshSoftCloudsIfActive() {
    if (typeof renderCloudStyle !== 'undefined' && renderCloudStyle === 'soft') buildSkyClouds();
  }

  // ===== Per-frame =====
  function tickCloudSea(t, dt) {
    const sky = (scene.fog && scene.fog.color) ? scene.fog.color
              : (scene.background && scene.background.isColor ? scene.background : null);
    if (renderCloudSea && cloudSeaMesh) {
      if (sky) cloudSeaMesh.userData.cloudTint.copy(sky);
      cloudSeaGroup.rotation.y += dt * 0.006;
    }
    if (typeof renderCloudStyle !== 'undefined' && renderCloudStyle === 'soft' && skyCloudsMesh) {
      const spd = (typeof renderCloudSpeed === 'number') ? renderCloudSpeed : 0.35;
      skyCloudsGroup.rotation.y += dt * 0.02 * (0.3 + spd);
    }
  }

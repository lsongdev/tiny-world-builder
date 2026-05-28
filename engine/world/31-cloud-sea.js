  // -------- cloud sea (soft sprite layer beneath the islands) --------
  // Ported from the three.js r55 "webgl_clouds" demo (clouds-mrdoob/) to r128:
  //   - THREE.Geometry + GeometryUtils.merge  ->  one merged BufferGeometry
  //   - ImageUtils.loadTexture                ->  TextureLoader
  //   - per-quad billboarding done in the vertex shader (works for the orbit
  //     camera; the demo only ever flew straight down -Z so it didn't need it)
  // Renders as a wide, thin band of camera-facing puffs at a fixed Y well below
  // the home island, tinted to the live sky/fog colour and faded into the
  // horizon. depthTest ON (islands correctly occlude clouds behind them),
  // depthWrite OFF (overlapping puffs blend by draw order — fine for soft
  // clouds and avoids hard transparency-sorting artefacts). Off by default;
  // toggled from the render-settings panel via setCloudSeaEnabled().

  const cloudSeaGroup = new THREE.Group();
  cloudSeaGroup.name = 'cloud-sea';
  xrWorldRoot.add(cloudSeaGroup);
  cloudSeaGroup.visible = false;

  let cloudSeaMesh = null;
  let cloudSeaMaterial = null;
  const CLOUD_SEA_Y = -8;        // sea height (islands sit ~0; undersides to ~-3)
  const CLOUD_SEA_BAND = 3.2;    // vertical jitter of the layer
  const CLOUD_SEA_COUNT = 1800;  // puff count (overdraw-bounded; demo used 8000)
  const _cloudSeaTint = new THREE.Color(0xb9dcf4);

  function buildCloudSea() {
    if (cloudSeaMesh) return;    // build once, lazily on first enable

    const tex = new THREE.TextureLoader().load('engine/world/assets/cloud-sea.png');
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;

    // Deterministic placement so the layer is stable across reloads.
    const rand = (typeof makeMulberry32 === 'function')
      ? makeMulberry32('cloud-sea')
      : Math.random;

    const n = CLOUD_SEA_COUNT;
    const corners = new Float32Array(n * 4 * 2);
    const uvs = new Float32Array(n * 4 * 2);
    const centers = new Float32Array(n * 4 * 3);
    const scaleRot = new Float32Array(n * 4 * 2);
    const indices = new Uint32Array(n * 6);

    const CORNER = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const innerR = GRID * TILE * 0.9;   // start just past the island
    const outerR = GRID * TILE * 9.0;   // fade out toward the horizon

    for (let i = 0; i < n; i++) {
      // Scatter on a ring (denser near the island, sparse far out), so the
      // layer reads as a sea stretching to the horizon rather than a disc.
      const ang = rand() * Math.PI * 2;
      const rr = innerR + (outerR - innerR) * Math.sqrt(rand());
      const cx = Math.cos(ang) * rr;
      const cz = Math.sin(ang) * rr;
      const cy = CLOUD_SEA_Y + (rand() - 0.5) * 2 * CLOUD_SEA_BAND;
      // Bigger puffs farther out so the horizon stays soft and full.
      const scale = (3.5 + rand() * rand() * 9) * (0.7 + rr / outerR);
      const rot = rand() * Math.PI;

      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        corners[v * 2] = CORNER[c][0];
        corners[v * 2 + 1] = CORNER[c][1];
        uvs[v * 2] = UV[c][0];
        uvs[v * 2 + 1] = UV[c][1];
        centers[v * 3] = cx;
        centers[v * 3 + 1] = cy;
        centers[v * 3 + 2] = cz;
        scaleRot[v * 2] = scale;
        scaleRot[v * 2 + 1] = rot;
      }
      const o = i * 4;
      const idx = i * 6;
      indices[idx] = o; indices[idx + 1] = o + 1; indices[idx + 2] = o + 2;
      indices[idx + 3] = o; indices[idx + 4] = o + 2; indices[idx + 5] = o + 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3));
    geo.setAttribute('aScaleRot', new THREE.BufferAttribute(scaleRot, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    // Manual bounding sphere (no position attribute for three to infer from).
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, CLOUD_SEA_Y, 0),
      outerR + 20,
    );

    cloudSeaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        tint: { value: _cloudSeaTint },
        opacity: { value: 0.9 },
        fadeInner: { value: innerR },
        fadeOuter: { value: outerR },
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
        '  float s = aScaleRot.x;',
        '  float a = aScaleRot.y;',
        '  float cs = cos(a), sn = sin(a);',
        '  vec2 cor = vec2(aCorner.x * cs - aCorner.y * sn, aCorner.x * sn + aCorner.y * cs) * s;',
        '  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);',
        '  mv.xy += cor;',           // billboard: offset in view space
        '  float r = length(aCenter.xz);',
        '  vFade = 1.0 - smoothstep(fadeInner, fadeOuter, r);', // dissolve to horizon
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D map;',
        'uniform vec3 tint;',
        'uniform float opacity;',
        'varying vec2 vUv;',
        'varying float vFade;',
        'void main() {',
        '  vec4 t = texture2D(map, vUv);',
        '  float alpha = t.a * opacity * vFade;',
        '  if (alpha < 0.01) discard;',
        // soft white puffs, tinted slightly toward the sky as they recede
        '  vec3 col = mix(t.rgb, tint, 0.35 * (1.0 - vFade));',
        '  gl_FragColor = vec4(col, alpha);',
        '}',
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    cloudSeaMesh = new THREE.Mesh(geo, cloudSeaMaterial);
    cloudSeaMesh.frustumCulled = false; // billboarded; bounds aren't axis-tight
    cloudSeaMesh.renderOrder = -1;      // draw before opaque-ish world dressing
    cloudSeaMesh.raycast = function () {};
    cloudSeaGroup.add(cloudSeaMesh);
  }

  // Render-settings toggle.
  function setCloudSeaEnabled(on) {
    renderCloudSea = !!on;
    try { localStorage.setItem(RENDER_LS.cloudSea, renderCloudSea ? '1' : '0'); } catch (_) {}
    if (renderCloudSea) buildCloudSea();
    cloudSeaGroup.visible = renderCloudSea;
  }

  // Per-frame: keep the layer tinted to the live sky and drift it gently.
  function tickCloudSea(t, dt) {
    if (!renderCloudSea || !cloudSeaMesh) return;
    const sky = (scene.fog && scene.fog.color) ? scene.fog.color
              : (scene.background && scene.background.isColor ? scene.background : null);
    if (sky) _cloudSeaTint.copy(sky);
    cloudSeaGroup.rotation.y += dt * 0.006; // slow lazy drift
  }

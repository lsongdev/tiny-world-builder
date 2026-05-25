/**
 * LandscapeEngine — water surface mixin.
 *
 * Builds the animated reflective water plane (ripples, fresnel, sun
 * glint, fog, optional XZ clip box) and registers the mesh into the
 * scene. Attaches `_initWater` to LandscapeEngine.prototype.
 *
 * Depends on: LandscapeEngine being defined globally and window.THREE.
 */
(function (global) {
  if (!global.LandscapeEngine) {
    throw new Error('engine/landscape/water.js: LandscapeEngine must be loaded first.');
  }
  const THREE = global.THREE;
  if (!THREE) {
    throw new Error('engine/landscape/water.js: THREE must be loaded first.');
  }

  Object.assign(global.LandscapeEngine.prototype, {
    // --- Water Implementation ---
    _initWater() {
      this.waterMat = new THREE.ShaderMaterial({
        uniforms: {
          time:      { value: 0 },
          shallow:   { value: new THREE.Color(0x4ea68a) },
          deep:      { value: new THREE.Color(0x143a46) },
          skyTop:    { value: new THREE.Color(this.currentBiome.skyTop) },
          skyBottom: { value: new THREE.Color(this.currentBiome.skyBottom) },
          cameraPos: { value: new THREE.Vector3() },
          fogColor:  { value: new THREE.Color(this.currentBiome.fogColor) },
          fogNear:   { value: 500 },
          fogFar:    { value: 6100 },
          sunDir:    { value: this.sunDir.clone() },
          runwayR:   { value: this.WATER_RUNWAY_R },
          reflectivity: { value: 1.28 },
          fresnelBoost: { value: 1.12 },
          sunGlint:     { value: 1.18 },
          waterOpacity: { value: 0.92 },
          clipEnabled:  { value: 0.0 },
          clipMin:      { value: this._clipMin },
          clipMax:      { value: this._clipMax },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          varying float vDist;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vec4 mv = viewMatrix * wp;
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform float time;
          uniform vec3 shallow;
          uniform vec3 deep;
          uniform vec3 skyTop;
          uniform vec3 skyBottom;
          uniform vec3 cameraPos;
          uniform vec3 fogColor;
          uniform float fogNear;
          uniform float fogFar;
          uniform vec3 sunDir;
          uniform float runwayR;
          uniform float reflectivity;
          uniform float fresnelBoost;
          uniform float sunGlint;
          uniform float waterOpacity;
          uniform float clipEnabled;
          uniform vec3 clipMin;
          uniform vec3 clipMax;
          varying vec3 vWorldPos;
          varying float vDist;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          void main() {
            float edgeFade = 1.0;
            // Clip bounds discard
            if (clipEnabled > 0.5) {
              float dx1 = vWorldPos.x - clipMin.x;
              float dx2 = clipMax.x - vWorldPos.x;
              float dz1 = vWorldPos.z - clipMin.z;
              float dz2 = clipMax.z - vWorldPos.z;
              float minDist = min(min(dx1, dx2), min(dz1, dz2));
              if (minDist < 0.0) {
                discard;
              } else {
                float fadeZone = 2.5;
                edgeFade = clamp(minDist / fadeZone, 0.0, 1.0);
              }
            }

            float rw = length(vWorldPos.xz);
            if (rw < runwayR) discard;
            float rwFade = smoothstep(runwayR, runwayR + 60.0, rw);

            vec2 uv = vWorldPos.xz * 0.012;
            float r1 = noise(uv + vec2(time * 0.05, time * 0.03));
            float r2 = noise(uv * 2.3 - vec2(time * 0.07, time * 0.04));
            float ripple = r1 * 0.65 + r2 * 0.35;

            vec2 eps = vec2(0.5, 0.0);
            float rN = noise(uv + eps.xy) - noise(uv - eps.xy);
            float rE = noise(uv + eps.yx) - noise(uv - eps.yx);
            vec3 norm = normalize(vec3(-rN * 0.6, 1.0, -rE * 0.6));
            float sun = pow(max(0.0, dot(norm, sunDir)), 32.0);
            vec3 viewDir = normalize(cameraPos - vWorldPos);
            float fresnel = pow(1.0 - max(0.0, dot(norm, viewDir)), 3.0);
            float skyMix = clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 reflectedSky = mix(skyBottom, skyTop, pow(skyMix, 0.8));

            vec3 col = mix(deep, shallow, ripple * 0.58 + 0.24);
            float reflectionMix = clamp((0.14 + fresnel * 0.44 * fresnelBoost) * reflectivity, 0.0, 0.94);
            col = mix(col, reflectedSky, reflectionMix);
            col += vec3(1.0, 0.98, 0.92) * sun * (0.28 + 0.42 * sunGlint);

            col = floor(col * 12.0) / 12.0;

            float fogF = clamp((vDist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
            col = mix(col, fogColor, fogF);

            gl_FragColor = vec4(col, waterOpacity * rwFade * edgeFade);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      this.waterGeo = new THREE.PlaneGeometry(this.WATER_EXTENT, this.WATER_EXTENT, 1, 1);
      this.waterGeo.rotateX(-Math.PI / 2);
      this.waterMesh = new THREE.Mesh(this.waterGeo, this.waterMat);
      this.waterMesh.position.y = this.WATER_LEVEL;
      this.waterMesh.renderOrder = 3;
      this.scene.add(this.waterMesh);
    },
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

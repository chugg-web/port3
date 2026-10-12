import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const MODEL_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260929_212926_92423081-b0e4-4f5a-b650-14af6c05c058.glb';
const LINES = ['Исследуй', 'Новые', 'Идеи'];
const FONT_STACK = 'Poppins, Montserrat, sans-serif';

/* ---------- renderer / camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const FOV = 30;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

/* ---------- background headline ---------- */
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');
let bgTex = null;

const bgScene = new THREE.Scene();
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D uTex;
    varying vec2 vUv;
    void main(){
      gl_FragColor = texture2D(uTex, vUv);
      #include <colorspace_fragment>
    }`,
  depthTest: false,
  depthWrite: false
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bgQuad.frustumCulled = false;
bgScene.add(bgQuad);

function drawHeadline(W, H, dpr, mobile) {
  bgCanvas.width = Math.round(W * dpr);
  bgCanvas.height = Math.round(H * dpr);
  const c = bgCtx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);

  let fs = Math.min(H * 0.21, W * (mobile ? 0.21 : 0.118));
  c.font = `800 ${fs}px ${FONT_STACK}`;
  let widest = Math.max(...LINES.map(t => c.measureText(t).width));
  const maxW = W * (mobile ? 0.9 : 0.5);
  if (widest > maxW) { fs *= maxW / widest; c.font = `800 ${fs}px ${FONT_STACK}`; }

  c.fillStyle = '#e9e9e9';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const cx = W * (mobile ? 0.5 : 0.505);
  const cy = H * (mobile ? 0.45 : 0.468);
  const gap = fs * 1.07;
  const cap = fs * 0.7;
  LINES.forEach((t, i) => c.fillText(t, cx, cy + cap / 2 + (i - 1) * gap));

  const old = bgTex;
  bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  bgTex.minFilter = THREE.LinearFilter;
  bgTex.magFilter = THREE.LinearFilter;
  bgTex.generateMipmaps = false;
  bgTex.needsUpdate = true;
  bgMat.uniforms.uTex.value = bgTex;
  if (old) old.dispose();
}

/* ---------- glass material ---------- */
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vEye;
  void main(){
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPos = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPos;
    vNormal = normalize(normalMatrix * normal);
    vEye = normalize(mvPos.xyz);
  }`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform float uBackside;
  uniform float uIorR, uIorY, uIorG, uIorC, uIorB, uIorP;
  uniform float uRefractPower, uChromatic, uSaturation;
  uniform float uShininess, uDiffuseness, uFresnelPower;
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vEye;

  const int LOOP = 16;

  vec3 tex(vec2 uv){ return texture2D(uTexture, uv).rgb; }

  float specular(vec3 n, vec3 eye, vec3 light, float shininess, float diffuseness){
    vec3 lightVec = normalize(-light);
    vec3 viewVec = -eye;
    vec3 halfVec = normalize(lightVec + viewVec);
    return pow(max(dot(n, halfVec), 0.0), shininess) + max(0.0, dot(n, lightVec)) * diffuseness;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 n = normalize(vNormal);
    if (uBackside > 0.5) n = -n;
    vec3 eye = normalize(vEye);

    vec3 color = vec3(0.0);
    for (int i = 0; i < LOOP; i++){
      float slide = float(i) / float(LOOP) * 0.045;

      vec3 rR = refract(eye, n, 1.0 / uIorR);
      vec3 rY = refract(eye, n, 1.0 / uIorY);
      vec3 rG = refract(eye, n, 1.0 / uIorG);
      vec3 rC = refract(eye, n, 1.0 / uIorC);
      vec3 rB = refract(eye, n, 1.0 / uIorB);
      vec3 rP = refract(eye, n, 1.0 / uIorP);

      float r = tex(uv + rR.xy * (uRefractPower + slide * 1.0) * uChromatic).x * 0.5;

      vec3 tY = tex(uv + rY.xy * (uRefractPower + slide * 1.0) * uChromatic);
      float y = (tY.x * 2.0 + tY.y * 2.0 - tY.z) / 6.0;

      float g = tex(uv + rG.xy * (uRefractPower + slide * 2.0) * uChromatic).y * 0.5;

      vec3 tC = tex(uv + rC.xy * (uRefractPower + slide * 2.5) * uChromatic);
      float c = (tC.y * 2.0 + tC.z * 2.0 - tC.x) / 6.0;

      float b = tex(uv + rB.xy * (uRefractPower + slide * 3.0) * uChromatic).z * 0.5;

      vec3 tP = tex(uv + rP.xy * (uRefractPower + slide * 1.0) * uChromatic);
      float p = (tP.z * 2.0 + tP.x * 2.0 - tP.y) / 6.0;

      float R = r + (2.0 * p + 2.0 * y - c) / 3.0;
      float G = g + (2.0 * y + 2.0 * c - p) / 3.0;
      float B = b + (2.0 * c + 2.0 * p - y) / 3.0;

      color += vec3(R, G, B);
    }
    color /= float(LOOP);

    float luma = dot(color, vec3(0.2125, 0.7154, 0.0721));
    color = mix(vec3(luma), color, uSaturation);

    float spec = specular(n, eye, uLight, uShininess, uDiffuseness)
               + 0.6 * specular(n, eye, vec3(1.0, 1.0, -1.0), uShininess * 0.6, uDiffuseness * 0.5);
    color += spec * (uBackside > 0.5 ? 0.35 : 1.0);

    float f = pow(1.0 + dot(eye, n), uFresnelPower);
    color = mix(color, vec3(1.0), f * (uBackside > 0.5 ? 0.25 : 0.55));

    color += vec3(0.004, 0.005, 0.007);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;

function makeGlassMaterial(back) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    side: back ? THREE.BackSide : THREE.FrontSide,
    uniforms: {
      uTexture: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uBackside: { value: back ? 1 : 0 },
      uIorR: { value: 1.15 }, uIorY: { value: 1.16 }, uIorG: { value: 1.18 },
      uIorC: { value: 1.22 }, uIorB: { value: 1.22 }, uIorP: { value: 1.22 },
      uRefractPower: { value: back ? 0.22 : 0.30 },
      uChromatic: { value: 0.5 },
      uSaturation: { value: 1.08 },
      uShininess: { value: 90 },
      uDiffuseness: { value: 0.02 },
      uFresnelPower: { value: 5.0 },
      uLight: { value: new THREE.Vector3(-1, 1, 1) }
    }
  });
}
const backMat = makeGlassMaterial(true);
const frontMat = makeGlassMaterial(false);

/* ---------- scene graph ---------- */
const scene = new THREE.Scene();
const pivot = new THREE.Group();
const spinner = new THREE.Group();
spinner.rotation.set(-0.42, 0.62, 0.18);
pivot.add(spinner);
scene.add(pivot);

let cubeBack = null, cubeFront = null;
function setCubeGeometry(geo) {
  cubeBack = new THREE.Mesh(geo, backMat);
  cubeFront = new THREE.Mesh(geo, frontMat);
  cubeBack.frustumCulled = false;
  cubeFront.frustumCulled = false;
  spinner.add(cubeBack, cubeFront);
  document.getElementById('loader').classList.add('done');
}

function fallbackGeometry() {
  const g = new RoundedBoxGeometry(1, 1, 1, 8, 0.12);
  g.deleteAttribute('uv');
  return g;
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    try {
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        let g = o.geometry.clone();
        ['uv', 'color', 'tangent'].forEach(a => g.deleteAttribute(a));
        Object.keys(g.attributes).forEach(a => { if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); });
        g = mergeVertices(g, 1e-4);
        g.computeVertexNormals();
        g.applyMatrix4(o.matrixWorld);
        parts.push(g);
      });
      const merged = parts.length ? mergeGeometries(parts, false) : null;
      if (!merged) throw new Error('merge failed');
      merged.computeBoundingBox();
      const box = merged.boundingBox;
      const center = new THREE.Vector3(); box.getCenter(center);
      const size = new THREE.Vector3(); box.getSize(size);
      merged.translate(-center.x, -center.y, -center.z);
      const s = 1 / Math.max(size.x, size.y, size.z);
      merged.scale(s, s, s);
      setCubeGeometry(merged);
    } catch (e) {
      console.warn('Модель не обработана, используется запасной куб:', e);
      setCubeGeometry(fallbackGeometry());
    }
  },
  undefined,
  (err) => {
    console.warn('Модель не загрузилась, используется запасной куб:', err);
    setCubeGeometry(fallbackGeometry());
  }
);

/* ---------- render targets ---------- */
const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
const rtBack = new THREE.WebGLRenderTarget(1, 1, rtOpts);
const rtFront = new THREE.WebGLRenderTarget(1, 1, rtOpts);
backMat.uniforms.uTexture.value = rtBack.texture;
frontMat.uniforms.uTexture.value = rtFront.texture;

/* ---------- layout ---------- */
function layout() {
  const W = window.innerWidth;
  const H = document.getElementById('hero').clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  const mobile = W < 768 || W / H < 1;

  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();

  const buf = new THREE.Vector2();
  renderer.getDrawingBufferSize(buf);
  rtBack.setSize(buf.x, buf.y);
  rtFront.setSize(buf.x, buf.y);
  backMat.uniforms.uResolution.value.copy(buf);
  frontMat.uniforms.uResolution.value.copy(buf);

  drawHeadline(W, H, dpr, mobile);

  const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * 10;
  const visW = visH * camera.aspect;
  const sx = mobile ? 0.5 : 0.517;
  const sy = mobile ? 0.45 : 0.488;
  pivot.position.set((sx - 0.5) * visW, (0.5 - sy) * visH, 0);
  const px = Math.min(H * 0.44, W * (mobile ? 0.45 : 0.29));
  const sc = (px / H) * visH;
  pivot.scale.setScalar(sc);
}

/* ---------- interaction ---------- */
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const qa = new THREE.Quaternion();
function rotateWorld(dx, dy) {
  if (dx) { qa.setFromAxisAngle(AY, dx); spinner.quaternion.premultiply(qa); }
  if (dy) { qa.setFromAxisAngle(AX, dy); spinner.quaternion.premultiply(qa); }
}

let dragging = false, lastX = 0, lastY = 0, lastT = 0;
let vx = 0, vy = 0;
let releaseTime = -10;
let spinRemaining = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
  vx = vy = 0;
  spinRemaining = 0;
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const now = performance.now();
  const dx = (e.clientX - lastX) * 0.008;
  const dy = (e.clientY - lastY) * 0.008;
  rotateWorld(dx, dy);
  const frames = Math.max((now - lastT) / 16.67, 0.25);
  vx = dx / frames; vy = dy / frames;
  lastX = e.clientX; lastY = e.clientY; lastT = now;
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove('dragging');
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  if (performance.now() - lastT > 80) { vx = vy = 0; }
  releaseTime = performance.now() / 1000;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function spin(angle) {
  vx = vy = 0;
  spinRemaining += angle;
}
document.getElementById('prev').addEventListener('click', () => spin(-Math.PI / 2));
document.getElementById('next').addEventListener('click', () => spin(Math.PI / 2));

const dots = [...document.querySelectorAll('.dot')];
dots.forEach((d) => d.addEventListener('click', () => {
  dots.forEach(x => x.classList.remove('active'));
  d.classList.add('active');
}));

/* ---------- loop ---------- */
let prevT = performance.now() / 1000;
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now() / 1000;
  const dt = Math.min(t - prevT, 0.05);
  prevT = t;
  const k = dt * 60;

  if (!dragging) {
    if (spinRemaining !== 0) {
      const step = spinRemaining * Math.min(1, 0.09 * k);
      rotateWorld(step, 0);
      spinRemaining -= step;
      if (Math.abs(spinRemaining) < 0.0005) spinRemaining = 0;
    }
    if (vx || vy) {
      rotateWorld(vx * k, vy * k);
      const damp = Math.pow(0.94, k);
      vx *= damp; vy *= damp;
      if (Math.abs(vx) < 1e-5) vx = 0;
      if (Math.abs(vy) < 1e-5) vy = 0;
    }
    const idle = t - releaseTime - 0.6;
    if (idle > 0) {
      const blend = Math.min(idle / 1.0, 1);
      rotateWorld(0.0035 * blend * k, 0.0012 * blend * k);
    }
  }

  if (!cubeBack) {
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.render(bgScene, camera);
    return;
  }

  // 1) фон → rtBack
  renderer.autoClear = true;
  renderer.setRenderTarget(rtBack);
  renderer.render(bgScene, camera);

  // 2) фон + задние грани → rtFront
  renderer.setRenderTarget(rtFront);
  renderer.autoClear = true;
  renderer.render(bgScene, camera);
  renderer.autoClear = false;
  cubeBack.visible = true; cubeFront.visible = false;
  renderer.render(scene, camera);

  // 3) фон + передние грани → экран
  renderer.setRenderTarget(null);
  renderer.autoClear = true;
  renderer.render(bgScene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  cubeBack.visible = false; cubeFront.visible = true;
  renderer.render(scene, camera);
  renderer.autoClear = true;
}

/* ---------- start ---------- */
window.addEventListener('resize', layout);
if (document.fonts) document.fonts.addEventListener('loadingdone', layout);

const fontsReady = document.fonts
  ? Promise.race([
      Promise.all([
        document.fonts.load('800 100px Poppins'),
        document.fonts.load('800 100px Montserrat', 'Исследуй Новые Идеи'),
        document.fonts.ready
      ]),
      new Promise(r => setTimeout(r, 2500))
    ])
  : Promise.resolve();

fontsReady.then(() => {
  layout();
  requestAnimationFrame(frame);
});

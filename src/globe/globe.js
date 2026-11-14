// Three.js globe: rendering, camera flights, picking, a marker and an optional
// data overlay sphere (the hook phase 2 uses to drape EIC frames on the Earth).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { latLonToVector3, vector3ToLatLon, angularDistanceDeg } from './geo.js';

const TEX = './assets/textures/';
export const MIN_DISTANCE = 1.15;
export const MAX_DISTANCE = 6;
export const HOME = { lat: 20, lon: 0, distance: 3.2 };

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Globe extends EventTarget {
  constructor(container, { reducedMotion = false } = {}) {
    super();
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.flight = null;
    this.lastMoveAt = 0;
    this.settled = true;
    this._pointerDown = null;
  }

  async init() {
    const { container } = this;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x02040a);
    container.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
    camera.position.copy(latLonToVector3(HOME.lat, HOME.lon, HOME.distance));
    scene.add(camera);
    this.camera = camera;

    // Light rides with the camera so whatever you look at is lit (better for exploring than a real terminator).
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.5, 1.2, 1.0);
    camera.add(sun);

    const loader = new THREE.TextureLoader();
    const load = (f) => new Promise((res, rej) => loader.load(TEX + f, res, undefined, rej));
    const [map, spec, normal, clouds] = await Promise.all([
      load('earth_atmos_2048.jpg'), load('earth_specular_2048.jpg'),
      load('earth_normal_2048.jpg'), load('earth_clouds_1024.png'),
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 64),
      new THREE.MeshPhongMaterial({
        map, specularMap: spec, specular: new THREE.Color(0x333844), shininess: 18,
        normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8),
      }),
    );
    scene.add(this.earth);

    // Data overlay (phase 2): an equirectangular image/canvas draped just above the surface.
    this.overlay = new THREE.Mesh(
      new THREE.SphereGeometry(1.003, 128, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.overlay.visible = false;
    scene.add(this.overlay);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 48),
      new THREE.MeshPhongMaterial({ map: clouds, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    scene.add(this.clouds);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.07, 64, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.35,0.65,1.0,1.0) * i; }`,
      }),
    );
    scene.add(this.atmosphere);

    scene.add(this._makeStars());
    this.marker = this._makeMarker();
    scene.add(this.marker);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.autoRotateSpeed = 0.35;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.addEventListener('change', () => this._onMove());
    this.controls = controls;

    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this._pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }; this.dispatchEvent(new Event('interact')); });
    el.addEventListener('pointerup', (e) => {
      const d = this._pointerDown; this._pointerDown = null;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 500) {
        const hit = this.pickAt(e.clientX, e.clientY);
        if (hit) this.dispatchEvent(new CustomEvent('pick', { detail: hit }));
      }
    });

    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);
    this._clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this._frame());
  }

  // ---------- public API ----------

  /** Current view: the point under the screen centre and how far out we are. */
  getView() {
    const p = this.camera.position;
    const { lat, lon } = vector3ToLatLon(p);
    const distance = p.length();
    return { lat, lon, distance, altitudeKm: Math.round((distance - 1) * 6371), zoom: zoomLabel(distance) };
  }

  /** Smoothly fly so (lat, lon) is under the reticle. Resolves when the flight ends. */
  flyTo(lat, lon, { distance, duration } = {}) {
    lat = Math.max(-84, Math.min(84, lat));
    const startPos = this.camera.position.clone();
    const startDist = startPos.length();
    const endDist = clampDist(distance ?? startDist);
    const dir0 = startPos.clone().normalize();
    const dir1 = latLonToVector3(lat, lon, 1);
    const angle = dir0.angleTo(dir1);
    const q = new THREE.Quaternion().setFromUnitVectors(dir0, dir1);
    const ms = this.reducedMotion ? 0 : (duration ?? 900 + angle * 900);
    const hop = Math.min(1.4, angle * 0.6); // arc outwards on long flights
    if (this.flight) this.flight.resolve(false);
    return new Promise((resolve) => {
      this.flight = { start: performance.now(), ms, q, dir0, startDist, endDist, hop, resolve };
      this.controls.enabled = false;
      if (ms === 0) this._stepFlight(performance.now() + 1);
    });
  }

  zoomBy(factor) {
    const v = this.getView();
    return this.flyTo(v.lat, v.lon, { distance: 1 + (v.distance - 1) * factor, duration: 500 });
  }

  /** Move the view centre by degrees. Positive dLat = north, positive dLon = east. */
  nudge(dLat, dLon) {
    const v = this.getView();
    // Steps shrink as you zoom in so movement feels the same on screen.
    const s = Math.min(1, (v.distance - 1) / 2.2);
    return this.flyTo(v.lat + dLat * s, wrapLon(v.lon + dLon * s), { distance: v.distance, duration: 380 });
  }

  setMarker(lat, lon, label = '') {
    if (lat == null) { this.marker.visible = false; this.markerLabel = ''; return; }
    const pos = latLonToVector3(lat, lon, 1.004);
    this.marker.position.copy(pos);
    this.marker.lookAt(pos.clone().multiplyScalar(2));
    this.marker.visible = true;
    this.markerLabel = label;
    this.markerLatLon = { lat, lon };
  }

  /** Drape an equirectangular image or canvas over the globe (phase 2 data frames). Pass null to hide. */
  setOverlay(source, { opacity = 0.75 } = {}) {
    const mat = this.overlay.material;
    if (mat.map) mat.map.dispose();
    if (!source) { mat.map = null; this.overlay.visible = false; mat.needsUpdate = true; return; }
    const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    mat.map = tex; mat.opacity = opacity; mat.needsUpdate = true;
    this.overlay.visible = true;
  }

  setClouds(on) { this.clouds.visible = on; }
  setAutoRotate(on) { this.controls.autoRotate = on && !this.reducedMotion; }

  pickAt(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.earth, false)[0];
    return hit ? vector3ToLatLon(hit.point) : null;
  }

  /** Where a lat/lon lands on screen, or null if it is on the far side. */
  project(lat, lon) {
    const p = latLonToVector3(lat, lon, 1.004);
    const camDir = this.camera.position.clone().normalize();
    if (p.clone().normalize().dot(camDir) < 0.15) return null;
    const v = p.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  // ---------- internals ----------

  _frame() {
    const dt = this._clock.getDelta();
    const now = performance.now();
    if (this.flight) this._stepFlight(now);
    else {
      const v = this.camera.position.length();
      this.controls.rotateSpeed = 0.15 + (v - 1) * 0.22;
      this.controls.zoomSpeed = 0.6;
      this.controls.update();
    }
    this.clouds.rotation.y += dt * 0.004;
    if (this.marker.visible) {
      const s = 1 + 0.25 * Math.sin(now / 300);
      this.marker.children[1].scale.setScalar(s);
      const d = this.camera.position.length();
      this.marker.scale.setScalar(Math.max(0.35, (d - 1) * 0.6));
    }
    if (!this.settled && now - this.lastMoveAt > 450 && !this.flight) {
      this.settled = true;
      this.dispatchEvent(new CustomEvent('settled', { detail: this.getView() }));
    }
    this.renderer.render(this.scene, this.camera);
    this.dispatchEvent(new Event('frame'));
  }

  _stepFlight(now) {
    const f = this.flight;
    const t = f.ms === 0 ? 1 : Math.min(1, (now - f.start) / f.ms);
    const e = easeInOutCubic(t);
    const qt = new THREE.Quaternion().slerp(f.q, e);
    const dir = f.dir0.clone().applyQuaternion(qt);
    const dist = f.startDist + (f.endDist - f.startDist) * e + Math.sin(Math.PI * e) * f.hop;
    this.camera.position.copy(dir.multiplyScalar(dist));
    this.camera.lookAt(0, 0, 0);
    this._onMove();
    if (t >= 1) {
      this.flight = null;
      this.controls.enabled = true;
      this.controls.update();
      f.resolve(true);
    }
  }

  _onMove() {
    this.lastMoveAt = performance.now();
    this.settled = false;
    this.dispatchEvent(new CustomEvent('move'));
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _makeStars() {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 40);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
  }

  _makeMarker() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.008, 24), new THREE.MeshBasicMaterial({ color: 0xffb547 })));
    g.add(new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 48), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
    g.visible = false;
    return g;
  }
}

export function zoomLabel(d) {
  if (d > 3.6) return 'whole planet';
  if (d > 2.4) return 'hemisphere';
  if (d > 1.6) return 'continent';
  if (d > 1.3) return 'region';
  return 'close up';
}
const clampDist = (d) => Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, d));
const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
export { angularDistanceDeg };

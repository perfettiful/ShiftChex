// the moving picture behind the landing page: two weeks of shift tiles, and a rule check
// sweeping across them. tiles turn green as it passes, a few flash red first and get fixed.
// three.js comes from a CDN. if it can't load (offline, no WebGL) the hero keeps its plain background
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const COLS = 14, ROWS = 9;          // days across, shift blocks deep
const GAP_X = 1.04, GAP_Z = 0.74;
const SWEEP = 5;                    // seconds for the check to cross
const HOLD = 2.4;                   // all green, before it starts over
const FIX_AFTER = 2.2;              // how far behind the sweep a red tile gets fixed, in columns
const BAD_SHARE = 0.13;

export async function startHero(host) {
  let THREE;
  try { THREE = await import(THREE_URL); } catch { return; }
  if (!host.isConnected) return;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  host.classList.add("ready");

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xc7d8ff, 0x0b1424, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 9, 6);
  scene.add(sun);

  const COLOR = {
    waiting: new THREE.Color("#3a64ad"), ok: new THREE.Color("#2fbf77"),
    bad: new THREE.Color("#ec4f43"), open: new THREE.Color("#22324d"),
  };

  // the tiles
  const grid = new THREE.Group();
  scene.add(grid);
  const count = COLS * ROWS;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08 }), count);
  grid.add(tiles);
  const cells = Array.from({ length: count }, (_, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    return { x: (col - (COLS - 1) / 2) * GAP_X, z: (row - (ROWS - 1) / 2) * GAP_Z,
             color: COLOR.waiting.clone(), bad: false, open: false };
  });
  const minX = cells[0].x, maxX = cells[COLS - 1].x;
  const shuffle = () => cells.forEach((c) => {
    const r = Math.random();
    c.bad = r < BAD_SHARE;
    c.open = !c.bad && r < BAD_SHARE + 0.08;
  });
  shuffle();

  // the sweep: a soft band of light that runs across the tiles
  const glow = document.createElement("canvas");
  glow.width = 128; glow.height = 4;
  const g = glow.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "rgba(120,170,255,0)");
  grad.addColorStop(0.75, "rgba(120,190,255,.55)");
  grad.addColorStop(0.92, "rgba(210,240,255,1)");
  grad.addColorStop(1, "rgba(120,170,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 4);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, ROWS * GAP_Z + 1.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glow), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.rotation.x = -Math.PI / 2;
  beam.position.y = 0.2;
  grid.add(beam);

  // a little dust above it all, for depth
  const dust = new THREE.BufferGeometry();
  const spots = new Float32Array(220 * 3);
  for (let i = 0; i < spots.length; i += 3) {
    spots[i] = (Math.random() - 0.5) * 22;
    spots[i + 1] = Math.random() * 6;
    spots[i + 2] = (Math.random() - 0.5) * 14;
  }
  dust.setAttribute("position", new THREE.BufferAttribute(spots, 3));
  const motes = new THREE.Points(dust, new THREE.PointsMaterial({ color: 0x9fc3ff, size: 0.035,
    transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(motes);

  // the camera leans a little toward the pointer
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => {
    lean.tx = (e.clientX / innerWidth - 0.5) * 2;
    lean.ty = (e.clientY / innerHeight - 0.5) * 2;
  };
  addEventListener("pointermove", onPointer, { passive: true });

  // wide screens get the grid off to the right, behind the sign in card
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grid.position.x = camera.aspect > 1.3 ? 2.6 : 0;
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(host);
  resize();

  let onScreen = true;
  const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
  seen.observe(host);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const clock = new THREE.Clock();
  let cycleStart = 0, last = 0;

  function frame(t, dt) {
    const age = t - cycleStart;
    if (age > SWEEP + HOLD) { cycleStart = t; shuffle(); }
    const sweepX = still ? Infinity : minX - 1.5 + (maxX - minX + 3) * Math.min(1, age / SWEEP);
    const ease = 1 - Math.exp(-dt * 7);

    cells.forEach((c, i) => {
      const behind = (sweepX - c.x) / GAP_X;   // columns since the sweep passed, negative before
      let target = c.open ? COLOR.open : COLOR.waiting;
      if (behind > 0) target = c.bad && behind < FIX_AFTER ? COLOR.bad : COLOR.ok;
      c.color.lerp(target, still ? 1 : ease);
      tiles.setColorAt(i, c.color);

      const wave = still ? 0 : Math.sin(t * 1.1 + c.x * 0.55 + c.z * 0.8) * 0.07;
      // a small hop as the sweep goes over
      const hop = still ? 0 : Math.exp(-((behind - 0.3) ** 2) * 3) * 0.22;
      pos.set(c.x, wave + hop, c.z);
      size.set(1, 1 + hop * 3, 1);
      tiles.setMatrixAt(i, m.compose(pos, q, size));
    });
    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;

    beam.visible = !still && age < SWEEP + 0.4;
    beam.position.x = sweepX - 0.9;
    motes.rotation.y = t * 0.015;
    motes.position.y = Math.sin(t * 0.3) * 0.15;

    lean.x += (lean.tx - lean.x) * ease * 0.4;
    lean.y += (lean.ty - lean.y) * ease * 0.4;
    camera.position.set(lean.x * 0.9, 7.2 - lean.y * 0.5, 8.6);
    camera.lookAt(grid.position.x * 0.55, 0, 0.6);
    renderer.render(scene, camera);
  }

  function stop() {
    sizer.disconnect();
    seen.disconnect();
    removeEventListener("pointermove", onPointer);
    tiles.geometry.dispose(); tiles.material.dispose();
    beam.geometry.dispose(); beam.material.map.dispose(); beam.material.dispose();
    dust.dispose(); motes.material.dispose();
    renderer.dispose();
  }

  if (still) {
    // one finished frame, all checked, and no loop. it still redraws when the size changes
    sizer.disconnect();
    const redraw = new ResizeObserver(() => {
      if (!host.isConnected) { redraw.disconnect(); return stop(); }
      resize();
      frame(0, 1);
    });
    redraw.observe(host);
    frame(0, 1);
    return;
  }

  const tick = () => {
    // the landing page is gone once someone signs in
    if (!host.isConnected) return stop();
    requestAnimationFrame(tick);
    if (!onScreen || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    last += dt;
    frame(last, dt);
  };
  tick();
}

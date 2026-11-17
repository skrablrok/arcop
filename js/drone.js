/* ARCOP · hero drone
   A 3D folding camera drone (Three.js r128) that flies a slow loop above the hero headline. */
(function () {
  var hero = document.querySelector('.hero');
  var host = document.getElementById('fly');
  if (!hero || !host || !window.THREE) { if (window.__introDone) window.__introDone(); return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { if (window.__introDone) window.__introDone(); return; }
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.physicallyCorrectLights = true;
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, -0.9, 14);
  camera.lookAt(0, 0, 0);

  /* ── studio environment: dark room, large soft boxes, cool rim — reflections read as a product shoot ── */
  (function () {
    var pm = new THREE.PMREMGenerator(renderer);
    var env = new THREE.Scene();
    env.background = new THREE.Color(0x151617);
    function box(w, h, x, y, z, rx, ry, c) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
    }
    box(9, 4, 0, 7, 1, Math.PI / 2, 0, 0xf2f2f2);          // big overhead softbox
    box(3, 7, -8, 2, 3, 0, Math.PI / 2, 0xbdbdbd);         // key strip, left
    box(2, 6, 8, 1.5, -2, 0, -Math.PI / 2, 0x9db3c8);      // cool rim strip, right/back
    box(14, 1.2, 0, .5, -9, 0, 0, 0x5a5a5a);               // low horizon band behind
    box(16, 6, 0, -6, 0, -Math.PI / 2, 0, 0x2a2a28);       // floor bounce
    scene.environment = pm.fromScene(env, 0.035).texture;
    pm.dispose();
  })();
  var key = new THREE.DirectionalLight(0xfff4e8, 2.4); key.position.set(4, 8, 7); scene.add(key);
  var rim = new THREE.DirectionalLight(0xd9e6ff, 3.2); rim.position.set(-6, 3, -7); scene.add(rim);
  var fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(0, -6, 4); scene.add(fill);

  /* ── the drone: models/arcop-drone.glb, with the code-built model as a fallback ── */
  var drone = new THREE.Group(), craft = new THREE.Group();   // drone = flight transform, craft = normalised model
  drone.add(craft); scene.add(drone);
  var MODEL_W = .55, ready = false, rig = null;

  function setupRig(root) {
    var byName = {};
    root.traverse(function (o) { if (o.name) byName[o.name] = byName[o.name] || o; if (o.isMesh) { o.frustumCulled = false; } });
    // material finishing (the GLB stores standard PBR; glass and LEDs get their final tuning here)
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var m = o.material, n = m.name || '';
      m.envMapIntensity = /Lens|Sensor|Glass/.test(n) ? 1.8 : /Alumin|Steel|Copper|Gold/.test(n) ? 1.15 : .9;
      if (/LightLens/.test(n)) { m.transparent = true; m.opacity = .25; m.depthWrite = false; }
    });
    var props = [];
    ['FL', 'FR', 'RL', 'RR'].forEach(function (id) {
      var p = byName['Prop_' + id]; if (!p) return;
      var dir = (id === 'FL' || id === 'RR') ? 1 : -1;
      var blades = [byName['Blade_' + id + '_A'], byName['Blade_' + id + '_B']].filter(Boolean);
      // solid blades (no see-through motion blur)
      blades.forEach(function (b) { b.traverse(function (o) { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true; } }); });
      props.push({ node: p, dir: dir, light: byName['Light_' + id] });
    });
    return { props: props, yaw: byName.Gimbal_Yaw, roll: byName.Gimbal_Roll, pitch: byName.Gimbal_Pitch, status: byName.Light_Status };
  }
  function useModel(root) {
    if (ready) return;
    ready = true;
    window.__introStarted = true;
    // if the page already gave up waiting and revealed itself, skip the washing intro
    if (intro && !document.documentElement.classList.contains('lock')) {
      intro = false; host.classList.remove('intro'); if (spray) { spray.remove(); sctx = null; }
    }
    rig = setupRig(root);
    var bb = new THREE.Box3().setFromObject(root), sz = new THREE.Vector3(); bb.getSize(sz);
    MODEL_W = Math.max(sz.x, sz.z);
    var c = new THREE.Vector3(); bb.getCenter(c); root.position.sub(c);   // centre the model on its bounding box
    craft.add(root);
    measure();
    if (reduce) frame(performance.now()); else kick();
  }
  var fallbackTimer = setTimeout(function () { if (!ready && window.buildArcopDrone) useModel(window.buildArcopDrone(THREE).root); }, 2500);
  if (THREE.GLTFLoader) {
    var src = (document.currentScript && document.currentScript.dataset.model) || 'models/arcop-drone.glb';
    new THREE.GLTFLoader().load(src, function (g) { clearTimeout(fallbackTimer); useModel(g.scene); },
      undefined, function () { clearTimeout(fallbackTimer); if (window.buildArcopDrone) useModel(window.buildArcopDrone(THREE).root); });
  } else if (window.buildArcopDrone) { clearTimeout(fallbackTimer); setTimeout(function () { useModel(window.buildArcopDrone(THREE).root); }); }

  /* ── layout & flight ── */
  var W = 1, H = 1, unit = 1, area = {};
  function measure() {
    var r = hero.getBoundingClientRect(); W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
    camera.aspect = W / H; camera.updateProjectionMatrix();
    var visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    unit = visH / H;                                  // world units per px at z=0
    var h1 = hero.querySelector('h1').getBoundingClientRect();
    var top = 90, bottom = Math.max(top + 140, h1.top - r.top + h1.height * .25);
    var size = W < 700 ? W * .74 : Math.max(260, Math.min(W * .42, 660));  // drone width on screen, px
    craft.scale.setScalar(size * unit / MODEL_W);
    area = { cx: W * (W < 700 ? .52 : .58), cy: (top + bottom) / 2, ax: Math.min(W * (W < 700 ? .1 : .15), 340), ay: Math.max(18, (bottom - top) / 2 - size * .22), size: size };
  }
  function toWorld(px, py, out) { return out.set((px - W / 2) * unit, -(py - H / 2) * unit, 0); }

  var mx = 0, my = 0, tmx = 0, tmy = 0;
  hero.addEventListener('pointermove', function (e) { var r = hero.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - .5; tmy = (e.clientY - r.top) / r.height - .5; });
  hero.addEventListener('pointerleave', function () { tmx = tmy = 0; });
  /* inspection: grab the drone and turn it (eases back when released); scroll spins it; views via window.ArcopDrone */
  var inspect = { yaw: 0, pitch: 0, vy: 0, vp: 0, tyaw: 0, tpitch: 0, hold: false, drag: null }, droneScr = { x: -999, y: -999 };
  function nearDrone(e) { var r = hero.getBoundingClientRect(); return Math.hypot(e.clientX - r.left - droneScr.x, e.clientY - r.top - droneScr.y) < (area.size || 200) * .55; }
  // (grab-to-turn removed: the drone only flies)
  function stepInspect(dt, now) {
    if (inspect.drag) return;
    // a little inertia after release, then ease back to the target pose
    inspect.yaw += inspect.vy; inspect.vy *= Math.pow(.9, dt * 60);
    inspect.pitch += inspect.vp; inspect.vp *= Math.pow(.88, dt * 60);
    if (!inspect.hold && (!inspect.releasedAt || now - inspect.releasedAt > 900)) {
      var tw = Math.round((inspect.yaw - inspect.tyaw) / (Math.PI * 2)) * Math.PI * 2 + inspect.tyaw;   // shortest way round
      inspect.yaw += (tw - inspect.yaw) * (1 - Math.pow(.97, dt * 60));
      inspect.pitch += (inspect.tpitch - inspect.pitch) * (1 - Math.pow(.95, dt * 60));
    }
  }
  var VIEWS = { hero: [0, 0], front: [.22, -.55], side: [Math.PI / 2 + .22, -.45], rear: [Math.PI + .22, -.4], top: [.22, .9], under: [.22, -1.1], 'three-quarter': [-.6, -.15] };
  window.ArcopDrone = {
    view: function (name) { var v = VIEWS[name] || VIEWS.hero; inspect.tyaw = v[0]; inspect.tpitch = v[1]; inspect.hold = false; inspect.releasedAt = 0; kick(); },
    views: Object.keys(VIEWS),
    screenPosition: function () { return { x: droneScr.x, y: droneScr.y }; }
  };
  var visible = true;
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(hero);

  var t = .6, last = performance.now(), start = last, prev = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3(), running = false;
  function pathAt(tt) { return { x: area.cx + area.ax * Math.sin(tt), y: area.cy + area.ay * Math.sin(2 * tt) + Math.sin(tt * 3.1) * 5 }; }

  /* ── opening: the drone washes a dirty, dark pane clean, row by row ──
     veil  = the grime (erased where water hits it)
     spray = droplets, mist, running water and a wet shine, drawn above the veil and below the drone */
  var veil = document.getElementById('veil'), intro = !!(veil && !reduce && document.documentElement.classList.contains('lock'));
  var vctx = intro ? veil.getContext('2d') : null, introStart = 0, introE = 0, introEnd = null, blendFrom = null, lastB = null;
  var spray = null, sctx = null, drops = [], mist = [], rivers = [], sheens = [], sprayUntil = 0;
  var VW = innerWidth, VH = innerHeight, SDPR = Math.min(1.5, devicePixelRatio || 1), rnd = Math.random;
  var stamp = null;
  if (intro) {
    host.classList.add('intro', 'on');
    spray = document.createElement('canvas');
    spray.setAttribute('aria-hidden', 'true');
    spray.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:58;pointer-events:none';
    spray.width = VW * SDPR; spray.height = VH * SDPR;
    document.body.appendChild(spray);
    sctx = spray.getContext('2d'); sctx.scale(SDPR, SDPR);

    /* dirty glass, layered like the real thing:
       dark interior behind the pane -> organic dirt film -> old rain runs with tide lines
       -> dried mineral spots -> dust and fibres -> old squeegee arcs -> a faint sky reflection */
    (function () {
      var g = vctx, i, k;
      function hash(x, y) { var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
      function vnoise(x, y) {
        var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      }
      function fbm(x, y) { var s = 0, amp = .5, f = 1; for (var o = 0; o < 5; o++) { s += vnoise(x * f, y * f) * amp; f *= 2.03; amp *= .5; } return s; }

      // 1. what's behind the glass: a dark room, a little lighter towards the top
      var bg = g.createLinearGradient(0, 0, 0, VH);
      bg.addColorStop(0, '#1a1a19'); bg.addColorStop(.55, '#111110'); bg.addColorStop(1, '#0b0b0a');
      g.fillStyle = bg; g.fillRect(0, 0, VW, VH);

      // 2. dirt film: fractal noise, warm grey-brown, denser towards the bottom where rain splashes
      var sw = Math.ceil(VW / 5), sh = Math.ceil(VH / 5), film = document.createElement('canvas'); film.width = sw; film.height = sh;
      var fx = film.getContext('2d'), id = fx.createImageData(sw, sh), seedX = rnd() * 100, seedY = rnd() * 100;
      for (var y = 0; y < sh; y++) for (var x = 0; x < sw; x++) {
        var n = fbm(x / 34 + seedX, y / 26 + seedY), n2 = fbm(x / 9 + 40, y / 7 + 17);
        var dens = Math.max(0, n * 1.25 - .32) * (.75 + .5 * (y / sh)) + n2 * .12;
        var p = (y * sw + x) * 4;
        id.data[p] = 92 + n2 * 30; id.data[p + 1] = 83 + n2 * 24; id.data[p + 2] = 68 + n2 * 16; id.data[p + 3] = Math.min(255, dens * 150);
      }
      fx.putImageData(id, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.filter = 'blur(2px)'; g.drawImage(film, 0, 0, VW, VH); g.filter = 'none';

      // 3. old rain runs: a cleaner channel with tide-line deposits on both edges and a residue bead at the end
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (i = 0; i < 110; i++) {
        var sx = rnd() * VW, sy = -20 + rnd() * VH * .8, len = 25 + Math.pow(rnd(), 1.8) * 380, w = .5 + Math.pow(rnd(), 2) * 2.6, pts = [], xx = sx;
        for (k = 0; k <= 30; k++) { var yy = sy + len * k / 30; xx += (rnd() - .5) * 1.4 + (rnd() < .06 ? (rnd() - .5) * 5 : 0); pts.push([xx, yy]); }
        function path() { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]); }
        g.globalAlpha = .5 + rnd() * .45;
        path(); g.strokeStyle = 'rgba(158,146,122,.24)'; g.lineWidth = w + 1.4; g.stroke();      // deposit edges
        path(); g.strokeStyle = 'rgba(12,12,11,.75)'; g.lineWidth = w; g.stroke();             // cleaner channel
        var end = pts[pts.length - 1];
        if (rnd() < .6) { g.fillStyle = 'rgba(165,152,128,.28)'; g.beginPath(); g.ellipse(end[0], end[1], w * .7 + .4, w + .6, 0, 0, 7); g.fill(); }
        g.globalAlpha = 1;
      }

      // 4. dried water spots: mineral rings, clustered, lighter rims
      for (i = 0; i < 70; i++) {
        var cx = rnd() * VW, cy = rnd() * VH, spread = 20 + rnd() * 90, cnt = 4 + rnd() * 16 | 0;
        for (k = 0; k < cnt; k++) {
          var px2 = cx + (rnd() - .5) * spread * 2, py2 = cy + (rnd() - .5) * spread, pr = .6 + Math.pow(rnd(), 2.2) * 7;
          g.fillStyle = 'rgba(100,92,78,' + (.05 + rnd() * .08) + ')'; g.beginPath(); g.ellipse(px2, py2, pr, pr * (.8 + rnd() * .3), rnd() * 3, 0, 7); g.fill();
          g.strokeStyle = 'rgba(176,165,142,' + (.06 + rnd() * .14) + ')'; g.lineWidth = .4 + rnd() * .5; g.stroke();
        }
      }

      // 5. dust: fine specks, a few clumps and fibres
      for (i = 0; i < 5200; i++) {
        var a2 = .06 + Math.pow(rnd(), 3) * .55, s2 = .3 + Math.pow(rnd(), 4) * 1.6;
        g.fillStyle = 'rgba(' + (165 + rnd() * 40 | 0) + ',' + (155 + rnd() * 35 | 0) + ',' + (135 + rnd() * 30 | 0) + ',' + a2 + ')';
        g.fillRect(rnd() * VW, rnd() * VH, s2, s2);
      }
      for (i = 0; i < 40; i++) {
        var fx0 = rnd() * VW, fy0 = rnd() * VH; g.strokeStyle = 'rgba(170,160,140,' + (.15 + rnd() * .2) + ')'; g.lineWidth = .5;
        g.beginPath(); g.moveTo(fx0, fy0); g.bezierCurveTo(fx0 + (rnd() - .5) * 14, fy0 + (rnd() - .5) * 14, fx0 + (rnd() - .5) * 18, fy0 + (rnd() - .5) * 18, fx0 + (rnd() - .5) * 22, fy0 + (rnd() - .5) * 22); g.stroke();
      }

      // 6. old squeegee arcs from a careless clean, very faint
      for (i = 0; i < 7; i++) {
        var ax = rnd() * VW, ay = rnd() * VH, ar = 120 + rnd() * 260, a0 = rnd() * 6.3;
        g.strokeStyle = 'rgba(110,100,84,' + (.018 + rnd() * .025) + ')'; g.lineWidth = 30 + rnd() * 50; g.filter = 'blur(6px)';
        g.beginPath(); g.arc(ax, ay, ar, a0, a0 + .6 + rnd() * 1.2); g.stroke();
        g.filter = 'none';
      }

      // 7. the glass itself: a soft sky reflection band and a darker vignette at the edges
      g.save(); g.translate(VW * .62, 0); g.rotate(.32);
      var sh2 = g.createLinearGradient(-VW * .18, 0, VW * .18, 0);
      sh2.addColorStop(0, 'rgba(255,255,255,0)'); sh2.addColorStop(.5, 'rgba(225,232,238,.055)'); sh2.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sh2; g.fillRect(-VW * .18, -VH, VW * .36, VH * 3);
      var sh3 = g.createLinearGradient(VW * .22, 0, VW * .3, 0);
      sh3.addColorStop(0, 'rgba(255,255,255,0)'); sh3.addColorStop(.5, 'rgba(225,232,238,.035)'); sh3.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sh3; g.fillRect(VW * .22, -VH, VW * .08, VH * 3);
      g.restore();
      var vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .35, VW / 2, VH / 2, Math.max(VW, VH) * .75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
    })();

    // the water stamp: dense in the middle, broken and speckled at the edge
    stamp = document.createElement('canvas');
    var S = 256; stamp.width = stamp.height = S;
    (function () {
      var g = stamp.getContext('2d'), c = S / 2, i;
      var core = g.createRadialGradient(c, c, 0, c, c, c * .8);
      core.addColorStop(0, 'rgba(0,0,0,1)'); core.addColorStop(.75, 'rgba(0,0,0,.95)'); core.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = core; g.fillRect(0, 0, S, S);
      for (i = 0; i < 140; i++) {             // a broken, watery edge: soft lobes, not specks
        var ang = rnd() * Math.PI * 2, d = c * (.6 + rnd() * .3), r = c * (.05 + rnd() * .12);
        var bx = c + Math.cos(ang) * d, by = c + Math.sin(ang) * d, bg = g.createRadialGradient(bx, by, 0, bx, by, r);
        bg.addColorStop(0, 'rgba(0,0,0,' + (.5 + rnd() * .4) + ')'); bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bg; g.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    })();
  }

  var ROWS = 3, FLYIN = .75, ROW = 1.0, DROP = .38;
  var INTRO_LEN = FLYIN + ROWS * ROW + (ROWS - 1) * DROP;
  function eio(x) { return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function introPos(e) {
    var rowH = VH / ROWS, L = VW * .06, R = VW * .94;
    function rowY(i) { return rowH * (i + .5) - area.size * .14 - (i === 0 ? rowH * .08 : 0) + (i === ROWS - 1 ? rowH * .06 : 0); }
    if (e < FLYIN) { var f = eio(e / FLYIN); return { x: VW + area.size - (VW + area.size - R) * f, y: rowY(0) - (1 - f) * 70, on: f > .55 }; }
    e -= FLYIN;
    for (var i = 0; i < ROWS; i++) {
      var dirLeft = i % 2 === 0, a = dirLeft ? R : L, b = dirLeft ? L : R;
      if (e < ROW) { var q = eio(e / ROW); return { x: a + (b - a) * q, y: rowY(i), on: true }; }
      e -= ROW;
      if (i < ROWS - 1) { if (e < DROP) { var d = eio(e / DROP); return { x: b, y: rowY(i) + rowH * d, on: true }; } e -= DROP; }
    }
    return { x: ROWS % 2 ? L : R, y: rowY(ROWS - 1), on: false };
  }

  // water hitting the pane: textured stamps along the path, plus streams that run down and clean as they go
  function wash(x, y, dt) {
    var r = VH / ROWS * .86, n, i;
    vctx.save(); vctx.globalCompositeOperation = 'destination-out';
    var from = lastB || { x: x, y: y }, dx = x - from.x, dy = y - from.y;
    n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * .12)));
    for (i = 1; i <= n; i++) {
      var sx = from.x + dx * i / n + (rnd() - .5) * r * .12, sy = from.y + dy * i / n + (rnd() - .5) * r * .12, sr = r * (.88 + rnd() * .24);
      vctx.save(); vctx.translate(sx, sy); vctx.rotate(rnd() * 6.3); vctx.drawImage(stamp, -sr, -sr, sr * 2, sr * 2); vctx.restore();
    }
    vctx.restore();
    lastB = { x: x, y: y };
    // new streams start at the lower edge of the wet patch
    if (rnd() < dt * 26) rivers.push({ x: x + (rnd() - .5) * r * 1.5, y: y + r * (.5 + rnd() * .25), len: 0, max: 60 + rnd() * 260, v: 90 + rnd() * 160, w: 1.6 + rnd() * 3.6, ph: rnd() * 9, wob: 1 + rnd() * 3, life: 1 });
    // a wet shine trails the drone
    if (rnd() < dt * 30) sheens.push({ x: x + (rnd() - .5) * r * 1.6, y: y - r * .4 + rnd() * r * .8, w: 6 + rnd() * 26, h: 40 + rnd() * 120, a: .08 + rnd() * .1, life: 1, v: 30 + rnd() * 60 });
  }

  // droplets and mist fly out of the nozzle toward the pane; streams run down; shine fades
  function sprayStep(dt, nx, ny, on) {
    if (!sctx) return false;
    var i, d;
    if (on) {
      var count = Math.round(dt * 520);
      for (i = 0; i < count; i++) {
        var ang = rnd() * Math.PI * 2, sp = 120 + rnd() * 520;
        drops.push({ x: nx, y: ny, px: nx, py: ny, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * .8 + 40, life: .25 + rnd() * .45, age: 0, r: .5 + rnd() * 1.6 });
      }
      if (rnd() < dt * 18) mist.push({ x: nx + (rnd() - .5) * 40, y: ny + (rnd() - .5) * 30, r: 30 + rnd() * 40, g: 120 + rnd() * 120, age: 0, life: .6 + rnd() * .5 });
    }
    sctx.clearRect(0, 0, VW, VH);

    // shine on the freshly washed glass
    for (i = sheens.length - 1; i >= 0; i--) {
      d = sheens[i]; d.life -= dt * .9; d.y += d.v * dt;
      if (d.life <= 0) { sheens.splice(i, 1); continue; }
      var sg = sctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,' + d.a * d.life + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.fillStyle = sg; sctx.fillRect(d.x, d.y, d.w, d.h);
    }
    // running streams: erase a wavy clean trail on the grime, draw a bright bead at the front
    vctx.save(); vctx.globalCompositeOperation = 'destination-out'; vctx.lineCap = 'round';
    for (i = rivers.length - 1; i >= 0; i--) {
      d = rivers[i];
      if (d.len < d.max) {
        var nl = Math.min(d.max, d.len + d.v * dt);
        var x0 = d.x + Math.sin(d.ph + d.len * .03) * d.wob, x1 = d.x + Math.sin(d.ph + nl * .03) * d.wob;
        vctx.strokeStyle = 'rgba(0,0,0,.9)'; vctx.lineWidth = d.w;
        vctx.beginPath(); vctx.moveTo(x0, d.y + d.len); vctx.lineTo(x1, d.y + nl); vctx.stroke();
        d.len = nl; d.v *= (1 - dt * .6);
        if (d.v < 25) d.max = d.len;      // stream has run out
      } else d.life -= dt * 1.4;
      d.age = (d.age || 0) + dt; if (d.age > 3) d.life = Math.min(d.life, 0);
      if (d.life <= 0) { rivers.splice(i, 1); continue; }
      var bx = d.x + Math.sin(d.ph + d.len * .03) * d.wob, by = d.y + d.len;
      sctx.fillStyle = 'rgba(210,225,235,' + .55 * d.life + ')'; sctx.beginPath(); sctx.ellipse(bx, by, d.w * .7, d.w * .95, 0, 0, 7); sctx.fill();
      sctx.fillStyle = 'rgba(255,255,255,' + .8 * d.life + ')'; sctx.beginPath(); sctx.arc(bx - d.w * .2, by - d.w * .3, Math.max(.6, d.w * .22), 0, 7); sctx.fill();
    }
    vctx.restore();
    // mist
    for (i = mist.length - 1; i >= 0; i--) {
      d = mist[i]; d.age += dt; if (d.age > d.life) { mist.splice(i, 1); continue; }
      var k = d.age / d.life, rr = d.r + d.g * k, a = .16 * (1 - k) * Math.min(1, k * 6);
      var mg = sctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, rr);
      mg.addColorStop(0, 'rgba(235,242,247,' + a + ')'); mg.addColorStop(1, 'rgba(235,242,247,0)');
      sctx.fillStyle = mg; sctx.fillRect(d.x - rr, d.y - rr, rr * 2, rr * 2);
    }
    // droplets with short motion streaks
    sctx.lineCap = 'round';
    for (i = drops.length - 1; i >= 0; i--) {
      d = drops[i]; d.age += dt; if (d.age > d.life) { drops.splice(i, 1); continue; }
      d.px = d.x; d.py = d.y;
      d.vx *= (1 - dt * 3.2); d.vy = d.vy * (1 - dt * 3.2) + 600 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      var al = (1 - d.age / d.life) * .85;
      sctx.strokeStyle = 'rgba(225,236,244,' + al + ')'; sctx.lineWidth = d.r;
      sctx.beginPath(); sctx.moveTo(d.px, d.py); sctx.lineTo(d.x, d.y); sctx.stroke();
    }
    return drops.length || mist.length || rivers.length || sheens.length;
  }

  function finishIntro(now) {
    if (!intro) return;
    intro = false; introEnd = now;
    host.classList.remove('intro');
    if (window.__introDone) window.__introDone();
  }

  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!reduce && !inspect.drag) t += dt * (inspect.hold ? .05 : .3);
    mx += (tmx - mx) * .04; my += (tmy - my) * .04;
    var p = pathAt(t);
    var px, py;
    if (intro) {
      // clock advances by capped frame time, so a slow first frame (shader compile) never skips the wash
      if (introStart) introE += dt; introStart = 1; window.__introStarted = true; window.__introE = introE;
      var e = introE, ip = introPos(e);
      px = ip.x; py = ip.y + Math.sin(now / 300) * 2;
      if (ip.on) wash(px, py + area.size * .14, dt);
      blendFrom = { x: px, y: py };
      if (e >= INTRO_LEN) finishIntro(now);
    } else if (blendFrom) {
      var bk = Math.min(1, (now - introEnd) / 1600), be = eio(bk);
      var lx = p.x - mx * 80, ly = p.y - my * 40 + Math.sin(now / 480) * 3;
      px = blendFrom.x + (lx - blendFrom.x) * be; py = blendFrom.y + (ly - blendFrom.y) * be;
      if (bk >= 1) blendFrom = null;
    } else {
      var k = reduce ? 1 : Math.min(1, Math.max(0, (now - start - 900) / 2000)); k = 1 - Math.pow(1 - k, 3);
      px = p.x - mx * 80 + (1 - k) * W * .7; py = p.y - my * 40 + (reduce ? 0 : Math.sin(now / 480) * 3) - (1 - k) * 80;
    }
    var sprayAlive = false;
    if (sctx) {
      sprayAlive = sprayStep(dt, px, py + area.size * .14, intro && introE > FLYIN * .55);
      if (!intro && !sprayAlive) { spray.remove(); sctx = null; }
    }
    toWorld(px, py, tmp); tmp.z = reduce ? 0 : Math.sin(t * .7) * .8;
    if (dt > 0) vel.lerp(tmp.clone().sub(prev).divideScalar(Math.max(dt, .001)), .06);
    prev.copy(tmp); drone.position.copy(tmp);
    // attitude: roll into lateral motion, pitch with vertical motion, slow yaw for a 3/4 view
    var roll = THREE.MathUtils.clamp(-vel.x * .09, -.32, .32), pitch = THREE.MathUtils.clamp(vel.y * .04 + .5, .3, .72);
    stepInspect(dt, now);
    var sp = Math.min(1, Math.max(0, scrollY / Math.max(1, H)));   // hero scroll progress: spin a full turn and come closer
    drone.position.z += sp * 3.2; drone.position.y += sp * H * unit * .18;
    drone.rotation.set(pitch + inspect.pitch * (1 - sp), -.22 + Math.sin(t * .5) * .3 + mx * .3 + inspect.yaw + sp * Math.PI * 2, roll);
    droneScr.x = px; droneScr.y = py;
    // props
    animateRig(now, dt, pitch, roll);
    renderer.render(scene, camera);
    host.classList.add('on');
    running = (visible || intro || blendFrom || sprayAlive) && !reduce;
    if (running) requestAnimationFrame(frame);
  }
  // props spin with a motion-blur trail; the gimbal stabilises the camera against the drone's tilt
  function animateRig(now, dt, pitch, roll) {
    if (!rig) return;
    var spd = reduce ? 0 : 7;
    rig.props.forEach(function (pr, i) {
      pr.node.rotation.y += pr.dir * spd * dt;
      if (pr.light) pr.light.visible = i < 2 || ((now / 700) | 0) % 2 === 0;
    });
    if (rig.status) rig.status.visible = ((now / 1600) | 0) % 2 === 0;
    if (rig.pitch) rig.pitch.rotation.x = -pitch * .8 + Math.sin(now / 2300) * .06;
    if (rig.roll) rig.roll.rotation.z = -roll * .9;
    if (rig.yaw) rig.yaw.rotation.y = Math.sin(now / 3100) * .18 + inspect.yaw * .2;
  }
  function kick() { if (!ready) return; if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  measure();
  addEventListener('resize', function () { measure(); if (reduce) frame(performance.now()); });
  if (document.fonts) document.fonts.ready.then(function () { measure(); });
  // (frames start once the model is loaded: see useModel)
})();

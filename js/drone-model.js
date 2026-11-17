/* ARCOP drone model builder (Three.js r128)
   Builds a detailed folding quadcopter from code and returns a scene graph whose
   parts are named and pivoted for animation. The same builder is used to export
   models/arcop-drone.glb, and as a fallback when the GLB cannot be loaded.

   Units: the model is built in centimetres; the root is scaled to metres (0.01).
   Axes: +Z = nose (forward), +Y = up, +X = left wing when seen from behind.

   Named nodes for animation:
     ArcopDrone (root)
       Body, Battery, Sensors_*, Vents_*, Screws, ...
       Arm_FL|FR|RL|RR  ->  Motor_* -> Prop_* (pivot on motor axis) -> Blade_*_A|B (fold pivots)
       Gimbal_Yaw -> Gimbal_Roll -> Gimbal_Pitch -> Camera
       Leg_FL|FR|RL|RR
       Light_* (nav LEDs) */
(function (global) {
  function build(THREE, opts) {
    opts = opts || {};
    var TEX = opts.textureSize || 512;
    var rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(1234567);

    /* ───────── textures (drawn once on canvas) ───────── */
    function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
    function tex(c, rep, srgb) {
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (rep) t.repeat.set(rep[0], rep[1]);
      if (srgb) t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 8; return t;
    }
    // carbon twill: colour + matching normal map
    var cfC = canvas(TEX), cfN = canvas(TEX);
    (function () {
      var g = cfC.getContext('2d'), n = cfN.getContext('2d'), cell = TEX / 16;
      g.fillStyle = '#121315'; g.fillRect(0, 0, TEX, TEX);
      n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, TEX, TEX);
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var horiz = ((x + y) % 4) < 2, px = x * cell, py = y * cell;
        var gr = horiz ? g.createLinearGradient(px, py, px, py + cell) : g.createLinearGradient(px, py, px + cell, py);
        gr.addColorStop(0, '#16171a'); gr.addColorStop(.45, '#2f3237'); gr.addColorStop(.55, '#2b2e33'); gr.addColorStop(1, '#141518');
        g.fillStyle = gr; g.fillRect(px + .5, py + .5, cell - 1, cell - 1);
        var ng = horiz ? n.createLinearGradient(px, py, px, py + cell) : n.createLinearGradient(px, py, px + cell, py);
        ng.addColorStop(0, horiz ? 'rgb(128,90,240)' : 'rgb(90,128,240)'); ng.addColorStop(.5, 'rgb(128,128,255)'); ng.addColorStop(1, horiz ? 'rgb(128,166,240)' : 'rgb(166,128,240)');
        n.fillStyle = ng; n.fillRect(px, py, cell, cell);
      }
    })();
    // fine plastic grain (roughness variation + micro normal)
    var grR = canvas(256), grN = canvas(256);
    (function () {
      var g = grR.getContext('2d'), id = g.createImageData(256, 256), n = grN.getContext('2d'), nd = n.createImageData(256, 256);
      for (var i = 0; i < id.data.length; i += 4) {
        var v = 228 + (rnd() - .5) * 40; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
        nd.data[i] = 128 + (rnd() - .5) * 14; nd.data[i + 1] = 128 + (rnd() - .5) * 14; nd.data[i + 2] = 255; nd.data[i + 3] = 255;
      }
      g.putImageData(id, 0, 0); n.putImageData(nd, 0, 0);
      // a few faint scuffs
      g.strokeStyle = 'rgba(200,200,200,.18)';
      for (i = 0; i < 40; i++) { g.lineWidth = .5 + rnd(); g.beginPath(); var x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 40, y + (rnd() - .5) * 10); g.stroke(); }
    })();
    // brushed aluminium roughness
    var brR = canvas(256);
    (function () {
      var g = brR.getContext('2d'); g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 1400; i++) { var y = rnd() * 256, v = 70 + rnd() * 70 | 0; g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',.5)'; g.lineWidth = rnd() * 1.2; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (rnd() - .5) * 2); g.stroke(); }
    })();

    /* ───────── materials ───────── */
    var M = {
      graphite: new THREE.MeshStandardMaterial({ name: 'Graphite', color: 0x34373b, roughness: .62, metalness: 0, roughnessMap: tex(grR, [3, 3]), normalMap: tex(grN, [4, 4]), normalScale: new THREE.Vector2(.25, .25) }),
      graphiteDark: new THREE.MeshStandardMaterial({ name: 'GraphiteDark', color: 0x1d1f22, roughness: .55, metalness: 0, roughnessMap: tex(grR, [3, 3]) }),
      panel: new THREE.MeshStandardMaterial({ name: 'Panel', color: 0x2a2c30, roughness: .5, metalness: .05, roughnessMap: tex(grR, [2, 2]) }),
      carbon: new THREE.MeshStandardMaterial({ name: 'Carbon', map: tex(cfC, [2, 2], true), normalMap: tex(cfN, [2, 2]), normalScale: new THREE.Vector2(.35, .35), roughness: .58, metalness: .1 }),
      carbonProp: new THREE.MeshStandardMaterial({ name: 'CarbonProp', map: tex(cfC, [3, .5], true), normalMap: tex(cfN, [3, .5]), normalScale: new THREE.Vector2(.25, .25), roughness: .45, metalness: .1, side: THREE.DoubleSide }),
      alu: new THREE.MeshStandardMaterial({ name: 'AluminiumSatin', color: 0xb4b8bd, roughness: .34, metalness: 1, roughnessMap: tex(brR, [1, 1]) }),
      aluDark: new THREE.MeshStandardMaterial({ name: 'AluminiumDark', color: 0x5d6168, roughness: .38, metalness: 1, roughnessMap: tex(brR, [1, 1]) }),
      steel: new THREE.MeshStandardMaterial({ name: 'Steel', color: 0x8d9197, roughness: .3, metalness: 1 }),
      copper: new THREE.MeshStandardMaterial({ name: 'Copper', color: 0xb5582c, roughness: .35, metalness: 1 }),
      rubber: new THREE.MeshStandardMaterial({ name: 'Rubber', color: 0x141414, roughness: .92, metalness: 0 }),
      glass: new THREE.MeshStandardMaterial({ name: 'LensGlass', color: 0x050608, roughness: .03, metalness: .6 }),
      coating: new THREE.MeshStandardMaterial({ name: 'LensCoating', color: 0x2c3c78, roughness: .08, metalness: 1 }),
      gold: new THREE.MeshStandardMaterial({ name: 'GoldRing', color: 0xc9a23a, roughness: .25, metalness: 1 }),
      sensor: new THREE.MeshStandardMaterial({ name: 'SensorGlass', color: 0x0a0b0d, roughness: .06, metalness: .4 }),
      vent: new THREE.MeshStandardMaterial({ name: 'VentDark', color: 0x0b0b0c, roughness: .8, metalness: 0 }),
      orange: new THREE.MeshStandardMaterial({ name: 'AccentOrange', color: 0xe4520f, roughness: .45, metalness: 0 }),
      ledRed: new THREE.MeshStandardMaterial({ name: 'LedRed', color: 0x330000, emissive: 0xff2a14, emissiveIntensity: 2.2 }),
      ledGreen: new THREE.MeshStandardMaterial({ name: 'LedGreen', color: 0x003300, emissive: 0x22ff66, emissiveIntensity: 2.2 }),
      ledWhite: new THREE.MeshStandardMaterial({ name: 'LedWhite', color: 0x333333, emissive: 0xffffff, emissiveIntensity: 1.6 })
    };

    // material colours are authored in sRGB; convert to linear for correct PBR shading
    Object.keys(M).forEach(function (k) { var m = M[k]; if (m.color && !m.map) m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); });

    /* ───────── geometry helpers ───────── */
    var V3 = THREE.Vector3;
    function mesh(geo, mat, name) { var m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = m.receiveShadow = true; return m; }
    // superellipse ring point
    function se(t, w, h, n) {
      var c = Math.cos(t), s = Math.sin(t);
      return [w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), h * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
    }
    /* loft: sections along local Z. each {z, w, h, y, x?, n}. returns BufferGeometry with caps.
       uvs: u around, v along length (for textures) */
    function loft(sections, seg, cap) {
      seg = seg || 48;
      var pos = [], uv = [], idx = [], S = sections.length, i, j;
      for (i = 0; i < S; i++) {
        var s = sections[i];
        for (j = 0; j <= seg; j++) {
          var t = j / seg * Math.PI * 2, p = se(t, s.w, s.h, s.n || 4);
          pos.push((s.x || 0) + p[0], (s.y || 0) + p[1], s.z); uv.push(j / seg, i / (S - 1));
        }
      }
      for (i = 0; i < S - 1; i++) for (j = 0; j < seg; j++) {
        var a = i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      if (cap !== false) {
        [0, S - 1].forEach(function (k, ci) {
          var s = sections[k], c = pos.length / 3; pos.push(s.x || 0, s.y || 0, s.z); uv.push(.5, ci);
          for (j = 0; j < seg; j++) { var a = k * (seg + 1) + j; if (ci === 0) idx.push(c, a + 1, a); else idx.push(c, a, a + 1); }
        });
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // smooth profile helper: sample a function z->(w,h,y) with rounded ends
    function capsuleSections(len, w, h, n, steps, round) {
      var out = [], r = round || .2;
      for (var i = 0; i <= steps; i++) {
        var u = i / steps, z = (u - .5) * len, e = Math.min(u, 1 - u) / r, k = e >= 1 ? 1 : Math.sqrt(1 - (1 - e) * (1 - e));
        out.push({ z: z, w: w * Math.max(.02, k), h: h * Math.max(.02, k), n: n });
      }
      return out;
    }
    function orientBetween(obj, a, b) {      // aligns obj's local +Z from a to b
      obj.position.copy(a); obj.lookAt(b);
    }
    function lathe(points, seg) { return new THREE.LatheGeometry(points.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 48); }
    function cyl(r1, r2, h, seg, mat, name) { return mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 32), mat, name); }
    function box(w, h, d, mat, name) { return mesh(new THREE.BoxGeometry(w, h, d), mat, name); }
    // hex socket screw head, axis along +Y
    function screw(r) {
      var g = new THREE.Group(); g.name = 'Screw';
      var head = mesh(lathe([[0, 0], [r, 0], [r, r * .35], [r * .85, r * .55], [0, r * .55]], 20), M.steel); g.add(head);
      var hex = mesh(new THREE.CylinderGeometry(r * .42, r * .42, r * .3, 6), M.vent); hex.position.y = r * .48; g.add(hex);
      return g;
    }

    /* ───────── assembly ───────── */
    var root = new THREE.Group(); root.name = 'ArcopDrone';
    var model = new THREE.Group(); model.name = 'Model_cm'; root.add(model);
    root.scale.setScalar(.01);   // cm -> m

    /* Body: lofted fuselage, flat-ish sides, tapered nose and rounded tail */
    var bodySecs = [];
    var prof = [   // z, half width, half height, y centre, n
      [-11.2, .2, .2, .4, 3], [-11.0, 2.6, 1.6, .5, 3.4], [-10.4, 3.6, 2.4, .5, 3.6], [-9.2, 4.2, 2.9, .5, 3.8], [-6, 4.5, 3.2, .4, 4],
      [-2, 4.6, 3.25, .3, 4], [2, 4.5, 3.2, .2, 4], [5, 4.2, 3.0, 0, 3.8], [7.5, 3.7, 2.6, -.2, 3.5], [9.4, 3.1, 2.2, -.4, 3.2],
      [10.6, 2.4, 1.7, -.5, 3], [11.2, 1.6, 1.1, -.55, 2.8], [11.45, .2, .2, -.55, 2.5]
    ];
    prof.forEach(function (p) { bodySecs.push({ z: p[0], w: p[1], h: p[2], y: p[3], n: p[4] }); });
    var body = mesh(loft(bodySecs, 72), M.graphite, 'Body'); model.add(body);

    // top battery shell, slightly proud of the body with a dark seam underneath
    var batSecs = [];
    [[-10.5, 3.3, .2, 3.05], [-10.2, 3.75, .55, 3.15], [-9, 4.05, .7, 3.2], [-4, 4.2, .75, 3.25], [1, 4.15, .72, 3.2], [3.4, 3.9, .6, 3.15], [4, 3.6, .3, 3.05]]
      .forEach(function (p) { batSecs.push({ z: p[0], w: p[1], h: p[2], y: p[3], n: 5 }); });
    var battery = mesh(loft(batSecs, 64), M.panel, 'Battery'); model.add(battery);
    var seam = mesh(loft(batSecs.map(function (s) { return { z: s.z, w: s.w + .06, h: .08, y: s.y - s.h * .55, n: 5 }; }), 64), M.vent, 'Seam_Battery'); model.add(seam);
    // battery latches + charge LEDs
    [-1, 1].forEach(function (sx) {
      var latch = box(.22, .3, 2.0, M.graphiteDark, 'BatteryLatch'); latch.position.set(sx * 4.12, 3.0, -4); model.add(latch);
      for (var k = 0; k < 3; k++) { var rib = box(.06, .22, .1, M.vent); rib.position.set(sx * 4.24, 3.0, -4.6 + k * .6); model.add(rib); }
    });
    for (var li = 0; li < 4; li++) { var led = cyl(.13, .13, .1, 12, li < 3 ? M.ledGreen : M.graphiteDark, 'BatteryLed'); led.rotation.x = Math.PI / 2; led.position.set(-.9 + li * .6, 3.15, -10.45); model.add(led); }
    var power = cyl(.32, .32, .12, 24, M.graphiteDark, 'PowerButton'); power.rotation.x = Math.PI / 2; power.position.set(1.7, 3.1, -10.48); model.add(power);

    // nose: dark front panel with paired forward obstacle sensors
    var nose = mesh(loft([{ z: 10.25, w: 2.95, h: 1.15, y: .25, n: 4 }, { z: 10.9, w: 2.5, h: .95, y: .2, n: 4 }, { z: 11.15, w: 2.1, h: .75, y: .2, n: 4 }], 48), M.sensor, 'NosePanel'); model.add(nose);
    function sensorEye(name, size) {
      var g = new THREE.Group(); g.name = name;
      var bez = mesh(lathe([[0, 0], [size * 1.25, 0], [size * 1.3, .12], [size * 1.05, .22], [size * .92, .2], [0, .2]], 32), M.graphiteDark); bez.rotation.x = Math.PI / 2; g.add(bez);
      var lens = mesh(new THREE.SphereGeometry(size, 32, 16, 0, Math.PI * 2, 0, Math.PI * .32), M.glass); lens.rotation.x = Math.PI / 2; lens.position.z = .02; lens.scale.set(1, .35, 1); g.add(lens);
      var inner = mesh(new THREE.CircleGeometry(size * .45, 24), M.coating); inner.position.z = .23; g.add(inner);
      return g;
    }
    [-1, 1].forEach(function (sx) { var e = sensorEye('Sensor_Front_' + (sx < 0 ? 'R' : 'L'), .5); e.position.set(sx * 1.55, .45, 11.0); e.rotation.y = sx * .18; model.add(e); });
    [-1, 1].forEach(function (sx) { var e = sensorEye('Sensor_Rear_' + (sx < 0 ? 'R' : 'L'), .38); e.position.set(sx * 1.4, 1.0, -11.0); e.rotation.y = Math.PI - sx * .15; model.add(e); });
    // side sensors
    [-1, 1].forEach(function (sx) { var e = sensorEye('Sensor_Side_' + (sx < 0 ? 'R' : 'L'), .34); e.position.set(sx * 4.62, 1.2, 1.5); e.rotation.y = sx * Math.PI / 2; model.add(e); });

    // side vents: recessed slots with a thin frame
    [-1, 1].forEach(function (sx) {
      var vg = new THREE.Group(); vg.name = 'Vents_' + (sx < 0 ? 'R' : 'L');
      var frame = mesh(loft(capsuleSections(5.2, .55, 1.15, 6, 10, .15), 24), M.graphiteDark); frame.rotation.y = Math.PI / 2; vg.add(frame);
      for (var k = 0; k < 7; k++) { var sl = box(.2, 1.6, .26, M.vent); sl.position.set(sx * .45, 0, -1.9 + k * .63); vg.add(sl); }
      vg.position.set(sx * 4.25, -.6, -3.4); model.add(vg);
    });

    // underside: belly plate, downward sensors, ToF, auxiliary light, screws
    var belly = mesh(loft([{ z: -8.5, w: 3.2, h: .35, y: -2.9, n: 5 }, { z: -6, w: 3.6, h: .45, y: -3.05, n: 5 }, { z: 5, w: 3.5, h: .45, y: -3.05, n: 5 }, { z: 7.2, w: 2.8, h: .35, y: -2.85, n: 5 }], 48), M.graphiteDark, 'BellyPlate'); model.add(belly);
    [-1, 1].forEach(function (sx) { var e = sensorEye('Sensor_Down_' + (sx < 0 ? 'R' : 'L'), .45); e.position.set(sx * 1.5, -3.45, -2.5); e.rotation.x = Math.PI / 2; model.add(e); });
    var tof = box(1.5, .1, .6, M.sensor, 'ToF'); tof.position.set(0, -3.48, -.5); model.add(tof);
    var aux = cyl(.55, .55, .12, 24, M.ledWhite, 'AuxLight'); aux.position.set(0, -3.48, -5.2); model.add(aux);
    var auxRim = mesh(new THREE.TorusGeometry(.6, .08, 8, 24), M.graphiteDark); auxRim.rotation.x = Math.PI / 2; auxRim.position.set(0, -3.48, -5.2); model.add(auxRim);
    var screws = new THREE.Group(); screws.name = 'Screws'; model.add(screws);
    [[-2.8, -6.8], [2.8, -6.8], [-2.8, 4.4], [2.8, 4.4]].forEach(function (p) { var s = screw(.28); s.rotation.x = Math.PI; s.position.set(p[0], -3.45, p[1]); screws.add(s); });

    /* Arms, motors, props, legs */
    var arms = [
      { id: 'FL', side: 1, front: true, root: new V3(3.9, 1.0, 6.2), tip: new V3(15.6, 2.1, 11.8), dir: 1 },
      { id: 'FR', side: -1, front: true, root: new V3(-3.9, 1.0, 6.2), tip: new V3(-15.6, 2.1, 11.8), dir: -1 },
      { id: 'RL', side: 1, front: false, root: new V3(3.8, -1.6, -6.6), tip: new V3(15.0, -.4, -12.6), dir: -1 },
      { id: 'RR', side: -1, front: false, root: new V3(-3.8, -1.6, -6.6), tip: new V3(-15.0, -.4, -12.6), dir: 1 }
    ];
    var parts = { props: [], blades: [], lights: [], gimbal: {} };

    function propBlade(name, tipColour) {
      // airfoil blade: span along +X from r0 to R, chord along Z, twisted
      var r0 = 1.05, R = 11.6, N = 26, A = 14, pos = [], uv = [], idx = [];
      function chord(u) { return u < .12 ? 1.25 + u / .12 * .75 : 2.0 * (1 - Math.pow((u - .12) / .88, 1.6) * .62) * (u > .94 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - .94) / .06, 2))) * .9 + .1 : 1); }
      function thick(u) { return .32 * (1 - u) + .05; }
      function twist(u) { return (24 - 15 * u) * Math.PI / 180; }
      function sweep(u) { return -.55 * u * u; }          // leading edge sweeps back toward the tip
      for (var i = 0; i <= N; i++) {
        var u = i / N, r = r0 + (R - r0) * u, c = Math.max(.08, chord(u)), t = thick(u) * (c / 2), tw = twist(u);
        for (var j = 0; j < A; j++) {
          // closed airfoil: cambered top, flatter bottom; x along chord from LE(0) to TE(1)
          var a = j / A * Math.PI * 2, xc = (1 - Math.cos(a)) / 2, top = a < Math.PI;
          var camber = .045 * c * 4 * xc * (1 - xc), half = t * 2.6 * Math.sqrt(Math.max(0, xc)) * (1 - xc);
          var yy = camber + (top ? half : -half * .45), zz = (.5 - xc) * c + sweep(u) * c;
          var cy = yy * Math.cos(tw) - zz * Math.sin(tw), cz = yy * Math.sin(tw) + zz * Math.cos(tw);
          pos.push(r, cy, cz); uv.push(u, j / A);
        }
      }
      for (i = 0; i < N; i++) for (j = 0; j < A; j++) {
        var a0 = i * A + j, a1 = i * A + (j + 1) % A, b0 = a0 + A, b1 = a1 + A;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
      var tipC = pos.length / 3; pos.push(R + .02, 0, sweep(1) * .2); uv.push(1, .5);
      for (j = 0; j < A; j++) idx.push(N * A + j, tipC, N * A + (j + 1) % A);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      var blade = new THREE.Group(); blade.name = name;          // pivot at the fold screw
      var m = mesh(g, M.carbonProp, name + '_Mesh'); m.position.x = -1.05; blade.add(m);
      // root clamp + tip marking
      var clamp = mesh(loft(capsuleSections(1.6, .55, .32, 4, 10, .3), 24), M.graphiteDark, name + '_Root'); clamp.rotation.y = Math.PI / 2; clamp.position.x = .15; blade.add(clamp);
      var pin = screw(.2); pin.position.set(0, .3, 0); blade.add(pin);
      if (tipColour) {
        var tg = new THREE.BufferGeometry(); var tp = [], ti = [];
        var start = Math.floor(N * .9) * A;
        for (i = start; i < pos.length / 3 - 1; i++) tp.push(pos[i * 3], pos[i * 3 + 1] * 1.04, pos[i * 3 + 2] * 1.01);
        var rows = (pos.length / 3 - 1 - start) / A;
        for (i = 0; i < rows - 1; i++) for (j = 0; j < A; j++) { var c0 = i * A + j, c1 = i * A + (j + 1) % A; ti.push(c0, c0 + A, c1, c1, c0 + A, c1 + A); }
        tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setIndex(ti); tg.computeVertexNormals();
        var tipM = mesh(tg, M.orange, name + '_Tip'); tipM.position.x = -1.05; blade.add(tipM);
      }
      return blade;
    }

    function motorUnit(id, dir) {
      var g = new THREE.Group(); g.name = 'Motor_' + id;
      // pod (arm end housing)
      var pod = mesh(lathe([[0, -1.5], [1.55, -1.5], [1.9, -1.25], [2.0, -.5], [1.98, .15], [1.85, .3], [0, .3]], 48), M.graphite, 'MotorPod_' + id); g.add(pod);
      var podRing = mesh(new THREE.TorusGeometry(2.08, .06, 8, 48), M.vent); podRing.rotation.x = Math.PI / 2; podRing.position.y = -.55; g.add(podRing);
      // stator base (dark alu) with copper windings showing through
      var base = mesh(lathe([[0, .3], [1.75, .3], [1.85, .45], [1.85, .7], [0, .7]], 48), M.aluDark, 'MotorBase_' + id); g.add(base);
      var wind = new THREE.Group(); wind.name = 'Windings_' + id;
      for (var k = 0; k < 12; k++) { var c = mesh(new THREE.TorusGeometry(.28, .13, 8, 12), M.copper); var a = k / 12 * Math.PI * 2; c.position.set(Math.cos(a) * 1.3, 1.25, Math.sin(a) * 1.3); c.rotation.y = -a; wind.add(c); }
      g.add(wind);
      // bell: satin aluminium with vent cut-outs (dark slots + ribs)
      var bell = mesh(lathe([[1.62, .72], [1.78, .74], [1.84, .9], [1.84, 2.3], [1.75, 2.48], [1.2, 2.62], [.55, 2.66], [.55, 2.7]], 64), M.alu, 'MotorBell_' + id); g.add(bell);
      var bellIn = mesh(lathe([[1.6, .9], [1.6, 2.2], [1.15, 2.42], [.5, 2.46]], 48), M.vent); bellIn.material = M.vent; g.add(bellIn);
      for (k = 0; k < 10; k++) {   // window slots on the top shoulder exposing windings
        var a2 = k / 10 * Math.PI * 2, slot = box(.42, .5, .55, M.vent); slot.position.set(Math.cos(a2) * 1.42, 2.45, Math.sin(a2) * 1.42); slot.rotation.y = -a2; slot.rotation.z = .5 * 0; g.add(slot);
        var w2 = mesh(new THREE.TorusGeometry(.2, .1, 6, 10), M.copper); w2.position.set(Math.cos(a2) * 1.42, 2.3, Math.sin(a2) * 1.42); w2.rotation.y = -a2; g.add(w2);
      }
      var band = mesh(new THREE.CylinderGeometry(1.86, 1.86, .1, 64, 1, true), M.aluDark); band.position.y = 1.55; g.add(band);
      // prop: pivot on the motor axis; two folding blades on a hub
      var prop = new THREE.Group(); prop.name = 'Prop_' + id; prop.position.y = 2.7; prop.userData.dir = dir; g.add(prop);
      var hub = mesh(lathe([[0, 0], [1.1, 0], [1.15, .25], [1.0, .55], [.62, .72], [.62, 1.02], [.45, 1.12], [0, 1.12]], 40), M.graphiteDark, 'PropHub_' + id); prop.add(hub);
      var hex = mesh(new THREE.CylinderGeometry(.26, .26, .2, 6), M.vent); hex.position.y = 1.08; prop.add(hex);
      var dot = cyl(.12, .12, .05, 16, dir > 0 ? M.alu : M.orange); dot.position.y = 1.19; prop.add(dot);   // marks CW / CCW props
      ['A', 'B'].forEach(function (s, bi) {
        var b = propBlade('Blade_' + id + '_' + s, true); b.position.set(bi ? -1.05 : 1.05, .45, 0); b.rotation.y = bi ? Math.PI : 0;
        if (dir < 0) b.scale.z = -1;  // mirror the twist for counter-rotating props
        prop.add(b); parts.blades.push(b);
      });
      parts.props.push(prop);
      return g;
    }

    arms.forEach(function (a) {
      var grp = new THREE.Group(); grp.name = 'Arm_' + a.id; model.add(grp);
      var dirV = new V3().subVectors(a.tip, a.root), len = dirV.length();
      // tapered arm, flattened superellipse, slight droop
      var secs = [];
      for (var i = 0; i <= 12; i++) {
        var u = i / 12, w = 1.25 - .4 * u, h = .95 - .25 * u;
        if (u < .08) { w *= .8 + u / .08 * .2; h *= .8 + u / .08 * .2; }
        secs.push({ z: u * len, w: w, h: h, y: -Math.sin(u * Math.PI) * .35, n: 3.4 });
      }
      var armMesh = mesh(loft(secs, 40), a.front ? M.graphite : M.graphite, 'ArmBeam_' + a.id);
      var holder = new THREE.Object3D(); orientBetween(holder, a.root, a.tip); holder.add(armMesh); grp.add(holder);
      // carbon insert strip on the top of each arm
      var strip = mesh(loft(secs.slice(2, 11).map(function (s) { return { z: s.z, w: s.w * .62, h: .12, y: s.y + s.h * .93, n: 4 }; }), 24), M.carbon, 'ArmCarbon_' + a.id); holder.add(strip);
      // fold hinge at the body with screws
      var hinge = cyl(1.05, 1.05, 2.0, 32, M.graphiteDark, 'Hinge_' + a.id); hinge.position.copy(a.root); grp.add(hinge);
      var hcap = cyl(.75, .75, .12, 24, M.aluDark); hcap.position.set(a.root.x, a.root.y + 1.03, a.root.z); grp.add(hcap);
      var hs = screw(.32); hs.position.set(a.root.x, a.root.y + 1.08, a.root.z); grp.add(hs);
      var hs2 = screw(.28); hs2.rotation.x = Math.PI; hs2.position.set(a.root.x, a.root.y - 1.03, a.root.z); grp.add(hs2);
      // motor at the tip
      var mot = motorUnit(a.id, a.dir); mot.position.copy(a.tip); mot.position.y += .25; grp.add(mot);
      // leg below the pod: tall tapered legs on the front arms, short fins on the rear
      var legH = a.front ? 5.6 : 3.4, leg = new THREE.Group(); leg.name = 'Leg_' + a.id;
      var lsecs = [];
      for (i = 0; i <= 10; i++) { var u2 = i / 10; lsecs.push({ z: -u2 * legH, w: (a.front ? .62 : .5) * (1 - u2 * .45), h: (a.front ? 1.25 : 1.6) * (1 - u2 * .35), x: 0, y: u2 * u2 * (a.front ? 1.4 : -1.2), n: 3.2 }); }
      var lm = mesh(loft(lsecs, 32), M.graphite, 'LegMesh_' + a.id); lm.rotation.x = -Math.PI / 2; lm.rotation.z = a.side * .06; leg.add(lm);
      var foot = mesh(new THREE.SphereGeometry(.42, 20, 12), M.rubber, 'Foot_' + a.id); foot.position.set(0, -legH + .05, a.front ? -1.4 : 1.2); foot.scale.set(1, .7, 1.6); leg.add(foot);
      leg.position.set(a.tip.x, a.tip.y - 1.55, a.tip.z); grp.add(leg);
      // navigation light under the pod
      var lmat = a.front ? (a.side > 0 ? M.ledGreen : M.ledRed) : M.ledWhite;
      var light = mesh(new THREE.SphereGeometry(.28, 16, 10), lmat, 'Light_' + a.id); light.scale.y = .5;
      light.position.set(a.tip.x, a.tip.y - 1.45, a.tip.z + (a.front ? 1.6 : -1.6)); grp.add(light); parts.lights.push(light);
      var lens = mesh(new THREE.SphereGeometry(.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ name: 'LightLens', color: 0xffffff, transparent: true, opacity: .25, roughness: .1 })); lens.rotation.x = Math.PI; lens.position.copy(light.position); grp.add(lens);
    });

    /* Gimbal: yaw (vertical) -> roll (fore-aft) -> pitch (lateral) -> camera */
    var gy = new THREE.Group(); gy.name = 'Gimbal_Yaw'; gy.position.set(0, -2.6, 8.4); model.add(gy);
    var dampers = new THREE.Group(); dampers.name = 'Gimbal_Dampers'; gy.add(dampers);
    var plate = mesh(loft(capsuleSections(3.2, 1.9, .3, 5, 10, .2), 32), M.graphiteDark, 'GimbalPlate'); plate.position.y = -.1; gy.add(plate);
    [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]].forEach(function (p) { var d = mesh(new THREE.SphereGeometry(.18, 16, 12), M.rubber, 'Damper'); d.position.set(p[0], .2, p[1]); dampers.add(d); });
    var yawMotor = mesh(lathe([[0, 0], [1.05, 0], [1.1, -.15], [1.1, -1.0], [.95, -1.15], [0, -1.15]], 40), M.alu, 'Gimbal_YawMotor'); yawMotor.position.y = -.3; gy.add(yawMotor);
    var yawLine = mesh(new THREE.TorusGeometry(1.1, .035, 6, 40), M.vent); yawLine.rotation.x = Math.PI / 2; yawLine.position.y = -.85; gy.add(yawLine);
    function beam(a, b, w, h, mat, name) {     // rounded bar between two points (in the parent's space)
      var len = a.distanceTo(b), o = new THREE.Object3D(); orientBetween(o, a, b);
      o.add(mesh(loft([{ z: 0, w: w, h: h, n: 4 }, { z: len, w: w, h: h, n: 4 }], 16), mat, name)); return o;
    }
    // roll stage: motor sits behind the camera, axis along Z; linked down from the yaw motor
    gy.add(beam(new V3(0, -1.3, -.2), new V3(0, -2.9, -2.05), .32, .26, M.alu, 'Gimbal_YawLink'));
    var gr = new THREE.Group(); gr.name = 'Gimbal_Roll'; gr.position.set(0, -3.05, -2.2); gy.add(gr);
    var rollMotor = mesh(lathe([[0, 0], [.85, 0], [.9, .12], [.9, .55], [.75, .65], [0, .65]], 32), M.alu, 'Gimbal_RollMotor'); rollMotor.rotation.x = Math.PI / 2; rollMotor.position.z = -.35; gr.add(rollMotor);
    var rollCap = screw(.22); rollCap.rotation.x = -Math.PI / 2; rollCap.position.z = -.42; gr.add(rollCap);
    // bracket: from the roll motor out to the left side, then forward to the pitch motor
    gr.add(beam(new V3(0, 0, .2), new V3(-2.25, 0, .2), .3, .42, M.alu, 'Gimbal_RollArm'));
    gr.add(beam(new V3(-2.25, 0, .05), new V3(-2.25, 0, 2.2), .22, .42, M.alu, 'Gimbal_RollArm2'));
    var gp = new THREE.Group(); gp.name = 'Gimbal_Pitch'; gp.position.set(0, 0, 2.2); gr.add(gp);
    var pitchMotor = mesh(lathe([[0, 0], [.85, 0], [.9, .12], [.9, .42], [.75, .5], [0, .5]], 36), M.alu, 'Gimbal_PitchMotor'); pitchMotor.rotation.z = Math.PI / 2; pitchMotor.position.x = -1.82; gp.add(pitchMotor);
    var pitchScrew = screw(.2); pitchScrew.rotation.z = Math.PI / 2; pitchScrew.position.x = -2.38; gp.add(pitchScrew);
    var pivotCap = cyl(.55, .55, .22, 24, M.aluDark); pivotCap.rotation.z = Math.PI / 2; pivotCap.position.x = 1.92; gp.add(pivotCap);

    // camera head: rounded housing, big main lens with stepped rings + two smaller lenses
    var cam = new THREE.Group(); cam.name = 'Camera'; gp.add(cam);
    var housing = mesh(loft([
      { z: -1.7, w: 1.0, h: 1.0, n: 3 }, { z: -1.5, w: 1.55, h: 1.5, n: 3.6 }, { z: -1.0, w: 1.8, h: 1.72, n: 4 },
      { z: .6, w: 1.85, h: 1.78, n: 4.2 }, { z: 1.3, w: 1.8, h: 1.72, n: 4 }, { z: 1.62, w: 1.62, h: 1.55, n: 3.8 }, { z: 1.75, w: 1.2, h: 1.1, n: 3 }
    ], 56), M.graphiteDark, 'CameraHousing'); cam.add(housing);
    function mainLens(r) {
      var L = new THREE.Group(); L.name = 'MainLens';
      // barrel steps, aluminium bezel, gold ring, black inner rings with grooves, glass dome, coated element
      var bez = mesh(lathe([[r * .98, -.2], [r * 1.12, -.2], [r * 1.12, .25], [r * 1.06, .32], [r * 1.06, .55], [r * 1.0, .62], [r * .97, .62]], 48), M.alu, 'LensBezel'); bez.rotation.x = Math.PI / 2; L.add(bez);
      var goldR = mesh(new THREE.TorusGeometry(r * 1.07, .045, 8, 48), M.gold, 'LensGoldRing'); goldR.position.z = .18; L.add(goldR);
      var face = mesh(new THREE.RingGeometry(r * .76, r * 1.0, 48), M.graphiteDark); face.position.z = .6; L.add(face);
      for (var k = 0; k < 6; k++) { var gro = mesh(new THREE.TorusGeometry(r * (.74 - k * .07), .018, 6, 48), k % 2 ? M.aluDark : M.vent); gro.position.z = .56 - k * .05; L.add(gro); }
      var well = mesh(new THREE.CylinderGeometry(r * .36, r * .74, .3, 48, 1, true), M.vent); well.rotation.x = Math.PI / 2; well.position.z = .42; L.add(well);
      var glass = mesh(new THREE.SphereGeometry(r * .4, 32, 16, 0, Math.PI * 2, 0, Math.PI * .4), M.glass, 'LensFrontGlass'); glass.rotation.x = Math.PI / 2; glass.scale.y = .45; glass.position.z = .22; L.add(glass);
      var el = mesh(new THREE.SphereGeometry(r * .24, 24, 12, 0, Math.PI * 2, 0, Math.PI * .45), M.coating, 'LensElement'); el.rotation.x = Math.PI / 2; el.scale.y = .4; el.position.z = .2; L.add(el);
      var glint = mesh(new THREE.CircleGeometry(r * .07, 16), M.ledWhite); glint.position.set(-r * .12, r * .14, .4); L.add(glint);
      L.rotation.y = 0; return L;
    }
    var lens1 = mainLens(1.0); lens1.position.set(-.25, .1, 1.5); cam.add(lens1);
    var tele = new THREE.Group(); tele.name = 'TeleLens';
    var tb = mesh(lathe([[.3, -.1], [.42, -.1], [.42, .2], [.36, .26], [.3, .26]], 32), M.alu); tb.rotation.x = Math.PI / 2; tele.add(tb);
    var tg2 = mesh(new THREE.CircleGeometry(.34, 32), M.glass); tg2.position.z = .24; tele.add(tg2);
    var tc = mesh(new THREE.CircleGeometry(.16, 24), M.coating); tc.position.z = .25; tele.add(tc);
    tele.position.set(1.08, .78, 1.6); cam.add(tele);
    var tof2 = mesh(new THREE.CircleGeometry(.22, 24), M.sensor, 'CameraToF'); tof2.position.set(1.08, -.6, 1.76); cam.add(tof2);
    var camLed = mesh(new THREE.CircleGeometry(.06, 12), M.ledRed); camLed.position.set(1.25, -.1, 1.76); cam.add(camLed);
    parts.gimbal = { yaw: gy, roll: gr, pitch: gp, camera: cam };

    // antennas folded along the rear legs + rear status light
    var rearLight = mesh(new THREE.BoxGeometry(2.2, .18, .1), M.ledGreen, 'Light_Status'); rearLight.position.set(0, -.6, -11.25); model.add(rearLight); parts.lights.push(rearLight);

    // quality: smooth shading everywhere, names on every mesh
    root.traverse(function (o) { if (o.isMesh && !o.name) o.name = (o.parent && o.parent.name ? o.parent.name + '_part' : 'Part'); });
    root.userData = { units: 'metres', forward: '+Z', up: '+Y', builder: 'arcop-drone-model.js' };
    return { root: root, parts: parts, materials: M };
  }
  global.buildArcopDrone = build;
})(typeof window !== 'undefined' ? window : this);

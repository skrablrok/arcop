(() => {
  document.documentElement.classList.remove('no-js');
  const $ =(s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Mobile menu ---------- */
  const burger = $('#burger');
  const nav = $('#mainNav');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Zapri meni' : 'Odpri meni');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); } });

  /* ---------- Active nav link on scroll ---------- */
  const links = $$('.main-nav a:not(.btn)');
  // the section whose top has passed 40% of the viewport is "current"; above all of them → Domov
  const targets = links.slice(1).map(a => [a, $(a.getAttribute('href'))]).filter(([, el]) => el);
  let spyTick = false;
  const spy = () => {
    spyTick = false;
    const line = innerHeight * 0.4;
    let current = links[0], best = -Infinity;
    targets.forEach(([a, el]) => {
      const top = el.getBoundingClientRect().top;
      if (top <= line && top > best) { best = top; current = a; }
    });
    // "O nas" lives inside the contact section, so the two links light up together
    const pair = ['#o-nas', '#kontakt'];
    const curHref = current.getAttribute('href');
    links.forEach(a => a.classList.toggle('active', a === current || (pair.includes(curHref) && pair.includes(a.getAttribute('href')))));
  };
  addEventListener('scroll', () => { if (!spyTick) { spyTick = true; requestAnimationFrame(spy); } }, { passive: true });
  spy();

  /* ---------- Reveal on scroll ---------- */
  const rev = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); rev.unobserve(en.target); }
    });
  }, { threshold: .12 });
  $$('.reveal').forEach((el, i) => {
    el.style.transitionDelay = (i % 6) * 60 + 'ms';
    rev.observe(el);
  });

  /* ---------- Before / after sliders ---------- */
  $$('.ba').forEach(ba => {
    const r = $('input', ba);
    const set = () => ba.style.setProperty('--pos', r.value + '%');
    r.addEventListener('input', set);
    set();
  });

  /* ---------- Contact form (validates, then opens e-mail client) ---------- */
  const form = $('#povprasevanje');
  const note = $('#formNote');
  const rules = {
    name: v => v.trim().length >= 2 || 'Vpišite ime in priimek.',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Vpišite e-pošto v obliki ime@domena.si.',
    message: v => v.trim().length >= 5 || 'Na kratko opišite objekt in želeno storitev.'
  };
  const check = (input) => {
    const rule = rules[input.name];
    if (!rule) return true;
    const res = rule(input.value);
    const field = input.closest('.field');
    const err = $('.err', field);
    const ok = res === true;
    field.classList.toggle('invalid', !ok);
    err.textContent = ok ? '' : res;
    input.setAttribute('aria-invalid', String(!ok));
    return ok;
  };
  Object.keys(rules).forEach(n => {
    const el = form.elements[n];
    el.addEventListener('blur', () => { if (el.value) check(el); });
    el.addEventListener('input', () => { if (el.closest('.field').classList.contains('invalid')) check(el); });
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = Object.keys(rules).map(n => form.elements[n]);
    const results = inputs.map(check);
    const firstBad = inputs[results.indexOf(false)];
    if (firstBad) { firstBad.focus(); return; }
    const f = form.elements;
    const body = `Ime: ${f.name.value}\nE-pošta: ${f.email.value}\nTelefon: ${f.phone.value || '-'}\nStoritev: ${f.service.value}\n\n${f.message.value}`;
    window.location.href = `mailto:info@dronecleaningsolutions.si?subject=${encodeURIComponent('Povpraševanje: ' + f.service.value)}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Hvala! Odpiramo vaš e-poštni program.';
  });

  /* ---------- 3D drone (model-viewer) ---------- */
  const mv = $('#heroDrone');
  if (mv) {
    mv.addEventListener('load', () => mv.classList.add('loaded'));
    // drone always moves while visible; pause only off-screen to save battery/CPU
    new IntersectionObserver(([en]) => {
      if (!mv.play) return;
      en.isIntersecting ? mv.play() : mv.pause();
    }).observe(mv);
  }

  /* ---------- Scroll effects ---------- */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const header = $('.site-header');
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.prepend(bar);

  const hero = $('.hero'), heroCopy = $('.hero-copy'), facade = $('.facade'), heroDroneWrap = $('.hero-drone');
  let ticking = false, lastPhi = null, heroWasVisible = true;

  const onScroll = () => {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    header.classList.toggle('scrolled', y > 20);
    const max = document.documentElement.scrollHeight - vh;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (reduceMotion) return;

    // hero parallax – only computed while the hero is on screen
    const p = clamp(y / hero.offsetHeight);
    if (p < 1 || heroWasVisible) {
      heroWasVisible = p < 1;
      facade.style.transform = `translate3d(0, ${y * 0.35}px, 0) scale(1.08)`;
      heroCopy.style.transform = `translate3d(0, ${y * 0.12}px, 0)`;
      heroCopy.style.opacity = String(clamp(1 - p * 1.9));
      heroDroneWrap.style.transform = `translate3d(${p * -40}px, ${y * -0.1}px, 0) scale(${1 + p * 0.12})`;
      if (mv) {
        const phi = Math.round(72 - p * 24); // tilt camera to look down on the drone
        if (phi !== lastPhi) { mv.cameraOrbit = `35deg ${phi}deg 80%`; lastPhi = phi; }
      }
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Scroll text: words light up, title colours fill in ---------- */
  if (!reduceMotion) {
    // split text nodes into word spans, keeping inner elements (<b>, .yellow) so lit words take their colour
    const splitWords = (el) => {
      const words = [];
      const walk = (node) => {
        [...node.childNodes].forEach(n => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach(part => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              const s = document.createElement('span');
              s.className = 'w'; s.textContent = part;
              frag.appendChild(s); words.push(s);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1) walk(n);
        });
      };
      walk(el);
      return words;
    };
    const wordBlocks = $$('[data-scroll-words]').map(el => ({ el, words: splitWords(el), lit: -1 }));
    const fills = $$('.section-title .blue, .section-title .yellow, .equipment h2 .yellow').map(el => { el.classList.add('fill-text'); return el; });

    let textTick = false;
    const onTextScroll = () => {
      textTick = false;
      const vh = innerHeight;
      wordBlocks.forEach(b => {
        const r = b.el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        // starts when the block enters the lower part of the screen, done by the time it reaches ~35% from top
        const p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.5));
        const lit = Math.round(p * b.words.length);
        if (lit === b.lit) return;
        b.words.forEach((w, i) => w.classList.toggle('on', i < lit));
        b.lit = lit;
      });
      fills.forEach(el => {
        const r = el.getBoundingClientRect();
        const p = clamp((vh * 0.92 - r.top) / (vh * 0.4));
        el.style.setProperty('--fill', (p * 100).toFixed(1) + '%');
      });
    };
    addEventListener('scroll', () => { if (!textTick) { textTick = true; requestAnimationFrame(onTextScroll); } }, { passive: true });
    addEventListener('resize', onTextScroll);
    onTextScroll();
  }

  /* ---------- Before/after: one demo sweep when it enters view ---------- */
  if (!reduceMotion) {
    const sweepObs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        sweepObs.unobserve(en.target);
        const ba = en.target, r = $('input', ba);
        const delay = $$('.ba').indexOf(ba) % 4 * 220 + 400;
        let stopped = false;
        ba.addEventListener('pointerdown', () => { stopped = true; }, { once: true });
        r.addEventListener('keydown', () => { stopped = true; }, { once: true });
        setTimeout(() => {
          const t0 = performance.now(), dur = 1800;
          const step = t => {
            if (stopped) return;
            const k = clamp((t - t0) / dur);
            const v = 50 + Math.sin(k * Math.PI * 2) * 32 * (1 - k);
            r.value = v;
            ba.style.setProperty('--pos', v + '%');
            if (k < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }, delay);
      });
    }, { threshold: .6 });
    $$('.ba').forEach(ba => sweepObs.observe(ba));
  }

  /* ---------- Year ---------- */
  $('#year').textContent = new Date().getFullYear();
})();

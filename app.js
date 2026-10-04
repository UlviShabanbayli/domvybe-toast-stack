// Toasts — short messages that arrive in a corner of the screen and stack like a deck (the newest in front, the older
// ones peeking behind). Point at the deck, tap it or tab into it and it fans out into a list; swipe a toast away (it
// flies if you throw it, and springs back if you don't), or let its time run out. Each one says where it is from, what
// happened and what you can do next: a message with Reply, a payment whose amount counts up, an upload or a deploy that
// fills and turns into done, an invite to accept, an undo whose ring counts down, an error that shakes and offers Retry.
// While you read the deck, every countdown waits. Three looks move differently: Frost banners drop from the top and
// settle softly, Mono slides in quick and exact, Ivory fades in slowly.
// Real component: a labelled region (Alt+T moves into it), each toast a list item that is announced (errors at once,
// the rest politely; in progress is announced when it is done), focusable, dismissed with Escape or its × button, its
// actions real buttons, and prefers-reduced-motion (no flinging, short fades).
//
// The six stages of the tutorial:
//   1. the frame and the springs                              4. the kinds: done, in progress, undo, error
//   2. a toast: where it is from, its picture, its words      5. swiping, the timers, the keyboard
//   3. the deck: stacking, fanning out, arriving and leaving  6. what raises them in each look, and the loop

// ================================================================================================================
// STAGE 1 · the frame and the springs
// ================================================================================================================
const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const look = html.dataset.look;

// fit the 432 × 768 composition to the screen (?full=1: no frame, the page is the screen)
function fit() { html.style.setProperty('--k', 'full' in html.dataset ? '1' : Math.min(innerWidth / 432, innerHeight / 768).toFixed(4)); }
fit();
addEventListener('resize', fit);
$('meta[name="theme-color"]').content = getComputedStyle(html).getPropertyValue('--page').trim();

// the studio clock: ambient life reads time from here, so a capture tool can pause or drive it
const studio = (window.__studio = window.__studio || {});
if (!studio.now) studio.now = () => performance.now();

// With reduced motion every spring is critically damped: things still arrive, they just don't bounce.
const spring = (stiffness, damping) => ({ stiffness, damping: calm ? 2 * Math.sqrt(stiffness) : damping });
const critical = (stiffness) => ({ stiffness, damping: 2 * Math.sqrt(stiffness) });

// rendering helpers: write a style only when it changed; promote a layer only while it moves
const cache = new WeakMap(), promoted = new WeakMap();
function put(el, prop, v) {
  let c = cache.get(el);
  if (!c) cache.set(el, (c = {}));
  if (c[prop] !== v) { c[prop] = v; el.style[prop] = v; }
}
function promote(el, on) { if (promoted.get(el) !== on) { promoted.set(el, on); el.style.willChange = on ? 'transform, opacity' : ''; } }
const px = (v) => `${v.toFixed(2)}px`;

let clock = 0;
const queue = [];
const later = (s, fn) => { queue.push({ at: clock + s, fn }); wake(); };   // it wakes the loop: nothing else may be moving

// how each look moves. from: how far beyond its edge a toast starts (px); grow: the scale it starts at; move, fade:
// its springs; tilt: degrees per px of a swipe. Frost drops in softly, Mono slides in exact, Ivory fades in slowly.
const FEEL = {
  frost: { from: 46, grow: 0.94, move: spring(210, 20), fade: critical(140), tilt: 0.03 },
  mono: { from: 14, grow: 0.98, move: critical(520), fade: critical(420), tilt: 0.02 },
  ivory: { from: 12, grow: 1, move: critical(110), fade: critical(60), tilt: 0.012 },
}[look];

// ================================================================================================================
// STAGE 2 · a toast: where it is from, its picture, its words
// ================================================================================================================
const region = $('.toasts'), deck = $('.deck'), template = $('#toast');
const toasts = [];                                                 // newest first
const anchor = getComputedStyle(region).getPropertyValue('--anchor').trim();   // the deck hangs from the top, or stands on the bottom
const away = anchor === 'top' ? 1 : -1;                            // the direction a y offset moves on screen

// toast(spec) — spec: { kind: 'info' | 'done' | 'busy' | 'undo' | 'error', app: { name, icon, tint, dot }, when,
// face: { initials, hue }, thing (an SVG path, 40 × 40), title, desc, code, count: { format(k) }, actions: [{ label, run }],
// duration (s; 0 waits), and for in progress: speed, logs (what it says on the way), status(pct), then (what it becomes) }
function toast(spec) {
  const el = template.content.firstElementChild.cloneNode(true);
  const t = {
    el, body: $('.body', el), fill: $('.fill', el), timer: $('.timer', el), ring: $('.ring', el), tick: $('.i-done', el),
    appPath: $('.app-icon path', el), appName: $('.app-name', el), when: $('.when', el),
    face: $('.face', el), thing: $('.thing path', el), title: $('.t-title', el), desc: $('.t-desc', el), code: $('.t-code', el),
    buttons: $$('.t-action', el), close: $('.t-close', el),
    state: 'in', height: 64, left: 0, duration: 0, progress: 0,
    y: new Spring(-FEEL.from, FEEL.move), sc: new Spring(FEEL.grow, spring(260, 24)), op: new Spring(0, FEEL.fade),
    h: new Spring(64, spring(300, 26)), x: new Spring(0, spring(380, 26)), shake: new Spring(0, spring(900, 14)),
    show: new Spring(1, spring(260, 26)), draw: new Spring(0, critical(90)), fillS: new Spring(0, spring(120, 20)), counter: new Spring(0, critical(30)),
  };
  deck.prepend(el);
  set(t, spec);
  t.h.value = t.height;
  t.op.target = 1;
  toasts.unshift(t);
  while (toasts.filter((o) => o.state === 'in').length > 5) dismiss(toasts.filter((o) => o.state === 'in').pop());
  layout();
  t.close.addEventListener('click', () => dismiss(t));
  t.buttons.forEach((b, i) => b.addEventListener('click', () => t.actions[i]?.run(t)));
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(t); } });
  grab(t);
  wake();
  return t;
}
// what a toast says and does: used to make one, and to turn it into another (in progress → done, undo → done, …)
function set(t, spec) {
  const { kind, app, when = 'now', face, thing, title, desc = '', code = '', count, actions = [], duration = 5 } = spec;
  const was = t.kind;
  Object.assign(t, { kind, actions, duration, left: duration, count, then: spec.then, logs: spec.logs, status: spec.status, speed: spec.speed || 0.45 });
  t.el.dataset.kind = kind;
  t.el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.el.setAttribute('aria-busy', String(kind === 'busy'));
  t.el.tabIndex = 0;
  t.el.toggleAttribute('data-app', !!app);                        // where it is from: an app icon and name, or the small print
  if (app) {
    t.appName.textContent = app.name; t.when.textContent = when;
    if (app.icon) t.appPath.setAttribute('d', app.icon);
    t.el.style.setProperty('--icon', app.tint || '');
    t.el.style.setProperty('--dot', app.dot || '');
  }
  if (face) t.el.dataset.pic = 'face'; else if (thing) t.el.dataset.pic = 'thing'; else delete t.el.dataset.pic;   // a face, a thing, or the status icon
  if (face) { t.face.textContent = face.initials; t.el.style.setProperty('--hue', face.hue); }
  if (thing) t.thing.setAttribute('d', thing);
  t.title.textContent = title;
  t.desc.textContent = count ? count.format(0) : desc;
  t.code.textContent = code;
  t.buttons.forEach((b, i) => { b.textContent = actions[i]?.label || ''; });
  t.el.toggleAttribute('data-actions', actions.length > 0);
  if (count) { t.counter.value = 0; t.counter.target = 1; t.counted = -1; }
  t.height = t.body.offsetHeight;                                  // the card reshapes to fit the new words
  if (kind === 'done') { t.draw.value = 0; t.draw.target = 1; if (was && !calm) t.sc.velocity += 0.9; }
  else t.draw.target = 0;
  if (kind === 'error' && !calm) t.shake.velocity += 320;
  if (kind === 'busy') { t.progress = 0; t.fillS.value = 0; t.log = -1; t.pct = -1; }
  layout();
  wake();
}
// a toast leaves: thrown (it flies off the way it was thrown) or let go (it goes back the way it came, and fades)
function dismiss(t, thrown = 0) {
  if (!t || t.state !== 'in') return;
  t.state = 'out';
  t.el.removeAttribute('role');
  t.el.inert = true;
  if (thrown) { t.x.target = thrown * (t.el.offsetWidth + 80); t.x.set(spring(140, 18)); }
  else { t.y.target = -FEEL.from * 0.7; t.sc.target = FEEL.grow; }
  t.op.target = 0;
  if (document.activeElement === t.el || t.el.contains(document.activeElement)) (toasts.find((o) => o.state === 'in')?.el || region).focus();   // the focus stays in the deck
  layout();
  wake();
}

// ================================================================================================================
// STAGE 3 · the deck: stacking, fanning out, arriving and leaving
// ================================================================================================================
const PEEK = 12, GAP = 10, SHOWN = 3;                              // how far an older toast peeks out; the gap when open
let open = false;
function layout() {
  const live = toasts.filter((t) => t.state === 'in');
  let top = 0;
  live.forEach((t, i) => {
    if (open) {                                                    // the list: each at its own height, the newest nearest the edge
      t.y.target = top; t.sc.target = 1; t.h.target = t.height; t.show.target = 1;
      top += t.height + GAP;
    } else {                                                       // the deck: the older ones behind, smaller, only their edge shows
      t.y.target = Math.min(i, SHOWN - 1) * PEEK; t.sc.target = 1 - Math.min(i, SHOWN) * 0.05;
      t.h.target = live[0].height; t.show.target = i === 0 ? 1 : 0;
    }
    t.op.target = i < (open ? 5 : SHOWN) ? 1 : 0;
    t.el.style.zIndex = String(100 - i);
    t.el.querySelectorAll('button').forEach((b) => { b.tabIndex = open || i === 0 ? 0 : -1; });
  });
  const h = !live.length ? 0 : open ? top - GAP : live[0].height + Math.min(live.length - 1, SHOWN - 1) * PEEK;
  region.style.setProperty('--deck-h', px(h));
}
function setOpen(next) { if (open !== next) { open = next; layout(); wake(); } }
// pointing at the deck opens it, leaving closes it (a beat later); a tap opens it on a touch screen; so does focus
region.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setOpen(true); });
region.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') later(0.2, () => { if (!region.matches(':hover') && !region.contains(document.activeElement)) setOpen(false); }); });
region.addEventListener('focusin', () => setOpen(true));
region.addEventListener('focusout', () => setTimeout(() => { if (!region.contains(document.activeElement) && !region.matches(':hover')) setOpen(false); }, 0));
addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !region.contains(e.target)) setOpen(false); });

// ================================================================================================================
// STAGE 4 · the kinds: done, in progress, undo, error
// ================================================================================================================
// in progress fills; its words count (or a log says what it is doing); at the top it turns into what comes next
function progress(t, dt) {
  if (t.kind !== 'busy' || t.state !== 'in') return;
  t.progress = Math.min(1, t.progress + dt * t.speed * (1.15 - t.progress * 0.6));   // quick at first, then easing
  t.fillS.target = t.progress;
  if (t.logs) {
    const i = Math.min(t.logs.length - 1, Math.floor(t.progress * t.logs.length));
    if (t.log !== i) { t.log = i; t.code.textContent = t.logs[i]; }
  } else {
    const pct = Math.floor(t.progress * 100);
    if (t.pct !== pct) { t.pct = pct; t.desc.textContent = t.status ? t.status(pct) : `${pct}%`; }
  }
  if (t.progress >= 1) set(t, t.then);
}
// a count: the amount rolls up from nothing as the toast arrives, and lands on the exact figure
function counting(t) {
  if (!t.count || t.counted === t.counter.value) return;
  t.counted = t.counter.value;
  t.desc.textContent = t.count.format(t.counter.resting(0.002) ? 1 : t.counter.value);
}

// ================================================================================================================
// STAGE 5 · swiping, the timers, the keyboard
// ================================================================================================================
// swipe: the toast follows the finger; thrown far or fast enough it flies off, otherwise it springs back
function grab(t) {
  let start = null, last = null, moved = false;
  t.el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || t.state !== 'in') return;
    e.preventDefault();                                  // a drag, not a text selection
    start = { x: e.clientX }; last = [{ x: e.clientX, at: e.timeStamp }]; moved = false;
    t.el.setPointerCapture(e.pointerId);
  });
  t.el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const k = region.getBoundingClientRect().width / region.offsetWidth, dx = (e.clientX - start.x) / k;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true;
    t.x.value = t.x.target = dx; t.x.velocity = 0;
    last.push({ x: e.clientX, at: e.timeStamp }); if (last.length > 6) last.shift();
    wake();
  });
  const end = (e) => {
    if (!start) return;
    const k = region.getBoundingClientRect().width / region.offsetWidth, dx = (e.clientX - start.x) / k;
    const a = last[0], v = (e.clientX - a.x) / k / Math.max(1, e.timeStamp - a.at);   // px per ms
    start = null;
    if (!moved) { if (e.pointerType !== 'mouse' && !open) setOpen(true); return; }   // a tap: open the deck
    if (Math.abs(dx) > 90 || Math.abs(v) > 0.5) dismiss(t, Math.sign(dx || v));
    else { t.x.target = 0; t.x.velocity = v * 1000; }
    wake();
  };
  t.el.addEventListener('pointerup', end);
  t.el.addEventListener('pointercancel', end);
}
// every countdown waits while you read the deck (it is open, or something in it has the focus) or the page is hidden
const paused = () => open || document.hidden;
function count(dt) {
  if (paused()) return;
  for (const t of toasts) if (t.state === 'in' && t.duration && t.kind !== 'busy') {
    t.left -= dt;
    if (t.left <= 0) dismiss(t);
  }
}
// Alt+T moves the focus into the toasts (and so opens the deck); Escape there closes the one in focus
addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyT') { e.preventDefault(); (toasts.find((t) => t.state === 'in')?.el || region).focus(); }
});

// ================================================================================================================
// STAGE 6 · what raises them in each look, and the loop
// ================================================================================================================
const done = (t) => dismiss(t);                                   // an action that simply closes the toast
const money = (prefix, to, suffix = '') => (k) => `${prefix}${(to * k).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
// icons drawn for this page (24 × 24 strokes), and things drawn in line (40 × 40)
const ICON = {
  chat: 'M5 6.5h14v9H10l-4 3v-3H5z', card: 'M4 7h16v10H4zM4 10.5h16M7 14h4', photo: 'M4 6h16v12H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15 9.5h.1',
  cal: 'M5 6h14v13H5zM5 10h14M9 4v3M15 4v3', rocket: 'M12 3c3 2 4.5 5 4.5 9l-2 3h-5l-2-3c0-4 1.5-7 4.5-9zM9.5 15l-2 4M14.5 15l2 4M12 9h.1',
  copy: 'M8 8h11v11H8zM5 16V5h11', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0', bug: 'M8 9h8v6a4 4 0 0 1-8 0zM12 9V5M4 13h4M16 13h4M5 7l3 2M19 7l-3 2',
  pay: 'M4 7h16v10H4zM14 12h.1M4 10h16', bag: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0', box: 'M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8', stop: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM6.5 6.5l11 11',
};
const THING = {
  watch: 'M15 6h10l1 6H14zM14 28h12l-1 6H15zM20 12a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM20 15v5l3 2M28.5 19h1.5',
  parcel: 'M8 13l12-6 12 6-12 6zM8 13v14l12 6 12-6V13M20 19v14M14 10l12 6',
  calendar: 'M8 10h24v22H8zM8 16h24M14 7v5M26 7v5M13 22h6v5h-6z',
};
const APP = {
  messages: { name: 'Messages', icon: ICON.chat, tint: 'linear-gradient(180deg, #64E07F, #2DBE4E)' },
  wallet: { name: 'Wallet', icon: ICON.card, tint: 'linear-gradient(180deg, #3A3A3C, #0B0B0F)' },
  photos: { name: 'Photos', icon: ICON.photo, tint: 'linear-gradient(180deg, #FFB547, #FF5E8A)' },
  calendar: { name: 'Calendar', icon: ICON.cal, tint: 'linear-gradient(180deg, #FF6B5E, #E5372C)' },
};
const repo = (name, dot) => ({ name, dot: `var(--mo-${dot})` });
// each look's four buttons: [label, small print, icon, what it raises]
const SCRIPTS = {
  frost: {
    a: ['Message', 'from Aysel', ICON.chat, () => toast({ kind: 'info', app: APP.messages, face: { initials: 'AK', hue: 300 }, title: 'Aysel Karimova', desc: 'Can you look at the deck before 4?', duration: 6,
      actions: [{ label: 'Reply', run: (t) => set(t, { kind: 'done', app: APP.messages, title: 'Reply sent', desc: 'On it — give me 15 minutes.', duration: 3 }) }, { label: 'Mark as read', run: done }] })],
    b: ['Payment', 'Wallet', ICON.card, () => toast({ kind: 'done', app: APP.wallet, title: 'Payment received', count: { format: money('+$', 1240, ' from Northpine') }, duration: 5 })],
    c: ['Upload', '12 photos', ICON.photo, () => toast({ kind: 'busy', app: APP.photos, title: 'Uploading 12 photos', desc: '0 of 12', duration: 0, speed: 0.5, status: (p) => `${Math.round(p * 0.12)} of 12`,
      then: { kind: 'done', app: APP.photos, title: '12 photos uploaded', desc: 'Lisbon, October · shared album', actions: [{ label: 'Open album', run: done }] } })],
    d: ['Invite', 'Calendar', ICON.cal, () => toast({ kind: 'info', app: APP.calendar, thing: THING.calendar, title: 'Design review', desc: 'Today, 16:00 – 16:30 · Studio', duration: 8,
      actions: [{ label: 'Accept', run: (t) => set(t, { kind: 'done', app: APP.calendar, title: 'You’re going', desc: 'Design review · 16:00', duration: 3 }) }, { label: 'Decline', run: done }] })],
  },
  mono: {
    a: ['Deploy', 'main → production', ICON.rocket, () => toast({ kind: 'busy', app: repo('calmdeck-web · main', 'amber'), title: 'Deploying to production', desc: 'Commit 3f2a9c1 · “Fix the pricing grid”', duration: 0, speed: 0.38,
      logs: ['Cloning repository…', 'Installing dependencies…', 'Building…', 'Uploading build output…', 'Assigning domain…'],
      then: { kind: 'done', app: repo('calmdeck-web · main', 'green'), title: 'Ready in 41s', desc: 'Your changes are live.', code: 'calmdeck.app', actions: [{ label: 'Visit', run: done }, { label: 'Logs', run: done }] } })],
    b: ['Copy', 'install command', ICON.copy, () => toast({ kind: 'done', title: 'Copied to clipboard', code: 'npm i @calmdeck/toasts', duration: 3 })],
    c: ['Remove', 'a teammate', ICON.user, () => toast({ kind: 'undo', app: repo('team · calmdeck', 'amber'), title: 'Member removed', desc: 'aysel@calmdeck.dev lost access.', duration: 6,
      actions: [{ label: 'Undo', run: (t) => set(t, { kind: 'done', app: repo('team · calmdeck', 'green'), title: 'Member restored', desc: 'aysel@calmdeck.dev is back.', duration: 3 }) }] })],
    d: ['Break build', 'error', ICON.bug, () => toast({ kind: 'error', app: repo('calmdeck-web · preview', 'red'), title: 'Build failed', code: 'Error: Cannot find module ./config', duration: 7,
      actions: [{ label: 'Retry', run: (t) => set(t, { kind: 'busy', app: repo('calmdeck-web · preview', 'amber'), title: 'Rebuilding', duration: 0, speed: 0.7, logs: ['Restoring cache…', 'Building…', 'Uploading…'],
        then: { kind: 'done', app: repo('calmdeck-web · preview', 'green'), title: 'Ready in 18s', code: 'pr-128.calmdeck.app', actions: [{ label: 'Visit', run: done }] } }) },
      { label: 'View logs', run: done }] })],
  },
  ivory: {
    a: ['Pay', '€ 3,450', ICON.pay, () => toast({ kind: 'done', app: { name: 'Payment' }, when: '14:02', title: 'Payment approved', count: { format: money('€ ', 3450, ' · card ending 4421') }, duration: 6 })],
    b: ['Add to bag', 'The Meridian', ICON.bag, () => toast({ kind: 'undo', app: { name: 'Your bag' }, when: '1 item', thing: THING.watch, title: 'Added to your bag', desc: 'The Meridian, 38 mm · ivory dial', duration: 6,
      actions: [{ label: 'View bag', run: done }, { label: 'Undo', run: (t) => set(t, { kind: 'done', app: { name: 'Your bag' }, when: 'empty', title: 'Removed from your bag', desc: 'The Meridian, 38 mm', duration: 3 }) }] })],
    c: ['Ship order', 'No. 2041', ICON.box, () => toast({ kind: 'busy', app: { name: 'Order No. 2041' }, title: 'Preparing your order', desc: 'Wrapping · 0%', duration: 0, speed: 0.45,
      status: (p) => `${p < 50 ? 'Wrapping' : 'Handing to the courier'} · ${p}%`,
      then: { kind: 'done', app: { name: 'Order No. 2041' }, when: 'today', thing: THING.parcel, title: 'Your order has shipped', desc: 'Arrives Thursday, 9 October', actions: [{ label: 'Track parcel', run: done }] } })],
    d: ['Decline card', 'error', ICON.stop, () => toast({ kind: 'error', app: { name: 'Payment' }, when: '14:06', title: 'Payment declined', desc: 'Your bank asked to confirm it is you.', duration: 7,
      actions: [{ label: 'Try again', run: (t) => set(t, { kind: 'busy', app: { name: 'Payment' }, title: 'Confirming with your bank', desc: '0%', duration: 0, speed: 0.8,
        then: { kind: 'done', app: { name: 'Payment' }, when: '14:07', title: 'Payment approved', desc: '€ 3,450.00 · card ending 4421', duration: 4 } }) }, { label: 'Use another card', run: done }] })],
  },
}[look];
// the page's buttons: named and drawn for the look; each raises its toast
$$('[data-toast]').forEach((b) => {
  const [label, sub, icon, raise] = SCRIPTS[b.dataset.toast];
  $('b', b).textContent = label; $('span', b).textContent = sub; $('path', b).setAttribute('d', icon);
  b.addEventListener('click', raise);
});

// ---- rendering ----
function render() {
  for (const t of toasts) {
    const x = t.x.value + t.shake.value;
    const moving = ![t.y, t.sc, t.op, t.h, t.x, t.shake].every((s) => s.resting(0.01));
    promote(t.el, moving);
    put(t.el, 'height', px(Math.max(8, t.h.value)));
    put(t.el, 'transform', `translate(${px(x)}, ${px(away * t.y.value)}) rotate(${(x * FEEL.tilt).toFixed(3)}deg) scale(${t.sc.value.toFixed(4)})`);
    put(t.el, 'opacity', clamp(t.op.value * (1 - Math.abs(t.x.value) / 600), 0, 1).toFixed(3));
    const words = clamp(t.show.value, 0, 1);                       // the older toasts in the deck show only their edge
    put(t.body, 'opacity', words.toFixed(3));
    t.body.style.pointerEvents = words > 0.5 ? '' : 'none';
    // the kinds: the fill and the ring (in progress), the ring as a countdown (undo), the timer line, the tick
    put(t.fill, 'width', `${(clamp(t.fillS.value, 0, 1) * 100).toFixed(2)}%`);
    put(t.fill, 'opacity', t.kind === 'busy' ? '1' : '0');
    const ring = t.kind === 'busy' ? t.fillS.value : t.kind === 'undo' ? t.left / t.duration : 0;
    put(t.ring, 'strokeDashoffset', (1 - clamp(ring, 0, 1)).toFixed(4));
    put(t.ring, 'opacity', t.kind === 'busy' || t.kind === 'undo' ? '1' : '0');
    put(t.tick, 'strokeDashoffset', (1 - clamp(t.draw.value, 0, 1)).toFixed(4));
    const timed = t.kind !== 'busy' && t.kind !== 'undo' && t.duration > 0;
    put(t.timer, 'opacity', timed ? '1' : '0');
    put(t.timer, 'transform', `scaleX(${clamp(t.left / (t.duration || 1), 0, 1).toFixed(4)})`);
  }
}
// ---- the loop: with ambient life it runs every frame; with reduced motion only while something moves ----
const glows = $$('.amb .glow');
const springs = () => toasts.flatMap((t) => [t.y, t.sc, t.op, t.h, t.x, t.shake, t.show, t.draw, t.fillS, t.counter]);
let running = false, last = 0;
function wake() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
function frame(now) {
  const dt = Math.min(0.032, Math.max(0, (now - last) / 1000));
  last = now;
  clock += dt;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= clock) queue.splice(i, 1)[0].fn();
  for (const t of toasts) { progress(t, dt); counting(t); }
  count(dt);
  const all = springs();
  all.forEach((s) => s.step(dt));
  for (let i = toasts.length - 1; i >= 0; i--) {                   // gone: out, faded, at rest
    const t = toasts[i];
    if (t.state === 'out' && t.op.value < 0.02 && t.op.resting(0.02)) { t.el.remove(); toasts.splice(i, 1); }
  }
  const t = calm ? 0 : studio.now() / 1000;
  glows.forEach((g, i) => put(g, 'transform', `translate(${px(Math.sin(t * (0.13 + i * 0.05) + i * 2) * 26)}, ${px(Math.cos(t * (0.11 + i * 0.04) + i) * 18)})`));
  render();
  const still = all.every((s) => s.resting(0.002)) && !queue.length && !toasts.some((o) => o.state === 'in' && (o.duration || o.kind === 'busy'));
  if (!calm || !still) requestAnimationFrame(frame); else running = false;
}
wake();

// the touch circle, for the video
const touch = $('.touch');
let down = false;
const showTouch = (e) => { touch.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; touch.classList.add('is-on'); };
addEventListener('pointerdown', (e) => { down = true; showTouch(e); });
addEventListener('pointermove', (e) => { if (down) showTouch(e); });
addEventListener('pointerup', () => { down = false; touch.classList.remove('is-on'); });

// for scripts and the tutorial's console: raise a toast by its button (a, b, c, d), open or close the deck, read the state
window.__toasts = {
  raise: (name) => SCRIPTS[name][3](),
  open: (on = true) => setOpen(on),
  state: () => ({ open, toasts: toasts.filter((t) => t.state === 'in').map((t) => ({ kind: t.kind, title: t.title.textContent, left: +t.left.toFixed(2) })) }),
};

// ===== Co-op connection test =====
// A bare arena: everyone gets a dot, the host moves them all, guests just send their stick.
// It's here to prove the devices can find each other at home, over the internet, and in the car.
const NetTest = {
  COL: ['#ffb057', '#6fd3ff', '#c38cff'], AW: 900, AH: 520,
  run: false, pos: {}, inp: {}, keys: new Set(), touch: null, sendT: 0, pingT: 0, stT: 0,
  qrMode: false,

  home() {
    this.stop(); Net.reset();
    Menu.html(`<h2>Co-op Test</h2><div class="sub">Checks that your devices can play together. Up to 3 players. Everyone gets a dot to move around, plus ping and connection details.</div>
      <button class="btn" id="n-host">Host a room</button>
      <div class="drow" style="justify-content:center"><input class="seed" id="n-code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" style="width:140px;text-align:center"><button class="btn" id="n-join" style="width:auto;margin:0">Join</button></div>
      <div class="sub" style="margin-top:16px">No internet, like on a road trip? One phone turns on its hotspot, everyone joins it, then pass QR codes between screens.</div>
      <div class="row"><button class="btn small" id="n-qhost">Host with QR</button><button class="btn small" id="n-qjoin">Join with QR</button></div>
      <div class="sub" id="n-msg" style="min-height:1.2em;color:#ff8a9a"></div>
      <button class="btn small" id="b-back">Back</button>`);
    const msg = t => { const el = document.getElementById('n-msg'); if (el) el.textContent = t; };
    Menu.on('n-host', async () => { msg(''); if (await Net.host()) this.arena(); else msg(Net.status); });
    const join = async () => { const c = (document.getElementById('n-code').value || '').trim(); if (c.length !== 4) { msg('Room codes are 4 letters'); return; } this.qrMode = false; if (await Net.join(c)) this.arena(); else msg(Net.status); };
    Menu.on('n-join', join);
    document.getElementById('n-code').onkeydown = e => { if (e.key === 'Enter') join(); };
    Menu.on('n-qhost', () => { this.qrMode = true; this.qrInvite(); });
    Menu.on('n-qjoin', () => { this.qrMode = true; this.qrJoin(); });
    Menu.on('b-back', () => { Net.reset(); Menu.show('title'); });
  },

  // ---------- QR flows ----------
  async qrInvite() {
    Menu.html(`<div class="qrwrap"><canvas id="q-cv" class="qrc"></canvas><div><h2>Invite a player</h2><div class="sub" id="q-sub">Making a code…</div>
      <button class="btn" id="q-scan">They scanned it. Scan their reply</button><button class="btn small" id="q-back">Back to the arena</button></div></div>`);
    const code = await Net.qrInvite();
    if (!code) { document.getElementById('q-sub').textContent = 'The room is full (3 players).'; }
    else { document.getElementById('q-sub').textContent = 'On the other device: Co-op Test → Join with QR, then scan this.'; await QR.draw(document.getElementById('q-cv'), code); }
    Menu.on('q-scan', () => this.qrScan('Scan the reply code on their screen', async s => { const ok = await Net.qrAcceptReply(s); this.arena(); if (!ok) Net.say("That wasn't a reply code"); }));
    Menu.on('q-back', () => { if (Net.pending) { Net.drop(Net.pending); Net.pending = null; } this.arena(); });
  },
  qrJoin() { this.qrScan("Scan the host's invite code", async s => {
    const reply = await Net.qrReply(s);
    if (!reply) { this.home(); return; }
    Menu.html(`<div class="qrwrap"><canvas id="q-cv" class="qrc"></canvas><div><h2>Show this to the host</h2><div class="sub">The host taps "Scan their reply" and points their camera here. You'll drop into the arena once it connects.</div><button class="btn small" id="q-back">Cancel</button></div></div>`);
    await QR.draw(document.getElementById('q-cv'), reply);
    Menu.on('q-back', () => this.home());
    const wait = setInterval(() => { if (!Net.peers[0]) return clearInterval(wait); if (Net.peers[0].open) { clearInterval(wait); this.arena(); } }, 200);
  }); },
  qrScan(title, onText) {
    Menu.html(`<h2>${title}</h2><video id="q-vid" style="width:100%;max-width:420px;max-height:calc(100vh - 150px);border-radius:12px;background:#000"></video><div class="sub" id="q-sub">Starting the camera…</div><button class="btn small" id="q-back">Cancel</button>`);
    Menu.on('q-back', () => { QR.stop(); Net.role === 'host' ? this.arena() : this.home(); });
    QR.scan(document.getElementById('q-vid'), onText).then(() => { const s = document.getElementById('q-sub'); if (s) s.textContent = 'Hold the code steady in view.'; })
      .catch(e => { const s = document.getElementById('q-sub'); if (s) s.textContent = "Couldn't open the camera: " + e.message; });
  },

  // ---------- the arena ----------
  arena() {
    Menu.html(`<canvas id="n-cv" style="position:fixed;inset:0;width:100vw;height:100vh;touch-action:none"></canvas>
      <div style="position:fixed;left:12px;top:10px;right:12px;display:flex;justify-content:space-between;pointer-events:none;font-size:14px">
        <div id="n-info" style="text-align:left"></div>
        <div style="pointer-events:auto;display:flex;gap:8px">${Net.role === 'host' && this.qrMode ? '<button class="btn small" id="n-inv" style="width:auto;margin:0">Invite with QR</button>' : ''}<button class="btn small" id="n-leave" style="width:auto;margin:0">Leave</button></div>
      </div>`);
    Menu.on('n-leave', () => this.home());
    Menu.on('n-inv', () => this.qrInvite());
    this.cv = document.getElementById('n-cv'); this.c = this.cv.getContext('2d');
    if (!this.pos[0]) this.pos = {};
    if (Net.role === 'host' && !this.pos[0]) this.pos[0] = { x: this.AW / 2, y: this.AH / 2 };
    Net.onMsg = (peer, m) => this.onMsg(peer, m);
    Net.onChange = () => this.info();
    this.bindInput(); this.info();
    if (!this.run) { this.run = true; this.last = performance.now(); requestAnimationFrame(t => this.loop(t)); }
  },
  stop() { this.run = false; this.pos = {}; this.inp = {}; this.unbindInput(); },
  bindInput() {
    this.unbindInput();
    this.kd = e => { if (e.target.tagName === 'INPUT') return; this.keys.add(e.key.toLowerCase()); };
    this.ku = e => this.keys.delete(e.key.toLowerCase());
    addEventListener('keydown', this.kd); addEventListener('keyup', this.ku);
    const cv = this.cv, pt = e => ({ x: e.clientX, y: e.clientY });
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); this.touch = { id: e.pointerId, o: pt(e), p: pt(e) }; };
    cv.onpointermove = e => { if (this.touch && this.touch.id === e.pointerId) this.touch.p = pt(e); };
    cv.onpointerup = cv.onpointercancel = e => { if (this.touch && this.touch.id === e.pointerId) this.touch = null; };
  },
  unbindInput() { if (this.kd) { removeEventListener('keydown', this.kd); removeEventListener('keyup', this.ku); } this.keys.clear(); this.touch = null; },
  myStick() {
    const k = this.keys; let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), y = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (this.touch) { const dx = this.touch.p.x - this.touch.o.x, dy = this.touch.p.y - this.touch.o.y, d = Math.hypot(dx, dy); if (d > 6) { x = dx / Math.max(d, 50); y = dy / Math.max(d, 50); } }
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    if (gp && Math.hypot(gp.axes[0], gp.axes[1]) > 0.2) { x = gp.axes[0]; y = gp.axes[1]; }
    const m = Math.hypot(x, y); return m > 1 ? [x / m, y / m] : [x, y];
  },
  onMsg(peer, m) {
    if (Net.role === 'host') {
      if (m.t === 'in') this.inp[peer.slot] = [clamp(+m.x || 0, -1, 1), clamp(+m.y || 0, -1, 1)];
    } else if (m.t === 'st') {
      for (const [s, x, y] of m.p) { const o = this.pos[s] || (this.pos[s] = { x, y, tx: x, ty: y }); o.tx = x; o.ty = y; }
      for (const s of Object.keys(this.pos)) if (!m.p.some(q => q[0] === +s)) delete this.pos[s];
      this.hostRtt = m.r;
    }
  },
  loop(t) {
    if (!this.run) return;
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const host = Net.role === 'host', [mx, my] = this.myStick();
    this.pingT -= dt; if (this.pingT <= 0) { this.pingT = 1; Net.pingAll(); this.info(); }
    if (host) {
      this.inp[0] = [mx, my];
      for (const p of Net.peers) if (p.open && !this.pos[p.slot]) this.pos[p.slot] = { x: this.AW / 2 + (p.slot === 1 ? -80 : 80), y: this.AH / 2 };
      for (const s of Object.keys(this.pos)) if (+s !== 0 && !Net.peers.some(p => p.slot === +s && p.open)) delete this.pos[s];
      for (const s of Object.keys(this.pos)) { const o = this.pos[s], i = this.inp[s] || [0, 0]; o.x = clamp(o.x + i[0] * 260 * dt, 20, this.AW - 20); o.y = clamp(o.y + i[1] * 260 * dt, 20, this.AH - 20); }
      this.stT -= dt; if (this.stT <= 0) { this.stT = 0.05; Net.broadcast({ t: 'st', p: Object.keys(this.pos).map(s => [+s, Math.round(this.pos[s].x), Math.round(this.pos[s].y)]), r: Net.peers.map(p => [p.slot, Math.round(p.rtt)]) }, true); }
    } else {
      this.sendT -= dt; if (this.sendT <= 0 && Net.peers[0]) { this.sendT = 1 / 30; Net.send(Net.peers[0], { t: 'in', x: +mx.toFixed(2), y: +my.toFixed(2) }, true); }
      for (const o of Object.values(this.pos)) { o.x = lerp(o.x, o.tx, 1 - Math.exp(-dt * 18)); o.y = lerp(o.y, o.ty, 1 - Math.exp(-dt * 18)); }
    }
    this.draw();
    requestAnimationFrame(t2 => this.loop(t2));
  },
  draw() {
    const cv = this.cv; if (!cv || !cv.isConnected) { this.run = false; return; }
    const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const c = this.c, k = Math.min((W - 30) / this.AW, (H - 110) / this.AH), ox = (W - this.AW * k) / 2, oy = 70 + (H - 80 - this.AH * k) / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#07050d'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(ox, oy); c.scale(k, k);
    c.fillStyle = '#120c24'; c.fillRect(0, 0, this.AW, this.AH);
    c.strokeStyle = 'rgba(120,100,200,0.15)'; c.lineWidth = 1; for (let x = 0; x <= this.AW; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.AH); c.stroke(); } for (let y = 0; y <= this.AH; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(this.AW, y); c.stroke(); }
    c.strokeStyle = '#5b47a0'; c.lineWidth = 3; c.strokeRect(0, 0, this.AW, this.AH);
    const me = Net.role === 'host' ? 0 : Net.mySlot;
    for (const s of Object.keys(this.pos)) {
      const o = this.pos[s], col = this.COL[s] || '#fff';
      c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 18; c.beginPath(); c.arc(o.x, o.y, 18, 0, TAU); c.fill(); c.shadowBlur = 0;
      if (+s === me) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); }
      c.fillStyle = '#fff'; c.font = '700 15px system-ui'; c.textAlign = 'center'; c.fillText('P' + (+s + 1) + (+s === 0 ? ' host' : '') + (+s === me ? ' (you)' : ''), o.x, o.y - 26);
    }
    c.restore();
    if (Net.role === 'guest' && !(Net.peers[0] && Net.peers[0].open)) { c.fillStyle = '#e8dcff'; c.font = '700 18px system-ui'; c.textAlign = 'center'; c.fillText(Net.status || 'Connecting…', W / 2, H / 2); }
  },
  info() {
    const el = document.getElementById('n-info'); if (!el) return;
    const rows = [];
    if (Net.role === 'host') {
      rows.push(Net.code && Net.code !== 'QR' ? `Room <b style="font-size:22px;letter-spacing:.12em;color:#ffb057">${Net.code}</b> · ${1 + Net.peers.filter(p => p.open).length}/3 players` : `QR room · ${1 + Net.peers.filter(p => p.open).length}/3 players`);
      for (const p of Net.peers) rows.push(`<span style="color:${this.COL[p.slot]}">P${p.slot + 1}</span> ${p.open ? `${Math.round(p.rtt)} ms · ${p.link}` : 'connecting…'}`);
      if (!Net.peers.length) rows.push(this.qrMode ? 'Tap "Invite with QR" for each player.' : 'Others: Co-op Test → type this code → Join');
    } else {
      const p = Net.peers[0];
      rows.push(p && p.open ? `In room ${Net.code !== 'QR' ? Net.code : '(QR)'} as <span style="color:${this.COL[Net.mySlot]}">P${(Net.mySlot || 0) + 1}</span>` : Net.status);
      if (p && p.open) rows.push(`${Math.round(p.rtt)} ms to host · ${p.link}`);
    }
    rows.push('<span style="opacity:.6">Move: WASD, arrows, stick, or drag anywhere</span>');
    el.innerHTML = rows.map(r => `<div style="margin:2px 0;text-shadow:0 1px 3px #000">${r}</div>`).join('');
  },
};

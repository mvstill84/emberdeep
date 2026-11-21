// ===== Netplay =====
// Star layout: one host runs the game, up to two guests send inputs and get state back.
// Devices talk directly over WebRTC. They only need a go-between for the opening handshake:
// a public PeerJS signaling server when there's internet, or QR codes passed between screens when there isn't.
const Net = {
  MAX: 3,
  ICE: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  SIG: 'wss://0.peerjs.com:443/peerjs',
  role: null, code: '', ws: null, peers: [], status: '', onMsg: null, onChange: null, hbT: null,

  reset() {
    for (const p of this.peers) try { p.pc.close(); } catch (e) { }
    this.peers = []; this.role = null; this.code = ''; this.status = '';
    if (this.ws) try { this.ws.close(); } catch (e) { }
    this.ws = null; clearInterval(this.hbT);
  },
  changed() { if (this.onChange) this.onChange(); },
  say(s) { this.status = s; this.changed(); },

  // ---------- WebRTC plumbing ----------
  newPeer(slot) {
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    // two channels: reliable for events, fast (no resends) for state that's stale in 50 ms anyway
    const rel = pc.createDataChannel('rel', { negotiated: true, id: 0, ordered: true });
    const fast = pc.createDataChannel('fast', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    const peer = { pc, rel, fast, slot, rtt: 0, link: '…', open: false, last: performance.now() };
    const onmsg = e => { peer.last = performance.now(); let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.handle(peer, m); };
    rel.onmessage = onmsg; fast.onmessage = onmsg;
    rel.onopen = () => { peer.open = true; this.say('Connected'); this.linkType(peer); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') { peer.open = false; if (s !== 'disconnected') this.drop(peer); else this.changed(); }
    };
    return peer;
  },
  gathered(pc, ms = 3000) { // wait for ICE candidates so one message carries everything (works for QR too)
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  },
  async offer(peer) { await peer.pc.setLocalDescription(await peer.pc.createOffer()); await this.gathered(peer.pc); return peer.pc.localDescription.sdp; },
  async answer(peer, sdp) { await peer.pc.setRemoteDescription({ type: 'offer', sdp }); await peer.pc.setLocalDescription(await peer.pc.createAnswer()); await this.gathered(peer.pc); return peer.pc.localDescription.sdp; },
  async accept(peer, sdp) { await peer.pc.setRemoteDescription({ type: 'answer', sdp }); },
  async linkType(peer) { // how the bytes actually travel
    for (let i = 0; i < 10 && peer.pc.connectionState !== 'closed'; i++) {
      try {
        const st = await peer.pc.getStats(); let pair = null; const c = {};
        st.forEach(r => { if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r; if (r.type === 'local-candidate' || r.type === 'remote-candidate') c[r.id] = r; });
        if (pair) { const L = c[pair.localCandidateId] || {}, Rm = c[pair.remoteCandidateId] || {}; peer.link = L.candidateType === 'relay' || Rm.candidateType === 'relay' ? 'relayed' : L.candidateType === 'host' && Rm.candidateType === 'host' ? 'direct, local network' : 'direct, over internet'; this.changed(); return; }
      } catch (e) { }
      await new Promise(r => setTimeout(r, 500));
    }
  },
  freeSlot() { for (let s = 1; s < this.MAX; s++) if (!this.peers.some(p => p.slot === s)) return s; return -1; },
  drop(peer) { try { peer.pc.close(); } catch (e) { } this.peers = this.peers.filter(p => p !== peer); this.changed(); },

  // ---------- messages ----------
  send(peer, m, fast) { const ch = fast ? peer.fast : peer.rel; if (ch.readyState === 'open') try { ch.send(JSON.stringify(m)); } catch (e) { } },
  broadcast(m, fast) { for (const p of this.peers) this.send(p, m, fast); },
  handle(peer, m) {
    if (m.t === 'ping') return this.send(peer, { t: 'pong', tm: m.tm });
    if (m.t === 'pong') { peer.rtt = lerp(peer.rtt || (performance.now() - m.tm), performance.now() - m.tm, 0.3); return; }
    if (m.t === 'welcome') { peer.slot = m.slot; this.mySlot = m.slot; this.changed(); }
    if (m.t === 'full') { this.say('That room is full'); }
    if (this.onMsg) this.onMsg(peer, m);
  },
  pingAll() { for (const p of this.peers) this.send(p, { t: 'ping', tm: performance.now() }); },

  // ---------- online: room codes via the public signaling server ----------
  roomId(code) { return 'emberdeep-room-' + code.toLowerCase(); },
  sigOpen(id) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(`${this.SIG}?key=peerjs&id=${encodeURIComponent(id)}&token=${Math.random().toString(36).slice(2)}`);
      let done = false;
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.type === 'OPEN') { done = true; this.ws = ws; this.hbT = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'HEARTBEAT' })); }, 5000); res(ws); }
        else if (m.type === 'ID-TAKEN') { done = true; rej(new Error('taken')); ws.close(); }
        else if (m.type === 'ERROR') { if (!done) { done = true; rej(new Error(m.payload && m.payload.msg || 'error')); } }
        else this.sigMsg(m);
      };
      ws.onerror = () => { if (!done) { done = true; rej(new Error('offline')); } };
      ws.onclose = () => { if (!done) { done = true; rej(new Error('offline')); } };
      setTimeout(() => { if (!done) { done = true; rej(new Error('timeout')); try { ws.close(); } catch (e) { } } }, 8000);
    });
  },
  sigSend(dst, type, payload) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, dst, payload })); },
  async sigMsg(m) {
    if (this.role === 'host' && m.type === 'OFFER') { // a guest knocking
      const slot = this.freeSlot();
      if (slot < 0) { this.sigSend(m.src, 'ANSWER', { full: true }); return; }
      const peer = this.newPeer(slot); peer.sigId = m.src; this.peers.push(peer); this.changed();
      const sdp = await this.answer(peer, m.payload.sdp);
      this.sigSend(m.src, 'ANSWER', { sdp });
      peer.rel.addEventListener('open', () => this.send(peer, { t: 'welcome', slot }));
    } else if (this.role === 'guest' && m.type === 'ANSWER') {
      if (m.payload.full) { this.say('That room is full'); return; }
      const peer = this.peers[0]; if (peer) await this.accept(peer, m.payload.sdp);
    } else if (m.type === 'EXPIRE' && this.role === 'guest') this.say('No room with that code');
  },
  async host() {
    this.reset(); this.role = 'host'; this.mySlot = 0;
    for (let i = 0; i < 6; i++) {
      const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join('');
      try { this.say('Opening a room…'); await this.sigOpen(this.roomId(code)); this.code = code; this.say('Waiting for players'); return true; }
      catch (e) { if (e.message !== 'taken') { this.say("Couldn't reach the matchmaking server. No internet? Use QR codes."); return false; } }
    }
    return false;
  },
  async join(code) {
    this.reset(); this.role = 'guest'; this.code = code.toUpperCase();
    try { this.say('Connecting…'); await this.sigOpen('emberdeep-guest-' + Math.random().toString(36).slice(2, 10)); }
    catch (e) { this.say("Couldn't reach the matchmaking server. No internet? Use QR codes."); return false; }
    const peer = this.newPeer(0); this.peers.push(peer);
    this.say('Finding room ' + this.code + '…');
    const sdp = await this.offer(peer);
    this.sigSend(this.roomId(this.code), 'OFFER', { sdp });
    setTimeout(() => { if (!peer.open && this.role === 'guest' && this.peers[0] === peer) this.say('No answer from room ' + this.code + '. Check the code?'); }, 12000);
    return true;
  },

  // ---------- offline: QR handshake ----------
  async pack(sdp) { // compress the handshake so it fits a QR code comfortably
    const keep = sdp.split('\r\n').filter(l => l && !/^a=(extmap|rtcp-fb|ssrc|msid|rtpmap|fmtp)/.test(l)).join('\n');
    try {
      const s = new Blob([keep]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const b = new Uint8Array(await new Response(s).arrayBuffer());
      let bin = ''; for (const x of b) bin += String.fromCharCode(x);
      return 'Z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return 'R' + btoa(keep); }
  },
  async unpack(s) {
    if (s[0] === 'R') return atob(s.slice(1)).split('\n').join('\r\n') + '\r\n';
    const b64 = s.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64), b = Uint8Array.from(bin, c => c.charCodeAt(0));
    const out = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return (await new Response(out).text()).split('\n').join('\r\n') + '\r\n';
  },
  // host side: one invite per guest
  async qrInvite() {
    if (this.role !== 'host') { this.reset(); this.role = 'host'; this.mySlot = 0; this.code = 'QR'; }
    const slot = this.freeSlot(); if (slot < 0) return null;
    const peer = this.newPeer(slot); this.peers.push(peer); this.pending = peer;
    peer.rel.addEventListener('open', () => this.send(peer, { t: 'welcome', slot }));
    return 'E1' + await this.pack(await this.offer(peer));
  },
  async qrAcceptReply(s) { const peer = this.pending; if (!peer || !s.startsWith('E2')) return false; await this.accept(peer, await this.unpack(s.slice(2))); this.pending = null; return true; },
  // guest side: scan the invite, show a reply
  async qrReply(s) {
    if (!s.startsWith('E1')) return null;
    this.reset(); this.role = 'guest'; this.code = 'QR';
    const peer = this.newPeer(0); this.peers.push(peer);
    return 'E2' + await this.pack(await this.answer(peer, await this.unpack(s.slice(2))));
  },
};

// ---- QR helpers: the encoder and camera decoder load only when someone needs them ----
const QR = {
  load(src, name) {
    if (window[name]) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  },
  async draw(canvas, text) {
    await this.load('vendor/qrcode.min.js', 'qrcode');
    const q = qrcode(0, 'L'); q.addData(text); q.make();
    const n = q.getModuleCount(), px = Math.max(3, Math.floor(Math.min(320, innerWidth - 60, innerHeight - 140) / (n + 8))), sz = (n + 8) * px;
    canvas.width = canvas.height = sz; const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, sz, sz); c.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect((x + 4) * px, (y + 4) * px, px, px);
  },
  stream: null,
  async scan(video, onText) {
    await this.load('vendor/jsqr.min.js', 'jsQR');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = this.stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play();
    const cv = document.createElement('canvas'), c = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (!this.stream) return;
      if (video.videoWidth) {
        const k = Math.min(1, 640 / video.videoWidth); cv.width = video.videoWidth * k; cv.height = video.videoHeight * k;
        c.drawImage(video, 0, 0, cv.width, cv.height);
        const r = jsQR(c.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (r && r.data && /^E[12]/.test(r.data)) { this.stop(); onText(r.data); return; }
      }
      setTimeout(tick, 120);
    };
    tick();
  },
  stop() { if (this.stream) for (const t of this.stream.getTracks()) t.stop(); this.stream = null; },
};

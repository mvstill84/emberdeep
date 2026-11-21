// ===== Netplay =====
// Star layout: one host runs the game, up to two guests send inputs and get state back.
// Devices talk directly over WebRTC. They only need a go-between for the opening handshake:
// a public PeerJS signaling server when there's internet, or QR codes passed between screens when there isn't.
const Net = {
  MAX: 3,
  ICE: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  role: null, code: '', P: null, peers: [], status: '', onMsg: null, onChange: null,

  reset() {
    for (const p of this.peers) try { p.pc && p.pc.close(); } catch (e) { }
    this.peers = []; this.role = null; this.code = ''; this.status = '';
    if (this.P) try { this.P.destroy(); } catch (e) { }
    this.P = null;
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
  drop(peer) { try { peer.pc && peer.pc.close(); } catch (e) { } this.peers = this.peers.filter(p => p !== peer); this.changed(); },

  // ---------- messages ----------
  send(peer, m, fast) { const ch = fast ? peer.fast : peer.rel; if (ch && ch.readyState === 'open') try { ch.send(JSON.stringify(m)); } catch (e) { } },
  broadcast(m, fast) { for (const p of this.peers) this.send(p, m, fast); },
  handle(peer, m) {
    if (m.t === 'ping') return this.send(peer, { t: 'pong', tm: m.tm });
    if (m.t === 'pong') { peer.rtt = lerp(peer.rtt || (performance.now() - m.tm), performance.now() - m.tm, 0.3); return; }
    if (m.t === 'welcome') { peer.slot = m.slot; this.mySlot = m.slot; this.changed(); }
    if (m.t === 'full') { this.say('That room is full (3 players)'); }
    if (this.onMsg) this.onMsg(peer, m);
  },
  pingAll() { for (const p of this.peers) this.send(p, { t: 'ping', tm: performance.now() }); },

  // ---------- online: room codes via the public PeerJS server (official client, loaded on demand) ----------
  roomId(code) { return 'emberdeep-room-' + code.toLowerCase(); },
  // wrap a PeerJS DataConnection so it looks like a plain channel
  chan(conn) { return { get readyState() { return conn.open ? 'open' : 'closed'; }, send: s => conn.send(s) }; },
  wire(peer, conn, kind) {
    peer[kind] = this.chan(conn);
    if (kind === 'rel') peer.pc = conn.peerConnection || peer.pc;
    conn.on('data', d => { peer.last = performance.now(); let m; try { m = JSON.parse(d); } catch (_) { return; } this.handle(peer, m); });
    const opened = () => { if (kind === 'rel') { peer.open = true; peer.pc = conn.peerConnection; this.say('Connected'); this.linkType(peer); if (this.role === 'host') this.send(peer, { t: peer.full ? 'full' : 'welcome', slot: peer.slot }); } };
    if (conn.open) opened(); else conn.on('open', opened);
    conn.on('close', () => { if (kind === 'rel') { peer.open = false; this.drop(peer); } });
    conn.on('error', () => { });
  },
  async lib() { await QR.load('vendor/peerjs.min.js', 'Peer'); },
  makePeer(id) {
    return new Promise((res, rej) => {
      const P = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      const t = setTimeout(() => rej(new Error('timeout')), 9000);
      P.on('open', () => { clearTimeout(t); res(P); });
      P.on('error', e => { clearTimeout(t); rej(e); });
    });
  },
  async host() {
    this.reset(); this.role = 'host'; this.mySlot = 0;
    try { await this.lib(); } catch (e) { this.say("Couldn't load the matchmaking code. No internet? Use QR codes."); return false; }
    for (let i = 0; i < 6; i++) {
      const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join('');
      this.say('Opening a room…');
      try { this.P = await this.makePeer(this.roomId(code)); }
      catch (e) { if (e.type === 'unavailable-id') continue; this.say("Couldn't reach the matchmaking server. No internet? Use QR codes."); return false; }
      this.code = code; this.say('Waiting for players');
      this.P.on('error', () => { });
      this.P.on('connection', conn => {
        const md = conn.metadata || {}, gid = conn.peer;
        let peer = this.peers.find(p => p.gid === gid);
        if (!peer) {
          const slot = this.freeSlot();
          peer = { gid, slot: slot < 0 ? -1 : slot, full: slot < 0, rtt: 0, link: '…', open: false, last: performance.now(), pc: conn.peerConnection };
          if (!peer.full) this.peers.push(peer);
        }
        if (peer.full) { conn.on('open', () => { conn.send(JSON.stringify({ t: 'full' })); setTimeout(() => conn.close(), 500); }); return; }
        this.wire(peer, conn, md.ch === 'fast' ? 'fast' : 'rel');
        this.changed();
      });
      return true;
    }
    this.say("Couldn't open a room. Try again?"); return false;
  },
  async join(code) {
    this.reset(); this.role = 'guest'; this.code = code.toUpperCase();
    try { await this.lib(); this.say('Connecting…'); this.P = await this.makePeer(null); }
    catch (e) { this.say("Couldn't reach the matchmaking server. No internet? Use QR codes."); return false; }
    this.P.on('error', e => { if (e.type === 'peer-unavailable') this.say('No room with code ' + this.code); });
    const peer = { slot: 0, rtt: 0, link: '…', open: false, last: performance.now() };
    peer.fast = { readyState: 'closed', send() { } };
    this.peers.push(peer);
    this.say('Finding room ' + this.code + '…');
    const dst = this.roomId(this.code);
    this.wire(peer, this.P.connect(dst, { reliable: true, serialization: 'raw', metadata: { ch: 'rel' } }), 'rel');
    this.wire(peer, this.P.connect(dst, { reliable: false, serialization: 'raw', metadata: { ch: 'fast' } }), 'fast');
    setTimeout(() => { if (!peer.open && this.role === 'guest' && this.peers[0] === peer && !/No room|full/.test(this.status)) this.say('No answer from room ' + this.code + '. Check the code?'); }, 12000);
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
    const n = q.getModuleCount(), px = 6, sz = (n + 8) * px;
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

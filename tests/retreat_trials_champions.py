import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("()=>{Game.newRun('RETREAT','fighter');World.startLevel(2,2,true);World.players[0].inv=9999}")
    # walk into the first room of a route through its door
    def walk_to(x,y,ms=2500): pg.evaluate(f"()=>{{const p=World.players[0];p._t=[{x},{y}]}}"); 
    r=pg.evaluate("""async()=>{const W=World,p=W.players[0],st=W.rooms[0],n=W.rooms[st.links[0]];
      const d=W.doorPos(st,n.id);p.x=d.x;p.y=d.y;await new Promise(r=>setTimeout(r,200));
      const d2p=W.doorPos(n,st.id);const cx=n.mx*32+16,cy=n.my*32+16;p.x=d2p.x+(cx-d2p.x)*0.25;p.y=d2p.y+(cy-d2p.y)*0.25;
      await new Promise(r=>setTimeout(r,1800));
      const shut=n.doors.filter(i=>W.map[i]===SHUT).length, open=n.doors.filter(i=>W.map[i]===DOOR).length;
      const e0=W.enemies.filter(e=>!e.dead).length; for(const e of W.enemies){e.hp=e.maxHp*0.5}
      // step back out through the open door and away
      p.x=d.x+(st.mx*32-d.x)*0.5; p.y=d.y+(st.my*32-d.y)*0.5; await new Promise(r=>setTimeout(r,2200));
      const frozen=!!n.frozen, locked=W.locked, nE=W.enemies.length, fe=n.frozen?n.frozen.enemies.length:0;
      // come back
      p.x=d2p.x+(cx-d2p.x)*0.4;p.y=d2p.y+(cy-d2p.y)*0.4; await new Promise(r=>setTimeout(r,600));
      const back=[W.locked, W.enemies.length, Math.round(W.enemies[0].hp/W.enemies[0].maxHp*100)];
      return {route:n.route, entry:n.entry===st.id, shut, open, e0, frozen, locked, nE, fe, back}}""")
    print('retreat', r)
    # challenge: find one, enter, back out -> collapse
    r=pg.evaluate("""async()=>{for(let s=0;s<30;s++){Game.newRun('TRIAL'+s,'fighter');World.startLevel(3,1,true);if(World.rooms.some(r=>r.type==='challenge'))break}
      const W=World,p=W.players[0];p.inv=9999;const c=W.rooms.find(r=>r.type==='challenge'),nb=W.rooms[c.links[0]];
      nb.cleared=true; const d=W.doorPos(c,nb.id),cx=c.mx*32+16,cy=c.my*32+16; p.x=d.x+(cx-d.x)*0.3;p.y=d.y+(cy-d.y)*0.3;
      await new Promise(r=>setTimeout(r,800)); const kind=W.challenge&&W.challenge.kind;
      const dn=W.doorPos(nb,c.id); p.x=dn.x+(nb.mx*32-dn.x)*0.4; p.y=dn.y+(nb.my*32-dn.y)*0.4; await new Promise(r=>setTimeout(r,900));
      return {kind, collapsed:c.collapsed, walls:c.doors.filter(i=>W.map[i]===WALL).length, locked:W.locked, ch:!!W.challenge}}""")
    print('trial collapse', r)
    r=pg.evaluate("""async()=>{for(let s=30;s<70;s++){Game.newRun('TRIAL'+s,'mage');World.startLevel(3,2,true);if(World.rooms.some(r=>r.type==='challenge'))break}
      const W=World,p=W.players[0];p.inv=9999;const c=W.rooms.find(r=>r.type==='challenge'),nb=W.rooms[c.links[0]];
      const cx=c.mx*32+16,cy=c.my*32+16; p.x=cx;p.y=cy; await new Promise(r=>setTimeout(r,800)); const kind=W.challenge.kind;
      if(kind==='survive'){W.challenge.t=0.3}else{const e=W.enemies.find(e=>e.hunted);W.damage(e,1e7,{x:e.x,y:e.y,p,crit:true})}
      await new Promise(r=>setTimeout(r,900));
      return {kind, cleared:c.cleared, ch:!!W.challenge, loot:W.pickups.filter(k=>['weapon','chest','stone'].includes(k.kind)).map(k=>k.kind+(k.w?':'+RARITY[k.w.rarity].n:''))}}""")
    print('trial win', r)
    pg.screenshot(path='rt_trial.png')
    # elite champion
    r=pg.evaluate("""async()=>{for(let s=0;s<40;s++){Game.newRun('CHAMP'+s,'ranger');World.startLevel(2,3,true);if(World.rooms.some(r=>r.champion))break}
      const W=World,p=W.players[0];p.inv=9999;const c=W.rooms.find(r=>r.champion); p.x=c.mx*32+16;p.y=c.my*32+16+64; await new Promise(r=>setTimeout(r,1500));
      const ch=W.enemies.find(e=>e.champ); const info=ch&&[ch.D.n, Math.round(ch.maxHp), ch.r]; return info}""")
    print('champion', r)
    pg.wait_for_timeout(500); pg.screenshot(path='rt_champ.png')
    print(pg.evaluate("""()=>{const W=World,p=W.players[0],ch=W.enemies.find(e=>e.champ);W.damage(ch,1e7,{x:ch.x,y:ch.y,p,blunt:true,crit:true});return W.pickups.filter(k=>k.kind==='weapon').map(k=>RARITY[k.w.rarity].n)}"""))
    print('errors',errs[:3]); b.close()

import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
U = BASE + '/index.html'
CH = os.environ.get('CHROME', '/usr/bin/google-chrome')

# Solo: fight a bit, then let a goblin archer's arrow finish you. Read the end screen.
SOLO = """async()=>{
 localStorage.clear(); Game.newRun('SUMMARY','fighter'); const W=World, p=W.players[0], wait=ms=>new Promise(r=>setTimeout(r,ms));
 const r=W.rooms.find(r=>r.type==='combat'); p.x=r.mx*T+16; p.y=r.my*T+16; await wait(1800);
 const orig=Input.read.bind(Input); Input.read=(s,q)=>{const i=orig(s,q); const e=W.enemies.find(e=>!e.dead&&e.spawnT<=0); return Object.assign(i,{mx:0,my:0,attack:!!e,aim:e?Math.atan2(e.y-q.y,e.x-q.x):i.aim});};
 for(let k=0;k<40&&W.enemies.length;k++){ p.hp=p.maxHp; p.inv=Math.max(p.inv,0.5); await wait(250); }
 Input.read=(s,q)=>Object.assign(orig(s,q),{mx:0,my:0,attack:false});
 W.heal(1,p);  // nothing to heal: full health
 p.hp=3; W.heal(1,p); // +half heart
 W.enemies=[]; W.waves=[]; const a=W.makeEnemy('goblinArcher',p.x+120,p.y); a.spawnT=0; W.enemies.push(a); p.guard=false; p.inv=0; p.hp=1;
 for(let k=0;k<40&&Game.state==='play';k++) await wait(250);
 Input.read=orig;
 return {state:Game.state, sum:JSON.stringify(Game.sum), killer:p.killer};
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CH)
    pg = b.new_page(viewport={'width': 1100, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(U); pg.wait_for_timeout(500)
    print('solo', pg.evaluate(SOLO))
    pg.wait_for_timeout(2200)
    print('end screen', pg.evaluate("()=>[document.querySelector('.killer')&&document.querySelector('.killer').innerText.replace(/\\n/g,' | '), [...document.querySelectorAll('.stats span')].map(s=>s.textContent).join(' ')]"))
    pg.screenshot(path='sum_solo.png')

    # every monster and boss draws a portrait without throwing, and draws something
    print('portraits', pg.evaluate("""()=>{const bad=[]; const cv=document.createElement('canvas'); cv.width=cv.height=96;
      const ks=Object.keys(EDEF).map(t=>({n:t,type:t,r:EDEF[t].r}));
      for(const w of WORLDS) if(w&&w.bosses) for(const B of w.bosses) ks.push({n:B.title,type:'boss',bid:B.id,look:B.look,r:B.r||30});
      ks.push({n:'champ',type:'goblin',champ:'swift',r:12});
      const err=console.error; for(const k of ks){ try{ Render.portrait(cv,k); const d=cv.getContext('2d').getImageData(0,0,96,96).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>40) n++; if(n<200) bad.push(k.n+':'+n);}catch(e){bad.push(k.n+':'+e.message)} }
      return ks.length+' drawn, weak or broken: '+(bad.join(', ')||'none');}"""))

    # traps and falls name themselves; a boss slam names the boss
    pg.evaluate("()=>{Game.newRun('SUMTRAP','fighter'); const W=World,p=W.players[0]; p.guard=false; p.inv=0; p.hp=1; W.hurt(p,1,null,{n:'Spike trap'});}")
    pg.wait_for_timeout(2200)
    print('trap', pg.evaluate("()=>document.querySelector('.killer').innerText.replace(/\\n/g,' | ')"))
    pg.evaluate("""()=>{Game.newRun('SUMBOSS','fighter'); const W=World,p=W.players[0]; const r=W.rooms.find(r=>r.type==='boss')||W.rooms[0]; W.spawnBoss(r); const e=W.boss; e.spawnT=0;
      W.foeCtx=e; const w=W.warn(p.x,p.y,40,0.01,1,'slam'); W.foeCtx=null; p.guard=false; p.inv=0; p.hp=1;}""")
    pg.wait_for_timeout(2500)
    print('boss', pg.evaluate("()=>document.querySelector('.killer')&&document.querySelector('.killer').innerText.replace(/\\n/g,' | ')"))
    pg.screenshot(path='sum_boss.png')

    # phone-size end screen
    ph = b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ph.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
    ph.goto(U); ph.wait_for_timeout(500)
    ph.evaluate("()=>{Game.newRun('SUMPHONE','ranger'); const W=World,p=W.players[0]; p.rs.atk=412; p.rs.dmg=8123; p.rs.best=96; p.rs.lost=13; p.rs.healed=6; p.kills=57; p.rs.wk={'Vaelith, Frost Longbow of Echoes':41,'Shortbow':16}; const e=W.makeEnemy('owlbear',0,0); p.guard=false; p.inv=0; p.hp=1; W.hurt(p,1,null,W.who(e))}")
    ph.wait_for_timeout(2200); ph.screenshot(path='sum_phone.png', full_page=True)
    print('phone overflow', ph.evaluate("()=>document.documentElement.scrollWidth>innerWidth"))

    # campaign results screen carries the summary too
    pg.evaluate("()=>{localStorage.clear();Campaign.create(0,'Tess','ranger');Campaign.start(0,1,false)}"); pg.wait_for_timeout(1200)
    pg.evaluate("()=>{const W=World,p=W.players[0]; p.guard=false; p.inv=0; p.hp=1; W.hurt(p,1,null,{n:'Poison gas'})}"); pg.wait_for_timeout(2500)
    print('campaign', pg.evaluate("()=>[document.querySelector('h1').textContent, document.querySelector('.killer')&&document.querySelector('.killer').innerText.replace(/\\n/g,' | '), document.querySelectorAll('.stats').length]"))
    pg.screenshot(path='sum_campaign.png')

    # co-op: two players over the QR handshake, both go down, both screens show both columns
    A = b.new_page(viewport={'width': 1100, 'height': 760}); B = b.new_page(viewport={'width': 844, 'height': 390})
    for n, q in (('A', A), ('B', B)):
        q.on('pageerror', lambda e, n=n: errs.append(n + ': ' + str(e))); q.goto(U); q.wait_for_timeout(500)
        q.evaluate("()=>{Meta.data.unlocks.ranger=1;Meta.data.unlocks.mage=1;Meta.save()}")
    A.click('#b-coop'); A.click('#c-qhost'); A.wait_for_timeout(300)
    inv = A.evaluate("async()=>await Net.qrInvite()")
    B.click('#b-coop'); B.evaluate("()=>{NetTest.qrMode=true;Coop.startGuest();NetTest.onDone=()=>Coop.lobbyScreen()}")
    rep = B.evaluate("async(s)=>await Net.qrReply(s)", inv)
    A.evaluate("async(s)=>{await Net.qrAcceptReply(s);Coop.lobbyScreen()}", rep)
    B.wait_for_timeout(2500); B.evaluate("()=>Coop.lobbyScreen()"); B.wait_for_timeout(300)
    A.click('#cl-fighter'); B.wait_for_timeout(300); B.click('#cl-mage'); B.wait_for_timeout(500)
    A.click('#c-start'); A.wait_for_timeout(2500)
    A.evaluate("""()=>{const W=World,[h,g]=W.players; h.rs.atk=30; g.rs.atk=55; g.rs.wk={'Wand of Sparks':9};
      for(const q of W.players){q.guard=false;q.inv=0;q.hp=1;}
      W.hurt(g,1,null,W.who(W.makeEnemy('stirge',0,0))); W.hurt(h,1,null,{n:'Spike trap'});}""")
    A.wait_for_timeout(2500)
    for n, q in (('host', A), ('guest', B)):
        print(n, q.evaluate("()=>[Game.state, document.querySelector('.sumtbl')?[...document.querySelectorAll('.sumtbl tr')].map(r=>r.innerText.replace(/\\s+/g,' ')).join(' / '):'no table']"))
    A.screenshot(path='sum_coop_host.png'); B.screenshot(path='sum_coop_guest.png', full_page=True)
    print('errors', errs[:6])
    b.close()

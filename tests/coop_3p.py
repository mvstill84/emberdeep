import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
import json
U=BASE+'/index.html'
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    A=b.new_page(viewport={'width':1100,'height':700}); B=b.new_page(viewport={'width':844,'height':390}); C=b.new_page(viewport={'width':900,'height':500})
    errs={'A':[],'B':[],'C':[]}
    for n,p in (('A',A),('B',B),('C',C)):
        p.on('pageerror',lambda e,n=n:errs[n].append(str(e))); p.on('console', lambda m,n=n: errs[n].append('console: '+m.text) if m.type=='error' else None)
        p.goto(U); p.wait_for_timeout(500)
        p.evaluate("()=>{Meta.data.unlocks.ranger=1;Meta.data.unlocks.mage=1;Meta.save()}")
    A.click('#b-coop'); A.click('#c-qhost'); A.wait_for_timeout(300)
    for G in (B,C):
        inv=A.evaluate("async()=>await Net.qrInvite()")
        G.click('#b-coop'); G.evaluate("()=>{NetTest.qrMode=true;Coop.startGuest();NetTest.onDone=()=>Coop.lobbyScreen()}")
        rep=G.evaluate("async(s)=>await Net.qrReply(s)",inv)
        A.evaluate("async(s)=>{await Net.qrAcceptReply(s);Coop.lobbyScreen()}",rep)
        G.wait_for_timeout(2500); G.evaluate("()=>Coop.lobbyScreen()"); G.wait_for_timeout(300)
    print('lobby host', A.evaluate("()=>JSON.stringify(Coop.lobby.map(l=>[l.slot,l.cls]))"), 'B slot', B.evaluate("()=>Coop.slot"), 'C slot', C.evaluate("()=>Coop.slot"))
    A.click('#cl-fighter'); B.wait_for_timeout(300)
    B.click('#cl-mage'); B.wait_for_timeout(500)
    print('C sees fighter disabled:', C.evaluate("()=>{Coop.lobbyScreen();return document.getElementById('cl-fighter').disabled+' '+document.getElementById('cl-mage').disabled}"))
    C.click('#cl-fighter') if False else None
    C.click('#cl-ranger'); C.wait_for_timeout(500)
    A.screenshot(path='co_lobby.png')
    print('lobby', A.evaluate("()=>JSON.stringify(Coop.lobby.map(l=>[l.slot,l.cls]))"))
    A.click('#c-start'); A.wait_for_timeout(2500)
    print('host players', A.evaluate("()=>World.players.map(p=>[p.slot,p.cls,p.src,Math.round(p.x),Math.round(p.y)])"), 'coopN', A.evaluate("()=>Game.coopN"))
    print('guest B', B.evaluate("()=>[Game.state, Coop.inRun, World.players.map(p=>[p.slot,p.cls,Math.round(p.x)]), World.meP().cls, Game.seed===null]"), 'seedmatch', A.evaluate("()=>Game.seed")==B.evaluate("()=>Game.seed"))
    # guest moves right
    B.keyboard.down('d'); B.wait_for_timeout(1000); B.keyboard.up('d'); B.wait_for_timeout(300)
    print('host sees P2 move', A.evaluate("()=>{const p=World.players.find(p=>p.slot===1);return Math.round(p.x)}"), 'guest sees self', B.evaluate("()=>Math.round(World.meP().x)"))
    # walk host into a combat room → doors lock, guests pulled in
    A.evaluate("()=>{const W=World,r=W.rooms.find(r=>r.type==='combat'),p=W.players[0];p.x=r.mx*32+16;p.y=r.my*32+16;for(const q of W.players)q.inv=3}")
    A.wait_for_timeout(2500)
    print('host locked', A.evaluate("()=>[World.locked, World.enemies.length, World.players.map(p=>World.roomAt(p.x,p.y)&&World.roomAt(p.x,p.y).id), World.room.id]"))
    print('guest C', C.evaluate("()=>[World.locked, World.enemies.length, World.enemies.slice(0,2).map(e=>e.D&&e.D.n), World.room&&World.room.id, World.parts.length]"))
    C.screenshot(path='co_guestC.png'); B.screenshot(path='co_guestB.png'); A.screenshot(path='co_host.png')
    # guest attacks (mouse) -> host sees projectile/mage shots
    C.mouse.move(600,250); C.mouse.down(); C.wait_for_timeout(800); C.mouse.up()
    print('host projs after C attack', A.evaluate("()=>World.projs.filter(p=>p.owner==='p').length"))
    # pause from guest
    B.keyboard.press('Escape'); B.wait_for_timeout(600)
    print('pause', A.evaluate("()=>[Game.state, Coop.pausedBy]"), B.evaluate("()=>Game.state"), C.evaluate("()=>[Game.state, document.querySelector('.panel h2')&&document.querySelector('.panel h2').textContent]"))
    C.evaluate("()=>{document.getElementById('b-res').click()}"); C.wait_for_timeout(600)
    print('resumed', A.evaluate("()=>Game.state"), B.evaluate("()=>Game.state"))
    # downed + revive
    A.evaluate("()=>{const W=World,q=W.players.find(p=>p.slot===1);q.inv=0;q.guard=false;q.hp=1;W.hurt(q,1)}")
    A.wait_for_timeout(300)
    print('downed', A.evaluate("()=>World.players.map(p=>[p.slot,p.downed])"), B.evaluate("()=>World.meP().downed"))
    A.evaluate("()=>{const W=World,q=W.players.find(p=>p.slot===1),h=W.players[0];h.x=q.x+10;h.y=q.y}")
    A.wait_for_timeout(3600)
    print('revived', A.evaluate("()=>World.players.map(p=>[p.slot,p.downed,p.hp])"))
    print('errors', {k:v[:4] for k,v in errs.items()})
    b.close()

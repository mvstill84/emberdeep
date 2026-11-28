import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
U=BASE+'/index.html'
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    A=b.new_page(viewport={'width':1100,'height':700}); B=b.new_page(viewport={'width':900,'height':500})
    for p in (A,B): p.goto(U); p.wait_for_timeout(400); p.evaluate("()=>{Meta.data.unlocks.ranger=1;Meta.data.unlocks.mage=1}")
    A.evaluate("()=>{NetTest.qrMode=true;Coop.startHosting();Net.reset();Net.role='host';Net.mySlot=0;Net.code='QR';NetTest.onDone=()=>Coop.lobbyScreen();Coop.lobbyScreen()}")
    inv=A.evaluate("async()=>await Net.qrInvite()")
    B.evaluate("()=>{NetTest.qrMode=true;Coop.startGuest();NetTest.onDone=()=>Coop.lobbyScreen()}")
    rep=B.evaluate("async(s)=>await Net.qrReply(s)",inv); A.evaluate("async(s)=>{await Net.qrAcceptReply(s);Coop.lobbyScreen()}",rep)
    B.wait_for_timeout(2000); B.evaluate("()=>Coop.lobbyScreen()")
    A.click('#cl-fighter'); B.wait_for_timeout(300); B.click('#cl-ranger'); A.wait_for_timeout(500); A.click('#c-start'); A.wait_for_timeout(2000)
    B.mouse.move(700,250); B.mouse.down()
    for i in range(5):
        B.wait_for_timeout(200)
        print(A.evaluate("()=>{const q=World.players[1],m=Coop.inputs[1];return [q.cls,q.wi,q.weapons[q.wi].type,Math.round(q.charge*100)/100,m&&m.atk,m&&m.dev,m&&m.aim, q.cd, World.projs.length]}"), B.evaluate("()=>[Input.mouse.l, Game.state]"))
    B.mouse.up(); B.wait_for_timeout(150)
    print('after release', A.evaluate("()=>[World.projs.length, World.players[1].charge]"))
    A.evaluate("()=>{const p=World.players[0];World.burst(p.x,p.y,40,'#ff0000',200,2);Snd.play('item')}")
    B.wait_for_timeout(400)
    print('guest parts', B.evaluate("()=>World.parts.length"), 'host ev queued', A.evaluate("()=>Coop.ev.length"))
    # portal: host steps in first, waits; guest presses E at the portal
    A.evaluate("()=>{const W=World,p=W.players[0],q=W.players[1];W.rooms.forEach(r=>{r.cleared=true;r.waves=[]});W.enemies=[];W.locked=false;W.pickups.push({kind:'portal',x:p.x+50,y:p.y,t:1,last:false});q.x=p.x+50;q.y=p.y+20;p.x=p.x+50;}")
    A.wait_for_timeout(400)
    A.keyboard.press('e'); A.wait_for_timeout(500)
    print('host in portal', A.evaluate("()=>[World.players[0].inPortal, World.level]"), 'guest sees', B.evaluate("()=>World.players.map(p=>p.inPortal)"))
    A.screenshot(path='co_hold.png')
    B.keyboard.press('e'); B.wait_for_timeout(1500)
    print('next level', A.evaluate("()=>[World.world,World.level,World.players.map(p=>p.inPortal)]"), B.evaluate("()=>[World.world,World.level,Game.state]"))
    # end of run: everyone down
    A.evaluate("()=>{for(const q of World.players){q.inv=0;q.guard=false;q.hp=1;q.revives=0;World.hurt(q,1)}}")
    A.wait_for_timeout(2500)
    print('end', A.evaluate("()=>[Game.state]"), B.evaluate("()=>[Game.state, document.querySelector('.panel h1')&&document.querySelector('.panel h1').textContent, Coop.inRun]"))
    B.screenshot(path='co_end.png')
    b.close()

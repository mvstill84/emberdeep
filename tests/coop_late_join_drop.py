import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
U=BASE+'/index.html'
def link(A,G):
    inv=A.evaluate("async()=>await Net.qrInvite()")
    G.evaluate("()=>{NetTest.qrMode=true;Coop.startGuest();NetTest.onDone=()=>Coop.lobbyScreen()}")
    rep=G.evaluate("async(s)=>await Net.qrReply(s)",inv); A.evaluate("async(s)=>{await Net.qrAcceptReply(s)}",rep)
    G.wait_for_timeout(2000); G.evaluate("()=>Coop.lobbyScreen()")
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    A=b.new_page(viewport={'width':1100,'height':700}); B=b.new_page(viewport={'width':900,'height':500}); C=b.new_page(viewport={'width':900,'height':500})
    errs=[]
    for p in (A,B,C): p.on('pageerror',lambda e:errs.append(str(e))); p.goto(U); p.wait_for_timeout(400); p.evaluate("()=>{Meta.data.unlocks.ranger=1;Meta.data.unlocks.mage=1}")
    A.evaluate("()=>{NetTest.qrMode=true;Coop.startHosting();Net.reset();Net.role='host';Net.mySlot=0;Net.code='QR';NetTest.onDone=()=>Coop.lobbyScreen();Coop.lobbyScreen()}")
    link(A,B); A.evaluate("()=>Coop.lobbyScreen()")
    A.click('#cl-mage'); B.wait_for_timeout(300); B.click('#cl-fighter'); A.wait_for_timeout(400); A.click('#c-start'); A.wait_for_timeout(1500)
    print('2p run', A.evaluate("()=>[Game.coopN, World.players.length]"))
    # C joins mid-run
    link(A,C); C.wait_for_timeout(500)
    print('C lobby', C.evaluate("()=>[Coop.hostInRun, document.querySelector('.panel .sub').innerText.slice(0,90)]"))
    C.click('#cl-ranger'); C.wait_for_timeout(500)
    print('pending', A.evaluate("()=>Coop.pending.map(l=>l.slot+':'+l.cls)"))
    A.evaluate("()=>Game.nextLevel(false)"); A.wait_for_timeout(1500)
    print('after next', A.evaluate("()=>[World.level, World.players.map(p=>p.slot+':'+p.cls), Game.coopN]"), C.evaluate("()=>[Game.state, World.meP()&&World.meP().cls, World.level]"))
    # B drops
    B.close(); A.wait_for_timeout(8000)
    print('after B left', A.evaluate("()=>[World.players.map(p=>p.slot), Coop.lobby.map(l=>l.slot)]"), C.evaluate("()=>World.players.map(p=>p.slot)"))
    print('errors', errs[:5]); b.close()

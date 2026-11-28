import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
U=BASE+'/index.html'
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    A=b.new_page(viewport={'width':1000,'height':640}); B=b.new_page(viewport={'width':844,'height':390})
    errs=[]
    for p in (A,B): p.on('pageerror',lambda e:errs.append(str(e))); p.goto(U); p.wait_for_timeout(600)
    inv=A.evaluate("async()=>{NetTest.qrMode=true;return await Net.qrInvite()}"); print('invite len',len(inv))
    # QR round trip through an actual image
    print('qr decode ok', A.evaluate("""async(s)=>{const cv=document.createElement('canvas');await QR.draw(cv,s);await QR.load('vendor/jsqr.min.js','jsQR');const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);const r=jsQR(d.data,cv.width,cv.height);return r&&r.data===s}""", inv))
    rep=B.evaluate("async(s)=>await Net.qrReply(s)", inv); print('reply len',len(rep))
    A.evaluate("async(s)=>{await Net.qrAcceptReply(s);NetTest.arena()}", rep)
    B.wait_for_timeout(2500)
    B.evaluate("()=>NetTest.arena()")
    print('open', A.evaluate("()=>Net.peers.map(p=>[p.slot,p.open,p.link])"), B.evaluate("()=>[Net.mySlot,Net.peers[0].open,Net.peers[0].link]"))
    B.keyboard.down('d'); B.wait_for_timeout(1200); B.keyboard.up('d')
    print('host sees guest', A.evaluate("()=>JSON.stringify(NetTest.pos)"))
    print('guest sees', B.evaluate("()=>JSON.stringify(Object.fromEntries(Object.entries(NetTest.pos).map(([k,o])=>[k,[Math.round(o.x),Math.round(o.y)]])))"))
    A.wait_for_timeout(1500); A.screenshot(path='net_host.png'); B.screenshot(path='net_guest.png')
    # third player
    C=b.new_page(viewport={'width':800,'height':400}); C.on('pageerror',lambda e:errs.append(str(e))); C.goto(U); C.wait_for_timeout(500)
    inv2=A.evaluate("async()=>await Net.qrInvite()"); rep2=C.evaluate("async(s)=>await Net.qrReply(s)",inv2); A.evaluate("async(s)=>{await Net.qrAcceptReply(s);NetTest.arena()}",rep2)
    C.wait_for_timeout(2000); C.evaluate("()=>NetTest.arena()"); C.wait_for_timeout(1500)
    print('3p', A.evaluate("()=>Object.keys(NetTest.pos)"), C.evaluate("()=>[Net.mySlot,Object.keys(NetTest.pos)]"))
    print('4th refused', A.evaluate("async()=>await Net.qrInvite()"))
    print('online host w/o internet:', A.evaluate("async()=>{const ok=await Net.host();return [ok,Net.status]}"))
    print('errors',errs[:5]); b.close()

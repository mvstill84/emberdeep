import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html')
    pg.evaluate("()=>{localStorage.clear();Campaign.create(0,'Tess','ranger');Campaign.start(0,1,false)}"); pg.wait_for_timeout(1200)
    print(pg.evaluate("""()=>{const W=World,p=W.players[0];
      for(const [t,id] of [['weapon',null],['relic','hourglass']]){const k=t==='weapon'?{kind:'weapon',w:makeWeapon(RNG(7),{type:'staff',rarity:3})}:{kind:'relic',id:RELICS[0].id};Object.assign(k,{x:p.x,y:p.y,t:1});W.pickups.push(k);W.updPickups(0.016);W.toBag(p);}
      Campaign.finish(false);const h=Campaign.hero(0);return [JSON.stringify(h.corpse.loot.relics),h.corpse.loot.weapons.map(w=>w.name),h.stash.weapons.length]}"""))
    pg.evaluate("()=>Campaign.start(0,1,true)"); pg.wait_for_timeout(1200)
    print(pg.evaluate("""()=>{const W=World,p=W.players[0],k=W.pickups.find(k=>k.kind==='corpse');if(!k)return 'no corpse';p.x=k.x;p.y=k.y;k.t=1;W.updPickups(0.016);W.interact(p);return W.pickups.filter(k=>k.kind==='weapon'||k.kind==='relic').map(k=>k.kind)}"""))
    print('errors',errs); b.close()

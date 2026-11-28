import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    print('rarity % by depth', pg.evaluate("""()=>{Game.diff=Game.DIFF.quick;const out={};for(const d of [1,2,3,4,6,9]){const c=[0,0,0,0,0];const rng=RNG(7);for(let i=0;i<4000;i++)c[rollRarity(rng,d,'room')]++;out[d]=c.map(x=>Math.round(x/40))}return JSON.stringify(out)}"""))
    print('sword dmg by ilvl', pg.evaluate("""()=>{const r=[];for(const d of [1,4,7,10]){let s=0;for(let i=0;i<200;i++)s+=makeWeapon(RNG(i),{type:'sword',rarity:0,depth:d}).dmg;r.push(d+':'+Math.round(s/200))}return r.join(' ')}"""))
    pg.evaluate("()=>{Game.newRun('MINORS','fighter')}"); pg.wait_for_timeout(500)
    print(pg.evaluate("""()=>{const W=World,p=W.players[0];const before=Math.round(p.st.meleeDmg*100);
      for(let i=0;i<7;i++){W.pickups.push({kind:'item',item:ITEMS.find(x=>x.id==='m_whet'),x:p.x,y:p.y,t:1});W.updPickups(0.016);}
      W.pickups.push({kind:'item',item:ITEMS.find(x=>x.id==='m_shard'),x:p.x,y:p.y,t:1});W.updPickups(0.016);
      const d0=Math.round(p.weapons[0].dmg*10)/10;
      for(let i=0;i<4;i++){W.pickups.push({kind:'stone',x:p.x,y:p.y,t:1});W.updPickups(0.016);}
      return ['whet x'+p.items.filter(x=>x==='m_whet').length, before+'->'+Math.round(p.st.meleeDmg*100), 'mana '+p.maxMana, 'w0 '+d0+'->'+Math.round(p.weapons[0].dmg*10)/10+' '+p.weapons[0].name, 'w1 '+p.weapons[1].name, 'embers '+Game.runEmbers]}"""))
    pg.wait_for_timeout(300); pg.screenshot(path='loot_hud.png')
    # merchant screen
    pg.evaluate("()=>{World.merchant=Merchant.stock(3);Game.runEmbers=500;Game.state='menu';CampScreens.merchant()}"); pg.wait_for_timeout(300)
    pg.screenshot(path='loot_merchant.png')
    pg.evaluate("()=>document.querySelector('#menu [id^=m-]').click()"); pg.wait_for_timeout(200)
    print('after first buy', pg.evaluate("()=>[World.players[0].weapons[0].name, Game.runEmbers]"))
    pg.evaluate("()=>{Game.state='play';Menu.hide();Game.togglePause()}"); pg.wait_for_timeout(300); pg.screenshot(path='loot_pause.png')
    print('errors', errs[:5]); b.close()

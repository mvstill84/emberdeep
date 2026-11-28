import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    ctx=b.new_context(viewport={'width':844,'height':390},device_scale_factor=2,has_touch=True,is_mobile=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{Game.newRun('HUDT','fighter');World.startLevel(1,2,true);Input.last='touch';const W=World,p=W.players[0];
      p.weapons.push(makeWeapon(RNG(3),{depth:2,type:'hammer',rarity:3}));
      W.pickups.push({kind:'weapon',w:makeWeapon(RNG(9),{depth:2,type:'bow',rarity:2}),x:p.x,y:p.y+4,t:0});}""")
    pg.wait_for_timeout(800); pg.screenshot(path='m_hud.png')
    print(pg.evaluate("()=>[World.near&&World.near.kind, useLabel(World.near)]"))
    pg.evaluate("()=>{World.pickups=[];const p=World.players[0];World.pickups.push({kind:'potion',id:POTIONS[0].id,x:p.x,y:p.y+4,t:0})}"); pg.wait_for_timeout(500); pg.screenshot(path='m_pot.png')
    pg.evaluate("()=>{World.merchant=Merchant.stock(3);Game.state='menu';CampScreens.merchant()}"); pg.wait_for_timeout(400); pg.screenshot(path='m_shop.png')
    pg.evaluate("()=>{Game.state='play';Menu.hide&&Menu.hide();Game.togglePause()}"); pg.wait_for_timeout(400); pg.screenshot(path='m_pause.png')
    print('resume visible', pg.evaluate("()=>{const r=document.getElementById('b-res').getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom),innerHeight]}"))
    print('errors',errs[:3]); b.close()

import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html')
    pg.evaluate("()=>{localStorage.clear();Meta.data.camp=undefined;Campaign.create(0,'Tess','fighter');Campaign.start(0,1,false)}")
    pg.wait_for_timeout(1500)
    pg.evaluate("()=>{const W=World,r=W.rooms.find(r=>r.type==='combat');const p=W.players[0];p.x=r.mx*32+16;p.y=r.my*32+16;p.inv=99}")
    pg.wait_for_timeout(1800)
    pg.screenshot(path='h_pc.png')
    # cube + slime
    r=pg.evaluate("""()=>{const W=World,p=W.players[0];W.enemies=[];W.locked=true;const e=W.makeEnemy('cube',p.x+150,p.y);e.spawnT=0;W.enemies.push(e);return e.r}""")
    pg.wait_for_timeout(2500)
    print('cube r',r,'slime',pg.evaluate("()=>World.slime.length"))
    pg.screenshot(path='h_cube.png')
    print('split',pg.evaluate("""()=>{const W=World,p=W.players[0],e=W.enemies.find(e=>e.type==='cube');W.damage(e,9999,{x:p.x,y:p.y,p});return W.enemies.filter(e=>!e.dead).map(e=>e.type)}"""))
    pg.wait_for_timeout(600)
    print('slime after death',pg.evaluate("()=>World.slime.length"))
    print('slimed',pg.evaluate("()=>{const W=World,p=W.players[0];W.slime.push({x:p.x,y:p.y,r:20,life:5,max:5});W.updHazards(0.016);return p.slimed}"))
    # guard
    print('guard',pg.evaluate("()=>{const W=World,p=W.players[0];p.inv=0;const h=p.hp;W.hurt(p,1);const a=[p.guard,p.hp===h];p.inv=0;W.hurt(p,1);a.push(p.hp<h);p.inv=99;return a}"))
    # bag
    print('bag',pg.evaluate("""()=>{const W=World,p=W.players[0];W.enemies=[];W.locked=false;const w=makeWeapon(RNG(5),{type:'axe',rarity:2});W.pickups.push({kind:'weapon',w,x:p.x,y:p.y,t:1});W.updPickups(0.016);const can=W.canBag();W.toBag(p);return [can,Game.bag.weapons.map(x=>x.name)]}"""))
    pg.evaluate("()=>Game.togglePause()"); pg.wait_for_timeout(300); pg.screenshot(path='h_pause.png'); pg.evaluate("()=>Game.togglePause()")
    # swap in a new weapon, then win
    print('win',pg.evaluate("""()=>{const W=World,p=W.players[0];const w=makeWeapon(RNG(9),{type:'hammer',rarity:1});p.weapons[0]=w;Campaign.finish(true);const h=Campaign.hero(0);return [h.stash.weapons.length,h.load.w.join()===p.weapons.map(x=>x.uid).join(),Campaign.loadoutWeapons(h).map(x=>x.name)]}"""))
    pg.wait_for_timeout(300); pg.screenshot(path='h_done.png')
    # mage mana + touch layout
    pg.set_viewport_size({'width':844,'height':390})
    pg.evaluate("()=>{Campaign.create(1,'Mira','mage');Campaign.start(1,1,false)}"); pg.wait_for_timeout(1500)
    print('mana',pg.evaluate("()=>{const W=World,p=W.players[0];p.mana=0;p.exhausted=true;let t=0;while(p.exhausted&&t<30){W.updPlayer(p,0.05,{mx:0,my:0,aim:0});t+=0.05}return [p.maxMana,Math.round(p.mana),t.toFixed(1)]}"))
    pg.evaluate("()=>{Input.last='touch';const p=World.players[0];p.mana=40}"); pg.wait_for_timeout(500)
    pg.screenshot(path='h_touch.png')
    print('errors',errs)
    b.close()

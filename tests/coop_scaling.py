import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page()
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    print(pg.evaluate("""async()=>{Game.coopN=3;Game.newRun('BIGFIGHT','mage');World.startLevel(2,3,true);const W=World,p=W.players[0];p.inv=999;
      const r=W.rooms.find(r=>r.type==='combat');p.x=r.mx*32+16;p.y=r.my*32+16;
      for(let i=0;i<25;i++){const e=W.makeEnemy('skelArcher',p.x+Math.cos(i)*150,p.y+Math.sin(i)*150);e.spawnT=0;W.enemies.push(e);}
      await new Promise(r=>setTimeout(r,4000));
      Coop.on=true;Coop.host=true;Coop.inRun=true;const s=JSON.stringify(Coop.snapshot());Coop.on=false;Coop.inRun=false;
      return [W.enemies.length, W.projs.length, s.length]}"""))
    b.close()

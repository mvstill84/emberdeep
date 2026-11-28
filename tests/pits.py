import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
JS = """async(mode)=>{
 Game.newRun('PITS','fighter'); const W=World; let found=null;
 for (let s=0;s<40&&!found;s++){ World.startLevel(2,1+(s%3),true); for(const r of W.rooms){ if(!r.chasm) continue;
   // find a floor tile with chasm directly to the right, and floor beyond a 2-wide gap / 3-wide gap
   for(let y=r.y+1;y<r.y+r.h-1&&!found;y++) for(let x=r.x+1;x<r.x+r.w-5;x++){ const m=i=>W.map[y*MW+i];
     const g=mode==='roll3'?3:2; let ok=m(x)===FLOOR&&m(x-1)===FLOOR; for(let k=1;k<=g;k++) ok=ok&&m(x+k)===CHASM; ok=ok&&m(x+g+1)===FLOOR&&m(x+g+2)===FLOOR;
     if(ok){found={r,x,y};break;} } } }
 if(!found) return 'no gap';
 const p=W.players[0], {r,x,y}=found; W.rooms.forEach(q=>{q.cleared=true;q.waves=[]}); W.enemies=[]; W.room=null; W.locked=false;
 p.x=x*T+T-p.r-1; p.y=y*T+T/2; p.inv=0; p.guard=false; p.guardT=-999; let falls=0; const fi=W.fallIn.bind(W); let fl=[]; W.fallIn=q=>{falls++;fl.push([q.x/T,q.safeX/T,q.roll,q.lunge].map(v=>Math.round(v*100)/100));fi(q)}; const hp0=p.hp;
 const fake={mx:0,my:0,roll:false}; const orig=Input.read.bind(Input); Input.read=(s,q)=>Object.assign(orig(s,q),{mx:fake.mx,my:fake.my,roll:fake.roll,aim:null,attack:false});
 const wait=ms=>new Promise(r=>setTimeout(r,ms)); let out={};
 if(mode==='tap'){ fake.mx=1; await wait(150); fake.mx=0; await wait(600); out={fell:hp0-p.hp, x:Math.round(p.x/T*10)/10, startTile:x}; }
 if(mode==='push'){ fake.mx=1; await wait(900); fake.mx=0; await wait(400); out={fell:hp0-p.hp, tile:W.tile(p.x,p.y), x:Math.round(p.x/T*10)/10, startTile:x}; }
 if(mode.startsWith('roll')){ fake.mx=1; fake.roll=true; await wait(60); fake.roll=false; await wait(300); fake.mx=0; await wait(600); out={fell:hp0-p.hp, x:Math.round(p.x/T*10)/10, startTile:x}; }
 if(mode==='shove'||mode==='champ'){ p.x=(x-3)*T+T/2; const e=mode==='champ'?W.makeChampion(RNG(5),x*T+T/2,y*T+T/2):W.makeEnemy('goblin',x*T+T/2,y*T+T/2); e.spawnT=0; e.kx=600; W.enemies=[e]; await wait(500); out={dead:e.dead, hpFrac:Math.round(e.hp/e.maxHp*100), tile:W.tile(e.x,e.y)}; }
 if(mode==='hit'){ W.hurt(p,1,{x:p.x-20,y:p.y}); const tr=[]; for(let i=0;i<6;i++){tr.push([Math.round(p.x),Math.round(p.pushX||0),W.tile(p.x,p.y)]); await wait(100);} out={lost:hp0-p.hp,tr,edge:(x+1)*T}; }
 Input.read=orig; W.fallIn=fi; out.falls=falls; out.fl=fl; return out;}"""
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    for m in ['tap','push','roll2','roll3','shove','champ','hit']: print(m, pg.evaluate(JS,m))
    print('errors',errs[:3]); b.close()

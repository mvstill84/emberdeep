import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    print(pg.evaluate("""async()=>{Game.newRun('BAL','fighter');World.startLevel(2,2,true);const W=World,p=W.players[0];W.rooms.forEach(q=>{q.cleared=true;q.waves=[]});
     const mk=t=>{const e=W.makeEnemy(t,p.x+40,p.y);e.spawnT=0;W.enemies=[e];return e};
     const out={};
     let e=mk('goblin'); W.damage(e,9999,{x:p.x,y:p.y,p,melee:true,wtype:'sword',elem:'none'}); out.floor=[e.dead, Math.round(e.hp/e.maxHp*100)];
     e=mk('goblin'); W.damage(e,9999,{x:p.x,y:p.y,p,melee:true,wtype:'sword',elem:'none',crit:true}); out.critKills=e.dead;
     const hit=(t,src)=>{const e=mk(t);e.hp=e.maxHp*0.5;const h=e.hp;W.damage(e,10,Object.assign({x:p.x,y:p.y,p,elem:'none'},src));return Math.round((h-e.hp)*10)/10};
     out.skelSword=hit('skeleton',{melee:true,wtype:'sword'}); out.skelHammer=hit('skeleton',{melee:true,wtype:'hammer',blunt:true}); out.goblinSword=hit('goblin',{melee:true,wtype:'sword'}); out.zombieFireSpear=hit('zombie',{melee:true,wtype:'spear',elem:'fire'});
     e=mk('gnoll'); const S={x:p.x,y:p.y,p,melee:true,wtype:'hammer',blunt:true,elem:'none',stun:0.9}; e.hp=1e6;e.maxHp=1e6; W.damage(e,1,S); const s1=e.stun; await new Promise(r=>setTimeout(r,1000)); W.damage(e,1,S); const s2=e.stun; await new Promise(r=>setTimeout(r,2100)); W.damage(e,1,S); out.stun=[s1,Math.round(s2*100)/100,e.stun];
     const rng=RNG(7); const by=[0,0,0,0,0].map(()=>({d:0,q:0,n:0}));
     for(let i=0;i<400;i++){const r=i%5; const w=makeWeapon(rng,{depth:1,rarity:r,type:'sword'}); by[r].d+=w.dmg; by[r].q+=w.quirks.length; by[r].n++;}
     out.rar=by.map(b=>[Math.round(b.d/b.n*10)/10, Math.round(b.q/b.n*10)/10]);
     return out;}"""))
    print('errors',errs[:3]); b.close()

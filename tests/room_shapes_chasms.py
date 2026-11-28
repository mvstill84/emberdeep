import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    r=pg.evaluate("""()=>{const out={shapes:{},chasm:{},gauntletChasm:[0,0],bad:0,levels:0};
      for(let s=0;s<30;s++){Game.newRun('ROOMS'+s,'fighter');for(const [w,l] of [[1,2],[2,1],[2,3],[3,2],[4,2]]){World.startLevel(w,l,true);out.levels++;
        const R=World.rooms,W=World;
        for(const r of R){if(r.shape)out.shapes[r.shape]=(out.shapes[r.shape]||0)+1;if(r.chasm)out.chasm[r.shape]=(out.chasm[r.shape]||0)+1;if(r.route==='gauntlet'){out.gauntletChasm[1]++;if(r.chasm)out.gauntletChasm[0]++}}
        // walkable connectivity across the whole level: start -> exit
        const st=R.find(r=>r.type==='start'),en=R.find(r=>r.type==='boss'||r.type==='exit');const m=W.map,seen=new Uint8Array(m.length);
        const s0=Math.round(st.my)*MW+Math.round(st.mx),q=[s0];seen[s0]=1;const ok=t=>t===FLOOR||t===DOOR||t===PILLAR;
        while(q.length){const i=q.pop(),x=i%MW,y=(i-x)/MW;for(const [dx,dy] of DIRS){const j=(y+dy)*MW+x+dx;if(!seen[j]&&ok(m[j])){seen[j]=1;q.push(j)}}}
        if(!en.doors.some(i=>seen[i]))out.bad++;}}
      return out}""")
    print(json.dumps(r))
    # screenshot a gauntlet room with chasms
    pg.evaluate("""()=>{for(let s=0;s<40;s++){Game.newRun('GAUNT'+s,'mage');World.startLevel(2,2,true);const r=World.rooms.find(r=>r.route==='gauntlet'&&r.chasm&&r.shape==='big');if(r){const p=World.players[0];p.inv=999;World.rooms.forEach(q=>{q.cleared=true;q.waves=[]});p.x=r.x*32+64;p.y=r.my*32+16;Render.zoom&&0;return}}}""")
    pg.wait_for_timeout(1500); pg.screenshot(path='gt_room.png')
    print('errors',errs[:3]); b.close()

import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome')); pg=b.new_page(viewport={'width':1280,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html'); pg.wait_for_timeout(400)
    r=pg.evaluate("""()=>{const out={routes:{},combos:{},sides:{},bad:0,rooms:[],champ:0,levels:0};
      for(let s=0;s<40;s++){Game.newRun('LAYOUT'+s,'fighter');for(const [w,l] of [[1,1],[1,2],[2,1],[2,3],[3,2],[4,3]]){World.startLevel(w,l,true);out.levels++;
        const R=World.rooms, st=R.find(r=>r.type==='start'), end=R.find(r=>r.type==='boss'||r.type==='exit');
        const seen=new Set([st.id]),q=[st.id];while(q.length){const id=q.shift();for(const n of R[id].links)if(!seen.has(n)){seen.add(n);q.push(n)}} if(!seen.has(end.id))out.bad++;
        const rt=[...new Set(R.filter(r=>r.route).map(r=>r.routeIdx+':'+r.route))].map(x=>x.split(':')[1]).sort().join('+');out.combos[rt]=(out.combos[rt]||0)+1;
        for(const r of R){if(r.route)out.routes[r.route]=(out.routes[r.route]||0)+1;if(r.side)out.sides[r.type]=(out.sides[r.type]||0)+1;if(r.champion)out.champ++;}
        out.rooms.push(R.length);}}
      out.rooms=[Math.min(...out.rooms),Math.max(...out.rooms),Math.round(out.rooms.reduce((a,b)=>a+b)/out.rooms.length*10)/10];return out}""")
    print(json.dumps(r))
    pg.evaluate("()=>{Game.newRun('SIGNS','fighter');World.startLevel(2,2,true)}"); pg.wait_for_timeout(1500)
    pg.screenshot(path='rt_start.png')
    print('errors',errs[:3]); b.close()

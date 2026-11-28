import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
import asyncio
from playwright.async_api import async_playwright
JS_TP = '''(id)=>{const W=__emberdeep.World,r=W.rooms[id],p=W.players[0];p.x=r.mx*32+16;p.y=r.my*32+16+(r.type==='boss'?64:0);p.inv=99;return r.type}'''
JS_KILL = '''()=>{const W=__emberdeep.World;for(const e of W.enemies){if(e.spawnT<=0){W.damage(e,99999,{x:e.x,y:e.y,p:W.players[0],blunt:true})}}return [W.enemies.length,W.locked]}'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        await pg.goto('file:///home/claude/emberdeep/index.html')
        await pg.evaluate("()=>{const M=__emberdeep.Meta;M.data.unlocks={codexE:1,codexA:1,relics:1,ranger:1,mage:1}}")
        await pg.evaluate("()=>__emberdeep.Game.newRun('TESTSEED','ranger')")
        for lv in range(9):
            info = await pg.evaluate("()=>{const W=__emberdeep.World;return [W.world,W.level,W.rooms.map(r=>r.type).join(',')]}")
            print('level', info)
            order = await pg.evaluate("()=>__emberdeep.World.rooms.map((r,i)=>i).sort((a,b)=>(__emberdeep.World.rooms[a].type==='boss')-(__emberdeep.World.rooms[b].type==='boss'))")
            shot=False
            for rid in order:
                t = await pg.evaluate(JS_TP, rid)
                await pg.wait_for_timeout(1600 if (t=='combat' and not shot) else 300)
                if t=='combat' and not shot:
                    await pg.screenshot(path=f'/home/claude/test/w_{info[0]}_{info[1]}.png'); shot=True
                for k in range(60):
                    await pg.wait_for_timeout(150)
                    st = await pg.evaluate(JS_KILL)
                    if not st[1] and st[0]==0: break
                if t=='boss' and info[1]==3:
                    await pg.screenshot(path=f'/home/claude/test/boss_{info[0]}.png')
                await pg.evaluate('''()=>{const W=__emberdeep.World,p=W.players[0];for(let g=0;g<4;g++){const k=W.pickups.find(k=>k.kind==='chest'||k.kind==='item'||(k.kind==='weapon'&&k.group));if(!k)break;p.x=k.x;p.y=k.y;W.updPickups(0.016);W.interact(p);}}''')
            st = await pg.evaluate("()=>{const W=__emberdeep.World,p=W.players[0];return {cleared:W.rooms.filter(r=>r.cleared).length+'/'+W.rooms.length,items:p.items.length,weapons:p.weapons.map(w=>w.name+' ['+RARITY[w.rarity].n+']'),embers:__emberdeep.Game.runEmbers}}")
            print('  ', st)
            await pg.evaluate("()=>{const W=__emberdeep.World,p=W.players[0],k=W.pickups.find(k=>k.kind==='portal');if(k){p.x=k.x;p.y=k.y;k.t=1;W.updPickups(0.016);W.interact(p);W.interact(p)}}")
            await pg.wait_for_timeout(1500)
            s = await pg.evaluate("()=>__emberdeep.Game.state")
            if s!='play': print('state',s); break
        print('\n'.join(errs[:20]))
        await b.close()
asyncio.run(main())

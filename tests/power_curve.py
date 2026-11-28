import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
# Bot run that loots like a player: grabs small items and stones, opens chests, keeps the two strongest weapons.
# At each level it prints: your typical hit vs. how much health common foes have here.
import asyncio, sys, json
from playwright.async_api import async_playwright
CLS = sys.argv[1] if len(sys.argv)>1 else 'fighter'
SEED = sys.argv[2] if len(sys.argv)>2 else 'POWERCURVE'
TP = '''(id)=>{const W=World,r=W.rooms[id],p=W.players[0];p.x=r.mx*32+16;p.y=r.my*32+16+(r.type==='boss'?64:0);p.inv=99;return r.type}'''
KILL = '''()=>{const W=World;for(const e of W.enemies){if(e.spawnT<=0){W.damage(e,1e7,{x:e.x,y:e.y,p:W.players[0],blunt:true})}}return [W.enemies.length,W.locked]}'''
LOOT = '''()=>{const W=World,p=W.players[0];
  const score=w=>{const per=w.type==='bow'?w.charge:w.cd;let s=w.dmg/Math.max(0.15,per);if(w.quirks.includes('twin'))s*=1.2;if(w.quirks.includes('echo'))s*=1.45;if(w.elem!=='none')s*=1.15;return s};
  for(let g=0;g<40;g++){const k=W.pickups.find(k=>(k.kind==='item'&&k.item&&k.item.minor)||k.kind==='stone'||k.kind==='heart'||k.kind==='half'||k.kind==='key');if(!k)break;p.x=k.x;p.y=k.y;k.t=5;W.updPickups(0.016);}
  for(let g=0;g<6;g++){const k=W.pickups.find(k=>k.kind==='chest'||k.kind==='lockchest'||(k.kind==='item'&&!k.item.minor));if(!k)break;p.x=k.x;p.y=k.y;k.t=5;W.updPickups(0.016);W.interact(p);}
  for(const k of W.pickups.filter(k=>k.kind==='weapon')){const worst=p.weapons.reduce((a,w,i)=>score(w)<score(p.weapons[a])?i:a,0);
    if(score(k.w)>score(p.weapons[worst])){p.wi=worst;p.x=k.x;p.y=k.y;k.t=5;W.updPickups(0.016);W.interact(p);}}
  const best=p.weapons.reduce((a,w)=>score(w)>score(a)?w:a,p.weapons[0]);
  const cm=best.cat==='melee'?p.st.meleeDmg:best.cat==='ranged'?p.st.rangedDmg:p.st.magicDmg;
  const crit=1+((best.crit||0)+p.st.crit)*(p.st.critMult-1);
  const hit=best.dmg*p.st.dmg*cm*crit*(best.type==='bow'?1.3:1);
  const hpOf=t=>W.makeEnemy(t,0,0).maxHp;
  return {lvl:W.world+'-'+W.level, best:best.name+' ['+RARITY[best.rarity].n+' i'+(best.ilvl||1)+']', hit:Math.round(hit), dps:Math.round(score(best)*p.st.dmg*cm*crit*p.st.rate), minors:p.items.filter(i=>i.startsWith('m_')).length, majors:p.items.filter(i=>!i.startsWith('m_')).length,
    goblin:Math.round(hpOf('goblin')), skeleton:Math.round(hpOf('skeleton')), gnoll:Math.round(hpOf('gnoll')), zombie:Math.round(hpOf('zombie'))}}'''
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE+'/index.html')
        await pg.evaluate("()=>{Meta.data.unlocks={codexE:1,codexA:1,relics:1,ranger:1,mage:1}}")
        await pg.evaluate(f"()=>Game.newRun('{SEED}','{CLS}')")
        for lv in range(12):
            order = await pg.evaluate("()=>World.rooms.map((r,i)=>i).sort((a,b)=>(World.rooms[a].type==='boss')-(World.rooms[b].type==='boss'))")
            for rid in order:
                await pg.evaluate(TP, rid); await pg.wait_for_timeout(250)
                for k in range(60):
                    await pg.wait_for_timeout(120)
                    st = await pg.evaluate(KILL)
                    if not st[1] and st[0]==0: break
                await pg.evaluate(LOOT)
            r = await pg.evaluate(LOOT)
            hits = {k: round(r[k]/max(1,r['hit']),1) for k in ('goblin','skeleton','gnoll','zombie')}
            print(r['lvl'], 'hit', r['hit'], 'dps', r['dps'], 'minors', r['minors'], 'majors', r['majors'], '| hits to kill', hits, '|', r['best'])
            await pg.evaluate("()=>{const W=World,p=W.players[0],k=W.pickups.find(k=>k.kind==='portal');if(k){p.x=k.x;p.y=k.y;k.t=1;W.updPickups(0.016);W.interact(p);W.interact(p)}}")
            await pg.wait_for_timeout(1200)
            if await pg.evaluate("()=>Game.state")!='play': break
        print('errors', errs[:3]); await b.close()
asyncio.run(main())

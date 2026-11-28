import os
BASE = os.environ.get('BASE', 'http://localhost:8765')
from playwright.sync_api import sync_playwright
import os
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
    pg=b.new_page(viewport={'width':844,'height':390})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'/index.html')
    pg.evaluate("()=>{const M=__emberdeep.Meta;M.data.embers=777;M.data.unlocks={x:1};M.save()}")
    pg.click('#b-data')
    code=pg.input_value('#exp'); print(code[:30], len(code))
    pg.screenshot(path='save.png')
    pg.evaluate("()=>{const M=__emberdeep.Meta;M.data.embers=1;M.save()}")
    pg.fill('#imp','junk'); pg.click('#b-load'); pg.click('#b-load'); print(pg.inner_text('#imp-msg'))
    pg.click('#b-back'); pg.click('#b-data')
    pg.fill('#imp',code); pg.click('#b-load'); pg.click('#b-load')
    pg.wait_for_timeout(1500)
    print(pg.evaluate("()=>[__emberdeep.Meta.data.embers, JSON.stringify(__emberdeep.Meta.data.unlocks)]"))
    print('errors',errs)

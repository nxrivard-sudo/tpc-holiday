const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const handoff = fs.readFileSync(path.join(root,'planner-leads.js'),'utf8');
function setup(mode='ok') {
  const dom = new JSDOM(html,{url:'https://holiday.thepicniccollective.com/holiday-at-home/',runScripts:'outside-only'});
  const w=dom.window, calls=[],events=[];
  w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.matchMedia=()=>({matches:false});
  w.TPCHolidayTracking={consultClick:()=>events.push('ads')};
  w.fbq=(...args)=>events.push(args);
  w.fetch=async(url,options)=>{
    calls.push({url,options});
    if(mode==='reject') throw Error('offline');
    if(mode==='pending') return new Promise(()=>{});
    if(url.includes('planner_health')) return {ok:true,json:async()=>mode==='old'?Promise.reject(Error('html')):{planner_schema:1}};
    return {ok:true,json:async()=>({ok:mode!=='invalid',id:'qa-receipt',duplicate:mode==='duplicate'})};
  };
  for(const script of w.document.querySelectorAll('script:not([src])')) {
    if((!script.type||script.type==='text/javascript')&&script.textContent.includes('function summaryText')) w.eval(script.textContent);
  }
  w.eval(handoff);
  for(let i=0;i<30&&!w.document.getElementById('w-lead');i++) w.document.getElementById('w-next').click();
  return {dom,w,calls,events};
}
function submit(x) {
  x.w.document.getElementById('l-name').value='QA TEST - delete';
  x.w.document.getElementById('l-email').value='events@thepicniccollective.com';
  x.w.document.getElementById('l-date').value='2026-12-12';
  x.w.document.getElementById('w-lead').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));
}
(async()=>{
  for(const mode of ['ok','reject','pending','old','invalid','duplicate']) {
    const x=setup(mode);submit(x);
    assert.ok(x.w.document.getElementById('w-sum'),'instant estimate even '+mode);
    assert.ok(x.w.document.querySelector('.sumtable'),'itemization rendered '+mode);
    await new Promise(r=>setTimeout(r,10));
    if(mode==='ok'||mode==='duplicate'||mode==='invalid') {
      const post=x.calls.find(c=>c.options&&c.options.method==='POST');
      assert.ok(post,'submission POST');
      const p=JSON.parse(post.options.body);
      assert.equal(p.name,'QA TEST - delete');assert.equal(p.source,'at-home planner');
      assert.equal(p.date,'2026-12-12');
      assert.equal(p.summary,x.w.document.getElementById('w-sum').textContent);
      assert.deepEqual(p.rows,[...x.w.document.querySelectorAll('.sumtable tr')].map(row=>[...row.cells].map(cell=>cell.textContent.trim())));
      assert.equal(p.total,p.rows.at(-1)[1]);assert.ok(p.disclaimer.includes('An estimate, not a quote'));
      assert.equal(post.options.headers['Content-Type'],'text/plain;charset=UTF-8');
      assert.equal(x.events.length,mode==='ok'?2:0,'track accepted nonduplicate only');
    } else assert.equal(x.events.length,0,'no success tracking on failure');
    const queue=JSON.parse(x.w.localStorage.getItem('tpc_at_home_pending_v1'));
    assert.equal(queue.length,mode==='ok'||mode==='duplicate'?0:1,'retain until confirmed');
    x.dom.window.close();
  }
  const x=setup();
  x.w.document.getElementById('w-lead').dispatchEvent(new x.w.Event('submit',{cancelable:true}));
  assert.equal(x.calls.length,0,'validation stops network');
  assert.ok(x.w.document.getElementById('w-lead')); x.dom.window.close();
  console.log('PASS planner submit: POST exact itemized estimate; instant render on rejection/hang; old deployment retained; success-only Ads/Meta; duplicate suppression; invalid form rejected (7 scenarios).');
})().catch(e=>{console.error(e);process.exitCode=1;});

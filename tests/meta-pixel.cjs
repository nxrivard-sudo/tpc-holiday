// Offline tests only: JSDOM does not load external resources.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'meta-pixel.js'), 'utf8');
const google = fs.readFileSync(path.join(root, 'tracking.js'), 'utf8');
function setup({ placeholder=false, gpc=false, withGoogle=false, pref=null, url='https://holiday.thepicniccollective.com/holiday-parties/?src=meta' }={}) {
  const dom = new JSDOM('<head></head><body><a id="book" href="https://thepicniccollective.hbportal.co/schedule/test">Book</a><a id="other" href="https://evil.example/?next=thepicniccollective.hbportal.co">Other</a><a id="internal" href="/gift/">Gift</a></body>', {url, runScripts:'outside-only'});
  const w = dom.window;
  Object.defineProperty(w.navigator, 'globalPrivacyControl', {value:gpc, configurable:true});
  w.document.addEventListener('click', e=>e.preventDefault());
  const googleEvents=[];
  w.gtag=(...args)=>googleEvents.push(args);
  if (pref) w.localStorage.setItem('tpc_holiday_marketing_consent', pref);
  if (withGoogle) { w.eval(google); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); }
  w.eval(placeholder ? source.replace("'547128289323855'", "'PIXEL_ID'") : source);
  return {dom,w,googleEvents, events:()=>Array.from(w.fbq?.queue || []).map(a=>Array.from(a))};
}
let t=setup({placeholder:true}); t.w.TPCHolidayMeta.setConsent(true); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq, undefined); assert.equal(t.w.document.querySelectorAll('script').length,0); t.dom.window.close();
t=setup({pref:'no'}); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq,undefined, 'stored no is respected'); assert.equal(t.w.document.querySelectorAll('script').length,0); t.dom.window.close();
t=setup(); assert.equal(t.events().filter(a=>a[2]==='PageView').length,1, 'on by default, no banner');
t=setup({url:'https://holiday.thepicniccollective.com/go/?c=recipient-token'}); t.w.TPCHolidayMeta.setConsent(true); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq,undefined); assert.equal(t.w.document.querySelectorAll('script').length,0); t.dom.window.close();
t=setup({gpc:true}); t.w.TPCHolidayMeta.setConsent(true); assert.equal(t.w.fbq,undefined); t.dom.window.close();
t=setup({withGoogle:true}); t.w.TPCHolidayMeta.setConsent(true); t.w.TPCHolidayMeta.setConsent(true);
assert.equal(t.w.document.querySelectorAll('script[src*="fbevents.js"]').length,1);
assert.equal(t.events().filter(a=>a[0]==='init').length,1);
assert.equal(t.events().filter(a=>a[2]==='PageView').length,1);
t.w.document.querySelector('#book').click(); t.w.document.querySelector('#book').click(); t.w.document.querySelector('#other').click(); t.w.document.querySelector('#internal').click();
assert.equal(t.events().filter(a=>a[2]==='Lead').length,1);
assert.equal(t.googleEvents.length,2, 'Existing Google listener still fires on each HoneyBook click');
assert.equal(t.googleEvents[0][2].send_to,'AW-10933789586/C6GcCMqvsp0dEJLH0d0o');
const lead=t.events().find(a=>a[2]==='Lead'); assert.deepEqual(Object.keys(lead[3]),['content_name']);
t.w.TPCHolidayMeta.setConsent(false); const n=t.events().length; t.w.document.querySelector('#book').click(); assert.equal(t.events().length,n); assert.equal(t.events().at(-1)[1],'revoke');
t.w.TPCHolidayMeta.setConsent(true); Object.defineProperty(t.w.navigator,'globalPrivacyControl',{value:true}); t.w.document.querySelector('#book').click(); assert.equal(t.events().filter(a=>a[2]==='Lead').length,1);
t.dom.window.close();
t=setup(); t.w.TPCHolidayMeta.schedulerRedirect(); t.w.TPCHolidayMeta.schedulerRedirect();
assert.equal(t.events().filter(a=>a[2]==='Lead').length,1, 'go booking redirect counts once'); t.dom.window.close();
t=setup({url:'https://holiday.thepicniccollective.com/go/?d=book&ck=private'}); t.w.TPCHolidayMeta.setConsent(true); t.w.TPCHolidayMeta.schedulerRedirect(); assert.equal(t.w.fbq,undefined); t.dom.window.close();
t=setup(); t.w.document.dispatchEvent(new t.w.Event('DOMContentLoaded'));
assert.equal(t.w.document.querySelector('section[aria-label="Marketing privacy choices"]'),null,'no consent banner'); assert.ok(!Array.from(t.w.document.querySelectorAll('button')).some(b=>b.textContent==='Privacy choices')); t.dom.window.close();
for (const file of ['index.html','holiday-at-home/index.html','holiday-parties/index.html','holiday-parties/trends.html','gift/index.html','socal-holiday-party-planning/index.html','go/index.html']) {
 const html=fs.readFileSync(path.join(root,file),'utf8'); assert.equal((html.match(/<script[^>]+src="[^\"]*meta-pixel\.js/g)||[]).length,1,file);
 assert.ok(html.includes('547128289323855'),file+' Pixel ID');
}
console.log('PASS: live Pixel ID, all 7 integrations, no banner, default-on, stored-no respected, go booking proxy dedupe and token suppression.');
console.log('PASS: placeholder inert; denial/GPC; one script/init/PageView; exact HoneyBook origin; double-click dedupe; revocation; no PII payload; existing Google event coexistence.');

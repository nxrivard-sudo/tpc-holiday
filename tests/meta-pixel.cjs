// Offline tests only: JSDOM does not load external resources.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'meta-pixel.js'), 'utf8');
const google = fs.readFileSync(path.join(root, 'tracking.js'), 'utf8');
function setup({ placeholder=false, gpc=false, withGoogle=false }={}) {
  const dom = new JSDOM('<head></head><body><a id="book" href="https://thepicniccollective.hbportal.co/schedule/test">Book</a><a id="other" href="https://evil.example/?next=thepicniccollective.hbportal.co">Other</a><a id="internal" href="/gift/">Gift</a></body>', {url:'https://holiday.thepicniccollective.com/holiday-parties/?src=meta', runScripts:'outside-only'});
  const w = dom.window;
  Object.defineProperty(w.navigator, 'globalPrivacyControl', {value:gpc, configurable:true});
  w.document.addEventListener('click', e=>e.preventDefault());
  const googleEvents=[];
  w.gtag=(...args)=>googleEvents.push(args);
  if (withGoogle) { w.eval(google); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); }
  w.eval(placeholder ? source : source.replace("'PIXEL_ID'", "'123456789012345'"));
  return {dom,w,googleEvents, events:()=>Array.from(w.fbq?.queue || []).map(a=>Array.from(a))};
}
let t=setup({placeholder:true}); t.w.TPCHolidayMeta.setConsent(true); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq, undefined); assert.equal(t.w.document.querySelectorAll('script').length,0); t.dom.window.close();
t=setup(); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq,undefined); assert.equal(t.w.document.querySelectorAll('script').length,0); t.w.TPCHolidayMeta.setConsent(false); assert.equal(t.w.fbq,undefined); t.dom.window.close();
t=setup(); t.w.history.replaceState({},'', '/go/?c=recipient-token'); t.w.TPCHolidayMeta.setConsent(true); t.w.document.querySelector('#book').click(); assert.equal(t.w.fbq,undefined); assert.equal(t.w.document.querySelectorAll('script').length,0); t.dom.window.close();
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
console.log('PASS: placeholder inert; zero network before consent; denial/GPC; one script/init/PageView; exact HoneyBook origin; double-click dedupe; revocation; no PII payload; existing Google event coexistence.');

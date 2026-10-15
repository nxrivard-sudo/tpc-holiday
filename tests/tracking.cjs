// Run: NODE_PATH=/path/to/jsdom/node_modules node tests/tracking.cjs
const { JSDOM } = require('jsdom');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = resolve(__dirname, '..');
const source = readFileSync(resolve(root, 'tracking.js'), 'utf8');
const booking = 'https://thepicniccollective.hbportal.co/schedule/66673cf26bf84d002bbb2e10';
const storageKey = 'tpc_holiday_attribution';
function setup(query = '', saved, blocked = false) {
  const dom = new JSDOM('<a id="book" href="' + booking + '?existing=yes#details">Book</a><a id="internal" href="/gift/">Gift</a><a id="email" href="mailto:events@thepicniccollective.com">Email</a><a id="external" href="https://example.org/">Other</a>', {url: 'https://holiday.thepicniccollective.com/' + query, runScripts:'outside-only'});
  if (saved) dom.window.localStorage.setItem(storageKey, JSON.stringify(saved));
  if (blocked) Object.defineProperty(dom.window, 'localStorage', {get() { throw Error('blocked'); }});
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}
(async function () {
  let dom = setup('?src=instagram&utm_source=ig&utm_medium=social&utm_campaign=holiday2026&utm_content=story&utm_term=picnic&secret=never-forward');
  let w = dom.window;
  let url = new URL(w.document.querySelector('#book').href);
  for (const key of ['src','utm_source','utm_medium','utm_campaign','utm_content','utm_term']) assert.ok(url.searchParams.has(key));
  assert.equal(url.searchParams.get('existing'), 'yes');
  assert.equal(url.hash, '#details');
  assert.equal(url.searchParams.has('secret'), false);
  assert.equal(JSON.parse(w.localStorage.getItem(storageKey)).src, 'instagram');
  assert.equal(new URL(w.document.querySelector('#internal').href).searchParams.get('src'), 'instagram');
  assert.equal(w.document.querySelector('#email').href, 'mailto:events@thepicniccollective.com');
  assert.equal(w.document.querySelector('#external').href, 'https://example.org/');
  assert.equal(new URL(w.TPCHolidayTracking.url(booking + '?src=explicit')).searchParams.get('src'), 'explicit');
  const link = w.document.createElement('a'); link.href = booking; w.document.body.append(link);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(new URL(link.href).searchParams.get('utm_campaign'), 'holiday2026');
  link.href = booking + '?estimate=custom';
  await new Promise(r => setTimeout(r, 0));
  assert.equal(new URL(link.href).searchParams.get('src'), 'instagram');
  dom.window.close();
  dom = setup('', {src:'email', utm_campaign:'return-visit'});
  assert.equal(new URL(dom.window.document.querySelector('#book').href).searchParams.get('src'), 'email'); dom.window.close();
  dom = setup('?src=new', {src:'old', utm_campaign:'stale'});
  assert.equal(new URL(dom.window.document.querySelector('#book').href).searchParams.has('utm_campaign'), false); dom.window.close();
  dom = setup('?src=email%20%26%20friends', null, true);
  assert.equal(new URL(dom.window.document.querySelector('#book').href).searchParams.get('src'), 'email & friends'); dom.window.close();
  dom = setup('', null, true);
  assert.equal(new URL(dom.window.document.querySelector('#book').href).searchParams.has('src'), false); dom.window.close();
  dom = setup('', 'invalid cached data'); dom.window.close();
  // Verify redirect logic without navigating or sending the existing beacon.
  dom = setup('?src=newsletter&utm_campaign=holiday2026');
  for (const destination of ['home','company','book','https://evil.example']) {
    let redirected;
    const html = readFileSync(resolve(root,'go/index.html'),'utf8');
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(inline, {URLSearchParams, location:{search:'?d='+encodeURIComponent(destination), replace(value){redirected=value;}}, navigator:{sendBeacon(){throw Error('unexpected beacon');}}, setTimeout(fn){fn();}, window:dom.window});
    const result = new URL(redirected);
    assert.equal(result.searchParams.get('src'), 'newsletter');
    assert.equal(result.searchParams.get('utm_campaign'), 'holiday2026');
    assert.ok(['holiday.thepicniccollective.com','thepicniccollective.hbportal.co'].includes(result.hostname));
    if (destination === 'https://evil.example') assert.equal(result.pathname, '/holiday-at-home/');
  }
  dom.window.close();
  const pages = ['index.html','gift/index.html','go/index.html','holiday-at-home/index.html','holiday-parties/index.html','holiday-parties/trends.html','socal-holiday-party-planning/index.html'];
  for (const page of pages) {
    const html = readFileSync(resolve(root,page), 'utf8');
    const doc = new JSDOM(html).window.document;
    const scripts = [...doc.querySelectorAll('script[src]')].filter(s => s.getAttribute('src').endsWith('tracking.js'));
    assert.equal(scripts.length, 1, page);
    assert.equal(resolve(dirname(resolve(root,page)), scripts[0].getAttribute('src')), resolve(root,'tracking.js'));
    // Parse every inline executable script to catch injection/integration syntax errors.
    for (const script of doc.querySelectorAll('script:not([src])')) {
      if (!script.type || script.type === 'text/javascript') new vm.Script(script.textContent, {filename:page});
    }
    for (const img of doc.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      if (!src.startsWith('http') && !src.startsWith('data:')) readFileSync(resolve(dirname(resolve(root,page)),src));
    }
  }
  const gift = new JSDOM(readFileSync(resolve(root,'gift/index.html'),'utf8')).window.document;
  assert.equal(gift.querySelectorAll('.card').length, 3);
  for (const amount of ['$100','$250','$500']) assert.ok(gift.body.textContent.includes(amount));
  assert.equal(gift.querySelectorAll('form').length, 0);
  assert.ok(gift.body.textContent.includes('PRICE TBD'));
  console.log('PASS: attribution URL/storage, all six parameters, internal navigation, existing query/hash, dynamic links, campaign replacement, blocked storage, redirect allowlist, all 7 page integrations, inline syntax, local images and gift draft safeguards.');
})().catch(error => {console.error(error); process.exitCode=1;});

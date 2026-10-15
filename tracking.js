/* Local attribution only; no analytics requests or personal data collection.
 * New tagged visits replace the previous campaign; untagged visits retain it.
 * Existing destination params win. Storage failure never blocks navigation.
 */
(function () {
  'use strict';
  var keys = ['src', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var storageKey = 'tpc_holiday_attribution';
  var incoming = new URLSearchParams(location.search);
  var campaign = {};
  keys.forEach(function (key) {
    var value = incoming.get(key);
    if (value) campaign[key] = value.slice(0, 200);
  });
  var fresh = Object.keys(campaign).length > 0;
  try {
    if (!fresh) {
      var saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      keys.forEach(function (key) {
        if (typeof saved[key] === 'string' && saved[key]) campaign[key] = saved[key].slice(0, 200);
      });
    }
    if (fresh) localStorage.setItem(storageKey, JSON.stringify(campaign));
  } catch (error) { /* Private browsing/storage restrictions: keep URL attribution. */ }

  function trackedUrl(href) {
    var url;
    try { url = new URL(href, location.href); } catch (error) { return href; }
    if (!/^https?:$/.test(url.protocol)) return href;
    var internal = url.origin === location.origin || url.origin === 'https://holiday.thepicniccollective.com';
    var booking = url.origin === 'https://thepicniccollective.hbportal.co';
    if (!internal && !booking) return href;
    keys.forEach(function (key) {
      if (campaign[key] && !url.searchParams.has(key)) url.searchParams.set(key, campaign[key]);
    });
    return url.href;
  }
  window.TPCHolidayTracking = { url: trackedUrl };
  function decorate(root) {
    var anchors = root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
    if (root.matches && root.matches('a[href]')) update(root);
    anchors.forEach(update);
  }
  function update(anchor) {
    var href = anchor.getAttribute('href');
    var next = trackedUrl(href);
    if (href !== next) anchor.setAttribute('href', next);
    if (window.self !== window.top && /^https:\/\/[^/]*\.hbportal\.co\//.test(next)) anchor.target = '_top';
  }
  function start() {
    decorate(document);
    if (window.self !== window.top) {
      document.documentElement.style.overflow = 'hidden';
      var lastHeight = 0;
      function reportHeight(navigation) {
        // The document scrollHeight cannot shrink below the iframe viewport.
        var body = document.body;
        var style = getComputedStyle(body);
        var height = Math.ceil(body.getBoundingClientRect().height +
          (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
        if (height !== lastHeight || navigation === true) {
          lastHeight = height;
          window.parent.postMessage({ tpcHeight: height, tpcNavigation: navigation === true }, '*');
        }
      }
      window.addEventListener('load', function () { reportHeight(); });
      window.addEventListener('resize', function () { reportHeight(); });
      window.addEventListener('pageshow', function (event) { reportHeight(event.persisted); });
      new ResizeObserver(function () { reportHeight(); }).observe(document.body);
      if (document.fonts) document.fonts.ready.then(function () { reportHeight(); });
      reportHeight(true);
    }
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') update(record.target);
        else record.addedNodes.forEach(decorate);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    document.addEventListener('click', function (event) {
      var anchor = event.target.closest && event.target.closest('a[href]');
      if (anchor) update(anchor);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

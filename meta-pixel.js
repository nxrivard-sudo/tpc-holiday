/* Holiday marketing Pixel: on by default (no banner); GPC and a stored "no" override.
 * Lead = scheduler-link click proxy, NEVER a submitted inquiry or booking.
 * No advanced matching, email, phone, booking URL or campaign data supplied.
 */
(function () {
  'use strict';
  if (window.TPCHolidayMeta) return;
  var pixelId = '547128289323855';
  var allowed = false;
  var initialized = false;
  var pageViewed = false;
  var lastClick = new WeakMap();
  function hasConsent() {
    return allowed && navigator.globalPrivacyControl !== true;
  }
  function ready() {
    // Existing email redirects may contain recipient identifiers: never load there.
    var query = new URLSearchParams(location.search);
    var sensitive = ['c', 'ck', 'email', 'phone', 'name', 'first_name', 'last_name'];
    if (sensitive.some(function (key) { return query.has(key); })) return false;
    return /^\d{5,}$/.test(pixelId) && hasConsent();
  }
  function load() {
    if (!ready()) return;
    if (!window.fbq) {
      var queue = function () {
        if (queue.callMethod) queue.callMethod.apply(queue, arguments);
        else queue.queue.push(arguments);
      };
      queue.push = queue;
      queue.loaded = true;
      queue.version = '2.0';
      queue.queue = [];
      window.fbq = queue;
      if (!window._fbq) window._fbq = queue;
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }
    if (!initialized) {
      window.fbq('consent', 'grant');
      window.fbq('set', 'autoConfig', false, pixelId);
      window.fbq('init', pixelId);
      initialized = true;
    } else window.fbq('consent', 'grant');
    if (!pageViewed) {
      window.fbq('trackSingle', pixelId, 'PageView');
      pageViewed = true;
    }
  }
  function setConsent(value) {
    allowed = value === true && navigator.globalPrivacyControl !== true;
    if (ready()) load();
    else if (initialized && typeof window.fbq === 'function') window.fbq('consent', 'revoke');
  }
  var redirectTracked = false;
  function schedulerRedirect() {
    if (!ready() || redirectTracked) return;
    redirectTracked = true;
    load();
    window.fbq('trackSingle', pixelId, 'Lead', { content_name: 'HoneyBook scheduler click' });
  }
  window.TPCHolidayMeta = { setConsent: setConsent, schedulerRedirect: schedulerRedirect };
  // No consent banner (Nick 2026-10-15): on by default, like the main Squarespace site.
  // Browsers sending Global Privacy Control are still never tracked; a prior explicit "no" is respected.
  (function autoConsent() {
    var preference = null;
    try { preference = localStorage.getItem('tpc_holiday_marketing_consent'); } catch (e) {}
    if (preference !== 'no') setConsent(true);
  })();
  document.addEventListener('click', function (event) {
    if (!ready()) return;
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    try {
      if (new URL(anchor.href, location.href).origin !== 'https://thepicniccollective.hbportal.co') return;
      var now = Date.now();
      if (lastClick.has(anchor) && now - lastClick.get(anchor) < 1500) return;
      lastClick.set(anchor, now);
      load();
      window.fbq('trackSingle', pixelId, 'Lead', { content_name: 'HoneyBook scheduler click' });
    } catch (error) { /* Tracking must never block booking navigation. */ }
  }, true);
})();

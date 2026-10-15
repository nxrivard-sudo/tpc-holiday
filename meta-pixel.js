/* Holiday marketing Pixel: explicit opt-in, local preference, GPC override.
 * No request or event until explicit marketing consent; GPC overrides consent.
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
  // No noscript bypass. Preferences apply only to this holiday origin.
  function consentUI() {
    var preference = null;
    try { preference = localStorage.getItem('tpc_holiday_marketing_consent'); } catch (e) {}
    if (preference === 'yes') setConsent(true);
    var panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Marketing privacy choices');
    panel.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:99999;background:#fff;color:#222;border:1px solid #777;padding:14px;font:14px/1.5 system-ui;box-shadow:0 2px 12px #0003;max-width:600px';
    var text = document.createElement('p');
    text.textContent = 'Optional Meta (Facebook/Instagram) tracking helps us measure holiday ads and show relevant ads. It shares page visits and planning-link clicks with Meta. Choose Allow or Decline; you can change your choice anytime.';
    panel.appendChild(text);
    function button(label, action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'margin:4px;padding:8px 14px;font:inherit;cursor:pointer';
      b.addEventListener('click', action); panel.appendChild(b); return b;
    }
    var toggle = document.createElement('button');
    toggle.type = 'button'; toggle.textContent = 'Privacy choices';
    toggle.style.cssText = 'position:fixed;bottom:5px;left:5px;z-index:99998;background:#fff;color:#222;border:1px solid #777;padding:6px;font:12px system-ui;cursor:pointer';
    toggle.addEventListener('click', function () { panel.hidden = false; });
    function choose(value) {
      try { localStorage.setItem('tpc_holiday_marketing_consent', value ? 'yes' : 'no'); } catch (e) {}
      setConsent(value); panel.hidden = true;
    }
    if (navigator.globalPrivacyControl !== true) button('Allow', function () { choose(true); });
    else text.textContent = 'Global Privacy Control is on. Meta marketing tracking is disabled.';
    button('Decline', function () { choose(false); });
    panel.hidden = preference === 'yes' || preference === 'no' || navigator.globalPrivacyControl === true;
    document.body.appendChild(toggle); document.body.appendChild(panel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', consentUI, {once:true});
  else consentUI();
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

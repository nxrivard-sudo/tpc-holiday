/* Durable best-effort handoff. No credentials; estimate rendering never waits on this. */
(function () {
  'use strict';
  var endpoint = 'https://script.google.com/macros/s/AKfycbwRRRt6sh7mDnbeth36U42YV1wDcaErmySejMLe0rKVPt6HpfbCe2SzxKSVSRJ35_FQJw/exec';
  var key = 'tpc_at_home_pending_v1', busy = false, pending = [];
  try { pending = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
  if (!Array.isArray(pending)) pending = [];
  // Expire retained personal data after 24 hours; cap the queue on shared devices.
  pending = pending.filter(function (p) { return p && Date.now() - p.created < 86400000; }).slice(-5);
  function save() { try { localStorage.setItem(key, JSON.stringify(pending)); } catch (e) {} }
  function conversion() {
    try { if (window.TPCHolidayTracking) window.TPCHolidayTracking.consultClick(); } catch (e) {}
    // Respect the existing Pixel consent/GPC controls, without changing shared scripts.
    try {
      if (navigator.globalPrivacyControl !== true && localStorage.getItem('tpc_holiday_marketing_consent') !== 'no' && typeof window.fbq === 'function') {
        window.fbq('trackSingle', '547128289323855', 'Lead', {content_name: 'At-home planner estimate submitted'});
      }
    } catch (e) {}
  }
  function flush() {
    if (busy || !pending.length || typeof fetch !== 'function') return Promise.resolve();
    busy = true;
    var item = pending[0], controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;
    // The old deployed unsubscribe handler returns "ok" for unknown actions. Never
    // mistake that for acceptance or discard a lead until the receiver is deployed.
    return fetch(endpoint + '?action=planner_health', {signal: controller && controller.signal})
      .then(function (r) { if (!r.ok) throw Error('intake unavailable'); return r.json(); })
      .then(function (health) {
        if (health.planner_schema !== 1) throw Error('intake not deployed');
        return fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'}, body: JSON.stringify(item.payload), keepalive: true, signal: controller && controller.signal});
      })
      .then(function (r) { if (!r.ok) throw Error('intake rejected'); return r.json(); })
      .then(function (receipt) {
        if (receipt.ok !== true || !receipt.id) throw Error('intake not accepted');
        pending = pending.filter(function (p) { return p.id !== item.id; }); save();
        if (!receipt.duplicate) conversion();
      })
      .catch(function () { /* Keep the payload for the next online/page visit; never hide the estimate. */ })
      .finally(function () { if (timer) clearTimeout(timer); busy = false; });
  }
  window.TPCPlannerLeads = {
    submit: function (payload) {
      var item = {id: payload.submission_id, created: Date.now(), payload: payload};
      if (!pending.some(function (p) { return p.id === item.id; })) pending.push(item);
      pending = pending.slice(-5); save(); return flush();
    },
    flush: flush
  };
  window.addEventListener('online', flush);
  save(); flush();
})();

// Add as Planner.gs to the EXISTING TPC Holiday Unsubscribe Apps Script.
// Uses its existing SECRET for authenticated local polling; no secret in this file.
// Add the hooks documented in DEPLOYMENT.md to the existing doGet/doPost.
function plannerJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function plannerGet_(q) {
  if (q.action === 'planner_health') return plannerJson_({planner_schema: 1});
  if (q.action !== 'planner_list') return null;
  if (q.key !== SECRET) return plannerJson_({ok: false});
  const props = PropertiesService.getScriptProperties().getProperties(), out = {};
  Object.keys(props).filter(k => k.indexOf('pl:') === 0).sort().slice(0, 10).forEach(k => out[k.slice(3)] = JSON.parse(props[k]));
  return plannerJson_({ok: true, leads: out});
}
function plannerPost_(r) {
  let p;
  try { p = JSON.parse((r.postData || {}).contents || '{}'); } catch (err) { return null; }
  if (p.action === 'planner_ack') {
    if (p.key !== SECRET || !/^[a-f0-9]{64}$/.test(p.id || '')) return plannerJson_({ok: false});
    PropertiesService.getScriptProperties().deleteProperty('pl:' + p.id);
    return plannerJson_({ok: true});
  }
  if (p.action !== 'planner_lead') return null;
  if (p.schema !== 1 || p.website || typeof p.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email) || !p.name || String(p.name).length > 150 || p.email.length > 254 || !Array.isArray(p.rows) || p.rows.length > 75 || !p.rows.length || p.rows.some(row => !Array.isArray(row) || row.length !== 2 || row.some(c => typeof c !== 'string' || c.length > 400)) || p.rows[p.rows.length-1][0] !== 'Estimated total' || p.rows[p.rows.length-1][1] !== p.total || typeof p.total_amount !== 'number' || !isFinite(p.total_amount) || p.total_amount < 0 || p.total_amount > 10000000 || typeof p.summary !== 'string' || p.summary.length > 4500 || typeof p.disclaimer !== 'string' || p.disclaimer.length > 1200 || !Number.isInteger(p.guests) || p.guests < 1 || p.guests > 10000) return plannerJson_({ok: false, error: 'invalid'});
  // Keep only the fields the worker uses. Browser-supplied selections are estimates,
  // never signed quotes or payment instructions; the email escapes all markup.
  const clean = {schema: 1, name: String(p.name), email: p.email.trim().toLowerCase(), phone: String(p.phone || '').slice(0,60), date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : '', area: String(p.area || '').slice(0,80), guests: p.guests, kids: Math.max(0,Math.min(10000,Number(p.kids)||0)), rows: p.rows, total: p.total, total_amount: p.total_amount, summary: p.summary, disclaimer: p.disclaimer, source: 'at-home planner', received_at: new Date().toISOString()};
  const canonical = JSON.stringify([clean.email,clean.rows,clean.date,clean.area,clean.guests,clean.kids]);
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical).map(b => ('0' + ((b+256)%256).toString(16)).slice(-2)).join('');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const P = PropertiesService.getScriptProperties(), now = Date.now();
    // Dedupe within a rolling 24 hours, even after the local worker acknowledges.
    const existing = JSON.parse(P.getProperty('pd:' + hash) || 'null');
    if (existing && now - existing.at < 86400000) return plannerJson_({ok:true,id:existing.id,duplicate:true});
    // Dated id allows a fresh request for the same selections after 24 hours.
    const id = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hash + ':' + now).map(b => ('0' + ((b+256)%256).toString(16)).slice(-2)).join('');
    const all = P.getProperties();
    Object.keys(all).filter(k => k.indexOf('pd:') === 0).forEach(k => { if (now - JSON.parse(all[k]).at > 86400000) P.deleteProperty(k); });
    const recent = Object.keys(all).filter(k => k.indexOf('pl:') === 0).map(k => JSON.parse(all[k]));
    // No unbounded public email relay: per-recipient and global limits; preserve queue.
    if (recent.length >= 100 || Object.keys(all).filter(k=>k.indexOf('pd:')===0).map(k=>JSON.parse(all[k])).filter(x=>now-x.at<3600000).length >= 30 || Object.keys(all).filter(k=>k.indexOf('pd:')===0).map(k=>JSON.parse(all[k])).filter(x=>x.email===clean.email && now-x.at<86400000).length >= 3) return plannerJson_({ok:false,error:'limited'});
    const encoded = JSON.stringify(clean);
    if (Utilities.newBlob(encoded).getBytes().length > 8500) return plannerJson_({ok:false,error:'too_large'});
    P.setProperty('pl:' + id, encoded);
    P.setProperty('pd:' + hash, JSON.stringify({id:id,at:now,email:clean.email}));
    return plannerJson_({ok:true,id:id,duplicate:false});
  } finally { lock.releaseLock(); }
}

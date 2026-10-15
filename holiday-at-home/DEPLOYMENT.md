# Holiday-at-Home lead intake — deployed; worker blocked

**Status: Apps Script version 4 deployed and receiver verified; NOT operational because the single live QA failed in the HoneyBook worker. Worker disabled.** One production QA submission was accepted; no estimate email or staff alert was sent. Read-only HoneyBook verification found no QA project or matching events@ contact.

## Deployment and single live QA result — 2026-10-15

- Signed-in editor account verified as `events@thepicniccollective.com`. Added `Planner.gs` and the two hooks below. Reloaded editor and verified exact Planner source plus both saved hooks. The unsubscribe `SECRET` was preserved, checked in-page before saving; never copied into this repository.
- Updated only the existing active deployment `AKfycbwRRRt6sh7mDnbeth36U42YV1wDcaErmySejMLe0rKVPt6HpfbCe2SzxKSVSRJ35_FQJw` from version 3 to **version 4**. Existing `/exec` URL, execute-as events@ and Anyone access retained. No authorization prompt or new scopes.
- `curl -LsS /exec?action=planner_health` returned `{"planner_schema":1}`. Browser fetch from `https://holiday.thepicniccollective.com` returned the same JSON.
- Invalid unsubscribe token regression: captured before editing using `e=planner-qa-invalid@example.invalid&t=invalid`; before/after HTTP 200 and identical visible text `Unsubscribe`. No real customer link used.
- Submitted once through the live planner: **QA TEST - delete**, **events@thepicniccollective.com**, **2026-12-12**, 12 adults, Orange County. Exact displayed total **$2,276**: cocktail styling $318, Holiday Cocktail Hour $432, cocoa $204, gingerbread decorating $948; items $1,902, service/production $210, sales tax $164 (plus included celebration/color rows).
- Receiver accepted a nonduplicate intake id `aa79aa8d202faf0bc0a2c03f9bc6e039fab57a78bf1e9dbec7ddb434d4bc64a9`.
- Invoked only the planner worker with the normal staff-alert callback. It failed before recording HoneyBook success: `StopIteration` in `holiday_planner_leads.mcp()` line 50 after `json.loads(text)` failed. The response did not contain a parseable JSON result or a JSON-prefixed line. Root cause upstream of that parser is not yet established; do not claim successful creation.
- Disabled immediately by removing `~/.hermes/state/holiday_planner_leads.enabled`; verified marker absent. The QA remains in the Apps Script queue; do not submit another production QA.
- Read-only HoneyBook MCP lookup by stable marker `aa79aa8d202f`: **0 projects**; exact events@ contact search: **0 contacts**. No archive ids available.
- Gmail API through `_gmail_api_access_token()` found **0 messages** for `rfc822msgid:holiday-estimate-aa79aa8d202faf0bc0a2c03f9bc6e039fab57a78bf1e9dbec7ddb434d4bc64a9@thepicniccollective.com`. No Gmail message id or emailed-row comparison available.
- Staff delivery state has no `planner:<intake-id>` entry. **No Nick Telegram or Lauren SMS alert fired** because HoneyBook failed first. No real-customer messages sent.
- Next repair: inspect the HoneyBook MCP write-result contract/error before any retry; reconcile existing project/contact and Gmail state first, then resume the same queued QA only with authorization. Keep worker disabled until this is resolved.

## Chosen design

Keep the estimate immediate. After rendering, send its exact displayed table rows, total, disclaimer, contact details and summary to the existing free Apps Script web app. Store a durable queue there; the existing 5-minute holiday inquiry cron consumes one lead per run through HoneyBook MCP and events@ SMTP. No new paid services or separate cron.

The public HoneyBook form was inspected read-only in Chrome/CDP. Its bundle POSTs to `https://api.honeybook.com/api/v2/workspace/inquiries`, with `g-recaptcha-response-v3` obtained for `contact_form_submit` on HoneyBook's origin. Contact form id `655515dc1c59cf016cfcd489`; vendor id `5ccf4d17ab536c1784c9d766`. Do not bypass that protection or assume a token-free cross-origin request works. The existing unsubscribe web app silently returns `ok` for unknown POST actions. A health check plus structured receipt prevents that response from discarding a visitor's lead.

## The one blocking deployment

Existing Apps Script project:
`https://script.google.com/home/projects/1_KRYmdZ73riYVbFCPEtADxvXmvjwCmgGwYbDB4XDpvLMyXfQZ0z-QLSj/edit`

1. Add `server/Planner.gs` as a new Apps Script file. It references the existing `SECRET`; **do not copy the secret into this repository**.
2. In existing `doGet(r)`, immediately after `const q = r.parameter || {};`, add:
   ```js
   const planner = plannerGet_(q); if (planner) return planner;
   ```
3. At the start of existing `doPost(r)`, add:
   ```js
   const planner = plannerPost_(r); if (planner) return planner;
   ```
4. **Deploy → Manage deployments → edit the existing web-app deployment → New version → Deploy.** Preserve its current access and execution identity; keep the same `/exec` URL. Saving editor source alone does not update a versioned web app. No account changes, scopes, or paid services are required by this extension.
5. Verify `/exec?action=planner_health` returns JSON `{"planner_schema":1}` from the live website origin, not just from a server-side request. Exercise existing unsubscribe/click behavior with isolated mocks, not a real customer's unsubscribe link.

## Installed local worker / cron

- Worker: `~/.hermes/scripts/holiday_planner_leads.py` (versioned source here in `server/`).
- Existing alert script extended: `~/.hermes/scripts/holiday_inquiry_alert.py`; pre-change backup: `holiday_inquiry_alert.py.bak`.
- No new cron and no scheduler configuration changes. The existing inquiry alert cron calls the worker after its current inquiry/reply work.
- Worker is inert without `~/.hermes/state/holiday_planner_leads.enabled`.
- After receiver deployment, enable for the single live QA using that marker, then inspect results before leaving it enabled.
- At the existing schedule, emails/projects are asynchronous: one queued lead per 5-minute run during its configured 8am–9pm window. Outside that window the next scheduled run handles them.
- Requires existing private `honeybook.json` OAuth credentials and SMTP/unsubscribe secret files. Never print any of these.
- HoneyBook contact is matched by exact email; a new project carries a stable intake-id marker. Contact membership and lead status are read back before success is recorded. No HoneyBook communications APIs are used.
- Email uses the page's exact row strings and total, HTML-escaped, with plain-text alternative, booking `?src=estimate_email`, phone, address and Lauren signature.
- Receiver dedupes normalized email + rows/date/area/guest selections for a rolling 24 hours, including after queue acknowledgement. Public submission has per-recipient and global limits. Queue acknowledgement requires the private secret.
- SMTP send is reserved before transport. A timeout/uncertain result is **not** retried automatically: check Gmail for `rfc822msgid:holiday-estimate-<intake-id>@thepicniccollective.com` before marking a private state record sent. This avoids duplicate visitor emails but needs manual recovery on uncertain sends.
- New staff alerts include `Source: at-home planner` and the exact estimated total, using the existing staff-only alert sender/budget.
- Browser retains unacknowledged payloads locally for up to 24h / five submissions and retries on online/page visit. A closed browser cannot retry until revisited. Never claim a browser-local queue is a server-captured lead.
- Ads + consent/GPC-respecting Meta Lead fire only after a structured accepted, nonduplicate receipt, not on offline failure.

## Required single live QA after deployment

Submit once through the live planner as **QA TEST - delete**, email **events@thepicniccollective.com**. Do not send anything to real customers. Allow one cron run (or invoke only the intake worker with its normal staff-alert callback). Read HoneyBook project/workspace/contact back and record ids for Lauren to archive. Read events@ Gmail through `picnic_squarespace_catering_intake._gmail_api_access_token()`, search the deterministic message id, and record the Gmail message id. Compare email rows/total with the submitted page. Submit the exact payload again only to the isolated test harness to verify deduplication; do not create another production QA inquiry.

Until this completes, report **blocked / not end-to-end verified**, never "working".

## Tests (no outbound writes)

```sh
NODE_PATH=~/.hermes/cache/scratch/node_modules node holiday-at-home/tests/planner-leads.cjs
node holiday-at-home/tests/receiver.cjs
python -m unittest discover -s holiday-at-home/tests -p 'test_*.py' -v
NODE_PATH=~/.hermes/cache/scratch/node_modules node tests/tracking.cjs
NODE_PATH=~/.hermes/cache/scratch/node_modules node tests/meta-pixel.cjs
```

The browser suite verifies real planner DOM + exact displayed rows with mock fetch, success-only conversion events, duplicate handling, instant estimate on rejection/hanging network, invalid form validation, and retention against the old deployment. Receiver and worker tests are isolated mocks, **not production proof**. The worker's MCP transport has been exercised read-only against the actual company pipeline; write paths remain unverified until the single QA.

# Holiday-at-Home lead intake — rollout pending

**Status: browser handoff and worker implemented; NOT operational until the existing Apps Script web app is redeployed.** No production QA submission or estimate email has been sent. No HoneyBook QA project exists yet.

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

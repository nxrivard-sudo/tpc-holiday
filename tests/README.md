# Local holiday draft verification

Install the test-only DOM dependency outside this repository and run:

```sh
npm install --prefix "$TMPDIR/tpc-holiday-test" jsdom --no-audit --no-fund
NODE_PATH="$TMPDIR/tpc-holiday-test/node_modules" node tests/tracking.cjs
git diff --check
```

Gift draft: `/gift/`. No checkout, no voucher issuance, no approved pricing. Nick must approve the $100/$250/$500 placeholders, copy, delivery method, service area, inclusions and legally reviewed voucher/redemption terms before publishing. The gift page is marked noindex and visibly labeled as a draft.

Example channel links:

- `/gift/?src=instagram&utm_source=instagram&utm_medium=social&utm_campaign=holiday2026`
- `/holiday-at-home/?src=newsletter&utm_source=newsletter&utm_medium=email&utm_campaign=holiday2026`
- `/go/?d=book&src=partner&utm_source=partner&utm_medium=referral&utm_campaign=holiday2026`

`tracking.js` accepts only `src`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term` (max 200 characters each). It stores the latest tagged campaign under localStorage key `tpc_holiday_attribution`. A new tagged visit replaces the old campaign; an untagged visit reuses it. Storage is browser/origin-specific and persists until cleared. Blocked or malformed storage does not stop navigation.

Attribution is carried through same-origin/holiday-site links, fixed `/go/` redirects and the exact HoneyBook booking origin, including dynamically rendered estimate-summary booking links. Existing destination parameters take precedence, and unrelated query parameters/hash fragments are preserved. Email, phone and unrelated external links are not modified. The script sends no analytics requests. Existing `/go/` click-counter behavior is unchanged. Carrying parameters into HoneyBook does not prove HoneyBook stores or reports them; downstream reporting requires a separate check before launch.

Tests exercise DOM link decoration and dynamic mutations, storage fallback, campaign precedence, redirect safety, script integration on every HTML page, inline JS syntax, local image references and gift-draft safeguards. They do not constitute a visual browser review or an end-to-end HoneyBook submission.

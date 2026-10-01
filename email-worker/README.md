# ChronoRoam Email Worker

Receives every email sent to `<username>@<domain>` and forwards it to the backend's
`POST /webhooks/email-intake` (see `my-backend/routes/webhookRoutes.js`), which runs it through
the AI extraction pipeline and stores the result as a pending review item — nothing is ever
auto-saved (see `EmailImportReviewModal.js` on the frontend for the review-before-save step).

## Two phases

**Phase A — deploy the Worker itself.** Gets the Worker live on Cloudflare and the two secrets
configured.

**Phase B — domain + Email Routing.** Cloudflare Email Routing only delivers real email to a
Worker once a domain's DNS is actually on Cloudflare — not something `wrangler deploy` alone can
do. **`chronoroam.app` is already purchased and this phase is already done** — real forwarded
emails to `<username>@chronoroam.app` are live and working end to end. Kept below as reference
for setting this up again (a different domain, a fresh Cloudflare account, etc.), not as an
open TODO.

One thing that IS still manual: **`wrangler deploy` does not run automatically on `git push`.**
A code change to this Worker (`src/index.js`) needs an explicit `npx wrangler deploy` (or the
Cloudflare dashboard's "Edit code" button) before it's actually live — unlike the backend on
Render, which does auto-deploy on push.

---

## Phase A — deploy the Worker now

### 1. Install dependencies

```bash
cd email-worker
npm install
```

### 2. Log in to Cloudflare (one-time)

```bash
npx wrangler login
```

Opens a browser to authorize Wrangler against your Cloudflare account. If you'd rather not use
the browser flow, `wrangler` also accepts an API token via `CLOUDFLARE_API_TOKEN` — see
[Wrangler's auth docs](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).

### 3. Set the two secrets

These are **not** in `wrangler.toml` — set via `wrangler secret put`, which stores them encrypted
on Cloudflare's side, never in a file that could end up in git.

```bash
npx wrangler secret put BACKEND_WEBHOOK_URL
# For local testing right now, paste the cloudflared tunnel URL, no trailing slash, e.g.:
#   https://particularly-blake-rapidly-blanket.trycloudflare.com
# (This will need updating — see "Updating the tunnel URL" below — every time the tunnel
# restarts, since trycloudflare.com quick tunnels get a fresh random URL each time. For a real
# deployment, this becomes your actual backend's public URL instead.)

npx wrangler secret put WEBHOOK_SHARED_SECRET
# Paste the exact value of EMAIL_INTAKE_SHARED_SECRET from my-backend/.env — these two must
# match exactly, or every request gets a 401.
```

### 4. Deploy

```bash
npx wrangler deploy
```

This publishes the Worker to your Cloudflare account (reachable at
`chronoroam-email-intake.<your-subdomain>.workers.dev`, though that URL isn't actually useful
here — Email Workers aren't triggered by HTTP requests, only by Cloudflare Email Routing
delivering real mail, which is Phase B).

### Updating the tunnel URL

Every time `cloudflared tunnel --url http://localhost:5000` restarts, it hands out a **new**
random `*.trycloudflare.com` URL. Whenever that happens during local testing:

```bash
cd email-worker
npx wrangler secret put BACKEND_WEBHOOK_URL
# paste the new tunnel URL
npx wrangler deploy
```

(A **named** tunnel, instead of a quick tunnel, gets a stable URL and doesn't need this — worth
switching to once past initial testing. See
[Cloudflare's docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
if you want that instead.)

---

## Phase B — domain + Email Routing setup (reference; already done for `chronoroam.app`)

1. **Add the domain to Cloudflare**: Cloudflare dashboard → **Add a site** → enter the domain
   → follow the nameserver-change instructions (update nameservers at whichever registrar you
   bought it through to point at Cloudflare's).
2. **Enable Email Routing**: in the dashboard, select the zone → **Email** →
   **Email Routing** → **Get started**. Cloudflare will ask you to add a few DNS records (MX +
   SPF/TXT) — it offers to add these automatically if the zone's already on Cloudflare.
3. **Create the catch-all rule**: still under Email Routing → **Routing rules** → **Catch-all
   address** → set action to **Send to a Worker** → select `chronoroam-email-intake` (the Worker
   deployed in Phase A). This is what makes `<anything>@<domain>` — not just one specific
   address — hit this Worker; the Worker itself figures out which ChronoRoam user "anything" maps
   to.
4. **Swap `BACKEND_WEBHOOK_URL` to the real backend** (not the dev tunnel) once the backend has a
   stable public URL of its own:
   ```bash
   npx wrangler secret put BACKEND_WEBHOOK_URL
   # paste the real backend's URL
   npx wrangler deploy
   ```

---

## Testing

### Backend/extraction pipeline only, no live email

Everything the Worker does once triggered (parse the email → POST to the backend) can be
verified directly by sending the exact same request the Worker would send — useful for testing
the backend side in isolation, without needing a real email to actually arrive:

```bash
curl -X POST "$BACKEND_WEBHOOK_URL/webhooks/email-intake" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $EMAIL_INTAKE_SHARED_SECRET" \
  -d '{
    "username": "yourusername",
    "emailText": "Flight Confirmation - Delta\nFlight DL 166\nDeparture: SEA on Mon, Sep 14, 2026 at 10:15 AM\nArrival: MSP on Mon, Sep 14, 2026 at 3:47 PM",
    "fromAddress": "noreply@delta.com"
  }'
```

A `{"imported":true,...}` response means the tunnel/backend URL, backend, and extraction pipeline
are all correctly wired.

### Real end-to-end test

1. Forward a real flight/transportation confirmation email to `<your-chronoroam-username>@chronoroam.app`.
2. Open the ChronoRoam app and tap the "+" (add item) button on any trip — a badge on it, and a
   "N Emails to Review" entry inside its category-grid screen (see `Planner.js`/
   `ConfirmationImportModal.js`), should show the pending import within a few seconds (refetches
   on tab focus, plus a 60s background poll — see `usePendingEmailImports.js`). There is currently
   no Home-page-level indicator, only this trip-page one.
3. Review, confirm a trip, and check the extracted fields look right before hitting Confirm.

If it doesn't show up: `npx wrangler tail` (from `email-worker/`) streams the Worker's live logs
— shows exactly what the Worker parsed and what the backend responded with, including any
`console.error` lines from the "backend unreachable" / "backend rejected" paths in `src/index.js`.

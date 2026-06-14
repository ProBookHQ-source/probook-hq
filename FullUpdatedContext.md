# ProBook — Master Context Document
*Paste this entire document at the start of any new chat. Last updated: June 14, 2026.*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** oiltoheatrebate@gmail.com
- **GitHub account:** ProBookHQ-source (linked to ayc98223@gmail.com)
- **GitHub repo:** https://github.com/ProBookHQ-source/probook-hq

---

## What ProBook Is
A full-stack auto-booking platform Jose built for his lead generation business. The model: Jose runs niche lead gen sites (starting with OilToHeatRebate.com for Seattle oil-to-heat-pump conversions), sells those leads to HVAC contractors, and uses ProBook to automatically match leads to contractors and handle appointment booking — no manual scheduling needed.

**The full lead flow:**
1. Homeowner fills out quiz on OilToHeatRebate.com (or future niche sites)
2. Google Apps Script saves lead to Google Sheet + sends owner email + sends homeowner confirmation
3. Apps Script bridge POSTs lead to ProBook's `/api/leads/inbound` endpoint *(currently dormant — see Bridge section)*
4. ProBook auto-matches lead to the right contractor by niche + zip code (round-robin rotation)
5. Homeowner gets email with personalized booking link (24hr expiry)
6. Homeowner picks time from contractor's live availability calendar
7. Appointment confirmed — both parties notified, synced to Google Calendar

**Business model:** Sell raw leads first (no ProBook needed), then upgrade contractors to booked leads via ProBook (much higher value product).

---

## Live Deployment
- **Live URL:** https://probook-hq-production.up.railway.app
- **Custom domain:** https://probookhq.com (live, via Cloudflare DNS → Railway)
- **Admin dashboard:** https://probookhq.com/admin
- **Lead form:** https://probookhq.com/get-quote
- **Contractor portal:** https://probookhq.com/contractor
- **Hosting:** Railway.app (auto-deploys on every GitHub push to main)
- **Railway project name:** compassionate-elegance
- **Database:** PostgreSQL (Railway managed — persistent across redeploys ✅)
- **Email:** Resend HTTP API (FROM: bookings@probookhq.com)

## Admin Login Credentials
- **Email:** oiltoheatrebate@gmail.com
- **Password hint:** the word ProBook followed by the year 2024 and an exclamation mark

**To create a new admin account if locked out:**
```bash
curl -X POST https://probookhq.com/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"oiltoheatrebate@gmail.com","password":"YOURPASSWORD","name":"Jose","setupKey":"setup-1234"}'
```
*(Register endpoint auto-disables after first admin is created)*

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** PostgreSQL via `pg` npm package (Railway managed)
- **Frontend:** React + Vite + Tailwind CSS (pre-built, served by Express)
- **Auth:** JWT tokens (admin + contractor roles, 7-day expiry)
- **Email:** Resend HTTP API — `RESEND_API_KEY` env var, FROM: bookings@probookhq.com
- **Calendar:** Google Calendar API OAuth2 (built, not yet configured with credentials)
- **Deployment:** Docker on Railway, auto-deploy via GitHub push
- **DNS:** Cloudflare (probookhq.com → Railway)
- **Rate limiting:** express-rate-limit (60/15min public, 10/15min auth endpoints)

---

## Railway Environment Variables (currently set)
```
DATABASE_URL        → auto-set by Railway PostgreSQL plugin
JWT_SECRET          → strong random hex string (set)
SETUP_KEY           → setup-1234
RESEND_API_KEY      → set (Resend account key)
FROM_EMAIL          → bookings@probookhq.com
BRAND_NAME          → ProBook
FRONTEND_URL        → https://probookhq.com
INBOUND_API_KEY     → set (Fort Knox key from randomkeygen.com) ← bridge auth key
GOOGLE_CLIENT_ID    → not set yet
GOOGLE_CLIENT_SECRET → not set yet
GOOGLE_REDIRECT_URI → not set yet
```

---

## File Locations
**Source of truth (Jose's Mac):**
```
~/Desktop/lead-booking-app/
```
**Always work from the Desktop copy. Push to GitHub to deploy.**

---

## Project Structure
```
lead-booking-app/
├── Dockerfile                ← Railway build config (node:20, no lockfile)
├── .dockerignore
├── railway.json
├── NewScript.js              ← Updated Google Apps Script (with bridge) — copy to Apps Script editor
├── package.json
├── .env                      ← Local config only, NOT committed
│
├── backend/
│   ├── server.js             ← Express server + middleware + Google OAuth routes
│   ├── database/
│   │   └── db.js             ← PostgreSQL pool + prepare() shim + schema init + migrations
│   ├── routes/
│   │   ├── auth.js           ← Admin login/register, contractor login
│   │   ├── leads.js          ← Public POST /, inbound bridge POST /inbound, admin CRUD
│   │   ├── contractors.js    ← Admin CRUD for contractors
│   │   ├── bookings.js       ← Booking flow: validate-token, book, cancel, complete
│   │   ├── availability.js   ← Weekly slots + date overrides + open-slots calculation
│   │   └── niches.js         ← Niche management
│   ├── services/
│   │   ├── matchingEngine.js ← Round-robin contractor matching by niche + zip
│   │   ├── notifications.js  ← Resend email templates (all user strings HTML-escaped)
│   │   └── googleCalendar.js ← OAuth2 Google Calendar sync
│   └── middleware/
│       └── auth.js           ← JWT verify, requireAdmin, requireContractor
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── AdminDashboard.jsx     ← Full lead/contractor/appointment management
        │   ├── ContractorPortal.jsx   ← Google Calendar-style UI, availability, blocking
        │   ├── BookingFlow.jsx        ← Homeowner picks date + time
        │   ├── LeadIntakeWidget.jsx   ← Embeddable lead form at /get-quote
        │   └── LoginPage.jsx
        └── lib/api.js                ← Axios instance pointed at backend
```

---

## Database Schema
All tables are PostgreSQL. Schema auto-initializes on boot via `db.js`.

- **`admins`** — admin accounts
- **`niches`** — service categories. Auto-seeded on first boot: Roofing, Plumbing, HVAC, Electrical, Landscaping, Painting, General Contracting
- **`contractors`** — accounts with niche_id, service_zip_codes (JSON array `["98101","98103"]` or `["*"]` for all), is_active, google_refresh_token
- **`leads`** — incoming leads. Columns: id, name, email, phone, niche_id, zip_code, description, status (new→matched→booked), assigned_contractor_id, **source_site**, **external_tier**, **external_score**, **metadata** (JSONB — stores all qualifying fields from external sites), created_at
- **`availability_slots`** — weekly recurring schedule per contractor (day_of_week 0-6, start_time, end_time)
- **`availability_overrides`** — date-specific blocks or custom hours (is_available, date, start_time, end_time)
- **`appointments`** — confirmed bookings. lead_id is nullable (NULL = external block). Partial unique index prevents double-booking (excludes cancelled).
- **`booking_tokens`** — UUID tokens (24hr expiry) for homeowner booking links
- **`round_robin_state`** — tracks last assigned contractor per niche + zip for fair rotation

**DB is persistent** — PostgreSQL on Railway, survives redeploys. ✅

---

## Key API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/leads/meta/niches | public | List niches |
| POST | /api/leads | public | Submit lead (from /get-quote form) |
| POST | /api/leads/inbound | INBOUND_API_KEY | Bridge endpoint for external sites |
| GET | /api/leads | admin JWT | List all leads |
| POST | /api/leads/:id/match | admin JWT | Manually trigger matching |
| POST | /api/leads/:id/resend-link | admin JWT | Resend booking link to homeowner |
| DELETE | /api/leads/:id | admin JWT | Delete lead |
| POST | /api/auth/admin/register | setup key | Create admin (disabled after first) |
| POST | /api/auth/admin/login | — | Admin login → JWT |
| POST | /api/auth/contractor/login | — | Contractor login → JWT |
| GET/PUT | /api/availability/:id/slots | contractor JWT | Weekly schedule |
| GET/POST/DELETE | /api/availability/:id/overrides | contractor JWT | Date overrides |
| POST | /api/availability/:id/manual-block | contractor JWT | Block external time slot |
| DELETE | /api/availability/:id/manual-block | contractor JWT | Remove block |
| GET | /api/availability/:id/open-slots | public | Available times for booking |
| GET | /api/bookings/validate-token/:token | public | Validate booking link |
| POST | /api/bookings/book | public | Confirm appointment |
| PUT | /api/bookings/:id/cancel | contractor JWT | Contractor cancels (sends rebook link) |
| PUT | /api/bookings/:id/admin-cancel | admin JWT | Admin cancels |
| GET | /api/auth/google/connect/:contractorId | contractor JWT | Start Google Calendar OAuth |
| GET | /api/auth/google/callback | — | Google OAuth callback |

---

## The Bridge (OilToHeatRebate.com → ProBook)
The bridge automatically sends leads from the quiz site into ProBook's matching engine.

**How it works:**
1. Homeowner submits quiz on OilToHeatRebate.com
2. Google Apps Script runs: saves to Sheet → sends emails → calls `sendToProBook(data)`
3. `sendToProBook` POSTs to `https://probookhq.com/api/leads/inbound` with Bearer token auth
4. ProBook creates the lead, stores qualifying fields in `metadata` JSONB, runs matching engine
5. Matched contractor gets email with full qualifying breakdown (heating system, ductwork, timeline, tier/score, etc.)

**Current status: DORMANT (intentionally)**
Jose doesn't have contractors onboarded yet, so the bridge is built but not active. The Apps Script checks for Script Properties before firing — if not set, it silently skips.

---

## ⚠️ IMPORTANT: How to Flip the Bridge ON
*When Jose has contractors onboarded and wants leads to flow automatically into ProBook:*

**Step 1 — Set Script Properties in Google Apps Script:**
1. Go to script.google.com → open the Apps Script for OilToHeatRebate.com
2. Click the gear icon (Project Settings) → scroll to Script Properties
3. Add these two properties:
   - `PROBOOK_API_URL` = `https://probookhq.com`
   - `PROBOOK_API_KEY` = *(the Fort Knox key set in Railway as INBOUND_API_KEY)*
4. Click Save

**Step 2 — Redeploy the Apps Script:**
- Deploy → Manage Deployments → create a new version

**That's it — bridge activates immediately. No code changes needed.**

The `INBOUND_API_KEY` is already set in Railway. The Apps Script (`NewScript.js`) already has the `sendToProBook()` function. Everything is built and waiting.

---

## OilToHeatRebate.com (The Lead Gen Site)
- **URL:** oiltoheatrebate.com
- **Hosted on:** Cloudflare Pages
- **What it does:** Seattle oil-heat homeowner quiz. 13 steps. Collects: address, zip_code, heating type, oil tank, ductwork, year built, sq footage, monthly oil bill, reason, timeline, homeowner status, household size, income bracket, name, email, phone, consent
- **Backend:** Google Apps Script (web app deployment) → saves to Google Sheet + sends emails
- **Lead scoring:** Server-side recalculation (Tier 1 ≥12pts, Tier 2 ≥7pts, Tier 3 lower). Score factors: heating system, ductwork, reason, timeline, homeowner status, income
- **Bot protection:** Cloudflare Turnstile
- **Sheet:** "OilToHeatRebate Leads" Google Sheet (26 columns, color-coded by tier)
- **Current script file:** `NewScript.js` in `~/Desktop/lead-booking-app/` — this is the version with the bridge built in. If you ever need to update the Apps Script, use this file.
- **Owner email:** oiltoheatrebate@gmail.com
- **Resend email:** oiltoheatrebate@gmail.com (Gmail via GmailApp in Apps Script)

---

## ContractorPortal Features (current state)
- Google Calendar-inspired weekly view with day columns
- Stats bar: This Week / Total / Upcoming counts
- Blocked days shown with red diagonal stripe overlay
- Date override picker: month + day inputs, smart year auto-detection (uses next year if date has passed), "next year" checkbox for manual override
- Custom `TimeSelect` component (replaces native dropdowns) — styled dropdown, 4AM–10PM range in 30-min increments
- Manual time blocking (external blocks with null lead_id)
- Google Calendar sync button (OAuth flow)
- Profile editing (name, phone, company)
- Availability fetch range: 365 days

---

## How to Push Changes to Railway
```bash
cd ~/Desktop/lead-booking-app
rm -f .git/index.lock .git/HEAD.lock   # clear lock files if needed
git add -A
git commit -m "Your message"
git push origin main
```
Railway auto-deploys within ~2 minutes of the push.

---

## How to Run Locally
```bash
cd ~/Desktop/lead-booking-app
npm start
```
Open http://localhost:4000. Requires `backend/node_modules` to exist. If missing:
```bash
npm install --prefix backend
npm install --prefix frontend
npm run --prefix frontend build
npm start
```
**Note:** Local `.env` uses local DB config. Railway has its own env vars set separately.

---

## Dockerfile Notes (important)
- Uses `node:20` Debian (NOT Alpine — Alpine breaks rollup with musl errors)
- Does NOT copy `package-lock.json` (Mac lockfile breaks Linux installs)
- Frontend install uses `--include=dev --include=optional` for Vite/rollup binaries
- Calls Vite as `node node_modules/vite/bin/vite.js build` (bypasses broken .bin/vite wrapper)

---

## What Still Needs to Be Done

### 1. Add First Contractor (when ready to go live)
Admin dashboard → Contractors → Add Contractor
- Name, email, temp password, niche (HVAC), zip codes (`["98101","98102","98103"]` or `["*"]` for all Seattle zips)
- Contractor logs in, sets their weekly availability, optionally connects Google Calendar

### 2. Test Full End-to-End Flow
Has never been tested with a real contractor. Steps:
1. Add contractor (above)
2. Log in as contractor → set availability
3. Submit test lead via /get-quote
4. Admin dashboard → lead should appear as "matched"
5. Homeowner email should arrive with booking link (check bookings@probookhq.com Resend logs)
6. Click link → pick time → confirm
7. Admin → Appointments → booked appointment appears

### 3. Flip the Bridge On (when contractors onboarded)
See the ⚠️ IMPORTANT section above. Two steps: set Script Properties + redeploy Apps Script.

### 4. Google Calendar Integration (optional)
Already built — just needs credentials:
1. console.cloud.google.com → create project → enable Google Calendar API
2. OAuth 2.0 Client ID → Web application
3. Authorized redirect URI: `https://probookhq.com/api/auth/google/callback`
4. Add to Railway: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### 5. Add Credit Card to Railway
Railway gives $5 free trial. After that the app goes offline. Cost ~$5-10/month.

---

## Common Issues and Fixes

**Git lock files blocking push**
→ `rm -f .git/index.lock .git/HEAD.lock` then retry

**Build failing on Railway**
→ Check Dockerfile exists in repo root. Must use node:20, no lockfile copy, `--include=dev --include=optional`, and `node node_modules/vite/bin/vite.js build`

**"No contractors available" when submitting lead**
→ No contractors added yet. Go to /admin → Contractors and add one with matching niche and zip codes.

**Booking email not arriving**
→ Check Resend dashboard for delivery logs. Verify `RESEND_API_KEY` and `FROM_EMAIL` are set in Railway.

**Contractor portal showing wrong data**
→ Check browser console for API errors. Most likely a JWT issue — have contractor log out and back in.

**Admin locked out**
→ Use the curl register command above (only works if no admin exists in DB)

---

## Scaling Plan
- **New niches:** Add contractors under different niches — matching engine handles routing automatically
- **New cities:** Add contractors with their service zip codes
- **New lead gen sites:** Each site gets its own `PROBOOK_NICHE` and `PROBOOK_SOURCE` in its Apps Script. The `/api/leads/inbound` endpoint auto-creates new niches if they don't exist.
- **SMS:** Add Twilio to `notifications.js` for text alerts to contractors
- **Payments:** Add Stripe to charge contractors per lead or monthly subscription
- **Higher email volume:** Move from Resend free tier to paid plan or swap to SendGrid

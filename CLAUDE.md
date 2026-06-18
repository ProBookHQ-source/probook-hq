# ProBook — Master Context Document
*Paste this entire document at the start of any new chat. Last updated: June 17, 2026.*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** oiltoheatrebate@gmail.com
- **GitHub account:** ProBookHQ-source (linked to ayc98223@gmail.com)
- **GitHub repo:** https://github.com/ProBookHQ-source/probook-hq

---

## What ProBook Is
A full-stack auto-booking platform for Jose's lead generation business. The model: Jose runs niche lead gen sites (starting with OilToHeatRebate.com for Seattle oil-to-heat-pump conversions), sells those leads to HVAC contractors, and uses ProBook to automatically match leads to contractors and handle appointment booking — no manual scheduling needed.

**The full lead flow:**
1. Homeowner fills out quiz on OilToHeatRebate.com (or future niche sites)
2. Google Apps Script saves lead to Google Sheet + sends owner email + sends homeowner confirmation
3. Apps Script bridge POSTs lead to ProBook's `/api/leads/inbound` endpoint *(currently dormant — see Bridge section)*
4. ProBook auto-matches lead to the right contractor by niche + zip code (round-robin rotation)
5. Homeowner gets email with personalized booking link (48hr expiry)
6. Homeowner picks time from contractor's live availability calendar
7. Appointment confirmed — both parties notified, synced to Google Calendar

**Business model:** Sell raw leads first (no ProBook needed), then upgrade contractors to booked leads via ProBook (much higher value product).

---

## Live Deployment
- **Live URL:** https://probook-hq-production.up.railway.app
- **Custom domain:** https://probookhq.com (live, via Cloudflare DNS → Railway)
- **Landing page:** https://probookhq.com
- **Admin dashboard:** https://probookhq.com/admin
- **Lead form:** https://probookhq.com/get-quote
- **Contractor portal:** https://probookhq.com/contractor
- **Contractor apply:** https://probookhq.com/apply
- **Login:** https://probookhq.com/login
- **Hosting:** Railway.app (auto-deploys on every GitHub push to main)
- **Railway project name:** compassionate-elegance
- **Database:** PostgreSQL (Railway managed — persistent across redeploys ✅)
- **Email:** Resend HTTP API (FROM: bookings@probookhq.com)
- **Build system:** `nixpacks.toml` (replaced Dockerfile — installs backend + frontend deps, builds React, starts node)

## Admin Login Credentials
- **Email:** oiltoheatrebate@gmail.com
- **Password hint:** the word ProBook followed by the year 2024 and an exclamation mark

**To create a new admin account if locked out:**
```bash
curl -X POST https://probookhq.com/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"oiltoheatrebate@gmail.com","password":"YOURPASSWORD","name":"Jose","setupKey":"YOUR_SETUP_KEY"}'
```
*(Register endpoint auto-disables after first admin is created)*

⚠️ **SETUP_KEY warning:** The default is `setup-1234` — change it in Railway env vars before launch.

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** PostgreSQL via `pg` npm package (Railway managed)
- **Frontend:** React + Vite + Tailwind CSS (pre-built, served by Express at `frontend/dist`)
- **Auth:** JWT tokens (admin + contractor roles, 7-day expiry)
- **Email:** Resend HTTP API — `RESEND_API_KEY` env var, FROM: bookings@probookhq.com
- **Calendar:** Google Calendar API OAuth2 (built, not yet configured with credentials)
- **Deployment:** nixpacks on Railway, auto-deploy via GitHub push
- **DNS:** Cloudflare (probookhq.com → Railway)
- **Rate limiting:** express-rate-limit (60/15min public, 10/15min auth, 3/hr apply)
- **Security:** Helmet.js security headers, express-async-errors for async error handling
- **Error monitoring:** Sentry (activates when `SENTRY_DSN` env var is set)
- **Scheduled jobs:** node-cron (appointment reminders 24hr before)

---

## Railway Environment Variables (currently set)
```
DATABASE_URL         → auto-set by Railway PostgreSQL plugin
JWT_SECRET           → strong random hex string (set)
SETUP_KEY            → setup-1234  ← CHANGE THIS before launch
RESEND_API_KEY       → set (Resend account key)
FROM_EMAIL           → bookings@probookhq.com
BRAND_NAME           → ProBook
FRONTEND_URL         → https://probookhq.com
INBOUND_API_KEY      → set (Fort Knox key from randomkeygen.com) ← bridge auth key
GOOGLE_CLIENT_ID     → not set yet
GOOGLE_CLIENT_SECRET → not set yet
GOOGLE_REDIRECT_URI  → not set yet
SENTRY_DSN           → not set yet (optional — add to enable error monitoring)
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
├── nixpacks.toml             ← Railway build config (replaces Dockerfile)
├── railway.json              ← Minimal (just schema ref, no buildCommand)
├── NewScript.js              ← Updated Google Apps Script (with bridge) — copy to Apps Script editor
├── package.json
├── .env                      ← Local config only, NOT committed
│
├── backend/
│   ├── server.js             ← Express server + middleware + Google OAuth routes + startup migrations
│   ├── database/
│   │   ├── db.js             ← PostgreSQL pool + prepare() shim + schema init
│   │   └── schema.sql        ← Full table definitions (source of truth for fresh DB)
│   ├── routes/
│   │   ├── auth.js           ← Admin + contractor login/register, forgot/reset password, approve/decline contractors
│   │   ├── leads.js          ← Public POST /, inbound bridge POST /inbound, admin CRUD, reassignment
│   │   ├── contractors.js    ← Admin CRUD for contractors (list, add, update, delete)
│   │   ├── bookings.js       ← Booking flow: validate-token, book, cancel, complete, delete; cancel-token/reschedule-token
│   │   ├── availability.js   ← Weekly slots + date overrides + open-slots + manual blocks
│   │   ├── niches.js         ← Niche CRUD (admin)
│   │   └── apikeys.js        ← Per-site API key management (admin)
│   ├── services/
│   │   ├── matchingEngine.js ← Round-robin contractor matching by niche + zip + radius
│   │   ├── notifications.js  ← All Resend email templates (HTML-escaped, branded)
│   │   ├── googleCalendar.js ← OAuth2 Google Calendar sync
│   │   ├── auditLog.js       ← Lead event logging (lead_events table)
│   │   └── cron.js           ← node-cron: 24hr appointment reminders
│   ├── middleware/
│   │   └── auth.js           ← JWT verify, requireAdmin, requireContractor
│   └── tests/
│       ├── matching.test.js
│       ├── booking.test.js
│       ├── dedup.test.js
│       ├── auditLog.test.js
│       └── apikeys.test.js
│
└── frontend/
    └── src/
        ├── App.jsx                    ← All routes defined here
        ├── api/client.js              ← Axios instance pointed at /api
        ├── pages/
        │   ├── LandingPage.jsx        ← Public marketing page (probookhq.com)
        │   ├── LoginPage.jsx          ← Admin + contractor login (role toggle), forgot password link
        │   ├── ForgotPassword.jsx     ← Contractor forgot password form
        │   ├── ResetPassword.jsx      ← Contractor password reset (reads ?token= from URL)
        │   ├── ContractorApply.jsx    ← Public self-signup form for contractors
        │   ├── AdminDashboard.jsx     ← Full lead/contractor/appointment/niche/apikey management
        │   ├── ContractorPortal.jsx   ← Calendar UI, availability, blocking, settings, change password
        │   ├── BookingFlow.jsx        ← Homeowner picks date + time from live calendar
        │   ├── LeadIntakeWidget.jsx   ← Embeddable lead form at /get-quote
        │   └── CancelPage.jsx         ← Homeowner self-service cancel/reschedule
        └── utils/formatPhone.js
```

---

## Database Schema
All tables are PostgreSQL. Schema auto-initializes on boot via `db.js`. Additional columns added by startup migrations in `server.js` (safe to re-run — uses `IF NOT EXISTS`).

### Core Tables

**`admins`** — admin accounts (id, email, password_hash, name, created_at)

**`niches`** — service categories. Auto-seeded on first boot: Roofing, Plumbing, HVAC, Electrical, Landscaping, Painting, General Contracting

**`contractors`**
```
id, email, password_hash, name, phone, company_name,
niche_id, service_zip_codes (TEXT — JSON array ["98101"] or ["*"]),
status TEXT DEFAULT 'pending',   ← pending | approved | declined
service_radius_miles INTEGER,
max_appointments_per_day INTEGER,
is_active INTEGER DEFAULT 1,
applied_at, declined_at,
google_refresh_token, google_calendar_id,
reset_token TEXT,                ← for forgot-password flow
reset_token_expires TIMESTAMPTZ,
created_at
```

**`leads`**
```
id, name, email, phone, niche_id, zip_code, description,
status TEXT DEFAULT 'new',       ← new | matched | booked | completed | cancelled
assigned_contractor_id,
source_site, external_tier, external_score,
metadata JSONB,                  ← stores qualifying fields from external sites
created_at
```

**`appointments`**
```
id, lead_id (nullable — NULL = external block), contractor_id,
scheduled_date, scheduled_time, duration_minutes DEFAULT 60,
status TEXT DEFAULT 'pending',   ← pending | confirmed | cancelled | completed
google_event_id, notes, created_at, updated_at
```
Partial unique index prevents double-booking (excludes cancelled rows).

**`availability_slots`** — weekly recurring schedule (contractor_id, day_of_week 0-6, start_time, end_time, is_active)

**`availability_overrides`** — date-specific blocks or custom hours (contractor_id, date, is_available, start_time, end_time, reason)

**`booking_tokens`** — UUID tokens (48hr expiry) for homeowner booking links. Has `source` field (`'booking'` or `'reschedule'`) and `abuse_count` for reschedule abuse prevention.

**`round_robin_state`** — tracks last assigned contractor per niche + zip for fair rotation

**`lead_events`** — full audit trail. Every status change, email send, match attempt, etc. (lead_id, event_type, payload JSONB, created_at)

**`api_keys`** — per-site API keys for inbound lead submissions (id, name, key_hash, slug, is_active, created_at)

---

## Key API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/leads | Submit lead (from /get-quote form) |
| POST | /api/leads/inbound | Bridge endpoint for external sites (INBOUND_API_KEY auth) |
| GET | /api/leads/meta/niches | List niches |
| GET | /api/bookings/validate-token/:token | Validate booking link |
| POST | /api/bookings/book | Confirm appointment |
| POST | /api/bookings/cancel-token | Homeowner self-cancel via token |
| POST | /api/bookings/reschedule-token | Homeowner self-reschedule via token |
| GET | /api/availability/:id/open-slots | Available times for booking |
| GET | /api/niches | List all niches |
| POST | /api/auth/contractor/apply | Contractor self-signup |
| POST | /api/auth/contractor/login | Contractor login → JWT |
| POST | /api/auth/contractor/forgot-password | Send password reset email |
| POST | /api/auth/contractor/reset-password | Reset password via token |
| POST | /api/auth/admin/login | Admin login → JWT |
| POST | /api/auth/admin/register | Create first admin (disabled after one exists) |

### Admin (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET/DELETE | /api/leads | List / delete leads |
| POST | /api/leads/:id/match | Manually trigger matching |
| POST | /api/leads/:id/resend-link | Resend booking link |
| POST | /api/leads/:id/reassign | Reassign lead to different contractor |
| GET/POST/PUT/DELETE | /api/contractors | Contractor management |
| PUT | /api/auth/contractor/:id/approve | Approve contractor application |
| PUT | /api/auth/contractor/:id/decline | Decline contractor application |
| DELETE | /api/auth/contractor/:id/application | Delete declined application |
| GET/PUT/DELETE | /api/bookings | Appointment management |
| DELETE | /api/bookings/:id | Delete cancelled/completed appointment |
| GET/POST/DELETE | /api/niches | Niche management |
| GET/POST/PUT/DELETE | /api/apikeys | Per-site API key management |

### Contractor (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | /api/availability/:id/slots | Weekly schedule |
| GET/POST/DELETE | /api/availability/:id/overrides | Date overrides |
| POST/DELETE | /api/availability/:id/manual-block | Block/unblock time slots |
| PUT | /api/bookings/:id/cancel | Contractor cancels (sends rebook link) |
| PUT | /api/bookings/:id/complete | Mark as completed |
| GET | /api/auth/google/connect/:contractorId | Start Google Calendar OAuth |
| GET | /api/auth/google/callback | Google OAuth callback |

---

## Email Templates (notifications.js)
All emails use a shared branded HTML base with ProBook logo, indigo accent (#6366f1). Uses Resend HTTP API.

| Function | Trigger | Recipients |
|----------|---------|-----------|
| `sendBookingLinkToHomeowner` | Lead matched | Homeowner |
| `sendContractorNewLead` | Lead matched | Contractor |
| `sendAppointmentConfirmed` | Booking confirmed | Both |
| `sendContractorAppointmentBooked` | Booking confirmed | Contractor |
| `sendAppointmentCancelledHomeowner` | Cancelled | Homeowner |
| `sendAppointmentCancelledContractor` | Cancelled | Contractor |
| `sendRescheduleLink` | Contractor cancels | Homeowner (rebook link) |
| `sendRescheduledNotification` | Homeowner reschedules | Contractor |
| `sendAppointmentReminder` | 24hr before appt | Homeowner |
| `sendContractorReminder` | 24hr before appt | Contractor |
| `sendContractorApplicationAck` | Contractor applies | Contractor |
| `sendContractorApplicationAlert` | Contractor applies | Admin (oiltoheatrebate@gmail.com) |
| `sendContractorApproved` | Admin approves | Contractor |
| `sendContractorDeclined` | Admin declines | Contractor |
| `sendPasswordReset` | Forgot password | Contractor |

---

## Contractor Flow (Self-Signup)
Contractors can apply themselves at `/apply`:
1. Fill out form: name, email, password, phone, company, niche, service zips, radius
2. Gets acknowledgment email, admin gets alert email
3. Admin reviews in dashboard → Contractors tab → pending applications shown with Approve/Decline buttons
4. On approve: `is_active` set to 1, contractor gets approval email, can now log in
5. On decline: contractor gets decline email, admin can delete the application record
6. Approval uses `is_active` (not a `status` column) — the `status` column exists but approve/decline only uses `is_active`

---

## Forgot Password Flow
1. Contractor goes to `/forgot-password`, enters email
2. Backend checks `is_active = 1` (must be an approved/active contractor)
3. Generates `crypto.randomBytes(32).toString('hex')` token, stores with 1hr expiry
4. Sends email with link to `/reset-password?token=...`
5. Reset page validates token + expiry, lets user set new password (min 8 chars)
6. On success: token cleared, password bcrypt-hashed and saved
7. Always returns 200 on forgot-password (prevents email enumeration)

---

## Password Visibility Toggle
All password fields across the app have an Eye/EyeOff toggle button:
- LoginPage.jsx (sign in)
- ContractorApply.jsx (password + confirm)
- ResetPassword.jsx (new password + confirm)
- ContractorPortal.jsx — Change Password section (current, new, confirm)
- AdminDashboard.jsx — Add Contractor form (temporary password)

---

## Homeowner Self-Service Cancel/Reschedule
- Cancel/reschedule tokens stored in `booking_tokens` with `source` field
- Homeowners get cancel + reschedule links in confirmation emails
- `/cancel` route + `CancelPage.jsx` handles both flows
- Reschedule abuse prevention: checks `abuse_count` before cancelling existing appointment
- On reschedule: new booking token issued, contractor gets `sendRescheduledNotification` email

---

## Matching Engine (matchingEngine.js)
- Matches by niche_id + zip code
- Supports `["*"]` zip code (serves all zips)
- Radius-based: also matches contractors whose `service_zip_codes` are within `service_radius_miles` of the lead's zip
- Round-robin rotation via `round_robin_state` table
- Enforces `max_appointments_per_day` per contractor
- Lead deduplication: same email + niche within 30 days = no new lead created

---

## Admin Dashboard Features
Tabs: Leads | Contractors | Appointments | Performance | API Keys | Niches

**Leads tab:** Full lead list with status badges, search, manual match trigger, resend booking link, reassign contractor, delete

**Contractors tab:**
- Active contractors list with niche, zip codes, activity status
- "Add Contractor" form (admin-created accounts with temp password)
- Pending applications section with Approve/Decline buttons
- Declined applications with Delete option

**Appointments tab:**
- Full appointment list with lead info, contractor, date/time, status
- Cancel button (all statuses)
- Delete button (cancelled/completed only — with confirm step)

**Performance tab:** Lead conversion rates, contractor stats, booking funnel metrics

**API Keys tab:** Create/manage per-site API keys for external lead sources

**Niches tab:** Add/edit/delete service niches

---

## ContractorPortal Features
- Google Calendar-inspired weekly view with day columns
- Stats bar: This Week / Total / Upcoming counts
- Blocked days shown with red diagonal stripe overlay
- Date override picker: month + day inputs, smart year auto-detection
- Custom `TimeSelect` component (styled dropdown, 4AM–10PM, 30-min increments)
- Manual time blocking (external blocks with null lead_id)
- Google Calendar sync button (OAuth flow)
- Profile editing: name, phone, company
- Settings: service radius, max appointments per day
- Change Password section (current + new + confirm, all with eye toggle)
- Availability fetch range: 365 days

---

## The Bridge (OilToHeatRebate.com → ProBook)
Automatically sends leads from the quiz site into ProBook's matching engine.

**Current status: DORMANT (intentionally)** — no contractors onboarded yet.

**How to flip it ON when ready:**
1. Go to script.google.com → open Apps Script for OilToHeatRebate.com
2. Click gear → Project Settings → Script Properties → Add:
   - `PROBOOK_API_URL` = `https://probookhq.com`
   - `PROBOOK_API_KEY` = *(the value of `INBOUND_API_KEY` in Railway)*
3. Deploy → Manage Deployments → new version

No code changes needed — everything is already built and waiting.

---

## OilToHeatRebate.com (The Lead Gen Site)
- **URL:** oiltoheatrebate.com — hosted on Cloudflare Pages
- **What it does:** Seattle oil-heat homeowner quiz (13 steps)
- **Backend:** Google Apps Script → saves to Google Sheet + sends emails
- **Lead scoring:** Tier 1 ≥12pts, Tier 2 ≥7pts, Tier 3 lower
- **Bot protection:** Cloudflare Turnstile
- **Current script:** `NewScript.js` in `~/Desktop/lead-booking-app/`

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

**Note:** The sandbox (Claude's shell) cannot push to GitHub via HTTPS. Always push from Jose's terminal.

---

## How to Run Locally
```bash
cd ~/Desktop/lead-booking-app
npm start
```
Open http://localhost:4000. If `backend/node_modules` is missing:
```bash
npm install --prefix backend
npm install --prefix frontend
npm run --prefix frontend build
npm start
```

---

## nixpacks.toml (Railway Build Config)
```toml
[phases.install]
cmds = [
  "cd backend && npm install",
  "cd frontend && npm install"
]
[phases.build]
cmds = ["cd frontend && npm run build"]
[start]
cmd = "node backend/server.js"
```
This replaced the Dockerfile. Railway uses this automatically.

---

## Startup Migrations (server.js)
On every boot, `server.js` runs these safe migrations before accepting requests:
```javascript
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token TEXT`);
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`);
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
await db.query(`UPDATE contractors SET status = 'approved' WHERE is_active = 1 AND status IS NULL`);
```

---

## Common Issues and Fixes

**Git lock files blocking push**
→ `rm -f .git/index.lock .git/HEAD.lock` then retry

**"Cannot GET /" on Railway**
→ Check `nixpacks.toml` exists in repo root. Frontend must be built (`cd frontend && npm run build`). The Express catch-all serves `frontend/dist/index.html`.

**"No contractors available" when submitting lead**
→ No active contractors added. Go to /admin → Contractors and add one with matching niche and zip codes.

**Booking email not arriving**
→ Check Resend dashboard for delivery logs. Verify `RESEND_API_KEY` and `FROM_EMAIL` are set in Railway.

**Admin locked out**
→ Use the curl register command above (only works if no admin exists in DB)

**Forgot password email not arriving**
→ Contractor must have `is_active = 1` in DB. Check Railway logs for `[FORGOT-PW]` entries.

**column "status" does not exist error**
→ Startup migration adds this. Should never happen on a live deploy since migrations run on boot.

---

## Pre-Launch Checklist (target: June 21, 2026)
- [ ] Change `SETUP_KEY` from `setup-1234` to something strong in Railway
- [ ] Test full end-to-end booking flow with real contractor
- [ ] Verify Google Calendar integration (or confirm it's deferred)
- [ ] Add credit card to Railway (app goes offline after free trial)
- [ ] Flip bridge ON once first contractor is onboarded and availability is set

## Full End-to-End Test Steps
1. Go to /apply → submit contractor application → check approval email arrives
2. Admin dashboard → approve contractor application
3. Contractor logs in → sets weekly availability
4. Submit test lead via /get-quote
5. Admin → Leads → lead should appear as "matched"
6. Check homeowner email arrives with booking link (check Resend dashboard)
7. Click booking link → pick time → confirm
8. Admin → Appointments → booked appointment appears
9. Check contractor notification email arrived
10. Go to /forgot-password → request reset → confirm email arrives → reset password → log in

---

## Scaling Plan
- **New niches:** Add contractors under different niches — matching engine handles routing automatically
- **New cities:** Add contractors with their service zip codes
- **New lead gen sites:** Each site gets its own `PROBOOK_NICHE` and `PROBOOK_SOURCE` in its Apps Script
- **SMS:** Add Twilio to `notifications.js` for text alerts to contractors
- **Payments:** Add Stripe to charge contractors per lead or monthly subscription

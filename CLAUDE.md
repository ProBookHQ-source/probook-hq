# Tractify — Master Context Document
*Last updated: July 18, 2026.*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** oiltoheatrebate@gmail.com
- **GitHub account:** ProBookHQ-source (linked to ayc98223@gmail.com)
- **GitHub repo:** https://github.com/ProBookHQ-source/probook-hq

---

## What Tractify Is

Tractify is software that fills HVAC contractors' calendars with booked jobs automatically. It is not a website company. It is not a lead gen service. It is a pipeline — contractors set their available hours, Tractify does the rest. When a customer needs HVAC work, they find the contractor, pick a time that works, and it goes straight on the calendar. No missed calls. No back and forth. No chasing leads. Just booked jobs showing up while the contractor is on the job site.

**The three-word brand position: "Tractify fills your calendar."**

**The website is invisible infrastructure.** Contractors aren't buying a website — they're buying a pipeline of booked jobs. The website is just how it works, the same way nobody buys Shopify because they want a website. They buy it because they want to sell things. Never lead with website, system, or technology. Lead with the outcome.

**The full lead flow:**
1. Homeowner fills out the lead form on the contractor's Tractify-powered site
2. Tractify receives the lead via the inbound API (API key tied to that contractor)
3. Homeowner gets an email with a personal booking link (48hr expiry)
4. Homeowner picks a time from the contractor's live availability calendar
5. Appointment confirmed — both parties notified, synced to Google Calendar

**The pitch:** "You set your available hours. We do the rest. When a customer needs HVAC work, they find you, pick a time that works for you, and it goes straight on your calendar. No missed calls. No back and forth. No chasing leads. Just booked jobs showing up while you're on the job site."

**The personal demo close:** Jose sends every prospect his booking link — `tractifyhq.com/schedule/book`. When they book the call, he opens with: *"You just booked this call the exact same way your customers will book jobs with you."* The prospect experiences the product before Jose says another word.

**Note on the booking page:** The slug is `book` (not `jose`). Contractor account display name is "The Tractify Team". The 15-min call is for setting up a free trial — not a product demo. The product demos itself when real jobs start booking.

---

## The Three Big Ideas (July 2026 Pivot)

These came out of Jose's cold calling sessions July 13-14. They fundamentally change the direction of the business.

### Idea 0: The Free Trial Funnel — Subdomains Before Domains
Every contractor starts as a free trial on a Tractify subdomain (e.g. `premiercomforthvac.tractifyhq.com`). Full product, real booking flow, real appointments. Zero cost to Jose. They get their 5 free booked jobs. If they convert — buy the real domain, charge the $2,000 setup fee. If they don't — you spent nothing.

**Why this is the scalable model:**
- Zero marginal cost per free trial — subdomain costs nothing
- You only invest real money on contractors who already proved they convert
- The funnel filters itself — engaged contractors convert, the rest self-select out
- Scales infinitely online — one ad running 24/7, zero per-trial cost
- The entire online pitch becomes: **"Let us get you your first 5 jobs free. No strings."**

**How to deploy a free trial subdomain (manual process — first 2-3 clients):**
No subdomain automation needed yet. Do it by hand:
1. Edit `CLIENT` config in `~/Desktop/hvac-template/index.html` with client's info
2. Deploy to a new Cloudflare Pages project → auto-gets a `.pages.dev` URL
3. In Cloudflare DNS, add a CNAME: `premiercomforthvac` → `[their-pages-project].pages.dev`
4. Client is live at `premiercomforthvac.tractifyhq.com` — looks professional, costs nothing
5. Create their contractor account + API key in Tractify admin, link the API key to their contractor
6. **⚠️ Set `allowed_origins` to `https://premiercomforthvac.tractifyhq.com`**
7. Have contractor set their weekly availability in the portal

When they convert (pay): buy their real domain, add it as a custom domain on the same Cloudflare Pages project. No code changes needed.

**Build subdomain automation AFTER you have 3+ clients.** Do it by hand first — prove the process, then automate it.

**The online ad:**
Hook: *"HVAC contractors — we'll book your first 5 jobs for free."*
Body: *"No website needed. No commitment. We plug you into our software, set up your availability, and get 5 booked appointments onto your calendar automatically. If you love it we keep going. If not, no hard feelings."*
CTA: *"Book a 15 minute call to get started."* → tractifyhq.com/schedule/jose

**The flow:**
1. Contractor books a call → deploy on subdomain → they get 5 free jobs
2. After jobs 2-3: check-in call — let them tell you it's working
3. After 5 jobs: conversion call — $2,000 setup + $500/month retainer
4. They say yes: buy domain, full build, start retainer
5. They say no: you spent nothing, move on

### Idea 1: Stop Selling Websites, Sell Booked Appointments
The old pitch was "I'll build you a free website." This frames Tractify as a web design service — low perceived value, tons of competition, and the word "free" signals desperation.

The new pitch is: **"I get booked appointments onto your calendar."** The website is just infrastructure. The product is the outcome. This also solves the price anchoring problem — you're not selling a $500 website, you're selling $5,000+ worth of booked jobs.

### Idea 2: Inline Booking on the HVAC Template (No Email Step)
Currently after a homeowner fills out the lead form, they wait for a booking link email. That email step kills conversion — people click away, miss the email, or forget.

The new flow: **after form submit, show the slot picker inline right on the page.** The homeowner books immediately while they're already engaged. No email to wait for, no link to click, no friction. The booking happens in one session.

This requires:
- `POST /api/leads/inbound` to return a `booking_token` in its JSON response (small backend change)
- The HVAC template `index.html` to show a booking UI inline after submission using that token
- Still NOT built yet — this is Task 3 + Task 4

### Idea 3: Missed Call Text-Back (The SaaS Phase)
The most powerful future direction: pitch Tractify not as a website but as an **app**.

The pitch: *"Every time you miss a call, a text automatically goes out to that number. It says: 'Hey, sorry I missed you — here's a link to pick a time that works for you.' The customer clicks it, books a slot, and it goes on your calendar. You never lose another customer to a missed call."*

This is pure SaaS — no website build required, works with any contractor's existing website. The missed-call trigger can be built with Twilio (webhook on missed call → auto-SMS with booking link). This is Phase 2 and is not yet built, but the booking infrastructure already exists.

**Why this idea is powerful:** Contractors already feel the pain of missed calls every day. This pitches to a problem they know and hate, in language they understand. It's not "a system" (don't use that word — triggers resistance). It's "an app that texts them back for you."

---

## Sales Strategy (Active as of July 2026)

**Current phase:** Free case study phase — onboard 2 HVAC contractors for free in exchange for testimonials and real revenue data. Use those results to unlock paid clients and scale.

**Two channels running simultaneously:**
- **Online (Jose owns):** Organic social content + paid ads targeting HVAC contractors. Cast a wide net. Scale what works.
- **Cold calling (Daniel owns):** Direct outreach to Seattle/Snohomish contractors. Same pitch, human delivery.

Both channels feed the same funnel — `tractifyhq.com/schedule/jose`.

---

### Online Channel Strategy

**The online pitch:**

Hook: *"HVAC contractors — how many calls did you miss today?"*

Body: *"You set your available hours. We do the rest. When a customer needs HVAC work, they find you, pick a time that works for you, and it goes straight on your calendar. No missed calls. No back and forth. No chasing leads. Just booked jobs showing up while you're on the job site. We're plugging in 2 HVAC contractors in the Seattle area for free to prove it works. You get booked jobs. We get our case study. Zero cost to you."*

CTA: *"Book a 15 minute call and we'll show you exactly how it works."* → `tractifyhq.com/schedule/jose`

**Content approach:**
- Start organic — test messaging before spending money
- Platforms: Facebook first (HVAC owners are 35-55), Instagram secondary
- Content types: screen recordings of the booking flow, before/after stories, case study results
- Brand is faceless while building — no face on camera, text overlay and screen recordings
- When a piece of organic content performs, put paid spend behind it to scale
- **Never** mention website, system, or technology in ads — only outcomes and booked jobs

**Why online scales better than cold calling:** A cold call requires a stranger to trust you in 60 seconds. An ad that offers 5 free booked jobs with zero risk self-selects contractors who are already interested. Lower friction, wider reach, and the funnel runs 24/7 without Jose or Daniel on the phone.

---

### Cold Calling Channel

**The Master Script (July 2026 — use this verbatim):**

---

**Opener:**
*"Hey [name], my name's Jose — quick question, are you currently buying booked jobs?"*

That's it. Stop talking. Let them respond.

---

**If they say NO or not interested:**
*"No worries at all. I'll tell you what — save my number. When you're ready to have jobs booking straight onto your calendar automatically, call me back and I'll hand you the first 5 for free. No strings."*

Hang up. Move on. Don't pitch. Don't chase. You planted a seed — they'll think about it later.

---

**If they say YES or show any curiosity:**
*"Perfect. We built software that plugs directly into your schedule — customers find you, pick a time that works for you, and it goes straight on your calendar. No missed calls, no phone tag, no back and forth. Just jobs showing up automatically while you're out in the field."*

Pause. Let it land. Then:

*"We're bringing on 2 contractors in the Seattle area right now completely free. First 5 booked jobs on us — we just want the case study. You'd be crazy not to at least take a look."*

Then:

*"You got 15 minutes this week? I'll walk you through the whole thing."*

---

**When they agree to a call — send them:** `tractifyhq.com/schedule/book`

Have them book it live on the phone if possible. They experience the product before the sales call even starts.

---

**The sales call opener (the close):**
*"Before I say anything — you just booked this call the exact same way your customers are going to book jobs with you. That's the whole product right there."*

---

**If no answer — voicemail:**
*"Hey [name], Jose here. Save my number — when you're ready to have jobs booking onto your calendar automatically, call me back and I'll give you the first 5 for free."*

Short. No explaining. No pitching. Just the outcome and the offer.

---

**Rules that never change:**
- Never say "website", "system", or "software" in a cold call or voicemail — only say "booked jobs"
- Never chase a no — plant the seed and move on, confidence is everything
- The offer is always the same: first 5 booked jobs free, no strings, just want the case study
- Always get them to book at tractifyhq.com/schedule/jose — they experience the product before the sales call

---

**Voice agent / auto-attendant = warm lead:** They already understand missed calls cost money. Pitch: *"A voice agent is a fancy voicemail. Customers still can't book — they still have to wait for you to call back. This gets booked jobs onto your calendar automatically."*

---

**Prospects to follow up with (as of July 18):**
- **Zach (McFarland HVAC)** — VERBAL YES on July 14. Follow up July 20th with new script.
- **Justin** — Scheduled callback, score 8/10. Follow up July 20th.
- **Rusty (Cool Heat 365)** — Has his direct cell. Call after 12pm.

**New pitch for follow-up calls (July 2026):** Lead with the free 5 jobs offer, not the website. "Save my number — when you're ready to have jobs booking onto your calendar automatically, call me back and I'll give you the first 5 for free."

**Key objections and counters are in:**
- `~/Desktop/Tractify-SuperContext/04-SALES-PLAYBOOK.docx`
- The cheat sheet PDF (generated by `build_cheatsheet.py`)

---

### Team Structure
- **Jose** — product, strategy, online content and ads, building
- **Daniel** — cold calling, sales team lead, eventually director of operations
- August 2026: Jose and Daniel calling together Mon-Fri 7am-12pm. Jose closes first 2-3 case study clients before August so Daniel inherits a proven script and real results to point to.
- Daniel learns on the job — Jose calls while Daniel listens, then Daniel calls while Jose listens, debrief after every session.
- This script is what Daniel learns. Simple enough that anyone can do it, sharp enough to convert.

---

## Live Deployment
- **Live URL:** https://tractifyhq.com
- **Internal Railway URL:** https://probook-hq-production.up.railway.app (keep — Railway internal)
- **Landing page:** https://tractifyhq.com
- **Admin dashboard:** https://tractifyhq.com/admin
- **Jose's booking page:** https://tractifyhq.com/schedule/book ✅ LIVE (slug = 'book', display = 'The Tractify Team')
- **Lead form:** https://tractifyhq.com/get-quote
- **Contractor portal:** https://tractifyhq.com/contractor
- **Contractor apply:** https://tractifyhq.com/apply
- **Login:** https://tractifyhq.com/login
- **Hosting:** Railway.app (auto-deploys on every GitHub push to main)
- **Railway project name:** compassionate-elegance
- **Database:** PostgreSQL (Railway managed — persistent across redeploys ✅)
- **Email:** Resend HTTP API (FROM: bookings@tractifyhq.com) — domain verified via Cloudflare ✅
- **DNS:** Cloudflare (tractifyhq.com → Railway)
- **Build system:** `nixpacks.toml`

## Admin Login Credentials
- **Email:** oiltoheatrebate@gmail.com
- **Password hint:** the word Tractify followed by the year 2024 and an exclamation mark

**To create a new admin account if locked out:**
```bash
curl -X POST https://tractifyhq.com/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"oiltoheatrebate@gmail.com","password":"YOURPASSWORD","name":"Jose","setupKey":"YOUR_SETUP_KEY"}'
```
*(Register endpoint auto-disables after first admin is created)*

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** PostgreSQL via `pg` npm package (Railway managed)
- **Frontend:** React + Vite + Tailwind CSS (pre-built, served by Express at `frontend/dist`)
- **Auth:** JWT tokens (admin + contractor roles, 7-day expiry)
- **Email:** Resend HTTP API — `RESEND_API_KEY` env var, FROM: bookings@tractifyhq.com
- **Calendar:** Google Calendar API OAuth2 (built, not yet configured with credentials)
- **Deployment:** nixpacks on Railway, auto-deploy via GitHub push
- **DNS:** Cloudflare (tractifyhq.com → Railway)
- **Rate limiting:** express-rate-limit (60/15min public, 10/15min auth, 3/hr apply)
- **Security:** Helmet.js security headers, express-async-errors for async error handling
- **Error monitoring:** Sentry (activates when `SENTRY_DSN` env var is set)
- **Scheduled jobs:** node-cron (appointment reminders 24hr before)

---

## Railway Environment Variables (currently set)
```
DATABASE_URL         → auto-set by Railway PostgreSQL plugin
JWT_SECRET           → strong random hex string (set)
SETUP_KEY            → CHANGED from default (set to strong value) ✅
RESEND_API_KEY       → set (Resend account key)
FROM_EMAIL           → bookings@tractifyhq.com
BRAND_NAME           → Tractify
FRONTEND_URL         → https://tractifyhq.com
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
├── build_cheatsheet.py       ← Generates sales cheat sheet PDF (updated July 18 with new script)
├── transcribe-call.py        ← Transcribes .m4a call recordings via AssemblyAI (API key via env var — NOT hardcoded)
├── Tractify-Sales-Script.docx ← Master cold call script Word doc (full YES/NO paths, voicemail, objections)
├── prospect-tracker.xlsx     ← Live prospect pipeline (synced to SuperContext)
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
│   │   ├── contractors.js    ← Admin CRUD + public slug lookup (GET /public/:slug for /schedule pages)
│   │   ├── bookings.js       ← Token booking, book-direct, cancel, complete, delete; cancel-token/reschedule-token
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
    ├── index.html             ← viewport: width=device-width, initial-scale=1.0, shrink-to-fit=no
    └── src/
        ├── App.jsx                    ← All routes defined here
        ├── index.css                  ← Global CSS: overflow-x hidden on html/body/#root, 16px input font-size
        ├── api/client.js              ← Axios instance pointed at /api
        ├── pages/
        │   ├── LandingPage.jsx        ← Public marketing page
        │   ├── LoginPage.jsx          ← Admin + contractor login (role toggle), forgot password link
        │   ├── ForgotPassword.jsx     ← Contractor forgot password form
        │   ├── ResetPassword.jsx      ← Contractor password reset (reads ?token= from URL)
        │   ├── ContractorApply.jsx    ← Public self-signup form for contractors
        │   ├── AdminDashboard.jsx     ← Full lead/contractor/appointment/niche/apikey management
        │   ├── ContractorPortal.jsx   ← Calendar UI, availability, blocking, settings, change password
        │   ├── BookingFlow.jsx        ← Homeowner picks date + time (token-based, from email link)
        │   ├── DirectBooking.jsx      ← Personal booking page (/schedule/:slug) — no token, no lead
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
booking_slug TEXT UNIQUE,        ← e.g. 'book' → tractifyhq.com/schedule/book (Jose's slug is 'book', display = 'The Tractify Team')
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
id, lead_id (nullable — NULL = direct booking or manual block), contractor_id,
scheduled_date, scheduled_time, duration_minutes DEFAULT 60,
status TEXT DEFAULT 'pending',   ← pending | confirmed | cancelled | completed
google_event_id, notes, cancel_token, reschedule_token,
created_at, updated_at
```
- Direct bookings (from `/schedule/:slug`) have `lead_id = NULL`. Contact info stored as JSON in `notes`.
- Partial unique index prevents double-booking (excludes cancelled rows).

**`availability_slots`** — weekly recurring schedule (contractor_id, day_of_week 0-6, start_time, end_time, is_active)

**`availability_overrides`** — date-specific blocks or custom hours (contractor_id, date, is_available, start_time, end_time, reason)

**`booking_tokens`** — UUID tokens (48hr expiry) for homeowner booking links. Has `source` field (`'booking'` or `'reschedule'`) and `abuse_count` for reschedule abuse prevention.

**`round_robin_state`** — tracks last assigned contractor per niche + zip for fair rotation

**`lead_events`** — full audit trail. Every status change, email send, match attempt, etc. (lead_id, event_type, payload JSONB, created_at)

**`inbound_api_keys`** — per-site API keys for inbound lead submissions (id, name, key TEXT plaintext, source_slug, is_active, created_at, last_used_at, contractor_id TEXT → contractors.id, allowed_origins TEXT)
- `contractor_id` is optional. When set, inbound leads from that key skip the matching engine and route directly to that contractor.
- `allowed_origins` is optional. Comma-separated domains. When set, rejects requests whose `Origin` header doesn't match — prevents API key theft.

**`intake_events`** — client onboarding intake form step tracking (id, type, step INTEGER, step_name TEXT, direction TEXT, client_id TEXT, business_name TEXT, ts TIMESTAMPTZ, created_at)

---

## Key API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/leads | Submit lead (from /get-quote form) |
| POST | /api/leads/inbound | Bridge endpoint for external sites (INBOUND_API_KEY auth) |
| GET | /api/leads/meta/niches | List niches |
| GET | /api/contractors/public/:slug | Look up contractor by booking_slug (for /schedule pages) |
| GET | /api/bookings/validate-token/:token | Validate booking link |
| POST | /api/bookings/book | Confirm appointment (token-based, from email link) |
| POST | /api/bookings/book-direct | Book without token — used by /schedule/:slug pages |
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
| POST | /api/intake/track | Track intake form step event |

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
| GET/PUT/DELETE | /api/bookings | Appointment management (uses LEFT JOINs — shows direct bookings too) |
| DELETE | /api/bookings/:id | Delete cancelled/completed appointment |
| GET/POST/DELETE | /api/niches | Niche management |
| GET/POST/PUT/DELETE | /api/apikeys | Per-site API key management |
| GET | /api/intake/stats | Intake funnel dropoff stats |

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

## Personal Booking Page (/schedule/:slug)

**How it works:**
- Each contractor can have a `booking_slug` (e.g. `'jose'`) set in the DB
- `tractifyhq.com/schedule/jose` loads `DirectBooking.jsx` which looks up the contractor by slug
- Visitor fills out name + email + phone (required) + optional notes
- Picks date/time from the contractor's live availability
- Books via `POST /api/bookings/book-direct` — creates appointment with `lead_id = NULL`, sends email to both parties
- No lead, no token, no email step — fully self-contained

**Jose's slug:** `jose` → `tractifyhq.com/schedule/jose` ✅ LIVE

**Use case:** Jose texts this link to every prospect after a cold call. The demo is the close.

**To set a slug for a new contractor:**
```sql
UPDATE contractors SET booking_slug = 'their-slug' WHERE email = 'their@email.com';
```

---

## Email Templates (notifications.js)
All emails use a shared branded HTML base with Tractify logo, indigo accent (#6366f1). Uses Resend HTTP API.

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

Direct bookings (via `/schedule/:slug`) send inline HTML emails built directly in `bookings.js` — not via notifications.js.

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
- Includes direct bookings (lead_id = NULL) — shown without lead name
- Cancel button (all statuses)
- Delete button (cancelled/completed only — with confirm step)

**Performance tab:** Lead conversion rates, contractor stats, booking funnel metrics

**API Keys tab:** Create/manage per-site API keys for external lead sources. Each key can optionally be linked to a specific contractor. Each key also supports an optional `allowed_origins` field.

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
- Logout button in mobile bottom nav

---

## Mobile Responsiveness (fully complete as of June 19, 2026)
All pages are fully responsive. Key gotchas for future work:
- `overflow-x: clip` is NOT supported on iOS < 15.4 — always use `overflow-x: hidden`
- Setting `overflow-y: auto` implicitly sets `overflow-x: auto` per CSS spec — always pair explicitly
- `@layer base` rules have lower cascade priority — put critical overflow rules outside any `@layer`
- Long text without `truncate` + `min-w-0` in flex containers genuinely widens layout past the viewport
- Safari auto-zooms inputs when `font-size < 16px` — fixed globally in `index.css` with `font-size: 16px !important`

---

## The Bridge (OilToHeatRebate.com → Tractify)
Automatically sends leads from the quiz site into Tractify's matching engine.

**Current status: DORMANT (intentionally)** — no contractors onboarded yet.

**How to flip it ON when ready:**
1. Go to script.google.com → open Apps Script for OilToHeatRebate.com
2. Click gear → Project Settings → Script Properties → Add:
   - `PROBOOK_API_URL` = `https://tractifyhq.com`
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
git commit -m 'Your message'           # use single quotes — zsh expands ! in double quotes
git push origin main
```
Railway auto-deploys within ~2 minutes of the push.

**Note:** Claude's shell cannot push to GitHub via HTTPS. Always push from Jose's terminal.

**If Railway does not auto-deploy after a successful push:**
```bash
git commit --allow-empty -m 'Trigger Railway redeploy'
git push origin main
```

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

---

## Startup Migrations (server.js)
On every boot, `server.js` runs these safe migrations before accepting requests:
```javascript
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token TEXT`);
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`);
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
await db.query(`UPDATE contractors SET status = 'approved' WHERE is_active = 1 AND status IS NULL`);
await db.query(`ALTER TABLE inbound_api_keys ADD COLUMN IF NOT EXISTS contractor_id TEXT REFERENCES contractors(id) ON DELETE SET NULL`);
await db.query(`ALTER TABLE inbound_api_keys ADD COLUMN IF NOT EXISTS allowed_origins TEXT`);
await db.query(`CREATE TABLE IF NOT EXISTS intake_events (...)`);
await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE`);
await db.query(`ALTER TABLE appointments ALTER COLUMN lead_id DROP NOT NULL`).catch(() => {});
```
Note: `contractor_id` must be TEXT (not INTEGER) because `contractors.id` is a UUID stored as TEXT.

---

## Common Issues and Fixes

**Git lock files blocking push**
→ `rm -f .git/index.lock .git/HEAD.lock` then retry

**zsh "event not found" on git commit**
→ zsh expands `!` in double-quoted strings. Use single quotes: `git commit -m 'Your message'`

**"Cannot GET /" on Railway**
→ Check `nixpacks.toml` exists in repo root. Frontend must be built. Express catch-all serves `frontend/dist/index.html`.

**"No contractors available" when submitting lead**
→ No active contractors. Go to /admin → Contractors and add one with matching niche and zip codes.

**Booking email not arriving**
→ Check Resend dashboard. Verify `RESEND_API_KEY` and `FROM_EMAIL` are set in Railway.

**Admin locked out**
→ Use the curl register command above (only works if no admin exists in DB).

**Forgot password email not arriving**
→ Contractor must have `is_active = 1` in DB. Check Railway logs for `[FORGOT-PW]` entries.

**iOS Safari auto-zooms on input focus**
→ Safari zooms when input `font-size < 16px`. Fixed globally in `index.css`. If it recurs, verify the `font-size: 16px !important` rule is present outside any `@layer`.

**Mobile horizontal scroll**
→ Two root causes: (1) overflow rules in `@layer` can be overridden — rules must be outside any layer. (2) Long text without `truncate` + `min-w-0` genuinely widens layout. Both must be fixed together.

**Contractor can't block same-day time slots**
→ Root cause: `new Date("YYYY-MM-DD")` parses as UTC midnight, making today look like yesterday in Pacific time. Fixed by constructing date as `new Date(year, month, day)` (local time).

**API key rejected with 403 "Origin not allowed"**
→ The key has `allowed_origins` set. Add your domain to the allowed list in Admin → API Keys, or clear the field to allow any origin.

**Direct booking (/schedule/:slug) doesn't appear in admin appointments tab**
→ Should not happen — admin query uses LEFT JOINs. If it does, verify bookings.js admin GET uses `LEFT JOIN leads` not `JOIN leads`.

**Inline booking on HVAC template shows demo/fake slots instead of real availability**
→ Two causes: (1) API key is not linked to a contractor — go to Admin → API Keys, edit the key, set the Contractor field. Without this, `contractor_id` is null in the API response and demo mode runs. (2) CORS not configured — `/api/availability` and `/api/bookings/book` must have wildcard CORS set in server.js (already done July 18).

**Inline booking shows "No openings in the next 2 weeks"**
→ API key IS linked to a contractor but the open-slots fetch is failing. Check: (1) CORS headers in server.js, (2) contractor has weekly availability set in the portal, (3) fetch URL uses `TRACTIFY_API = 'https://tractifyhq.com'` (not the old Railway URL).

---

## Launch Status (as of July 18, 2026)

**Completed (all features):**
- ✅ Full app built, deployed, tested — tractifyhq.com live
- ✅ Dedicated contractor routing via API keys — HVAC client sites route leads directly to their contractor
- ✅ Domain-restricted API keys (`allowed_origins`) — prevents API key theft
- ✅ Same-day time block fix — UTC timezone parsing bug fixed in ContractorPortal.jsx
- ✅ Intake form step tracking — `/api/intake/track` + `intake_events` table
- ✅ Full rebrand to Tractify (July 4) — tractifyhq.com, Cloudflare, Resend, Railway all updated
- ✅ Personal booking page `/schedule/book` (July 16) — live at tractifyhq.com/schedule/book, display = "The Tractify Team"
- ✅ `book-direct` endpoint — books appointments without lead/token (for /schedule pages)
- ✅ Admin appointments query fixed — LEFT JOINs so direct bookings appear in dashboard
- ✅ Direct booking emails upgraded (July 18) — `sendDirectBookingConfirmation` + `sendDirectBookingContractorAlert` in notifications.js replace old inline HTML
- ✅ Task 3: `POST /api/leads/inbound` returns `booking_token` + `contractor_id` on dedicated contractor path (July 18)
- ✅ Task 4: Inline slot picker on HVAC template — shows immediately after form submit, no email step (July 18)
- ✅ Booking link email suppressed on dedicated path — inline booking replaces it entirely (July 18)
- ✅ CORS fix — `/api/availability` and `/api/bookings/book` now accept cross-origin requests from external client sites (July 18)
- ✅ AssemblyAI key secured — removed hardcoded key from transcribe-call.py, now reads from `ASSEMBLYAI_API_KEY` env var in ~/.zshrc
- ✅ Master cold call script — Tractify-Sales-Script.docx created, cheat sheet PDF updated with new pitch
- ✅ DirectBooking.jsx updated — headline "Claim Your 5 Free Booked Jobs", Tractify branding, phone formatting

**Remaining — code:**
- [ ] Intake funnel view in admin dashboard (data collecting, UI not built)
- [ ] Missed call text-back via Twilio (Phase 2 SaaS feature)
- [ ] Subdomain auto-deploy (build AFTER 3+ manual client deployments prove the process)

**Remaining — operational:**
- [ ] ⚠️ Push July 18 changes to Railway: `git add -A && git commit -m 'Fix: CORS + email suppression' && git push origin main`
- [ ] ⚠️ Jose set availability in contractor portal Sunday night before Monday calls (currently only Monday 9–12 set)
- [ ] Set up email campaign targeting HVAC contractors (need a contractor email list first)
- [ ] Onboard first 2-3 free trial clients using manual subdomain process (see Idea 0 section)
- [ ] Run full end-to-end test with a real contractor before onboarding clients
- [ ] Flip bridge ON once first contractor is onboarded (script properties only — no code changes)
- [ ] Google Calendar credentials (deferred — add to Railway when ready)

---

## ⚠️ Client Go-Live Checklist (HVAC Website Bundle)
**Run through this every single time you onboard a new HVAC client. Do not skip steps.**

### Free Trial Setup (subdomain — no domain purchase)
1. [ ] Edit CLIENT config in `~/Desktop/hvac-template/index.html` with client info
2. [ ] Deploy to a new Cloudflare Pages project → note the `.pages.dev` URL
3. [ ] In Cloudflare DNS, add CNAME: `[clientslug]` → `[their-pages-project].pages.dev`
   - Client is now live at `clientslug.tractifyhq.com`
4. [ ] Create contractor account in Tractify admin → Contractors → Add Contractor
5. [ ] Create API key in Tractify admin → API Keys → New Key
   - Name: client's business name
   - Source slug: their subdomain slug
   - **Link to their contractor account** ← required for inline booking to work
   - **⚠️ Set `Allowed Origins` to `https://clientslug.tractifyhq.com`**
6. [ ] Copy the generated API key — shown once only
7. [ ] Paste the key into `tractifyKey` in the CLIENT config, redeploy to Cloudflare Pages
8. [ ] Have contractor log into Tractify portal and set their weekly availability
9. [ ] Test: submit the lead form → inline slot picker should show with real slots → book a test appointment
10. [ ] Send contractor their portal login

### Conversion (paid — real domain)
1. [ ] Buy their real domain
2. [ ] Add as custom domain in the existing Cloudflare Pages project (same project, no redeploy)
3. [ ] Update `allowed_origins` in the API key to include the real domain
4. [ ] Charge $2,000 setup + $500/month retainer
5. [ ] Replace `YOUR_PROBOOK_API_KEY` in the CLIENT config with the real key from step 3
6. [ ] Update `CLIENT.sourceSite` and `CLIENT.siteUrl` to the client's actual domain
7. [ ] Swap in client's logo, cover photo (from R2 bucket if uploaded via intake form)
8. [ ] Deploy to Cloudflare Pages (or client's host)
9. [ ] Verify the deployed domain matches what you set in `allowed_origins` — test a lead submission
10. [ ] Have contractor log into Tractify portal and set their weekly availability
11. [ ] Send contractor their Tractify portal login

---

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
- **SMS / missed call text-back:** Add Twilio to `notifications.js` — Phase 2 SaaS product
- **Payments:** Add Stripe to charge contractors per lead or monthly subscription

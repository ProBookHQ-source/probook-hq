# ProBook — Master Context Document
*Paste this entire document at the start of any new chat. Last updated: June 2026.*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** oiltoheatrebate@gmail.com
- **GitHub account:** ProBookHQ-source (linked to ayc98223@gmail.com)
- **GitHub repo:** https://github.com/ProBookHQ-source/probook-hq

---

## What ProBook Is
A full-stack auto-booking platform Jose built for his lead generation business. It connects homeowners who need contractor work (roofing, HVAC, plumbing, etc.) with contractors automatically — no manual scheduling needed.

**The full flow:**
1. Homeowner fills out a lead form on Jose's website
2. ProBook auto-matches them to the right contractor by niche + zip code (round-robin rotation)
3. Homeowner gets an email with a personalized booking link (expires in 48 hours)
4. They pick a time from the contractor's live availability calendar
5. Appointment confirmed — both parties notified, synced to Google Calendar

---

## Live Deployment
- **Live URL:** https://probook-hq-production.up.railway.app
- **Login page:** https://probook-hq-production.up.railway.app/login
- **Admin dashboard:** https://probook-hq-production.up.railway.app/admin
- **Lead form (embeddable):** https://probook-hq-production.up.railway.app/get-quote
- **Hosting:** Railway.app (free trial — ~$5/month after trial ends)
- **Railway project name:** compassionate-elegance
- **Database:** SQLite stored in the Railway container (IMPORTANT: wipes on every redeploy — needs PostgreSQL upgrade for production)

## Admin Login Credentials
- **Email:** oiltoheatrebate@gmail.com
- **Password hint:** the word ProBook followed by the year 2024 and an exclamation mark
- **Setup key** (for creating new admin accounts): `setup-1234`

To create a new admin account if locked out:
```bash
curl -X POST https://probook-hq-production.up.railway.app/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"oiltoheatrebate@gmail.com","password":"YOURPASSWORD","name":"Jose","setupKey":"setup-1234"}'
```

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** SQLite via `node-sqlite3-wasm` (pure WebAssembly, no native compilation)
- **Frontend:** React + Vite + Tailwind CSS (pre-built, served by Express)
- **Auth:** JWT tokens (admin + contractor roles)
- **Email:** Nodemailer (SMTP — not yet configured)
- **Calendar:** Google Calendar API OAuth2 (not yet configured)
- **Deployment:** Docker on Railway

---

## File Locations
**On Jose's Mac (Desktop copy):**
```
~/Desktop/lead-booking-app/
```

**Original build location (also exists):**
```
/Users/joseromero/Library/Application Support/Claude/local-agent-mode-sessions/
f03ce153-03b1-4323-b6d1-ab14a5572e6a/5aa24c26-ea7e-49db-824a-ff5b49ee23dd/
local_32d9d256-4c02-4f46-98f0-3850cdd67661/outputs/lead-booking-app/
```

**Use the Desktop copy for all future work.**

---

## Project Structure
```
lead-booking-app/
├── Dockerfile                ← How Railway builds and runs the app
├── .dockerignore             ← Excludes node_modules, lockfiles, .env from Docker
├── nixpacks.toml             ← Legacy (Dockerfile takes precedence now)
├── railway.json              ← Railway start command config
├── setup.sh                  ← One-command local setup script
├── package.json              ← Root scripts
├── .env                      ← Local config (not committed to git)
│
├── backend/
│   ├── server.js             ← Express server, serves API + built frontend
│   ├── package.json
│   ├── database/
│   │   ├── db.js             ← SQLite connection + compatibility shim
│   │   └── schema.sql        ← All database tables
│   ├── routes/
│   │   ├── auth.js           ← /api/auth/admin/login, /admin/register, /contractor/login
│   │   ├── leads.js          ← /api/leads (public POST + admin GET)
│   │   ├── contractors.js    ← CRUD for contractors (admin only)
│   │   ├── bookings.js       ← /api/bookings/validate-token, confirm
│   │   └── availability.js   ← Weekly slots + date overrides + open-slots calc
│   ├── services/
│   │   ├── matchingEngine.js ← Round-robin contractor matching
│   │   ├── notifications.js  ← Nodemailer email sending
│   │   └── googleCalendar.js ← OAuth2 Google Calendar sync
│   └── middleware/
│       └── auth.js           ← JWT verify, requireAdmin, requireContractor
│
└── frontend/
    └── src/pages/
        ├── AdminDashboard.jsx     ← Full management UI
        ├── ContractorPortal.jsx   ← Contractor availability + Google Calendar
        ├── BookingFlow.jsx        ← Homeowner picks date + time
        ├── LeadIntakeWidget.jsx   ← Embeddable lead form at /get-quote
        └── LoginPage.jsx          ← Admin/contractor toggle login
```

---

## Database Tables
- `admins` — admin accounts
- `niches` — service categories, auto-seeded on first boot: Roofing, Plumbing, HVAC, Electrical, Landscaping, Painting, General Contracting
- `contractors` — contractor accounts with niche_id, service_zip_codes (JSON array), is_active
- `leads` — incoming leads, status: new → matched → booked
- `availability_slots` — weekly recurring schedule per contractor (day_of_week 0-6)
- `availability_overrides` — date-specific blocks or custom hours
- `appointments` — confirmed bookings
- `booking_tokens` — UUID tokens (48hr expiry) for homeowner booking links
- `round_robin_state` — tracks last assigned contractor per niche + zip

**CRITICAL:** Database on Railway is ephemeral — it wipes on every redeploy. Jose needs to:
1. Re-create his admin account after each redeploy (use curl command above)
2. Eventually migrate to PostgreSQL for production persistence

---

## Key API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/leads/meta/niches | public | List niches (for lead form) |
| POST | /api/leads | public | Submit a new lead |
| GET | /api/leads | admin JWT | List all leads |
| POST | /api/leads/:id/match | admin JWT | Manually trigger matching |
| POST | /api/auth/admin/register | setup key | Create admin account |
| POST | /api/auth/admin/login | — | Admin login, returns JWT |
| POST | /api/auth/contractor/login | — | Contractor login |
| GET/PUT | /api/availability/:id/slots | contractor JWT | Weekly schedule |
| GET/POST | /api/availability/:id/overrides | contractor JWT | Date overrides |
| GET | /api/availability/:id/open-slots | public | Available times for booking |
| GET | /api/bookings/validate-token/:token | public | Validate booking link |
| POST | /api/bookings/confirm | public | Confirm appointment |
| POST | /api/contractors | admin JWT | Add a contractor |

---

## How to Run Locally (on Jose's Mac)
```bash
# Make sure the app is on the Desktop first
cd ~/Desktop/lead-booking-app

# Start the server (installs nothing — dependencies already installed)
npm start
```
Then open http://localhost:4000

**If node_modules are missing (fresh clone):**
```bash
npm install --prefix backend
npm install --prefix frontend
npm run --prefix frontend build
npm start
```

**To push changes to Railway (auto-deploys):**
```bash
cd ~/Desktop/lead-booking-app
git add .
git commit -m "Your message"
git push
```

---

## How Railway Deployment Works
Railway watches the GitHub repo `ProBookHQ-source/probook-hq`. Every `git push` to main triggers an automatic redeploy. The Dockerfile controls how it builds:

1. Installs backend dependencies (production only)
2. Installs frontend dependencies (including dev + optional for Vite/rollup)
3. Calls `node node_modules/vite/bin/vite.js build` directly (bypasses broken .bin/vite wrapper)
4. Copies backend source
5. Starts with `node backend/server.js`

**Critical Dockerfile notes:**
- Uses `node:20` (Debian, NOT Alpine — Alpine causes rollup musl errors)
- Does NOT copy package-lock.json (it's Mac-generated and breaks Linux installs)
- Uses `--include=dev --include=optional` for frontend install
- Calls vite via `node node_modules/vite/bin/vite.js build` NOT `npm run build`

---

## What Still Needs to Be Done (Priority Order)

### 1. Fix Database Persistence (URGENT for production)
Every Railway redeploy wipes the SQLite database. Options:
- Add a Railway volume (simple, free)
- Switch to PostgreSQL (Railway has a free PostgreSQL plugin — recommended)
To add PostgreSQL: Railway dashboard → your project → Add Service → Database → PostgreSQL. Then update `backend/database/db.js` to use `pg` instead of `node-sqlite3-wasm`.

### 2. Set Up SMTP Email (NEEDED for booking links to send)
Without this, homeowners never receive their booking link. Go to Railway → probook-hq → Variables and add:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=oiltoheatrebate@gmail.com
SMTP_PASS=your-16-char-gmail-app-password
FROM_EMAIL=oiltoheatrebate@gmail.com
BRAND_NAME=ProBook
FRONTEND_URL=https://probook-hq-production.up.railway.app
JWT_SECRET=any-long-random-string
```
For Gmail App Password: myaccount.google.com/apppasswords → create one for "ProBook"

### 3. Point probookhq.com to Railway
Jose bought probookhq.com on Namecheap. Status unknown — may or may not be pointed to Cloudflare yet.
Steps:
1. Railway → Settings → Networking → Custom Domain → add `probookhq.com`
2. Railway gives you a CNAME target
3. In Cloudflare DNS → add CNAME record pointing probookhq.com to that target

### 4. Add First Contractor
Go to https://probook-hq-production.up.railway.app/admin → Contractors → Add Contractor
Fill in: name, email, temporary password, niche (e.g. HVAC), zip codes they serve (JSON array like `["98101","98102","98103"]` or `["*"]` for all zips)

### 5. Test Full End-to-End Flow
This has NEVER been tested. Here's how to test it:
1. Add a contractor (step 4 above)
2. Log in as that contractor, set their availability (what days/hours they work)
3. Submit a fake lead via: https://probook-hq-production.up.railway.app/get-quote
4. Check admin dashboard — lead should appear with status "matched"
5. Check email — homeowner booking link should arrive (requires SMTP step 2)
6. Click the booking link, pick a time, confirm
7. Check admin → Appointments — should show the booked appointment

### 6. Integrate with oiltoheatrebate.com Lead Form
Jose has a lead gen site at oiltoheatrebate.com with a Google Apps Script backend (FinalScript.js). Currently it saves leads to Google Sheets and sends email notifications but does NOT auto-book.

To integrate: add ~10 lines to FinalScript.js after `replyToLead(data)` that POST to ProBook's API:
```javascript
var proBookUrl = 'https://probook-hq-production.up.railway.app/api/leads';
var proBookPayload = JSON.stringify({
  name: data.first_name + ' ' + (data.last_name || ''),
  email: data.email,
  phone: data.phone,
  niche_id: 'HVAC_NICHE_ID_FROM_PROBOOK', // get from /api/leads/meta/niches
  zip_code: extractZip(data.address), // parse zip from address field
  description: 'Oil to heat pump conversion inquiry'
});
var proBookOptions = {
  method: 'post',
  contentType: 'application/json',
  payload: proBookPayload,
  muteHttpExceptions: true
};
UrlFetchApp.fetch(proBookUrl, proBookOptions);
```
Jose's lead form already collects full address including zip code.

### 7. Add Credit Card to Railway
Railway gives $5 free trial credit. After that, the app goes offline unless a card is added. Cost is ~$5-10/month for this size app.

### 8. Google Calendar Integration (Optional)
Contractors can connect Google Calendar so appointments sync automatically. Setup:
1. console.cloud.google.com → create project → enable Google Calendar API
2. Create OAuth 2.0 credentials → Web application
3. Authorized redirect URI: `https://probook-hq-production.up.railway.app/api/auth/google/callback`
4. Add to Railway Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

---

## Business Context
Jose runs a lead generation business. He's starting with oil-to-heat-pump conversions in Seattle (oiltoheatrebate.com) but plans to scale across multiple niches (roofing, HVAC, plumbing, etc.) and cities across the US. ProBook is the infrastructure that makes scaling possible — instead of manually scheduling each lead, the system handles matching and booking automatically so Jose can manage many contractors across many niches without extra work.

Current niche: HVAC (heat pump conversions), Seattle WA
Current contractors: 0 added yet
Current leads: 0

---

## Common Issues and Fixes

**"Database wiped after redeploy"**
→ Expected behavior with SQLite on Railway. Re-create admin account with curl command above. Long-term fix: add PostgreSQL.

**"Booking email not sending"**
→ SMTP not configured. Add environment variables to Railway (see step 2 above).

**"Login not working on Railway"**
→ Database was wiped. Re-create admin account.

**"Build failing on Railway"**
→ Check that Dockerfile exists in repo root. The winning Dockerfile uses node:20, --include=dev --include=optional, and calls vite via `node node_modules/vite/bin/vite.js build`.

**"npm start not working locally"**
→ Make sure backend/node_modules exists. Run `npm install --prefix backend` first.

**"No contractors available" when submitting lead**
→ No contractors added yet. Go to /admin → Contractors and add one with matching niche and zip codes.

---

## Embedding Lead Form on Any Website
```html
<iframe
  src="https://probook-hq-production.up.railway.app/get-quote"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius: 16px;">
</iframe>
```

---

## Scaling Plan
- **Database:** Swap SQLite → PostgreSQL when moving to production
- **Email:** Move to SendGrid for high-volume delivery
- **SMS:** Add Twilio to notifications.js for text alerts to contractors
- **Payments:** Add Stripe to charge contractors per lead or monthly subscription
- **New niches:** Just add contractors under different niches — the matching engine handles the rest
- **New cities:** Just add contractors with the zip codes they serve

# ProBook — Auto-Booking for Lead Generation

A full-stack scheduling platform that automatically matches leads to contractors and books appointments — runs as a **single server**, one command.

---

## How It Works

1. **Lead submits a form** on your website (`/get-quote`)
2. **Matching engine** finds the right contractor by niche + zip code using round-robin
3. **Homeowner gets an email** with a personalized booking link
4. **They pick a time** from the contractor's live availability
5. **Appointment is confirmed** — both parties notified, event added to Google Calendar

---

## Getting Started (One Command)

**Requirements:** Node.js 18+ — download at https://nodejs.org if you don't have it.

```bash
# 1. Open Terminal, navigate to this folder
cd lead-booking-app

# 2. Run setup (installs everything + creates your admin account)
bash setup.sh

# 3. Start the app
npm start
```

Then open **http://localhost:4000** — that's it. One server, one URL.

---

## After Setup

### Add your first contractor
1. Log in at http://localhost:4000/login (select **Admin**)
2. Go to **Contractors → Add Contractor**
3. Fill in their name, email, niche (e.g. Roofing), and zip codes they serve
4. They'll log in at http://localhost:4000/login (select **Contractor**) and set their availability

### Add email so booking links get sent
Open `.env` and fill in your SMTP settings:
```
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
FROM_EMAIL=you@yourdomain.com
BRAND_NAME=Your Business Name
```
Gmail tip: use a [Google App Password](https://myaccount.google.com/apppasswords), not your real password.

### Embed the lead form on your website
```html
<iframe
  src="http://localhost:4000/get-quote"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius: 16px;">
</iframe>
```
(Replace `localhost:4000` with your real domain once deployed.)

---

## Project Structure

```
lead-booking-app/
├── setup.sh              ← Run this first
├── package.json          ← Root scripts (npm start, npm run setup)
├── .env                  ← Your config (created by setup.sh)
│
├── backend/              Node.js/Express — serves API + built frontend
│   ├── server.js
│   ├── database/         SQLite schema + connection
│   ├── routes/           auth, contractors, leads, bookings, availability
│   ├── services/         matchingEngine, googleCalendar, notifications
│   └── middleware/       JWT auth
│
└── frontend/             React + Vite + Tailwind (built into backend/dist)
    └── src/
        ├── pages/
        │   ├── AdminDashboard.jsx     Full management UI
        │   ├── ContractorPortal.jsx   Contractor calendar + availability
        │   ├── BookingFlow.jsx        Homeowner picks appointment time
        │   ├── LeadIntakeWidget.jsx   Embeddable lead form
        │   └── LoginPage.jsx
        └── api/client.js
```

---

## Configuring Google Calendar Sync (Optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Google Calendar API**
3. Credentials → Create → **OAuth 2.0 Client ID** → Web application
4. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
5. Add to `.env`:
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Contractors connect their calendar from **Settings** inside their portal.

---

## Key URLs

| URL | Description |
|-----|-------------|
| `http://localhost:4000/` | Redirects to login |
| `http://localhost:4000/login` | Admin + contractor login |
| `http://localhost:4000/admin` | Admin dashboard |
| `http://localhost:4000/contractor` | Contractor portal |
| `http://localhost:4000/get-quote` | Homeowner lead form (embed this) |
| `http://localhost:4000/book/:token` | Homeowner booking page (via email) |

---

## Deploying to the Internet

When you're ready to make it live, the easiest option is **Railway**:

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add your `.env` values in Railway's environment settings
4. Railway gives you a public URL — update `GOOGLE_REDIRECT_URI` in `.env` to match

---

## Scaling Up

- **Database:** Swap SQLite → PostgreSQL when you outgrow it (just update `db.js`)
- **Email:** Move to SendGrid for high-volume delivery
- **SMS:** Add Twilio to `services/notifications.js` for text alerts
- **Payments:** Add Stripe if you want to charge contractors per lead

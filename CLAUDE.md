# Tractify — Master Context Document
*Last updated: July 31, 2026 (session 19 — SMS drip fully rewritten + Brain 3 final audit. Session 19 changes: (1) All smsAI.js drip messages rewritten — urgency-first, no soft language, no portal references. Availability step now portal-free: pulls contractor's hours from availability_slots DB at drip time, shows them inline in the text, asks contractor to confirm or text corrections. (2) formatAvailabilityForSms helper added to smsAI.js — formats DB slots into compact readable string for SMS. (3) update_availability_slot tool added to handleContractorSms — DELETE + INSERT pattern lets AI update recurring weekly availability slots entirely over text, no portal login required. (4) Brain 3 final audit — 3 fixes in homeownerSmsAI.js: handleService state race condition fixed (service_description saved first, state only advances to awaiting_slot after confirming slots exist — previously a slot-fetch failure left homeowners stuck in awaiting_slot with empty offered_slots); "We're fully booked — I'll have someone call you" broken promise removed (changed to "Text us again in a few days"); handleEmail confirmation SMS now includes the actual appointment date + time instead of just "check your email." (5) Session 18 — RAG diagnostic knowledge system built and live. Brain 3 audit fully closed: all 5 logic gaps fixed across sessions 17-18. Three Brain 3 fixes this session: (1) getLastConfirmedBooking now covers awaiting_email state so homeowners who book but never reply with their email are still recognized as returning on next contact. (2) Double-booking race condition — 23505 unique_violation now caught in handleSlotPick, re-fetches fresh slots and re-offers instead of returning generic error. (3) facebook.js returning homeowner greeting fixed — uses isReturning flag from startHomeownerSession so returning homeowners no longer get asked for their address again. RAG system built: pgvector + Voyage AI voyage-3-lite (512 dims, NOT OpenAI 1536) for semantic retrieval. Files: embeddings.js (Voyage AI wrapper with 4-retry exponential backoff), diagnosticKnowledge.js (getRelevantKnowledge + storeKnowledgeBatch + clearNicheKnowledge), loadDiagnosticKnowledge.js (one-time seeder — HVAC + Roofing + Electrical + Plumbing + Landscaping knowledge loaded). VOYAGE_API_KEY added to Railway env vars. Expanding to a new niche = DB inserts only, zero code changes. Session 17 — SMS maximization complete. Five major builds: (1) HVAC templates (both index.html + backend/templates/hvac-template.html) stripped to phone-only form — single phone field, submit fires Brain 3 conversational SMS immediately, success shows "Check Your Texts!" instead of inline slot picker. (2) Brain 3 name capture + lead_id threading — Brain 3 asks homeowner for name+address together via Claude JSON extraction, patches lead record as info is captured, skips lead creation in handleSlotPick when lead_id already set. (3) Cancelled appointment → Brain 3 rebook SMS — both contractor cancel (PUT /:id/cancel) and homeowner cancel (POST /cancel-token/:token) now fire a Brain 3 rebook session alongside the existing email: startRebookSession() creates a session with state='awaiting_slot', name+address+service pre-populated, offered_slots fetched — homeowner gets a text with available times immediately. (4) Pre-appointment morning-of confirmation SMS cron — runs 7:30 AM daily, texts homeowners their appointment details + "Reply CANCEL to cancel." CANCEL keyword in inbound-sms handler cancels the appointment + starts Brain 3 rebook session. pre_appt_sms_sent_at column tracks sends. (5) Review request SMS cron — runs hourly at :50, fires 2-4 hours after appointment marked 'completed', texts homeowner a Google review link using contractor.place_id. homeowner_review_sms_sent_at column tracks sends. New export from homeownerSmsAI.js: startRebookSession(). Session 16 — Brain 3 (homeowner conversational SMS) fully built and deployed. All three SMS drip missing pieces built: power message (after availability confirmed), calendar blocking training (after twilio confirmed), post-appointment close tracking via SMS cron (hourly at :45). Bug fixed: twilio.js inbound-sms contractor SELECT was missing sms_power_message_sent + sms_calendar_training_sent columns — specialty messages could fire repeatedly. Fixed by adding columns to SELECT. Session 15 — GBP API status resolved: OAuth credentials confirmed working — all three stored in Railway env vars as GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GBP_REFRESH_TOKEN (do not store values here). ⚠️ The original GBP_REFRESH_TOKEN was exposed in git commit history (session 14) and must be considered compromised. Before implementing GBP automation: (1) revoke the token at myaccount.google.com → Security → Third-party apps → Tractify GBP → Remove access, (2) generate a fresh token via OAuth Playground, (3) update GBP_REFRESH_TOKEN in Railway. Do not use the existing Railway token for any live GBP API calls. GBP Account Management API blocked at 0 QPM — requires Google approval (60-day verified GBP requirement + application at support.google.com/business/contact/api_default, "Application for Basic API Access", takes 1-4 weeks). Apply now and let it process in background. GBP booking button set manually per contractor in the interim — 2 min per contractor. My Business Reviews API also restricted/private. Post-access GBP automation deferred until Google approves. Manual GBP booking button steps filed below under "Manual GBP Booking Button Setup." Session 13 — automation-first model reframe filed: trial delivery must not depend on contractor manual action; ad-sourced contractors are low-commitment at signup; jobs must flow from Jose-controlled channels + automatic system responses; minimum contractor action = 2 things only. Session 12 final — legal + security hardening complete. Privacy Policy + Terms of Service live at /privacy and /terms. SMS consent disclosure added to both HVAC templates. STOP opt-out added to all homeowner-facing Twilio SMS. Terms acceptance checkbox added to intake-form.html (blocks submit if unchecked). /privacy and /terms routes added to App.jsx. Footer links added to LandingPage.jsx. Rate limiter added to both AI chat endpoints (20 req/15min protects Anthropic bill). Contractor AI chat rate limiter added alongside admin AI. Full security audit passed — no hardcoded secrets, all SQL uses parameterized queries or allowlist validation, Helmet active, Twilio + Facebook webhook signature validation in place, bcrypt on all passwords. Google Places API key in intake-form.html is public by design — restrict to intake.tractifyhq.com in Google Cloud Console as manual step.)*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** oiltoheatrebate@gmail.com
- **GitHub account:** ProBookHQ-source (linked to ayc98223@gmail.com)
- **GitHub repo:** https://github.com/ProBookHQ-source/probook-hq

## Business / Legal
- **LLC name:** OMNIANCEGROUP LLC
- **EIN:** 42-4017025 (issued July 23, 2026 — CP 575B letter on file)
- **EIN note:** Newly issued — not yet propagated to IRS verification systems Twilio checks (Error 18602). This resolves on its own within a few weeks.
- **Next steps unblocked by EIN:** Open business bank account, complete Washington state business license
- **Washington state business license:** Not yet obtained — do after bank account is open
- **Business bank account:** Not yet opened — EIN in hand, do this next

---

## What Tractify Is

Tractify is software that fills HVAC contractors' calendars with booked jobs automatically. It is not a website company. It is not a lead gen service. It is a pipeline — contractors set their available hours, Tractify does the rest. When a customer needs HVAC work, they find the contractor, pick a time that works, and it goes straight on the calendar. No missed calls. No back and forth. No chasing leads. Just booked jobs showing up while the contractor is on the job site.

**The three-word brand position: "Tractify fills your calendar."**

**The long game — how Tractify competes with and beats ServiceTitan and GoHighLevel:**
Everyone else is slapping AI on their front end as a marketing feature — "AI-powered booking," "smart scheduling." It's noise contractors don't care about. Tractify does the opposite: the AI is invisible on the surface but running everything on the backend. Contractors don't know it's AI, don't need to know, don't care. They just see results — jobs on the calendar, a monthly message that knows their exact numbers, insights that feel like they came from a business partner who's been watching them grow.

The competitive moat builds itself automatically and compounds every month a contractor stays:
- Month 1: the system knows their basic numbers
- Month 6: it knows their seasonal patterns, best channels, close rate
- Month 12: it's predicting slow periods before they happen and suggesting campaigns automatically
- The booking data, channel data, revenue history, and behavioral patterns all live inside Tractify — a competitor starting from zero with that contractor has none of it

ServiceTitan is bloated, expensive, built for enterprise, and requires dedicated staff to operate. GoHighLevel is a tool that still requires the contractor to do the work. Tractify does the work for them, learns their business over time, and gets more valuable every single month. No contractor with 12 months of history inside Tractify has a rational reason to leave — not because they're trapped, but because leaving means losing the only system that actually understands their business.

This is the path to unicorn exit numbers. Not by chasing features or marketing AI for the sake of it — but by quietly building the deepest data moat in the home services industry one booked job at a time. The machine has to work and deliver jobs first. Everything else compounds from there.

**The paradigm shift that makes Tractify unbeatable — discovered July 27, 2026 (session 9):**
Every competitor in this space — ServiceTitan, Jobber, GoHighLevel, Housecall Pro — made the same foundational assumption: the contractor will learn our software. They built onboarding flows, training videos, certification programs, and customer success teams to compensate for tools that require the contractor to adapt to the technology.

Tractify flips this entirely. The tool adapts to the contractor.

The two-way AI SMS interface means a contractor who has been doing this for 30 years and hates computers doesn't need to learn anything new. They just text. The same way they've been texting since 2008. On the other end is an AI that understands natural language, takes action on their live calendar, confirms the action, and gets smarter about them every single month. The most powerful AI technology available today — hidden behind the simplest interface that exists.

**The north star: contractor logs in once to set up. Everything after that is a text message.**
- "block Tuesday 2pm to 5pm" → blocked, confirmed by text
- "what's on my calendar tomorrow" → AI replies with their schedule
- "cancel my Thursday morning" → cancelled, homeowner rebook link fired automatically
- "Hey Mike — spring is here. Want us to send a tune-up offer to your past customers? Reply YES." → contractor replies YES → campaign fires

This is Apple-level thinking. The 80-year-old grandfather and the middle school kid using the same interface. "It just works." No competitor can copy it fast enough to matter because by the time they try, Tractify has 12 months of behavioral data on every contractor — what they text, when they text it, what campaigns they respond to, what their busiest weeks look like. That context is uncopiable. A competitor starting from zero with that contractor would be starting over.

Tractify is pulling from two extremes simultaneously: the most powerful AI technology available today, delivered through a text message interface contractors have been using since 2008. That intersection — cutting-edge capability with zero learning curve — is almost impossible to find. This is it. Unicorn confirmed.

**The evolved north star — discovered July 30, 2026 (session 14):**
The original north star was "contractor logs in once to set up. Everything after that is a text message." The evolved version goes further: a contractor should be able to get to 5 jobs and beyond without ever logging into the portal if they don't want to. The 2 required setup steps (availability confirmation + call forwarding) can be completed entirely over SMS — the AI texts them, they reply, it's done. The portal exists for contractors who want the visual dashboard. The SMS interface is complete enough for contractors who don't. Both paths work. Neither requires the other.

This matters because the target customer — the HVAC guy, the roofer, the electrician, the plumber who's been doing this 20+ years — is not a dashboard person. He's a phone person. He lives in his messages app. The product that wins with him is the one that meets him there and never asks him to go anywhere else. Every other tool in this space — ServiceTitan, GoHighLevel, Jobber, Housecall Pro — requires him to come to the software. Tractify goes to him. That's not a feature difference. That's a philosophy difference. And it applies identically to every blue collar home services niche: roofing, electrical, plumbing, landscaping. Same guy, same problem, same solution.

**The habit moat — why this compounds into something unbeatable:**
Month one a contractor texts to block time. It works instantly. Month three he's texting to check his schedule every morning — not because Tractify asked him to, but because it's faster than any other way. Month six it's a daily habit he doesn't think about. By month twelve, leaving Tractify means losing the assistant he texts every day to run his business. That switching cost isn't data, it isn't a contract, it isn't features — it's habit. Habits are the strongest lock-in that exists and you cannot manufacture them. They build themselves when the product earns them. Every competitor can copy the features. Nobody can copy 12 months of embedded daily behavior.

**✅ BUILT July 28, 2026 (session 10) — the north star is live.** The two-way AI SMS system is fully deployed. The moment a contractor's Twilio number is assigned, they get a welcome text. Every day after that, the AI texts them the next incomplete setup step. When they text back, the AI responds — guides them through setup, blocks time on their calendar, cancels appointments, looks up their schedule. All from a text message. No app, no login, no learning curve. This was the last major infrastructure piece. Tractify is now fully built end-to-end.

**The website is invisible infrastructure.** Contractors aren't buying a website — they're buying a pipeline of booked jobs. The website is just how it works, the same way nobody buys Shopify because they want a website. They buy it because they want to sell things. Never lead with website, system, or technology. Lead with the outcome.

**The full lead flow (general matching engine path):**
1. Homeowner fills out the lead form on the contractor's Tractify-powered site
2. Tractify receives the lead via the inbound API (API key tied to that contractor)
3. Homeowner gets an email with a personal booking link (48hr expiry)
4. Homeowner picks a time from the contractor's live availability calendar
5. Appointment confirmed — both parties notified, synced to Google Calendar

**⚡ Dedicated contractor path (HVAC template with API key linked to contractor):**
Steps 3-4 above are replaced by inline booking. After form submit, the slot picker appears immediately on the same page. Homeowner books without waiting for an email or leaving the site. The booking link email is suppressed entirely on this path — `POST /api/leads/inbound` returns a `booking_token` + `contractor_id` directly in the JSON response, and the HVAC template uses those to show the calendar inline.

**The pitch:** "You set your available hours. We do the rest. When a customer needs HVAC work, they find you, pick a time that works for you, and it goes straight on your calendar. No missed calls. No back and forth. No chasing leads. Just booked jobs showing up while you're on the job site."

**Note on the booking page:** The slug is `book` (not `jose`). Contractor account display name is "The Tractify Team". The funnel is fully automated — no personal sales call, no demo close. Contractor fills out the intake form, the pipeline deploys automatically, jobs appear, Stripe handles conversion at job 5. Zero human involvement from Tractify's side.

---

## The Three Big Ideas (July 2026 Pivot)

These came out of Jose's cold calling sessions July 13-14. They fundamentally change the direction of the business.

### Idea 0: The Free Trial Funnel — Subdomains Forever
Every contractor lives on a Tractify subdomain permanently (e.g. `premiercomforthvac.tractifyhq.com`) — both during the free trial AND after converting to paid. No custom domain is ever purchased. The subdomain is the product. Homeowners don't care about the URL — they find the contractor through GBP, ads, missed call text-back, or social channels where the URL is never visible. The site just works.

**Why subdomains forever is the right call:**
- Zero marginal cost per contractor — no domain to buy, no DNS to configure, no extra build
- Setup cost per contractor = ~$1.80 (Twilio number) — essentially nothing
- Twilio numbers from non-converting trials can be released and reused for new contractors
- Conversion moment is clean: Stripe fires at job 5, system marks them paid, everything keeps running. Nothing else changes.
- Maximum lock-in: contractor's entire online booking presence lives on Tractify's domain. They can't leave and take anything with them. Zero leverage for the contractor, all leverage for Tractify.
- Scales infinitely — one ad running 24/7, zero per-contractor infrastructure cost forever
- The entire online pitch becomes: **"Let us get you your first 5 jobs free. No strings."**

**If a contractor asks about the URL:** "Your booking platform runs on the Tractify network — same way Square payment links say square.site, or your GBP listing lives on Google. The homeowner experience is identical and the jobs work exactly the same way."

**The online ad:**
Hook: *"HVAC contractors — we'll book your first 5 jobs for free."*
Body: *"No website needed. No commitment. We plug you into our software, set up your availability, and get 5 booked appointments onto your calendar automatically. If you love it we keep going. If not, no hard feelings."*
CTA: *"Fill out our quick setup form and claim your 5 free jobs."* → intake.tractifyhq.com

**The fully automated flow (no human involvement from Tractify):**
1. Contractor sees ad → fills out intake form at `intake.tractifyhq.com`
2. Pipeline auto-deploys: subdomain live, contractor account created, API key linked, 10 channels ready
3. Contractor logs in → first-login modal → completes self-serve checklist
4. Jobs start appearing on their calendar from multiple channels simultaneously
5. At job 3: automated portal notification + email — data-aware messaging
6. At job 5: automated Stripe payment page — $2,000 setup + $800/month retainer. One click, done.
7. They pay → system flips them to paid, everything keeps running
8. They don't pay → trial ends, you spent nothing, move on

### Idea 1: Stop Selling Websites, Sell Booked Appointments
The old pitch was "I'll build you a free website." This frames Tractify as a web design service — low perceived value, tons of competition, and the word "free" signals desperation.

The new pitch is: **"I get booked appointments onto your calendar."** The website is just infrastructure. The product is the outcome. This also solves the price anchoring problem — you're not selling a $500 website, you're selling $5,000+ worth of booked jobs.

### Idea 2: Inline Booking on the HVAC Template (No Email Step)
Currently after a homeowner fills out the lead form, they wait for a booking link email. That email step kills conversion — people click away, miss the email, or forget.

The new flow: **after form submit, show the slot picker inline right on the page.** The homeowner books immediately while they're already engaged. No email to wait for, no link to click, no friction. The booking happens in one session.

This requires:
- `POST /api/leads/inbound` to return a `booking_token` in its JSON response (small backend change)
- The HVAC template `index.html` to show a booking UI inline after submission using that token
- ✅ Built and deployed July 18 — inline slot picker shows immediately after form submit, no email step

### Idea 3: The Multi-Channel Traffic System — How Tractify Actually Delivers the 5 Jobs

This is the insight that cracked the whole model open (July 18, 2026).

The free trial only works if the 5 jobs actually happen fast. Without a traffic plan, you're hoping the contractor shares their link around — slow, unreliable, contractor-dependent. The multi-channel system makes Tractify the one delivering the jobs, not just providing the tool.

**Channel 1: Paid Ads → New Homeowners**
Jose runs $5–10/day of Facebook/Instagram ads targeting homeowners in the contractor's service zip codes during their free trial.
- Ad copy: *"Need HVAC service? Book online in 60 seconds."* → links to their Tractify subdomain
- Homeowner lands on their professional site, fills out the form, books inline — one session, no friction
- These are high-intent leads: they saw an HVAC ad because they need HVAC work
- No new code needed — the inline booking is already built. Just run the ad.
- **Ad spend is selective — not every free trial gets it.** Jose and Daniel decide which contractors they believe are winners and invest ad spend behind those. Contractors in strong markets with good Google presence and active call volume may get their 5 jobs purely from the organic channels (GBP, missed call, Google reviewers, Nextdoor, Facebook groups) with zero or minimal ad spend. As Tractify scales and contractor acquisition cost becomes clear, ad spend per contractor gets calibrated accordingly.

**Channel 2: Missed Call Text-Back → Existing Interested Homeowners**
Every time the contractor misses a call, Tractify auto-texts the caller: *"Hey, sorry I missed you! Here's a link to book a time that works for you: [their booking link]"*
- The homeowner already called — they already want to hire this contractor. Highest possible intent.
- HVAC contractors miss calls constantly (on rooftops, under houses, can't answer)
- Every missed call that used to be a lost customer becomes a booked appointment automatically
- Built with Twilio: missed call → webhook → Tractify API → auto-SMS with booking link
- Contractor forwards their number to a Twilio number (5-min setup on onboarding call)

**Channel 3: Google Business Profile "Book" Button → Search Traffic**
Every HVAC contractor has a Google Business listing. Google lets you add a booking button directly to it — homeowners searching "HVAC near me" can book without even clicking to the website.
- Zero cost, zero ad spend — captures traffic that already exists and is actively searching
- Set up in 10 minutes on the onboarding call
- Highest-intent traffic possible: someone searching "HVAC near me" needs HVAC right now
- Add the contractor's Tractify booking link to their GBP listing under "Appointments"
- This alone could deliver 2-3 of the 5 free jobs

**Channel 4: Nextdoor → Neighborhood Trust Traffic**
HVAC is the most requested service on Nextdoor. Homeowners constantly post "anyone know a good AC guy?" and their neighbors respond.
- Post once in the contractor's neighborhood with their booking link — free, immediate reach
- Run Nextdoor ads at $5-10/day targeting specific zip codes — cheaper than Facebook, less competition
- Trust level is extremely high — neighbor recommendations convert better than any ad
- Comment in relevant neighborhood posts when homeowners ask for HVAC recommendations

**Channel 5: Existing Google Reviewers → Warm Re-engagement**
The contractor's past happy customers who left Google reviews are the warmest leads possible — they already paid, they already love the contractor.
- Message them directly through Google: "Thanks again for the review — we now have online booking if you ever need us again: [booking link]"
- Zero cost, no compliance issues, response rate is high because the trust is already established
- 20 messages to past reviewers could book multiple jobs before the ads even warm up

**Channel 6: Facebook Community Groups → Hyper-Local High-Intent**
Every city has local Facebook groups ("Seattle Neighbors," "Bellevue Community Board," etc.). Homeowners post asking for contractor recommendations constantly.
- Post in relevant groups or comment when someone asks for HVAC help — free, no ad spend
- These people are mid-search: they have a broken AC and are asking their community right now
- Booking rate on this traffic is extremely high — intent is already there
- Can be done on the onboarding call in minutes, contractor takes over afterward

**Channel 7: Facebook Messenger + Instagram DM Auto-Reply → Captured Inbound Interest**
Most contractors have a Facebook Business page and Instagram. Homeowners DM them constantly and get no response for days — those leads die. Facebook and Instagram both allow automatic instant replies to every incoming DM.
- Auto-reply message: *"Thanks for reaching out to [Business Name]! You can book a time that works for you here: [booking link] — takes 60 seconds and we'll confirm right away."*
- Set up once per contractor during onboarding week via Meta Business Suite — runs forever after that
- Zero cost, zero ongoing effort — every DM becomes a potential booking automatically
- Works 24/7: homeowner messages at 11pm, they get the booking link instantly instead of waiting until morning
- **Build status: No code needed on Tractify side.** Set up manually by Jose/Daniel in Meta Business Suite during contractor's first week. Takes 5 minutes per contractor.
- ⚠️ **Onboarding checklist:** Add as Step 7 in the contractor portal checklist with exact instructions + copy-paste reply text

**Channel 8: Facebook Pixel + Retargeting → Homeowners Who Almost Booked**
Every homeowner who visits the contractor's Tractify subdomain but doesn't fill out the form is a warm lead that currently disappears. The Facebook Pixel captures them and lets retargeting ads follow them automatically.
- Add pixel base code to `hvac-template/index.html` with a `fbPixelId` variable in the CLIENT config
- When `fbPixelId` is set, the pixel fires on every page load — Tractify's retargeting campaign automatically serves these visitors "Still need AC service? Book in 60 seconds" ads for the next 2 weeks
- Retargeting CPCs are 50-70% cheaper than cold traffic and convert 2-3x better — these visitors already showed intent
- Jose runs one retargeting campaign from his Business Manager with URL-based audience rules per contractor subdomain (e.g. all visitors to `premiercomfort.tractifyhq.com` → custom audience → retargeting ad)
- Fire-and-forget: set up once per contractor, runs automatically while their trial is active
- **Build needed:** Add `fbPixelId: ""` to CLIENT config in `deploy.js` `buildClientConfig()`. Add pixel snippet to `hvac-template/index.html` that only fires when `fbPixelId` is non-empty. Jose sets pixel ID per contractor when deploying.

**Channel 9: Facebook Lead Ads → Direct Tractify Webhook**
Instead of sending homeowners to the HVAC template site, Facebook Lead Ads open a pre-filled form inside Facebook — name, phone, and email auto-populated from their account. No page to load, no form to type. Homeowner taps "Get Quote," confirms their info, submits. Facebook fires a webhook to Tractify immediately. Tractify creates the lead and sends the homeowner an SMS with their booking link. 3-5x higher conversion than click-to-website ads because friction is nearly zero.
- Facebook fires `POST /api/leads/facebook` webhook when a lead submits
- Tractify calls Facebook Graph API with the `lead_id` to retrieve name, phone, email
- Lead is created in the system, booking link SMS sent automatically
- If API key is contractor-linked, routes directly to them — no matching engine needed
- Jose sets up one Lead Ad campaign per contractor in his Business Manager, points webhook to Tractify
- **Build needed:** New route `backend/routes/facebook.js` — webhook verification (Facebook sends a challenge on setup), lead retrieval via Graph API, SMS dispatch via Twilio. Store a `FB_PAGE_ACCESS_TOKEN` env var in Railway.

**Channel 10: SMS Keyword → Physical Touchpoint Bookings**
Every physical thing the contractor owns becomes a lead source. Truck wrap, business card, invoice, fridge magnet left at every completed job — all say "Text BOOK to [number]." Someone sees the truck in a neighbor's driveway, texts the keyword, gets the booking link back in seconds automatically. The truck is driving around the service area generating leads 24/7 with zero effort.
- Contractor's existing Twilio number handles inbound SMS (same number already used for missed call text-back)
- When anyone texts that number (any message, no specific keyword required), auto-reply fires: *"Book online with [Business Name]: tractifyhq.com/schedule/[slug] — takes 60 seconds."*
- Works from any physical touchpoint — van wrap, business card, invoice, fridge magnet, door hanger
- Fridge magnet left at every completed job = permanent re-booking channel from every past customer
- **Build needed:** Add inbound SMS handler to `backend/routes/twilio.js`. Twilio fires `POST /api/twilio/inbound-sms` when someone texts the contractor's number. Look up contractor by Twilio number, reply with their booking link. Separate from the missed call webhook (which fires on voice calls). Set the SMS webhook URL in Twilio console alongside the existing voice webhook.

**Why the combination is a breakthrough:**
All ten channels feed the same booking infrastructure that's already live. Together they create something no competitor is doing — a complete done-for-you demand generation machine:
- Paid ads drive NEW homeowners who've never heard of the contractor
- Facebook Lead Ads capture that same traffic with zero landing-page friction
- Missed call text-back captures homeowners who already called and got no answer
- SMS keyword turns every physical touchpoint into an automatic lead source
- Google Business Profile captures people actively searching right now
- Nextdoor captures neighborhood trust traffic
- Google reviewers re-engage past customers who already love the contractor
- Facebook groups capture homeowners mid-search in real time
- Facebook Messenger + Instagram auto-reply captures every inbound DM automatically
- Facebook Pixel + retargeting recaptures homeowners who visited but didn't book

The result: a contractor goes live on a Friday. By Monday, jobs are appearing on their calendar from every direction. They didn't share a link, they didn't do anything. Tractify did it for them.

**Why this speeds up the whole business model:**
- 5 free jobs happen in days, not weeks
- Contractor sees value immediately → emotional hook before they've paid a dollar
- Stripe conversion page fires at job 5 → revenue arrives with zero human involvement
- Free trial filters itself: contractors who don't engage self-select out, costs Jose nothing

**There is no onboarding call.** The self-serve checklist inside the contractor portal (built July 23) replaces the call entirely. Contractor logs in for the first time → first-login modal walks them through the setup steps → they complete each step at their own pace. Jose and Daniel are completely out of the onboarding process. All channels activate through the checklist or automatically — zero human involvement from the Tractify side.

**The innovation in one sentence:** Tractify doesn't just give contractors a booking tool — it activates every channel they already have, drives new traffic from multiple directions, and delivers the booked jobs. The contractor just shows up.

**Build status:**
- ✅ Inline booking already live (July 18)
- ✅ Paid ads — no code needed, just a Facebook ad account and budget
- ✅ Missed call text-back via Twilio — built July 21 (see Twilio section below)
- ✅ Google Business Profile, Nextdoor, Facebook groups, Google reviewers — no code needed, done on onboarding call
- ⬜ Facebook Messenger + Instagram DM auto-reply — no Tractify code needed; set up in Meta Business Suite per contractor. Add as Step 7 to onboarding checklist UI.
- ⬜ Facebook Pixel + retargeting — small template + deploy.js change. Add `fbPixelId` to CLIENT config. Jose runs retargeting campaign from his Business Manager.
- ⬜ Missed call follow-up text at 2 hours (if no booking) — backend change in `backend/routes/twilio.js`
- ✅ Facebook Lead Ads webhook — `backend/routes/facebook.js`. Webhook verification (GET), lead receiver (POST), Graph API call to get name/phone/email, lead created in DB, booking token generated, instant SMS from contractor's Twilio number + email backup. Hidden field `contractor_slug` in each Lead Ad form routes lead to correct contractor. Needs `FB_PAGE_ACCESS_TOKEN` + `FB_VERIFY_TOKEN` in Railway env vars.
- ⬜ SMS keyword / inbound SMS handler — add inbound SMS webhook to `backend/routes/twilio.js`. Anyone who texts contractor's Twilio number gets auto-reply with their booking link. Powers all physical touchpoints (van, business card, fridge magnet, door hanger).

### Idea 5: One Template Per Niche — The Automation Backbone (July 21, 2026)

Every contractor in the same niche gets the exact same site. Same bones, same layout, same booking flow — just their info swapped in. When Tractify moves into a new niche, swap the cover photo and service labels. That's it.

**Why this is the right call, not the easy call:**
Tractify is not a website company. The website is infrastructure — the same way nobody buys Shopify because they want a unique website. Contractors are buying booked jobs. A contractor who cares more about a custom website than about jobs on their calendar is the wrong client. The template filters for the right clients passively. Anyone who pushes back can go to a web design agency. That's a power position, not a limitation.

**The niche-swap logic:**
- HVAC contractors → HVAC cover photo, HVAC service chips, same everything else
- Electrical contractors → electrical panel cover photo, electrical service chips, same everything else
- Plumbing, roofing, landscaping — same pattern every time
- The contractor's name, reviews, phone, and service area make it theirs. Homeowners don't compare contractor sites side by side anyway.

**Why this makes the whole company work:**
This is the piece that makes everything else click together. One template + variable substitution from intake form data = deployment can be fully automated. "Contractor fills out form" to "contractor is live with 10 channels running" with zero human involvement. That's always been the destination — this is what gets you there.

**The constraint IS the product:**
By not offering custom sites, you lock yourself into selling outcomes instead of deliverables. You literally can't sell websites because you don't have a web design service. You only have booked jobs. Every conversation starts and ends there. Not a pitch — just true.

**Why this unlocks the proactive outreach play at scale:**
When you're ready to find contractors, deploy their site, run $20 in ads, and let jobs appear automatically — you can do it for any niche in minutes. Swap the cover photo. Same form. Same API key flow. Same 10 channels. Same Stripe conversion at job 5. The playbook doesn't change per niche, only the photo does. Without this, each new niche is a design project. With this, each new niche is a folder copy.

**Build status:** HVAC template already exists and is live. This decision means no new design work is needed per client or per niche expansion — only the template variables change.

### Idea 4: Broadcast SMS — Proactive Revenue from Existing Customers (July 21, 2026)

The missed call text-back is reactive — it catches customers who already tried to reach the contractor. Broadcast SMS is the proactive version — text the contractor's entire existing customer list to generate new bookings on demand.

**The Gary Vee parallel:** Wine Text sends weekly deal texts to an existing customer list and drives direct purchases. Same model applied to HVAC: contractor has 200 past customers sitting in their phone who already trust them. One text blast puts jobs on the calendar that week.

**What this looks like in practice:**
- "Hey it's Premier Comfort HVAC — we now offer online booking 24/7. Click here to schedule your fall tune-up: [booking link]"
- "Book your next service this week and get $50 off. Takes 60 seconds: [booking link]"
- Seasonal campaigns: AC checkups in spring, furnace tune-ups in fall, emergency service reminders before winter

**Seasonal campaigns are a core part of this play:**
Tractify automatically texts each contractor's past customer list when seasons change — no contractor action required. Spring triggers AC tune-up blasts. Fall triggers furnace checkup blasts. First cold snap triggers emergency service reminders. This generates new jobs on autopilot every season and is a standalone justification for retainer increases. The contractor sees jobs appearing without doing anything — that's the retention hook.

**Why this is a breakthrough addition:**
- Missed call text-back captures demand that already exists (someone called)
- Broadcast SMS creates new demand from people who weren't thinking about it
- Seasonal campaigns generate recurring demand automatically every few months
- All three feed the same booking infrastructure — no new code on the booking side
- Together: Tractify covers every end of the revenue pipeline — capturing lost calls, generating new ones, and re-engaging past customers on autopilot

**Compliance note:** Broadcast SMS in the US requires A2P 10DLC registration with carriers. Not hard but required before sending bulk texts. Must be registered through Twilio before doing any contractor customer list campaigns.

**Build status:** Not built yet — comes after first 3 paying clients are stable. Broadcast SMS + seasonal campaigns are upsell features that justify retainer increases.

---

## Sales Strategy (Pivoted July 18, 2026)

**Current phase:** Finishing infrastructure first — all remaining build items (Google Reviews pull, Twilio unblock, debug log removal, pipeline polish) must be complete before shifting focus. Once infrastructure is done, full attention moves to ads and execution. Cold calling is retired permanently.

**August execution focus — ads + job delivery:** Two-track ad strategy once infrastructure is complete:
- **Track 1 (wide net):** Any HVAC contractor, lower targeting specificity. Purpose is data — fill the funnel, learn what the self-selecting contractor looks like, identify which intake form signals predict fast job delivery.
- **Track 2 (sniper):** Hyper-targeted ideal profile — contractors with strong Google presence (4.5+ rating, 50+ reviews), active call volume, established local business. Behind these contractors, spend real ad money. These are the first case studies and the first Stripe conversions. Jobs deliver fast, conversion is close to guaranteed.
- Track 1 teaches you which signals predict success. That makes Track 2 targeting sharper over time. Run both simultaneously but Track 2 is where August revenue lives.

**Where the business lives and dies:** Delivering 5 jobs fast. Not the auto-deploy, not the checklist, not the channels — the actual booked jobs appearing on a contractor's calendar in the first 7-10 days. Everything else is infrastructure for that moment. August execution is about finding out if the machine produces what we think it does.

**Why this is the right move:** Cold calling is 1:1. An ad runs 24/7 and reaches thousands simultaneously. Contractors who respond to an ad are already interested — they're already half sold. The free trial offer (5 booked jobs, zero risk) is strong enough to stop the scroll and convert. This is how you build a company at scale, not a local service business.

**The funnel (fully automated as of July 23, 2026):**
Ad or organic content → contractor fills out intake form at `intake.tractifyhq.com` → subdomain auto-deploys instantly (Cloudflare Pages + Wrangler CLI) → contractor receives portal login via email → first-login modal appears → contractor completes self-serve onboarding checklist (availability, Twilio forwarding, GBP booking link, Nextdoor, Facebook group, Google reviewers, Messenger/Instagram auto-reply) → 10 channels activate → 5 jobs delivered → automated Stripe conversion page → $2,000 setup + $800/month retainer. Zero Jose or Daniel involvement after the ad runs.

**There is no onboarding call.** It was planned, then removed. The self-serve checklist replaced it entirely before the first client. The only bottlenecks in August are: (1) ad reach — how many contractors see the offer, and (2) job delivery speed — how fast the channels get 5 bookings onto each contractor's calendar. Deployment is instant and automatic. Setup is self-serve. The pipeline is hands-off.

---

## Pricing Strategy (Updated July 30, 2026 — session 15)

**The core principle:** Price reflects value delivered, not cost to serve. Charge for outcomes, not access.

### The Model — Per-Appointment, No Retainer

**Free trial:** 5 booked jobs, zero cost to contractor. No strings, no commitment.

**After job 5:** $2,000 setup fee (one-time). Covers trial delivery costs — ad spend, Twilio number, all infrastructure built for them. This is payment for results already received, not a commitment to the future.

**Ongoing:** $75 per confirmed booking, auto-billed the moment Stripe processes it. No monthly minimum. No contract. No retainer. They pay for jobs, nothing else.

**That's the entire model.** One sentence pitch: "We charge $75 per job we book for you. Nothing if we don't deliver."

---

### Why Per-Appointment Is the Right Model

**The offer is almost impossible to say no to.** There's no monthly commitment to evaluate, no risk of paying for a slow month, no contract to review. The only question is "do I want more booked jobs?" If yes, they're in. The decision is binary and obvious.

**Incentives are perfectly aligned.** Tractify makes money when contractors make money. Every booked appointment is revenue for both parties simultaneously. No other pricing model achieves this cleanly.

**The economics get insane at scale — and this is the key insight.** At 50 contractors each generating 20 appointments/month: 1,000 appointments × $75 = $75,000/month. At 100 contractors at 30 appointments each: 3,000 × $75 = $225,000/month. And Tractify's cost structure is almost entirely fixed — servers, Twilio, the platform. The marginal cost of booking appointment 1,000 is near zero. Margins compound automatically with volume.

**Individual contractor slow seasons are irrelevant at portfolio scale.** One contractor's slow January is noise when 50 contractors across different markets and specialties are in the portfolio. Seattle's heating season, Phoenix's AC season, a plumber's year-round demand — the portfolio diversifies away individual seasonality completely. Slow season is a single-contractor problem that evaporates at scale.

**Revenue scales with your best performers, not against them.** A contractor getting 40 jobs/month generates $3,000 in Tractify revenue. Show them the monthly results report — "you paid $3,000, we generated $32,000 in new revenue for you, ROI: 10.7x" — and that number is obviously cheap every single month. The math is always visible, the retention is automatic.

**Don't offer a retainer option alongside per-appointment.** Adverse selection kills this. Smart high-volume contractors will always pick the retainer (40 jobs × $75 = $3,000 vs $800 flat). You end up capping revenue from your best performers — exactly the wrong outcome. Per-appointment only. If a high-volume contractor pushes back, that's a custom conversation about volume tiers, not a retainer.

---

### Why $75 and Not $50

$25 per appointment will not affect whether a contractor converts. That decision is made when they watch 5 free jobs appear on their calendar, not when they see the price. But at 500 appointments a month, $25 less is $12,500 left on the table every single month for no reason.

Price reflects value, not cost. A $1,200 HVAC repair job acquired for $75 is already a gift to the contractor. Don't discount a gift before anyone has even asked you to.

$75 also sets the right anchor. It can be discounted as a goodwill gesture or volume incentive later. You cannot easily raise from $50 without a difficult conversation.

**What counts as billable:** confirmed booking, regardless of whether the homeowner shows up or the job closes. Tractify controls booking confirmation. Tractify cannot control homeowner behavior after the booking. This line must be clear in the contract upfront.

---

### The Math That Sells Itself

Show this on every monthly results report, automatically:

| | This Month |
|---|---|
| Jobs booked by Tractify | 28 |
| Estimated revenue generated | $22,400 |
| Tractify cost | $2,100 |
| Your ROI | 10.7x |

No contractor cancels when they see this. No contractor negotiates price when they see this. The report IS the retention strategy.

---

### Volume Tiers (Future — When High-Volume Contractors Push Back)

Not part of the launch model. Introduce only when a contractor is generating enough volume that $75/job starts feeling significant relative to their margin. Suggested structure when needed:

- Jobs 1-20/month: $75/job
- Jobs 21-40/month: $60/job
- Jobs 41+/month: $50/job

This rewards high-volume contractors without introducing retainer complexity, and keeps per-appointment as the universal model.

**Document every result obsessively from day one.** Job delivered, channel it came from, how fast, revenue logged. When the data is clean and the numbers are real, the product sells itself. The case study becomes the ad. The machine feeds itself.

---

### Stripe Conversion System — Job 5 Trigger (Build August 4 with Daniel)

At job 5, the system fires automatically. No Jose involvement. No call. No invoice. The machine closes itself.

**The technical flow:**
1. Job 5 confirmed → `POST /api/bookings/book` detects 5th non-cancelled booking for contractor → pulls contractor's `did_close` + `closed_value` data → runs smart A/B logic → generates Stripe Payment Link via API → texts contractor the link
2. Contractor pays $2,000 → Stripe webhook fires → system saves `stripe_customer_id` + `stripe_payment_method_id` → flips `contractors.payment_status = 'paid'`
3. Every subsequent appointment → **$75 auto-charged at the scheduled appointment time on the day of the appointment** (not at booking confirmation) → `appointments.stripe_charge_id` logged

**Billing trigger — day-of, not booking confirmation (locked August 1, 2026):**
The $75 fires at the scheduled appointment time, not when the homeowner books. This is intentional and is a core trust and marketing position.

- Homeowner books for next Tuesday → no charge yet
- Tuesday arrives → $75 auto-charges at the scheduled time
- Homeowner cancels before appointment day → no charge, nothing owed
- Homeowner cancels same day → charge still fires (contractor held that slot, that day is gone — on the homeowner not Tractify)
- Homeowner reschedules to a later date → charge moves to the new date automatically
- Contractor cancels → no charge, Brain 3 fires rebook SMS to homeowner

**Why this is the right call — trust + marketing:**
No other lead gen service or agency in this market charges this way. Every competitor bills upfront, monthly, or at booking. Tractify bills when the appointment actually happens. This is a genuine competitive differentiator that doubles as a trust signal and a marketing angle. Contractors cannot dispute in good faith — they're paying for something that just showed up on their calendar that day. The billing policy becomes content, the content drives conversions, and the conversions compound.

**The pitch line for conversion page, ads, and content:**
"We charge you when the appointment happens. Not when it's booked. Not upfront. When the job shows up on your calendar that day. Homeowner cancels or reschedules — no charge until the new day comes."

**New DB columns needed:**
```sql
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'trial'; -- 'trial' | 'paid' | 'churned'
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;
```

**Smart A vs B conversion SMS logic:**

Version A fires when: `SUM(closed_value WHERE did_close = 1) >= 2000 AND COUNT(did_close = 1) >= 3`
— contractor has logged meaningful, verifiable revenue. The numbers are real and impressive.

Version B fires otherwise — contractor hasn't logged closes, logged too few, or numbers are low. Don't fabricate a ROI they can't verify.

**Version A SMS (impressive logged revenue):**
> "[firstName] — 5 jobs, $[sum_closed_value] generated. That's your free trial. The machine works. Keep it running: [stripe_link]. $2,000 covers everything we built and ran. After that it's $75 per booking we deliver — nothing if we don't. We only make money when you make money. No contract, stop anytime."

**Version B SMS (no meaningful revenue logged):**
> "[firstName] — 5 jobs on your calendar. That's your free trial. The machine works. Keep it running: [stripe_link]. $2,000 covers everything we built. After that, $75 per booking we deliver — nothing if we don't. We only make money when you make money. No contract, stop anytime."

Both versions make two things unmistakably clear: (1) Tractify only charges for results delivered — aligned incentives, not a subscription. (2) There is no contract. They can stop. That confidence is the close.

---

### Revenue Split Framework + Cash Flow Discipline (locked August 1, 2026)

**Ownership:** Jose 55% / Daniel 45%

**Two completely separate revenue streams — they stack, never compete:**

**Stream 1 — Setup fee ($2,000 per converting contractor):**
This fires at job 5, after the trial is already delivered. By the time it hits, ad spend is already sunk — the setup fee recovers CAC and puts money in the pocket immediately. It is not funding future work. It is settlement on work already done and proven. Split this however Jose and Daniel decide — it can be taken entirely as profit or run through the same split as appointments. Every converting contractor is profitable on day one before a single $75 ever fires.

**Stream 2 — Per-appointment ($75, charged day-of):**
Pure compounding recurring revenue. CAC is already covered by the setup fee. Every dollar here is margin that funds ads and grows the profit split over time.

**The combined picture:** Even a slow month — 2 contractor conversions + 50 appointments across the portfolio = $4,000 setup fees + $3,750 appointments = $7,750 gross before split. The two streams are additive and independent.

**Per-appointment revenue split ($75 per confirmed appointment, charged day-of):**
- 50% → ads (reinvested immediately for growth — aggressive and intentional)
- 10% → cash/chargeback reserve (held, becomes profit after 90 days clean)
- Remainder after operations → profit split 55/45 between Jose and Daniel

**Why 50% back into ads:**
The model is self-liquidating — day-of charges mean cash arrives the same day the job happens. That cash immediately funds the next round of ads. The faster it compounds, the faster the profit side grows. 50% reinvestment is aggressive but the math rewards it — every dollar back into ads at a proven cost-per-booking generates more appointments, more charges, more profit. The split incentivizes both Jose and Daniel to push volume because their take grows proportionally with every appointment delivered.

**The reserve:**
10% held as a buffer — not primarily for chargebacks (the billing policy and Terms make those rare) but as smart cash flow discipline. Never deploy money that hasn't settled. Stripe holds funds for a few days anyway. The reserve grows with volume and becomes pure profit after it clears clean.

**The chargeback reality:**
Chargeback risk on this model is low by design. Setup fee is non-refundable and clearly stated upfront. Per-appointment charge fires day-of for something the contractor already experienced. Terms are explicit at signup — confirmed appointment on that day = billable event regardless of homeowner outcome. Contractor agreed, appointment happened, timestamp exists. B2B disputes are harder to win and contractors who've watched jobs land aren't disputing $75 for a job that showed up. The reserve exists for edge cases, not as a core risk management tool.

**The velocity angle:**
This model behaves like a product business but scales like software. Every $75 that comes in can immediately fund the next booking before anything is shipped, manufactured, or delivered. No inventory, no delays, no supplier. Pure cash velocity — appointment confirms, money moves, ads run, more appointments confirm. The compounding effect accelerates automatically with volume and the cost-per-booking decreases as the system learns.

---

### Churn / Offboarding Policy

**When a contractor wants to stop:**
- Deactivate immediately, no questions, no friction
- Twilio number held for 6 months at ~$1/month (Tractify absorbs this cost)
- During the 6-month hold: their number, their slug, their booking history — all preserved

**Return within 6 months:** same Twilio number reactivated, no setup fee, picks up exactly where they left off

**Return after 6 months:** number released, history cleared, new non-refundable $2,000 setup fee required before any channels reactivate

**The psychology behind this:** a contractor who thinks they want to leave but knows the 6-month window is closing will re-sign before it expires rather than pay another setup fee. The hold period is a free retention mechanic that costs $6-12 in Twilio and converts a permanent churn into a temporary pause for a meaningful percentage of contractors.

**The non-refundable framing is critical:** make it explicit in the deactivation SMS and in any future Terms of Service update. If they know upfront, there's no dispute, no bad feelings, no chargeback risk. They made an informed decision.

**Deactivation SMS (sent when a contractor requests deactivation):**
> "Got it — deactivating now. Your number is held for 6 months at no charge. Come back before then and you pick up exactly where you left off. After 6 months it's released — restarting requires a new non-refundable setup fee. No hard feelings — if the jobs weren't there, we didn't earn it."

**What "deactivate" means technically:**
- `contractors.payment_status = 'churned'`
- `contractors.is_active = 0`
- Twilio number: do NOT release — mark it in the DB with `twilio_hold_until` (6 months from deactivation date)
- Subdomains continue serving (no need to take them down — they're just inactive booking pages)
- New bookings stop flowing — Brain 3 sessions disabled for churned contractors

**New DB column needed:**
```sql
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS twilio_hold_until TIMESTAMPTZ;
```

Cron job (monthly): check contractors where `payment_status = 'churned'` and `twilio_hold_until < NOW()` → release Twilio number via API → set `twilio_number = NULL`.

---

### Content, Ads & Distribution Brain (August 2026)

*Built July 28, 2026. This is a full department-level knowledge base. The admin brain reads this on every query and cross-references it with live `acquisition_source` data from the database to answer attribution questions and make real spend recommendations. Update the Playbook Log at the bottom every time something is proven, disproven, or discovered.*

---

#### The Iron Rules (Never Break These)
1. Never mention website, system, or technology — only booked jobs and outcomes
2. Two distinct offers for two distinct audiences — never mix them: **Contractor-facing offer** (intake form, contractor ads, cold outreach): "5 free booked jobs, no strings." **Homeowner-facing offer** (all homeowner-targeted ads, physical channels, Brain 3): "Text us what's wrong — our AI will diagnose it free." The contractor offer is about outcomes. The homeowner offer is about help. Both are 100% true. Neither mentions Tractify's business model.
3. Every contractor-facing content piece drives to `intake.tractifyhq.com` with a unique `?src=` tag
4. **The billing policy is a marketing weapon — use it constantly.** "We charge when the appointment happens, not when it's booked" is not just a policy, it's the single most trust-building sentence in the entire pitch. It belongs in ads, in content, on the conversion page, in the Stripe SMS, everywhere. No competitor can match it. Every piece of educational content explaining how the billing works doubles as a conversion driver — contractors who understand it want it immediately. Lead with transparency, let the policy close them.
4. Both Jose and Daniel are on camera for contractor-facing content — faces convert better than faceless content
5. Raw and real beats polished every time — shot on iPhone is the format, not a limitation
6. Cost per completed intake form is the only metric that matters for contractor acquisition. Cost per homeowner booking is the only metric that matters for job delivery.
7. The creative is the product. A diagnostic ad that generates word of mouth compounds forever without ad spend. Build things that homeowners would tell their neighbors about unprompted.

---

#### The Diagnostic Ad — The Entire Creative Strategy in One Insight (July 31, 2026)

This is the most important strategic discovery in Tractify's history and changes everything about how ads are built, deployed, and scaled.

**The core insight:**
Tractify is not advertising HVAC service. Tractify is advertising a free diagnostic tool that happens to close bookings. The ad doesn't look like an ad. The homeowner doesn't experience it as a sales funnel. They experience it as a useful tool that helped them understand what's wrong with their home. By the time they realize they just had a sales conversation they already have a booked appointment and they're grateful for it.

**Why this beats every other ad format in home services:**
Every other HVAC ad triggers the sales filter instantly — "call us," "book now," "licensed and insured." Homeowner's brain dismisses it in under a second. The diagnostic ad triggers zero sales resistance because it's a genuine help offer. "Is your AC making a grinding noise? Text us — our AI will tell you what's actually wrong. Free." That's not an ad. That's a tool. The scroll stops.

**The universal creative template:**
"Is your [appliance/system] [specific symptom]? Text us — our AI will tell you what's actually wrong. Free."

Examples across niches:
- "Is your AC making a grinding noise? Running constantly but not cooling? Text us — our AI will diagnose it free."
- "Circuit breaker keeps tripping? Text us what's happening — our AI will tell you if it's serious."
- "Noticed dark spots on your roof after the last rain? Text us a description — our AI will tell you if it's actually a problem."
- "Water heater making a popping sound? Text us — our AI will tell you what's wrong."

One creative concept. One offer. One mechanic. Swap two words per niche. Deploy everywhere.

**The scaling unlock — proven creative compounds across zip codes:**
Test in one zip code. Find the symptom angle that converts best. That creative is now a proven asset. New contractor signs up in a new zip code — deploy the winning creative immediately. No testing phase, no wasted spend, no figuring out what works. You already know. Every new zip code runs on day-one proven creative from the zip codes before it. The creative playbook gets sharper with every market entered. By contractor 20 you have battle-tested creative across multiple markets deploying instantly for every new contractor.

**The niche scaling unlock:**
You're not advertising HVAC. You're not advertising roofing. You're advertising the free diagnostic tool. The brand is the tool — Tractify, the thing you text when something in your house is broken. One brand identity, one creative format, infinite niches. HVAC in Seattle, electrical in Phoenix, roofing in Dallas — same ad, same mechanic, same Brain 3 close. Zero new creative strategy per niche. Clone, swap two words, deploy.

**The word of mouth mechanic built into the product:**
"I texted this number and it told me exactly what was wrong with my AC" is a story people tell. Remarkable things spread without ad spend. And the ones where Brain 3 says "actually just change your filter" become the most loyal customers of all — because you saved them $200 and they'll never forget it. Honesty compounds trust. Trust compounds word of mouth. Word of mouth reduces paid spend required per zip code over time.

**The competitive moat on the creative side:**
Competitors see the ad and think it's a gimmick. They don't realize Brain 3 is behind it closing at a rate their "call us now" ads can never match. By the time they understand what they're looking at Tractify has homeowner trust relationships across hundreds of zip codes built over two years. They're starting from zero. The creative advantage and the data advantage compound simultaneously and are inseparable.

**The endgame:**
Homeowners across America don't think of Tractify as an HVAC company or a roofing company. They think of it as the number they text when something breaks. That brand position — the trusted home diagnostic tool — is worth more than any individual niche. It's the infrastructure layer that every home services transaction flows through. ServiceTitan owns contractor software. Tractify owns homeowner trust. Homeowner trust is the more valuable asset because it's the demand side of the entire market.

**Tagging for this creative:**
- Facebook diagnostic ad — HVAC: `fb_diag_hvac_aug`
- Facebook diagnostic ad — roofing: `fb_diag_roof_aug`
- Facebook diagnostic ad — electrical: `fb_diag_elec_aug`
- Instagram version: `ig_diag_hvac_aug`
- Nextdoor version: `nd_diag_hvac_aug`

Track which symptom angle converts best per niche. The data from symptom A vs symptom B is the creative playbook for every future market.

---

#### Physical Channels — Zero Ongoing Cost After Setup (July 31, 2026)

These two channels are fundamentally different from every paid channel. They have a one-time cost and then compound forever. Every competitor is optimizing CPMs. Tractify is quietly building a permanent booking infrastructure in thousands of homes.

**Channel A — Fridge Magnet (left at every completed job)**
After every appointment is marked complete, the contractor leaves a fridge magnet at the home. Magnet has the business name, the contractor's Twilio number, and one line: "Text us anytime to book service." Cost: $0.10-0.20 per magnet in bulk.

Six months later the homeowner's AC breaks. They look up, see the magnet, text the number. Brain 3 picks up instantly and closes the booking in 4 messages. The magnet cost pennies. The Twilio message costs cents. The job is worth $1,200+.

**The compounding math:** every completed job seeds a permanent passive booking channel in that home. Month 1: 50 jobs = 50 magnets. Month 12: thousands of magnets across the service area generating random inbound bookings at zero incremental cost. This is a channel that gets more powerful automatically just by the business running — no maintenance, no renewal, no algorithm. One physical object lasts 10 years on a fridge. The "ad" runs for a decade.

**Add to portal flow:** after contractor marks appointment complete, portal shows: "Don't forget to leave a magnet at this job. Every magnet is a future booking." Future cron: text contractor after every completed job: "Great work today — did you leave a magnet at [address]?"

**Channel B — Scratch Ticket Mailer — Two Uses**

*Contractor acquisition:* Mail to top 100-150 HVAC contractors in the service area. Physical scratch ticket reveals: "You won: 5 Free Booked Jobs." QR code underneath → `intake.tractifyhq.com?src=scratch_mail`. One converting contractor = $2,000 setup fee. Break-even at a fraction of 1% response rate. The scratch mechanic guarantees physical interaction — they can't ignore it the way they ignore a postcard. Tag: `?src=scratch_mail`.

*Homeowner job delivery:* Mail to 150-200 homeowner addresses in the contractor's service zips. Scratch to reveal: "Free HVAC diagnostic — text [Twilio number] to claim." Underneath is the contractor's Brain 3 number. Homeowner scratches, texts, Brain 3 opens the diagnostic conversation. Cost: $2-3 per mailer total. 150 mailers = $300-450. One job from that batch = $1,200+ revenue. Break-even under 1% response rate.

*The two-touch combination for contractor acquisition:* Scratch ticket arrives Tuesday. Jose DMs them Thursday: "Did you get the scratch card? The 5 free jobs offer is real." The DM is now warm — they've already held something physical from Tractify. Response rate jumps from ~2% cold to 15-20% warm. Tag the DM follow-up link: `?src=scratch_dm_followup`.

**Why physical channels matter strategically:**
Every competitor is fighting over Facebook CPMs and Google CPCs. The cost of those channels goes up every year as more advertisers enter. Physical channels don't have this dynamic. A fridge magnet in 2030 costs the same as a fridge magnet in 2024. The mechanic works identically. The competitive landscape for physical mail gets less crowded every year, not more, as everyone moves digital. These channels age in Tractify's favor.

---

#### Google Call-Only Ads + Brain 3 — The Closed Loop No Competitor Has (July 31, 2026)

This combination is possibly the most underpriced and underused homeowner acquisition channel that exists, and the reason it's underpriced is that every other company running it can't convert the missed calls. Tractify can.

**Why Call-Only ads have historically underperformed for home services:**
HVAC contractors miss calls constantly — they're on rooftops, under houses, in crawl spaces. Half the clicks to a Call-Only ad get voicemail. The homeowner hangs up and calls the next result. CPL looks terrible. Advertisers pause the campaigns. The underpriced inventory sits there.

**Why the same dynamic is now Tractify's biggest advantage:**
A missed call is the best possible outcome. Brain 3 catches every single one and opens a booking conversation in seconds. The contractor was on a roof. The homeowner texted the number (or called and missed). Brain 3 closed the booking in 4 messages. The contractor finds out when they get an alert with the address and a Maps link.

**The closed loop:**
Google Call-Only ad (high-intent searcher, actively looking for HVAC) → homeowner taps, phone rings → contractor misses (because they're working) → Twilio fires → Brain 3: "Hey! Sorry we missed you at [Business Name]. I'm their scheduling assistant — what's the address that needs service?" → booking confirmed in 4 messages.

**The economics:**
- Google Call-Only CPC for HVAC: $3-8 (vs $8-20 for Search with booking landing page)
- Reason it's cheaper: everyone else has bad conversion rates on missed calls
- Tractify's conversion rate on missed calls: dramatically better because Brain 3 catches them
- Effective CPB (cost per booking) on Call-Only: potentially the lowest of any paid channel
- Scale: as more calls happen, more data flows into Smart Bidding, CPC drops further

**How to run it:**
- Campaign type: Call-Only (separate from RSA campaigns)
- Bid strategy: Maximize Conversions initially, Target CPA once 30+ conversions
- Budget: $5-10/day per contractor, run alongside RSA campaigns
- Destination number: contractor's Twilio number (not their real number — Twilio catches missed calls)
- Ad headline: "[Business Name] HVAC" / "Available Now" / "Call for Same-Day Service"
- Tag bookings that follow a call within 2 hours as `booking_source = 'google_call'`

**The channel priority with Brain 3 active (updated):**
1. Call-Only Google ads → contractor misses → Brain 3 books (peak intent: actively searching, ready to call)
2. Facebook Lead Ads → pre-filled form → Brain 3 texts immediately → booked before they scroll away
3. Diagnostic ad (Facebook/Instagram/Nextdoor) → homeowner texts symptom → Brain 3 diagnoses → closes booking
4. Missed calls from all other sources → Brain 3 catches them all (zero additional ad spend)
5. SMS keyword / van wrap / fridge magnet → homeowner texts → Brain 3 books
6. Scratch ticket mailer → homeowner scratches, texts → Brain 3 books

Every channel feeds the same Brain 3 close. The channel diversification is Tractify's problem. The homeowner just has a conversation and ends up with an appointment.

---

#### The Two Ad Tracks

**Track 1 — Wide Net (data collection, $5-10/day)**
Any HVAC contractor, lower targeting specificity. Purpose: fill the funnel, learn what the self-selecting contractor looks like, identify which intake form signals predict fast job delivery. Track 1 builds the dataset that makes Track 2 targeting sharper over time. Don't put heavy ad spend behind Track 1 contractors unless they show strong signals after deploying.

**Track 2 — Sniper (August revenue, $20-40/day per contractor in trial)**
Hyper-targeted ideal profile: 4.5+ Google rating, 50+ reviews, 5+ years in business, active GBP listing, established local market. These are the first case studies and first Stripe conversions. Jobs deliver fast, conversion is near certain. This is where August revenue comes from.

**The signal that separates Track 2 from Track 1:**
When a contractor fills the intake form, check: Google rating (4.5+), review count (50+), years in business (5+), GBP listing present. Contractors matching all four → Track 2, put real ad spend behind them immediately. Missing two or more → Track 1, let organic channels work, minimal spend. Ask the brain: "which active contractors are Track 2 material?" — it can cross-reference their place_id data and booking velocity to answer.

---

#### Platform Strategy

**Facebook (primary — 80% of effort and all paid spend to start)**
HVAC business owners are 35-55. They're in Facebook contractor groups. They check Facebook on their phone between jobs. All paid spend goes here first. Every piece of organic content posts here first. Facebook also unlocks Lead Ads (zero-friction form inside Facebook, 3-5x better conversion than click-to-website) and the most mature contractor targeting of any platform.

**Instagram (secondary — repurpose only, no separate creation)**
Repost everything from Facebook. Reels from Facebook video. Don't create separate Instagram content — redistribute what's already performing. Audience skews 30-45, significant overlap with Facebook.

**Google Search Ads (secondary paid channel — start after Facebook has conversion data)**
Highest-intent traffic that exists — homeowner is actively typing "AC repair near me" right now. Do NOT use Google Local Service Ads (LSAs/Google Guaranteed): they require the contractor to set up their own account, get Google-verified, pass background checks, and grant Jose access. That's 2-3 weeks of back-and-forth per contractor minimum — needs a dedicated ops team at scale. Regular Google Search Ads have none of that friction. Jose controls the account, the campaign, and the spend. See full Google strategy section below.

**TikTok (future — after first 3 case studies exist)**
Younger contractors, organic reach still massive, authenticity-first format. Don't start here. Once case study data exists, TikTok becomes a raw behind-the-scenes storytelling channel showing the machine working in real time. The platform rewards showing real numbers and real outcomes.

**Facebook Group — "Home Service Contractors: More Booked Jobs"**
Start Day 1. Non-niche-specific name (scales as Tractify expands to plumbing, electrical, roofing). Post 3x/week: one value post (tactical, no pitch), one win post (contractor result when live), one question post to drive engagement. Group members convert at 3-5x the rate of cold ad traffic because the trust is already established before they see the offer. This is the owned audience that compounds forever — unlike ad spend which stops the moment you pause.

---

#### Facebook Ad Campaign Structure

**Campaign objective:** Leads — not Traffic, not Awareness. Leads objective unlocks Lead Ads and optimizes Facebook's algorithm toward form completions, not clicks.

**Campaign naming convention:** `[Track]-[Hook]-[Month]`
Example: `T2-MissedCall-Aug26`, `T1-Calendar-Aug26`

**Budget approach:** CBO (Campaign Budget Optimization) at the campaign level — Facebook allocates across ad sets automatically toward what's converting. Start $20/day per campaign. Scale winners to $40-60/day once cost per completed form is under $30. Kill any ad set where cost per form exceeds $60 after 7 days.

**Campaign structure:**
```
Campaign: T2-MissedCall-Aug26 ($20/day CBO)
  Ad Set 1: WA State — HVAC Business Owners (core targeting)
    Ad A: Missed call video, Script 1 (Jose on camera)
    Ad B: Same video, different hook caption in copy
  Ad Set 2: WA State — Contractor Interests (broader)
    Ad A: Calendar video, Script 2 (Daniel on camera)
    Ad B: Case study static image (when available)
```

**Placements:** Facebook Feed + Instagram Feed only. Remove Audience Network, Messenger, Reels to start. Feed = highest intent. Test Reels separately after Feed has proven data.

**Conversion optimization:** Drive to `intake.tractifyhq.com?src=[tag]`. Once 50+ contractors have hit the form, create a Facebook Custom Conversion on the intake success screen URL so Facebook can optimize toward completed forms instead of page visits — this is when targeting becomes dramatically more efficient.

---

#### Targeting Breakdown

**Core audience (Track 2):**
- Location: Washington state → radius around Seattle / Bellevue / Tacoma / Spokane
- Age: 35-55
- Job titles: HVAC Technician, HVAC Contractor, Heating and Cooling Contractor, Small Business Owner
- Interests: HVAC, Heating ventilation and air conditioning, Small business, Home improvement
- Behaviors: Small business owners (Facebook-verified)
- Exclusion: Anyone who visited `intake.tractifyhq.com` already (retargeting handles them separately)

**Lookalike audience (build after 50+ contractor signups):**
Upload email list of all contractors who completed the intake form → create 1% lookalike → this outperforms manual targeting because Facebook finds people who behave like your actual signups. Becomes the primary targeting at scale.

**Retargeting (always-on, $5/day):**
Anyone who visited `intake.tractifyhq.com` but didn't complete the form. Copy: "Still thinking about it? Your first 5 jobs are still free — takes 5 minutes." These people already showed intent — retargeting CPCs are 50-70% cheaper than cold and convert at a much higher rate.

---

#### Google Search Ads — The Scale Play (filed July 28, 2026)

**The core insight — turning a limitation into a competitive advantage:**
Every competitor assumes Google Local Service Ads (LSAs) are the only way to reach homeowners actively searching. They're wrong. LSAs require contractor account setup, Google verification, background checks, and ongoing access management — a dedicated team per 20 contractors. Regular Google Search Ads have none of that. Jose controls everything from one account. The limitation becomes the moat: no competitor doing LSA management at scale can do what Tractify does here because they're locked into the contractor-dependent setup model.

**Why Tractify's landing page beats LSA at conversion:**
- LSA flow: homeowner searches → Google's card → submits contact form → contractor notified → contractor calls back → homeowner may be cold → maybe books
- Tractify flow: homeowner searches → clicks ad → contractor subdomain → short form → live calendar → books in 60 seconds
- LSA hands the contractor a name and phone number. Tractify hands them a booked appointment. The conversion path is 3x shorter and Tractify controls the entire experience — LSA sends traffic to Google's interface, not Jose's.

**The MCC architecture — infinite scale, zero contractor involvement:**
Jose creates one Google Ads Manager Account (MCC). Each contractor = one campaign. New contractor signs up → zip codes already in the DB from intake form → clone template campaign → swap company name + zip codes → point destination URL to their subdomain → set budget → launch. ~20 minutes per contractor. No contractor involvement, ever.

```
Jose's Google Ads MCC
├── Campaign: Evergreen Home Heating [ZIPs: 98101, 98102, 98103]
│     ├── Ad Group: AC Repair → evergreenhomeheatingandenergy.tractifyhq.com?src=google_search
│     ├── Ad Group: Furnace Repair
│     ├── Ad Group: Emergency HVAC
│     └── Ad Group: General HVAC
├── Campaign: Premier Comfort HVAC [ZIPs: 98004, 98005, 98006]
│     └── [same structure, different subdomain + zips]
└── [next contractor — clone template, update 3 fields, launch]
```

**Keyword strategy — high-intent, ready-to-hire only:**
Use Exact Match and Phrase Match only. No broad match ever — it burns budget on garbage traffic.

High-intent keywords per ad group:
- AC Repair: `"AC repair [city]"`, `"air conditioner repair near me"`, `"[brand] AC repair"` (Carrier, Trane, Lennox — brand-specific = they already have the unit and need it fixed)
- Furnace Repair: `"furnace repair [city]"`, `"heat not working"`, `"furnace not turning on"`
- Emergency: `"emergency HVAC"`, `"emergency AC repair"`, `"AC broke down"`, `"no heat emergency"`
- General: `"HVAC near me"`, `"HVAC contractor [city]"`, `"licensed HVAC contractor"`, `"best HVAC [city]"`

Negative keywords (kill all non-buyer traffic immediately, add these on day 1):
`DIY, how to, parts, school, training, certification, salary, jobs, careers, YouTube, Reddit, free, manual, diagram, troubleshoot yourself`

**Ad formats — two types running simultaneously:**

*Responsive Search Ads (RSA) — primary:*
Google tests all combinations of headlines and descriptions, shows best performers automatically. One master template per contractor, swap `[Company Name]` and `[City]`:
- Headlines: "[Company Name] HVAC — [City]" / "Book Online in 60 Seconds" / "Same-Day Service Available" / "★★★★★ [X]+ Reviews" / "Licensed & Insured"
- Descriptions: "Licensed HVAC contractor serving [City]. Pick a time that works for you — appointments confirmed instantly." / "No phone tag. No waiting. Book online and we'll be there. [X]+ happy customers."
- Callout extensions: "Licensed & Insured" — "Book Online 24/7" — "Same-Day Available" — "5-Star Rated"
- Sitelinks: "Book Now" / "Emergency Service" / "Our Services" / "About Us"

*Call-Only Ads + Twilio = the breakthrough combination:*
Call-Only ads → when a homeowner clicks on mobile, their phone calls the number in the ad directly. That number is the contractor's Twilio number. Contractor is on a roof, misses the call. Twilio auto-texts the homeowner a booking link within seconds. The Call-Only ad feeds directly into Tractify's missed call text-back system. You're converting a high-intent Google click that would have been lost into an automatic booking — something no LSA can replicate because LSAs don't control what happens after they hand you the lead.
- Run Call-Only ads as a separate campaign at $5-10/day per contractor
- Use contractor's Twilio number as the call destination
- Tag the booking source as `google_call` when a booking follows within 2 hours of a call

**Smart Bidding toward actual bookings — this is where it becomes unfair:**
Install Google Tag Manager on each contractor subdomain. Fire a conversion event when a homeowner completes a booking (appointment confirmed). Tell Google to optimize for "Maximize Conversions" or "Target CPA" toward that event — not clicks, not form views, actual booked appointments. Google's algorithm learns which search queries → which clicks → actual bookings. Spend automatically concentrates on what converts. LSAs can only track contact form submits — a weaker signal. Tractify optimizes toward a better metric than LSA does natively. This advantage compounds every week the campaign runs.

**Performance Max — Maps exposure without LSA setup:**
Google's newest campaign type runs across Search, Display, YouTube, Maps, Gmail, and Discover automatically from one asset set. Relevant because it can serve on Google Maps — where LSAs live — without the contractor needing Google verification. Worth testing per contractor once search campaigns have 30+ conversions and Smart Bidding is fully unlocked. Provide Google headlines, descriptions, the contractor's logo (from their subdomain), and HVAC stock photos. Google handles placement.

**Budget architecture:**
- RSA campaigns: $10-15/day per contractor during trial
- Call-Only campaigns: $5-10/day per contractor during trial
- Do NOT start Google until Facebook has at least 2 weeks of data — Facebook's learning phase produces cheaper leads early, and Google conversion data needs a foundation
- Smart Bidding "learning phase" = ~2 weeks and 30+ conversions. Don't adjust campaigns or judge performance before day 14.
- Once Smart Bidding exits learning phase, CPA typically drops 30-50%. This is when Google becomes the primary channel if Facebook is plateauing.

**?src= tagging for Google campaigns:**

| Campaign type | Tag |
|---|---|
| Google Search RSA | `google_search_aug` |
| Google Call-Only | `google_call_aug` |
| Google Performance Max | `google_pmax_aug` |
| Google Display retargeting | `google_display_aug` |

**The compounding advantage — why this gets better with more contractors:**
Each contractor's conversion data (which keywords → bookings) feeds Jose's MCC account history. Google's algorithm gets smarter across all campaigns simultaneously. By contractor 10, Jose knows which keywords convert at the highest rate in the HVAC vertical across Washington state. By contractor 25, Smart Bidding has seen enough data to predict winning queries before they're proven. A single LSA manager never builds this kind of cross-contractor intelligence — their data lives in each contractor's separate account. Jose's MCC sees everything.

---

#### Google Search Ads — URL Tags

Every ad, post, story, group comment, and DM uses a unique `?src=` tag. The brain queries `contractors.acquisition_source` to show exactly which content piece drove each signup. This is already fully wired end-to-end: intake form reads the param → Worker passes it → deploy.js saves it to `contractors.acquisition_source`.

**Tag naming convention:** `[platform]_[format]_[hook]_[month]`

| Content piece | Tag to use |
|---|---|
| Facebook video ad — missed call | `fb_vid_missedcall_aug` |
| Facebook video ad — calendar | `fb_vid_calendar_aug` |
| Facebook video ad — direct offer | `fb_vid_offer_aug` |
| Facebook organic post | `fb_organic_aug` |
| Facebook group post | `fb_group_aug` |
| Instagram Reel | `ig_reel_aug` |
| Case study post | `fb_casestudy_aug` |
| TikTok video | `tiktok_vid_aug` |
| Direct DM / outreach | `dm_aug` |
| Facebook retargeting | `fb_retarget_aug` |
| Google Search RSA | `google_search_aug` |
| Google Call-Only ad | `google_call_aug` |
| Google Performance Max | `google_pmax_aug` |
| Google Display retargeting | `google_display_aug` |

Add the month suffix so you can compare Aug vs Sep performance. When a new creative runs, give it a unique tag. The brain will tell you which tags are producing active contractors with bookings vs which are producing signups who ghost.

---

#### Track 2 Attack Mode — What to Do When the Brain Identifies a Winner

When a contractor hits all four Track 2 signals (4.5+ Google rating, 50+ reviews, 5+ years in business, active GBP listing) and completes their checklist fast — this is the green light. Execute this sequence immediately, don't wait.

**The 10 channels already running before a dollar is spent:**
1. Missed call text-back (Twilio) — every missed call → instant booking link SMS
2. GBP "Book" button — organic search traffic booking directly from Google listing
3. Nextdoor post — neighborhood trust traffic from setup checklist
4. Facebook community group post — hyper-local homeowner mid-search traffic
5. Google reviewer outreach — past customers re-engaged, highest trust possible
6. Messenger + Instagram DM auto-reply — every inbound social message captured 24/7
7. SMS keyword / van wrap — inbound texts get booking link automatically

That's 7 automatic channels live before any ad spend. A Track 2 contractor with 80 reviews and an active listing may get 2-3 jobs from these alone in the first week.

**Then layer the tri-platform paid attack ($300/day total):**
- **Facebook/Instagram — $100/day:** Homeowner lookalike audience in their zip codes. Run Script 1 (missed call) or best-performing creative. Tag: `fb_vid_missedcall_aug`. Facebook approval: 24-48 hours.
- **Google Search + Call-Only — $100/day:** RSA campaign targeting high-intent keywords in their zip codes. Call-Only campaign using their Twilio number. Tag: `google_search_aug` / `google_call_aug`. Google review: 1-2 days.
- **Nextdoor — $100/day:** Zip code targeting in their exact service area. Homeowners asking for HVAC recommendations are already on this platform right now. Cheapest high-trust local traffic available.

**What omnipresence looks like for one homeowner in the service area:**
- Searches "AC repair [city]" on Google → contractor's ad at the top
- Opens Nextdoor → contractor in neighborhood feed
- Scrolls Facebook that evening → same contractor, different format
- Called them two days ago and missed → already has a booking link in their texts
- Checks Google Maps for reviews → booking button right there

This homeowner has now encountered the same contractor with real reviews across four different contexts. They're not comparing anymore. They're booking.

**Expected timeline for a Track 2 contractor:**
- Day 1: Deploy. 7 organic channels live. GBP booking button active.
- Day 1-2: First bookings from GBP + Nextdoor organic + Google reviewer outreach
- Day 2-3: Facebook and Google ads approved and running
- Day 3-5: Paid channels producing. Missed calls being caught and converted.
- Day 3-5: Hit 5 jobs. Stripe fires. $2,000 setup fee collected.

**The math:** $900-1,500 in ad spend to deliver 5 jobs. Contractor converts at $2,000. The free trial is profitable before the retainer even starts. Case study generated automatically from system data becomes the highest-converting ad creative going forward.

**Ask the brain:** "Which active contractors are Track 2 material?" — it cross-references their Google data (from place_id), booking velocity, and checklist completion speed to surface who deserves the full $300/day treatment right now.

---

#### Trial Delivery Optimization — 5 Jobs Fast at Minimum Cost

The core insight: the cheapest path to 5 jobs isn't optimizing ad spend — it's qualifying contractors so well that organic channels deliver 3-4 jobs for free, and ads only close the last 1-2. This reframes the whole problem. You're not minimizing cost-per-click. You're selecting contractors where the organic machine does the heavy lifting before you touch the budget. Target to work toward once case study data exists: 5 jobs in 7 days for under $500 total spend. At that number the $2,000 setup fee is 4x the cost of delivery and the business is obviously profitable at any scale.

---

**Layer 1 — Filter before deploying (biggest cost lever, costs nothing)**

Before deploying any contractor, run a 3-minute pre-qualification check on Google Maps:
- 50+ reviews ✓
- 4.5+ star rating ✓
- Photos present, GBP listing active with service area set ✓
- Showing up in top 3 results for "HVAC [city]" ✓
- Add to intake form: "Roughly how many calls do you miss per week?" — contractor missing 8+/week means missed call text-back alone could produce 2-3 jobs at zero cost

A contractor passing all five: expected organic output is 3-4 jobs free. Ads only need to close 1-2. Total paid spend: $150-300 instead of $1,500. The difference between a $300 trial and a $1,500 trial is entirely determined by who you let in — not how you run the ads.

---

**Layer 2 — Sequence organic channels before ads launch (24-48hr approval window is free time)**

Facebook and Google ads take 24-48 hours to approve. Use that window.

Day 1, first 2 hours — before any ad is live:
- Activate GBP booking button → highest-intent free traffic starts immediately
- Google reviewer outreach NOW — message every past reviewer on their Google listing: "Thanks again for the kind review — we now have online booking if you ever need service again: [link]." 20-30 messages. These people already paid them and left 5 stars. Trust is fully established. Could produce 2-3 bookings before a single ad impression runs.
- Submit Facebook and Google ads for approval simultaneously

Day 1, same day:
- Missed call text-back live and catching every missed call in real time
- Nextdoor organic post done (part of checklist)
- Messenger + Instagram DM auto-reply active

By the time ads approve on Day 2-3, you might already have 2-3 bookings from free channels. Ads only need to close the remaining jobs.

---

**Layer 3 — Ads as finishers, not starters**

Don't open at $300/day. Start at $50-100/day total, let organic run 72 hours, count jobs, then decide how much gas to add:
- 3 jobs by Day 3 from organic → $50/day closes 2 more
- 1 job by Day 3 → add $150/day, tighten targeting
- 0 jobs by Day 3 → contractor profile is the problem, not the ads — reassess before spending more

**Channel priority for job delivery paid ads:**

*Nextdoor first.* Criminally underrated for HVAC. Homeowners on Nextdoor are literally posting "anyone know a good AC guy?" right now. Context is neighbor recommendation, not internet ad. CPCs run $0.50-2.00 vs $5-15 on Google. Conversion rate is higher because trust context is already there. For a suburban contractor in a dense service area, Nextdoor is likely the single cheapest cost-per-booking paid channel available.

*Facebook Lead Ads second.* Not click-to-website — Lead Ads specifically. Form opens inside Facebook, name/email/phone pre-filled from their account, two taps to submit, Tractify texts booking link within 60 seconds. Conversion rate 3-5x higher than landing page because no friction — no page to load, no form to fill. Already built. This is the default homeowner acquisition ad format for job delivery.

*Google Call-Only third.* Captures homeowners at peak intent (actively searching, ready to call). Call goes to contractor's Twilio number → if missed, auto-text fires immediately. The Call-Only ad + missed call text-back is a closed loop that converts even when the contractor doesn't answer.

---

**Layer 4 — Ad creative that costs nothing to produce**

Pull the contractor's actual Google review text into the ad copy. "★★★★★ 'Best HVAC in [City] — showed up same day, AC fixed in an hour.' — Sarah M. | Book online in 60 seconds." Real neighbor social proof in the ad outperforms any copy Jose or Daniel writes. The reviews already exist — this is free creative that converts better than anything you'd pay to produce. On Nextdoor specifically this lands even harder because the homeowner knows Sarah M. might actually be their neighbor.

---

**Layer 5 — Speed up checklist completion = speed up organic output**

Every day a contractor delays completing the checklist is a day the organic channels don't fire. GBP booking button not set up = GBP traffic not converting. Call forwarding not set up = missed call text-back dead.

Two things accelerate completion:
1. Reframe each step with a concrete expected outcome: "GBP booking button: most contractors get their first booking within 48 hours of completing this step." Make the value of each step undeniable before they read the instructions.
2. The AI SMS drip calls out the specific stalled step by name: "You haven't set up call forwarding yet — you're probably missing calls right now that are going to your competitors." Not generic nudging — specific, urgent, true.

---

**Layer 6 — Warm outreach parallel track (zero cost, runs alongside ads)**

While ads warm up in Month 1, do targeted direct outreach simultaneously. This is not cold calling — it's pre-qualified warm outreach to contractors already identified as Track 2 material. Search Google Maps for "HVAC [city]," filter for 50+ reviews and 4.5+ stars, reach out to the top 10 with a specific message referencing their actual business:

*"Found you on Google — 70 reviews and 4.8 stars tells me you're already the real deal. I want to get 5 more booked jobs on your calendar this week for free to prove what Tractify does."*

Message is specific to them. Cost is zero. Conversion rate is much higher than cold ad traffic because you're referencing their real business and their actual results. Run this alongside paid ads every week — it finds the best contractors faster than any ad algorithm.

---

**The number to optimize toward**

Cost per delivered trial under $500. At that number:
- $2,000 setup fee = 4x cost of delivery
- Every trial is profitable even before the retainer starts
- The business scales as fast as you can find qualified contractors
- Case studies from each win reduce contractor acquisition cost going forward

Ask the brain at any time: "Which active contractors are closest to 5 jobs?" and "Which channels are producing bookings fastest?" — it has live data on both.

---

#### Budget Allocation (August)

| Line | Amount | Purpose |
|---|---|---|
| Facebook ads — Track 1 wide net | $150/mo ($5/day) | Data collection, funnel filling |
| Facebook ads — Track 2 sniper (2-3 contractors) | $300/mo ($10/day each) | August revenue |
| Retargeting (always-on) | $150/mo ($5/day) | Recapture intent visitors |
| Boost best organic post | $100-200 one-time | Amplify proven creative |
| **Total** | **$700-800/mo** | Keep tight until first Stripe conversion |

**Scale rule:** cost per completed form under $30 → double the budget on that campaign. Over $60 after 7 days → kill it and test new creative. Never let a failing ad set run longer than 7 days without data-backed reason to keep it alive.

---

#### Video Script Templates (Word-for-Word — Film These)

**Script 1: The Missed Call — 30 seconds (Jose on camera)**
```
Hook (0-3s):
"HVAC contractors — every missed call is a lost job. Here's what Tractify does about it."

Problem (3-12s):
"You're on a rooftop right now. Your phone rings. You can't answer.
That homeowner is already calling the next guy. That job is gone.
It happens ten times a week and you never even know."

Solution (12-22s):
"The second you miss that call, Tractify auto-texts them.
'Hey, sorry we missed you — here's a link to book a time.'
They book right there. Job's on your calendar before you climb down."

Offer (22-30s):
"First 5 jobs are free. No strings. Fill out our setup form — link in bio."
```

**Script 2: The Empty Calendar — 30 seconds (Daniel on camera)**
```
Hook (0-3s):
"What does an HVAC contractor's calendar look like before Tractify versus after?"

Before (3-12s):
[show phone with empty calendar app]
"This is what most HVAC contractors are dealing with right now.
Slow week. Waiting for the phone to ring. Hoping Google sends someone."

After (12-22s):
[show calendar with multiple bookings]
"This is what our contractors see 7 days after going live.
Jobs from Google. Jobs from missed calls. Jobs from Facebook.
All booked directly on the calendar. They didn't do anything. The system did."

Offer (22-30s):
"We'll get your first 5 jobs on your calendar free. Five minutes to set up. Link in bio."
```

**Script 3: The Direct Offer — 15 seconds (either, for rapid creative testing)**
```
Hook (0-2s):
"HVAC contractors — we'll book your first 5 jobs for free."

Proof (2-10s):
"We set up your entire booking pipeline — missed calls, Google, Facebook.
Jobs go straight to your calendar. No missed calls. No chasing leads."

CTA (10-15s):
"Fill out our quick form. Link in bio. Takes 5 minutes."
```

**Script 4: The Real Problem — 60 seconds (Jose on camera, organic deep dive)**
```
Hook (0-3s):
"HVAC contractors — the real reason you're not as busy as you should be
has nothing to do with your skill."

Problem (3-25s):
"You're incredible at the work. But you miss calls because you're doing the work.
Your Google listing doesn't have a book button.
Your Facebook page doesn't respond to DMs.
Your website — if you have one — doesn't let anyone book online.
So homeowners who want to hire you right now literally can't.
They move on. Not because they chose someone better. Because someone else made it easier."

Solution (25-45s):
"That's the entire problem Tractify solves.
We plug in everywhere a homeowner might try to reach you —
phone, Google, Facebook, missed calls —
and every single one of those touchpoints turns into a booked job on your calendar automatically."

Offer (45-60s):
"We're handing 5 contractors this month their first 5 jobs completely free.
No commitment. We just want the case study.
Link in bio — setup takes 5 minutes."
```

**Filming notes:** No tripod. Phone propped against something stable. Natural light near a window or outside. Know the beats, talk naturally — don't script-read. Imperfection is authenticity. One good take beats ten polished ones. The goal is a contractor watching this on his phone between jobs feeling like you're talking directly to him.

---

#### Content Calendar — Week 1 (Start Here)

| Day | Action |
|---|---|
| Day 1 | Film Script 3 (15-sec direct offer). Post to Facebook + Instagram. Set as paid ad at $20/day immediately. Tag: `fb_vid_offer_aug` |
| Day 2 | Film Script 1 (missed call). Post organically to Facebook. Post in 3 HVAC contractor Facebook groups. Tag: `fb_group_aug` |
| Day 3 | Screen recording: show admin dashboard, live booking coming in, calendar updating. 30-sec with voiceover. Post organically. Tag: `fb_organic_aug` |
| Day 4 | Repurpose Day 2 video to Instagram Reel. Tag: `ig_reel_aug` |
| Day 5 | Post value content in Facebook group (no pitch) — tactical tip about missed call text-back |
| Day 6 | Film Script 2 (calendar before/after). Post to Facebook. Tag: `fb_vid_calendar_aug` |
| Day 7 | Review data. Take best-performing organic video, run it as a paid ad at $20/day. Scale what's working. |

**Ongoing cadence:** 1 new video per week minimum. 3-5 group posts per week (value, not pitch). 1 paid ad running at all times. Case study post the moment first contractor hits 5 jobs — this becomes the highest-converting ad creative you'll ever run.

---

#### Organic Distribution

**Facebook contractor groups:**
Search "HVAC contractors [city]", "Home service contractors [state]", "Contractors [state]". Target groups with 1,000+ members and active recent posting. Don't drop the offer link immediately — comment on 3-4 other posts first, then post value content. Drop the intake link naturally after establishing presence. Groups that allow business posts: post once per week. Groups with strict rules: comment only, never post offers.

**Facebook group — "Home Service Contractors: More Booked Jobs":**
Post 3x/week: (1) value — tactical post, no mention of Tractify, (2) win — contractor result numbers when live, (3) question — drive engagement, get contractors talking. Goal: 100 engaged members by end of August. Every win post that shows real job numbers becomes a conversion event for lurking contractors.

**Nextdoor (homeowner-facing, drives jobs to trial contractors):**
Post in neighborhoods in each trial contractor's service area. "Need HVAC in [city]? [Contractor name] does online booking — no phone tag: [their subdomain]." This is not contractor acquisition — it's job delivery for the free trial, which is what makes the case study.

---

#### The Case Study Machine

The system already logs everything needed. No contractor involvement, no filming, no chasing.

**When a contractor hits 5 jobs, the case study pulls from live data:**
```
[Contractor name], [City]
Went live: [deploy date]
First booking: Day [X] — Channel: [booking_source]
All 5 jobs: Day [Y] — [X] days total
Channel breakdown: [X] Google, [X] missed call, [X] paid ads, [X] direct
[If revenue logged]: Estimated revenue: $[X]
```

**The visual:** Screenshot of their portal with 5 confirmed appointments. Real contractor name. Real dates. Real channel attribution. Impossible to fake. Instantly credible to other contractors because it looks exactly like something they'd recognize from their own calendar.

**Where it goes:**
- Facebook post: "Day [X] update — [Name] just hit 5 jobs." Tag: `fb_casestudy_aug`
- Run the portal screenshot as a paid ad creative — test it against Script 1 and Script 3, data wins
- Email to contractor at the job 3 milestone — shows them their own numbers, primes the Stripe conversion
- Add to the Facebook group as a win post — drives organic contractor signups from group members

---

#### How the Admin Brain Uses This Department

The brain cross-references this section with live database data on every query:

- **"Which content piece is driving the most signups?"** → queries `acquisition_source` breakdown, shows which `?src=` tags produced the most contractor accounts
- **"Which content is producing active contractors vs ghosters?"** → cross-references acquisition_source with onboarding step completion and booking count — tells you which creative attracted contractors who actually showed up vs signed up and disappeared
- **"What should I put the next $20 behind?"** → brain looks at highest signup-to-active-contractor conversion by source tag, recommends scaling that creative
- **"Who are the best case study candidates?"** → queries contractors by booking count, days live, source — surfaces whoever is closest to 5 jobs
- **"How much is each contractor costing us in ad spend?"** → Jose inputs spend amount, brain divides by contractor count from that source tag to give cost per acquisition
- **"Which track is performing better?"** → compares T1 vs T2 source tags against booking velocity and checklist completion speed

The brain can't see Facebook Ads Manager directly (that data doesn't live in Tractify's DB) but Jose can tell it ad spend and the brain calculates cost per acquisition from signup counts. Once acquisition_source is fully populated (Worker one-line fix pending), this becomes automatic on every query.

---

#### Learning Resources — Ads, Content & Distribution

*Jose's curated list of the best sources for learning each ad platform and content strategy. Added July 31, 2026. Work through these in order — Facebook first, then Google, then Nextdoor. Platform mastery comes after the first campaign is converting, not before.*

**Overall Content Mindset (read first)**
- **"Day Trading Attention" by Gary Vaynerchuk** — foundational thinking for organic content and how attention works across platforms in 2026. Read this before touching any ad platform. Rewires how you think about creative.

**Facebook / Meta Ads (start here)**
- **Ben Heath — YouTube** — the clearest practical educator for Facebook lead generation specifically. Watch his videos on campaign structure, creative testing, and algorithm behavior. Skip most other Facebook educators — too much noise in that space. Ben Heath is the signal.
- **Meta Blueprint** — facebook.com/business/learn — free courses directly from Meta. Use for platform fundamentals and understanding the ad auction. Pairs well with Ben Heath.

**Google Ads (layer on after Facebook has data)**
- **Google Skillshop** — skillshop.google.com — free, directly from Google, includes Search Ads certification. Best starting point for Google — teaches fundamentals correctly without bad habits. Do the Search Ads certification first.
- **Aaron Young "Define Digital Academy" — YouTube** — practical campaign management after Skillshop gives you the foundation. Good for understanding bidding strategies, Quality Score, and campaign optimization in the real world.

**Nextdoor Ads (simplest platform — no course needed)**
- **Nextdoor for Business help center** — business.nextdoor.com — spend one hour reading their documentation and you'll know everything needed. Creative and targeting principles learned from Facebook transfer directly. No dedicated course necessary.

**Offer + Lead Quality Thinking (applies across all platforms)**
- **"$100M Leads" by Alex Hormozi** — not a course on ad platforms but sharpens thinking on offers and lead quality in a way that makes everything you run more effective. The offer is more important than the targeting at this stage.

**The right order:**
1. Finish "Day Trading Attention" — content brain first
2. Meta Blueprint fundamentals → Ben Heath YouTube → first Facebook campaign live
3. Let Facebook run 2 weeks, collect conversion data
4. Google Skillshop certification → Aaron Young → first Google campaign live
5. Nextdoor launches alongside Google — 1 hour of reading, done
6. "$100M Leads" anywhere in the process — sharpens the offer thinking that makes all channels work better

---

#### Living Playbook Log

*This section is the running record of everything tested, proven, disproven, and learned. The brain reads this log and factors it into every recommendation. Date every entry. Be specific — vague entries are useless to the brain.*

**July 28, 2026 — Department initialized.**
Content/ads brain built from scratch. No ad spend deployed yet. First contractor (Evergreen Home Heating and Energy) live via auto-deploy July 25. Awaiting Twilio compliance approval before missed call channel activates. Scripts 1-4 written, ready to film. Facebook group not yet created. Week 1 content calendar mapped. Next action: film Script 3 (15-sec offer), post and run as paid ad Day 1.

**July 28, 2026 — Google Search Ads strategy locked.**
Decision: skip Google Local Service Ads entirely. LSA requires per-contractor account setup, Google verification, background checks, access grants — ops-team-level work that doesn't scale. Regular Google Search Ads (MCC architecture) give equal or better reach with zero contractor involvement. Key insight: Tractify's inline booking landing page converts better than Google's own LSA interface because the booking happens in one session on our page. LSA just hands you a name and phone number — we hand a booked appointment. Call-Only ads + Twilio missed call text-back = breakthrough combination that LSA can't replicate. Smart Bidding toward actual booked appointments = better optimization signal than LSA tracks. Start Google after Facebook has 2 weeks of data. Build MCC, clone template per contractor, use contractor zip codes from DB.

**July 28, 2026 — Full ad automation arc locked (the endgame).**
The compounding effect on Google's algorithm leads directly to full automation. Every contractor's conversion data makes the next campaign cheaper and faster. The automation arc:
- Phase 1 (now): Brain answers questions. Jose executes manually.
- Phase 2 (5-10 contractors): Brain surfaces patterns from acquisition_source + booking_source cross-reference. Jose still executes but the brain makes the call. Example: "fb_vid_missedcall_aug averaging 3.1 bookings/contractor. fb_vid_offer_aug averaging 0.6. Pause offer, double missed call budget."
- Phase 3 (15-20 contractors, Google Ads API + Meta Marketing API connected): Brain pulls live campaign data — keyword-level CPA, converting queries, burning ad groups. Makes specific recommendations. Jose approves or ignores. 10 min/week instead of hours.
- Phase 4 (25+ contractors, guardrails pre-approved): Brain executes automatically within monthly budget cap + CPA threshold Jose sets. Contractor at 4 jobs gets budget spike to close job 5 before Stripe fires. Contractor with dead calendar gets budget pulled + alert to Jose. Google and Facebook budgets rebalanced automatically based on which channel is converting that week.
Key advantage over Google's own Smart Bidding: brain has context Google doesn't — contractor job count, proximity to Stripe conversion, market profile, channel mix. Brain can say "contractor 8 is 2 jobs from $2,000 setup fee — pour gas on this for 48 hours." Google's algorithm can't make that call. Build Google Ads API integration after Phase 2 data exists to prove the patterns. Connect Meta Marketing API at same time.

**July 28, 2026 — Trial delivery optimization framework locked.**
Core insight: the cheapest path to 5 jobs isn't minimizing ad spend — it's qualifying contractors so well that organic channels deliver 3-4 jobs free and ads only close the gap. Five layers: (1) Filter before deploy — 3-min GBP check, miss-rate question on intake form. (2) Organic-first sequencing — reviewer outreach and GBP booking button on Day 1 before ads even approve, could produce 2-3 jobs before first ad impression. (3) Ads as finishers — start $50-100/day, count organic jobs at Day 3, only add spend where needed. (4) Channel priority: Nextdoor first (cheapest CPC, highest trust), Facebook Lead Ads second (3-5x conversion vs click-to-website), Google Call-Only third (closed loop with Twilio). (5) Free ad creative: pull contractor's actual Google review text into ad copy — outperforms anything written from scratch. Parallel track: warm outreach to pre-qualified Track 2 contractors on Google Maps alongside paid ads, zero cost, higher conversion than cold traffic. Target: under $500 per delivered trial. At that number the $2,000 setup fee is 4x cost of delivery and the business is profitable at any scale.

**July 28, 2026 — Track 2 omnipresence play locked.**
When a contractor is identified as Track 2 material (4.5+ stars, 50+ reviews, all 7 channels set up fast), the move is tri-platform paid attack simultaneously: $100/day Facebook, $100/day Google Search + Call-Only, $100/day Nextdoor. Key insight: the 10 channels aren't additive — they create omnipresence in a micro-geography. A homeowner in the service area can't avoid seeing this contractor. Google catches them actively searching. Nextdoor catches them asking neighbors. Facebook interrupts them before they've even started looking. Missed call text-back catches them if they already tried and got no answer. These aren't the same homeowners hit multiple times — they're completely different people caught at completely different moments of intent. Total addressable audience across all channels simultaneously is much larger than any single channel. Math on a winning contractor: organic channels alone produce 2-3 jobs the first week (GBP, Nextdoor post, reviewer outreach, Messenger auto-reply). Paid ads layer on top from day 3. Track 2 contractor result: 5 jobs in 3-5 days at $900-1,500 in ad spend. Contractor converts at $2,000 setup fee — the free trial is profitable before the retainer starts. The case study from that contractor ("5 jobs in 4 days, $6,200 revenue generated, 3 channels") becomes the ad creative that brings in the next ten contractors without additional spend. The flywheel feeds itself.

**July 28, 2026 — Automation-first constraint locked. Critical model reframe.**
Key insight from brainstorm: the channel strategy that works for contractors who were personally called is NOT the same as what works for contractors who came through an online ad. Ad-sourced contractors are low-commitment at signup — they saw something interesting and filled out a form. Asking them to manually text past customers, dig through missed call logs, post in Facebook groups, or do reviewer outreach causes immediate drop-off. They didn't sign a contract. They're just curious. The moment friction is high, they check out.

The reframe: **Tractify must generate the 5 jobs DESPITE low contractor engagement.** The jobs themselves are what convert curiosity into commitment. You don't earn their attention by asking for effort upfront — you earn it by putting appointments on their calendar before they've done anything.

The minimum contractor action for the system to work:
1. Confirm their availability — pre-populated from intake form, they just tap confirm
2. Forward their calls to the Twilio number — 5 minutes, AI walks them through it step by step via SMS

That's it. Two things. Not 8 checklist steps. Everything else is Jose + the system.

What this changes about channel strategy: organic channels that require contractor action (reviewer outreach, Facebook group posting, personal SMS to past customers) are NOT reliable for trial delivery in the first cohort. They're too dependent on contractor follow-through that won't happen at this stage. The reliable channels are ones Jose controls completely (paid ads) and ones that run automatically once Twilio is set up (missed call text-back, abandoned booking follow-up, Facebook Lead Ad webhook). The execution model is: Jose sets up paid ads once per contractor → system converts automatically → contractor shows up for the job. The pitch becomes: "Set your hours, forward your calls. We handle everything else."

What doesn't change: the checklist still exists, the AI SMS still pushes steps, GBP booking button still matters. But trial delivery can't be gated on contractors completing all of it. Jobs have to flow even for a contractor who only completed 2 of 7 steps.

Channels ranked by reliability (no contractor involvement needed):
1. Facebook Lead Ads (Jose sets up once, runs automatically, webhook converts in 60 seconds)
2. Google Search + Call-Only (Jose sets up once in MCC, runs automatically, Twilio catches missed calls)
3. Nextdoor paid ads (Jose sets up once, runs automatically)
4. Abandoned booking follow-up — system fires 1 hour after form submission with no appointment (needs to be built)
5. Missed call text-back — automatic once call forwarding is set up (contractor's 1 mandatory action)

Burst spend ($150-200/day across the three paid channels for days 1-3) compresses the trial into 3-5 days instead of 10. Get data fast, optimize fast, close the trial fast. Slow burn is the wrong strategy — speed is what makes the product feel magical.

**July 28, 2026 — Trust gap model + access-first channel strategy locked.**
The original checklist asked contractors to set up 7 channels themselves. Problem: ad-sourced contractors are low-commitment and most won't follow through. The new model flips who does the work: contractor grants access, Tractify does the setup.

Key insight on trust gap: it's not filled by disclaimers, contracts, or explanations. It's filled by the first job on their calendar. A contractor who just watched a real appointment appear from a stranger they've never met is not skeptical anymore. They're impressed. That's the moment to ask for account access — not at signup.

**The sequencing:**
1. Contractor does 2 things (confirm availability + call forwarding). Jose runs paid ads. First job appears. Zero access required.
2. After job 1 lands: Jose asks for GBP Manager access and Facebook Page Editor access. Frame: "We've already built your auto-reply, your reviewer outreach, your group post copy — just add us and we'll have 4 more channels live in 5 minutes."
3. Jose pushes everything live. Channels 6 and 7 activate. Jobs 2-5 come faster.

**What shrinks the access ask further — AI SMS handles low-friction channels:**
GBP booking button = one URL paste, 60 seconds. Messenger auto-reply = copy-paste text. Both handled by the AI SMS walking contractor through it step by step. No account access needed for either. The only things that genuinely require access are: GBP Manager for reviewer outreach, and Facebook Page Editor for posting as their page in community groups. Everything else is handled by paid ads or AI-assisted instructions.

**How the access request is made:**
- Request access as Tractify (Tractify Business Manager account), not Jose personally — it's a business relationship, not giving your login to a stranger
- Show the revoke instruction BEFORE the setup instruction every time — "you can remove us in one click: here's how. Now here's how to add us." Showing the exit before the entrance kills skepticism faster than any reassurance
- The "already done" close: by the time access is requested, the reviewer outreach templates are written, the group post copy is drafted, the Messenger message is ready. "We've already built everything — add us and we'll push it live in 5 minutes." Work done before the ask completely flips the psychology

**The access ask in one sentence:** "Add Tractify as manager on your Google listing and page editor on your Facebook — takes 2 minutes each. We'll set up 4 more channels using that access, and you can remove us anytime with one click."

**What this means for the pitch:** "Set your hours, forward your calls. We handle everything else." Literally true. The contractor does 2 things. Every channel activation from that point is Tractify.

**July 28, 2026 — Automation scope decision locked. What gets automated now vs what stays manual.**
Key distinction: not everything should be automated immediately. Automate only what provides zero learning value when done manually.

**Ads stay manual — intentionally.** Running Facebook, Google, and Nextdoor ads manually for the first 5-10 contractors is how the skill gets built — which copy converts, which targeting produces the right contractors, what budget levels make sense, what the real cost per job is. Automating ads before learning them means automating something you don't understand yet. When it underperforms you won't know why. The manual phase is the learning phase. Ad automation comes after the patterns are proven — not before.

**Post-access channel activation gets built now.** Once a contractor grants GBP Manager access or Facebook Page Editor access, the system should fire immediately and automatically. This is pure mechanical work — the same 3 API calls every time, no judgment involved. Doing this manually for every contractor is wasted time that should be building content and running ads.

**The build:**
- When GBP Manager access is granted → system automatically: (1) sets booking button on their GBP listing using contractor's place_id already in DB, (2) replies to every 4+ star review with their booking link. Uses Google Business Profile API.
- When Facebook Page Editor access is granted → system automatically sets Messenger instant reply with their booking link. Uses Facebook Graph API (infrastructure already half-built from Lead Ads webhook).
- Both triggered from admin dashboard — Jose marks "GBP access granted" or "Facebook access granted" → system fires immediately. No manual follow-through required.

**The principle:** Automate the mechanical. Stay manual on the things you're still learning. Jose's time and focus belongs on content, ads, and distribution — not repetitive per-contractor grunt work that an API call can handle in 2 seconds.

**July 28, 2026 — Capital-efficient trial model locked. Free organic starts the fire, signal-gated paid finishes it.**
The burst-spend-for-everyone model was wrong. Spending $150-200/day on every trial contractor before proving the market responds burns capital needed for the contractors who are guaranteed to convert. The corrected model:

Free organic channels do the heavy lifting first. Paid ads are the finisher, not the starter. This only works if access is granted early — which means the access ask moves to the success screen (immediately after intake form submit, when excitement is highest), not after job 1.

**Two paths, both handled:**

Path A — contractor grants access at success screen (goal: maximize this path):
- Post-access automation fires immediately: GBP booking button live, review replies sent with booking link, Messenger auto-reply set
- Jose posts in Nextdoor + Facebook group once (free, 20 minutes)
- Missed call text-back running automatically
- Organic channels run for 5-7 days
- If 2-3 organic jobs appear → small burst ($50-100/day) to close the remaining jobs
- Total ad spend: $100-300 per trial

Path B — contractor skips access at success screen:
- Signal test only: $10-20/day Facebook test ad for 3 days
- If a homeowner submits or a missed call converts → ask for access again, activate channels, burst to close
- If no signal after 72 hours → diagnose before spending more. Stop at $30-60.
- Total ad spend: $30-400 depending on signal

Path A is dramatically cheaper. Maximizing Path A uptake is the capital lever — which means the access ask framing has to be perfect.

**How the access ask is framed (this is everything):**
The ask lives on the success screen right after form submit. It is optional. It is bounded. It is transparent.
- Ask is under the Tractify Business Manager account — not Jose personally. Business relationship, not "give your login to a stranger."
- Revoke instructions shown FIRST, before the setup instructions. "You can remove our access anytime in one click — here's how." Then: "Here's how to add us." Showing the exit before the entrance is counterintuitive but it's the fastest trust-builder that exists. It signals confidence and zero pressure.
- Exact permissions spelled out: "As GBP Manager: we add your booking button and reply to your reviews with your booking link. We cannot change your business name, phone number, or delete your listing. You remain the owner." Specificity kills vague fear.
- The ask is framed around what activates, not what's granted: "Want us to activate 4 more channels right now?" not "Can you give us access to your accounts?"

Key insight: showing revoke instructions front and center doesn't undermine trust — it actively builds it. A company confident enough to lead with "here's how to remove us" is not a company trying to trap you. That transparency is the signal. Most contractors will read that and relax.

**The one thing that makes this whole model work: post-access automation must be built first.** If a contractor grants access on the success screen and Jose has to manually set up their channels, Path A doesn't scale. The automation fires the moment access is granted — no Jose involvement. Build the automation, then run the ads. Not the other way around.

**July 28, 2026 — Four critical gaps identified before first ad spend. Do not run ads until all four are closed.**
Gap 1: Checklist mismatch — portal shows 7-step checklist but real model is 2 things. Direct contradiction of the pitch. Any contractor logging in today sees conflicting information. Fix the checklist UI first, fast. Gap 2: No visibility into trial failure — no alert when job 1 lands, no alert when 72 hours pass with zero bookings. Flying blind in August without these. Build both alerts before ads run. Gap 3: Post-access channel automation not built — the new model depends on system auto-activating GBP (booking button + review replies) and Facebook (Messenger auto-reply) the moment access is granted. Neither API integration is built yet. This is 2-3 sessions of work and must be done before the first contractor who triggers it. Gap 4: Track 1 contractor economics — if a weak-profile contractor slips through the intake form and jobs take 2-3 weeks, burst ad spend ($150-200/day) becomes $2,000-3,000 before a single conversion. Pre-qualification is not optional. Brain should flag any contractor who doesn't meet Track 2 criteria before real ad spend is authorized. Correct sequence: fix checklist → build booking alerts → build post-access automation → then run ads.

**July 28, 2026 — Stripe conversion page framing locked. Honest structure, no misleading language.**
The revoke-first principle applies to the payment page the same way it applies to the access ask. Lead with the freedom, not the commitment. "No contract. Month-to-month. If the jobs stop coming, you stop paying." That line goes at the top — before the price — because it removes the biggest psychological barrier to clicking confirm.

Critical correction: do NOT frame the $2,000 setup fee as "covering things the contractor owns." They own nothing. The site runs on Tractify's domain. The Twilio number is Tractify's. The campaigns run from Jose's accounts. The channels are set up through Tractify's access. If they leave, all of it stops. Saying "it's yours" is misleading and destroys trust the moment they find out.

The honest framing is more powerful than the misleading one. Tractify is a service, not a product. Like electricity — when you're a customer it runs, when you leave it stops. That's not a trap, it's how services work. The no-contract line is what makes it honest: "we have to earn your business every single month because the moment results stop, you can walk."

**The $2,000 setup fee:** "covers the 5 jobs we already delivered, the ad spend we ran during your trial, and the full pipeline we built for you." Not "things you own" — results already received.

**The $800/month retainer:** "keeps the jobs flowing. No contract — we run your booking pipeline as long as we're delivering results. The moment we're not, you walk."

**The Stripe page in one paragraph:** "The $2,000 setup fee covers the 5 jobs we already delivered, the ad spend we ran during your trial, and the full pipeline we built for you. The $800/month keeps the jobs flowing. No contract — we run your booking pipeline as long as we're delivering results. The moment we're not, you walk. That's the deal."

This framing does two things simultaneously: it's completely honest about how the service works (everything stops if they leave), and it converts better because the confidence behind it is undeniable. A company that says "you can walk anytime" is a company that believes in its own results. Contractors who've already watched 5 jobs appear on their calendar will feel that immediately.

**July 28, 2026 — Guerrilla marketing channels evaluated. Three ideas, one winner, one combination play.**

**Cold DM on Facebook/Instagram — yes, but done right.**
The concept is correct. The execution needs guardrails. Meta aggressively flags new accounts sending high-volume identical messages. The fixes: (1) warm the account for 3-4 weeks with genuine content before any DM goes out — the account needs to look real and established first. (2) Don't go cold — go warm through groups. Jose joins 5-10 HVAC contractor Facebook groups, spends two weeks commenting and adding value, then DMs people who engaged with his comments. That's a warm DM with a prior touchpoint, not a cold one. Conversion rate dramatically higher, spam risk dramatically lower. (3) Volume on a new account: 10-15/day max, not 50-100. Build up slowly. (4) Personalize every message — contractor's name, their city, their review count. Never copy-paste. Never include a link in the first message — start a conversation, send the link when they respond. Best role: parallel track to content, not the primary channel. Groups plus 10-15 warm DMs per day is the right dose for this stage.

**Fortune cookie — concept sound, logistics kill it.**
Fragile item requiring special packaging. Food shipping complexity. Custom fortune insert printing. Cost lands at $6-10 per contractor minimum once cookie + insert + protective packaging + shipping is calculated. With low conversion rates that's an expensive acquisition channel. The core concept (surprising physical object that demands interaction) is right — the vehicle is wrong. Don't pursue.

**Scratch ticket — the winner.**
Same concept as the fortune cookie, better on every dimension. Everyone scratches a scratch ticket — it's involuntary. Custom scratch tickets print for $0.50-1.50 each in bulk. Envelope + first class stamp = $2-3 total per contractor. 3-5x cheaper than fortune cookies with higher engagement because of the physical interaction mechanic. Design: "YOU WON: 5 Free Booked Jobs Are In Your Future." QR code underneath. ?src=scratch_mail tracking tag. Intake form URL. Clean, memorable, trackable. NOT nationwide — start with the top 100-150 HVAC contractors in Seattle/Bellevue/Tacoma area. Pull mailing addresses from Google Maps (2-3 hours, free). 150 scratch tickets under $400 total. Validate the concept locally before scaling.

**The combination play — scratch ticket + DM follow-up.**
Scratch ticket arrives Tuesday. Jose DMs them Thursday: "Hey — did you get the scratch card we sent? The 5 free jobs offer is real." The DM is no longer cold — they've already held something physical from Tractify, scratched it, read the offer. It's a warm follow-up to a physical touchpoint. Response rate jumps from ~2% cold to potentially 15-20% warm. Two-touch sequence: physical → digital, both tracked. The scratch ticket makes the DM warm. The DM makes the scratch ticket actionable. Neither works as well alone as both do together. Tag: ?src=scratch_mail on the QR code, ?src=scratch_dm_followup on any link sent in the DM response.

**July 29, 2026 — 2-step portal + AI SMS drip architecture locked. SMS copy must be airtight before first real contractor.**
Contractor portal now shows exactly 2 required steps (confirm availability + call forwarding). Everything else removed from the UI entirely. One line at the bottom: "Everything else is handled by Tractify — you'll get a text as each channel goes live." The AI SMS drip is now the primary onboarding mechanism for all channels beyond the 2 required steps. This is intentional — the SMS drip acts as a filter. Contractors who text back and follow through are the ones worth having. Contractors who ignore three texts self-select out, saving Jose from chasing low-commitment trial contractors. The architecture is correct. The risk: if the SMS copy is generic or low-urgency, engaged contractors still won't act on it. **Before first real contractor goes live, the AI SMS drip messages in `backend/services/smsAI.js` must be rewritten to be specific, urgent, and value-forward.** Each message should name the exact channel, the exact cost of skipping it, and make the action feel like a 60-second win — not a task. Example of wrong: "Your next step is adding your booking link to Google Business Profile." Example of right: "Your Google listing is getting search traffic right now but there's no booking button — homeowners searching 'HVAC near me' can't book you. Takes 60 seconds to fix. Reply YES and I'll send the exact steps." The difference between those two messages is whether someone acts or ignores it. Review and rewrite every drip message in smsAI.js before the first contractor's Twilio number goes live.

**July 30, 2026 — All pre-ad gaps closed. Machine ready for first real contractor.**
Gap 1 closed: contractor portal now shows 2 required steps only. First-login modal rewritten to "You do 2 things. We handle the rest." Grayed-out 5-step section removed entirely — replaced with single line: "Everything else is handled by Tractify — you'll get a text as each channel goes live." Sidebar badge tracks only the 2 required steps. Setup Help chat panel also scoped to 2 steps. AI branding removed throughout portal ("Assistant" → "Help") — AI is invisible infrastructure, not a feature.

Gap 2 closed: real-time booking alert fires to Jose the instant any homeowner books through any contractor site. Shows contractor, homeowner name + phone, channel, and job progress toward Stripe. 72-hour silence alert fires once when a contractor is live 72+ hours with zero bookings — tells Jose something is broken and gives investigation checklist. Both wired end-to-end: notifications.js → bookings.js → cron.js → db.js migration.

Gap 3 scratched: post-access automation not built. AI SMS drip handles channel setup. Self-filtering is the point.

Gap 4 irrelevant: burst spend model scrapped. New model is organic-first, ads as finishers. No economics risk.

Worker acquisitionSource fix confirmed already working: intake form sends it, Worker passes full payload through, deploy.js saves it. Nothing to fix.

**The funnel is ready. The only thing between now and running ads is Twilio compliance approval (external, waiting) and Stripe (August 4 with Daniel).**

**July 30, 2026 — Three critical gaps in the SMS drip identified. Must be closed before first Twilio number goes live.**
The drip as designed treats itself as a 7-step onboarding tool that ends when setup is done. Three things are missing that turn it into a permanent business interface:

(1) **Power message** — contractors coming through ads have zero idea the SMS thread can manage their calendar. They need to be told explicitly, early, with an invitation to try it immediately. "What's on my calendar tomorrow?" → real answer in 10 seconds → product becomes real. No portal UI creates that moment. Fire this after step 1 (availability) is confirmed.

(2) **Calendar blocking training** — if contractors don't know to text "block Wednesday 10am-2pm" for jobs they book outside Tractify (referrals, repeat customers, word of mouth), double bookings happen. Angry homeowner. Contractor blames Tractify. This message must arrive before the first job lands, not after the first conflict. It needs to feel obvious and natural, not like a feature explanation.

(3) **Post-appointment close tracking via SMS** — the planned revenue logging feature (did_close + closed_value on appointments) won't get used if it requires logging into the portal. The SMS version: cron fires 30-60 min after appointment time, texts contractor "how'd your 2pm go with [name]? Did the job close? Reply YES $amount or NO." They're already on their phone, just finished the job. 5-second reply. AI logs it. This feeds the monthly results report, job 3 milestone message, Stripe conversion anchor, and case studies. Also keeps the SMS channel active permanently after setup ends — the channel never goes quiet.

**Architectural shift:** drip goes from onboarding tool (7 steps, then silence) to permanent business interface (3 phases: activation → orientation → ongoing loop). A contractor texting Tractify daily never cancels. Leaving means losing the business assistant in their texts. That retention story is completely different from "losing a booking website."

*[Add entries here every time something is tested, a result comes in, a decision is made, or a pattern is spotted. Format: Date — what was tested — what happened — what changed as a result.]*

**July 30, 2026 — Job acquisition framework locked. The make-or-break strategic question answered.**

The single thing that determines whether Tractify wins or loses is whether the machine delivers 5 jobs in 7-10 days for each trial contractor. Everything else is infrastructure for that moment. This entry is the complete framework for making that happen reliably and cheaply.

**The core insight:** Homeowners need HVAC service every single day regardless of what Tractify does. Right now in Seattle someone's AC is broken. They will hire someone today. The question is never "how do we create demand" — demand exists. The question is: can Tractify put the right contractor in front of that homeowner at the exact moment they're ready to hire, faster and more frictionlessly than any alternative?

**The intent ladder — rank every channel against this before spending a dollar:**

Level 1 — Emergency/immediate need: AC broke right now, no heat. Will hire the first person who responds. Conversion near 100% if responded to in under 5 minutes.

Level 2 — Active search: Typing "AC repair near me" into Google right now. Ready to hire within hours.

Level 3 — Passive consideration: Thinking about a tune-up, saw an ad, not urgent but willing to book.

Level 4 — Unaware: Has no idea they need HVAC work yet. Seasonal campaigns and retargeting live here.

Strategy: exhaust levels 1 and 2 completely before spending a dollar on 3 and 4. Most ad spend mistakes come from going to 3 and 4 before 1 and 2 are saturated.

**Channel rankings — by probability of producing a booking in 7 days:**

1. **Missed call text-back (Level 1 — highest ROI channel that exists).** Homeowner already called. Highest intent possible. 0 cost per conversion after Twilio setup. A contractor missing 8-10 calls/week has 8-10 Level 1 leads going to competitors every week. 30% conversion through text-back = 2-3 bookings per week at zero ad spend. Key variable: does this contractor miss calls? If answer is 0-1 per week, this channel is weak. If answer is "constantly," this alone could deliver all 5 jobs. Ask on intake form: "How many calls do you miss per week?"

2. **GBP booking button (Level 2 — highest-intent free traffic).** Someone searching "HVAC near me" and clicking on the listing is ready to hire. Adding the booking button converts existing organic search traffic that's already there. A contractor with 80 reviews and 4.8 stars in a suburban market gets meaningful GBP traffic every day. Day-one activation, not week-two. Zero cost. Could produce 1-2 bookings before any paid channel runs.

3. **Past Google reviewer outreach (Level 2 — warmest possible re-engagement).** Contractor's past customers who left 5-star reviews. Pre-written message sent directly through Google. These people already trust the contractor, already paid them, already had a good enough experience to leave public endorsement. A contractor with 60 reviews has 60 warm leads. 5-10% response rate = 3-6 potential bookings at zero cost. Can fire before ads are even submitted for approval. Message: "Hey [name] — thanks again for the kind review. We now have online booking if you ever need service again or know anyone who does: [link]." Bookings possible in 24-48 hours.

4. **Facebook Lead Ads targeting local homeowners (Level 2-3 — fastest paid channel).** Pre-filled form inside Facebook, two taps to submit, Tractify texts booking link in 60 seconds. No landing page. 3-5x higher conversion than click-to-website ads. The creative that converts best: pull the contractor's actual Google review text directly into the ad copy. "★★★★★ 'Fixed our AC same day, price was fair, showed up on time.' — Sarah M., Bellevue | Book [Contractor Name] in 60 seconds." Real reviewer's words in the ad. Free to produce. Outperforms any copywritten creative. Missed call angle also works: "HVAC contractors miss calls constantly — they're on rooftops, under houses. [Contractor Name] now has online booking so you don't have to play phone tag." Reframes the contractor's weakness as a feature.

5. **Google Search Ads (Level 2 — highest-intent paid traffic, slower to warm).** Someone typing "AC repair Bellevue" has maximum buying intent. Click goes to Tractify site, inline booking, appointment confirmed in 60 seconds. Tractify's conversion advantage over every competitor: their ad sends homeowners to a phone number or contact form → wait for callback. Tractify's ad sends them to a live calendar where they book a confirmed appointment immediately. The conversion rate difference is massive. Downside: 1-2 days to approve, Smart Bidding takes 14 days and 30 conversions to optimize. Don't judge Google performance before day 14. Exact match and phrase match only — never broad match (burns budget on DIY/how-to/parts/training traffic). Negative keywords on day 1: DIY, how to, parts, school, training, salary, jobs, careers, YouTube. High-intent keywords: "AC repair [city]", "HVAC near me", "furnace not working [city]", "[brand] AC repair" (brand-specific = they have the unit and need it fixed).

6. **Nextdoor (Level 2-3 — neighbor trust context).** Homeowners on Nextdoor are actively posting "anyone know a good AC guy?" CPCs $0.50-2.00 vs $5-15 on Google. Conversion rate higher because trust context is already established (neighbor recommendation). Best as a support channel during trials, not primary driver — conversion timeline less predictable for 7-day delivery windows. Gets more powerful as more contractors accumulate reviews from the same neighborhoods.

**The 7-day sequence that delivers 5 jobs:**

Day 1 (before any ad is live):
- Twilio number assigned, call forwarding set up → missed call text-back live immediately
- GBP booking button added → free search traffic converting from minute one
- Reviewer outreach messages sent → 2-3 potential warm bookings in 24 hours
- Facebook Lead Ad submitted for approval (24-48 hours)
- Google Search campaign submitted for approval (1-2 days)

Day 2-3 (ads approve):
- Facebook Lead Ad running at $20/day, Google Search at $15/day
- Missed calls being caught and converted automatically
- GBP organic producing

Day 3-5 (bookings accumulate):
- Qualified contractor (50+ reviews, active market) should have 2-3 from organic by now
- Paid channels adding 1-2 more
- At job 3: milestone email fires to contractor with their own numbers
- At job 5: Stripe payment page fires

Total spend to deliver 5 jobs on a qualified contractor: $200-400. Setup fee is $2,000. That's 5-10x return before the retainer even starts.

**The qualification filter — the single biggest lever in the entire business:**

The difference between a $300 trial and a $1,500 trial isn't the ad creative or the budget. It's who was deployed. The 3-minute pre-qualification check before any contractor goes live:
- 50+ Google reviews ✓
- 4.5+ star rating ✓
- GBP listing showing up in top 3 for "HVAC [city]" ✓
- Active call volume (5+ missed calls per week) ✓
- 5+ years in business ✓

A contractor who passes all five has existing demand the current system is failing to capture. Tractify is the capture mechanism. The demand already exists — you're routing it, not creating it.

A contractor who fails most of these: jobs take 3-4 weeks, ad spend to deliver 5 jobs is $1,500+, unit economics break down. The intake form must surface these signals. The brain must refuse to authorize real ad spend behind a contractor who doesn't pass the filter.

**The 72-hour organic test before committing ad budget:**

Don't open at $150/day. Let organic channels run for 72 hours first.
- 2-3 jobs by Day 3 from organic → small burst ($50/day) to close the remaining 2
- 1 job by Day 3 → add $100/day, tighten targeting
- 0 jobs by Day 3 → contractor profile is the problem, not the ads. Diagnose before spending more. The 72-hour silence alert built in session 14 is the early warning system for exactly this.

The organic channels are the qualification test. If GBP + missed call text-back + reviewer outreach don't produce 1 booking in 72 hours, ads will struggle too — the fundamental problem is insufficient market presence. Ads can amplify demand, they cannot create it where none exists.

**The failure mode that kills this:**

Running real ad spend ($150+/day) into an unqualified contractor before the organic channels have signaled. You can spend $2,000 and deliver zero jobs on a contractor with 8 reviews in a weak market. That's not a product failure — it's a deployment failure. The qualification filter and the 72-hour organic test are the protection mechanisms. Use them without exception.

**The creative formula that actually converts:**

Don't write ad copy from scratch. Pull the contractor's actual Google review text into the ad. "★★★★★ 'Best HVAC in [City] — showed up same day, AC fixed in an hour.' — Sarah M." This is free to produce, impossible to fake, and outperforms anything written by a copywriter. The reviewer might be the homeowner's neighbor. On Nextdoor this lands even harder for exactly that reason. Every contractor with 50+ reviews has dozens of ready-made ad creatives sitting in their Google listing.

**The compounding flywheel — why the first case study changes everything:**

The first case study is: real contractor, real jobs, real timeline, real revenue, real portal screenshot. "Premier Comfort HVAC — deployed Friday. First booking Saturday (missed call). 5 jobs by Tuesday. 4 closed, $6,800 in revenue. Total ad spend: $180." That case study becomes the highest-converting ad creative Tractify will ever run. Every contractor who sees it asks the same question: "why isn't this happening for me?" The machine feeds itself — each win makes the next win cheaper to acquire. That's the generational wealth version of this. Jobs delivered → case study → more contractors → more jobs → better case study → flywheel accelerates.

**The one-sentence summary for every decision in August:** Does this action deliver a booking to a contractor's calendar faster and cheaper? If yes, prioritize it. If no, cut it.

**July 30, 2026 — The 3-way SMS AI attack. The biggest architectural insight in the product so far.**

The contractor AI brain made Tractify's side of the relationship invisible. The homeowner AI brain makes the other side invisible too. When both exist simultaneously, the booking happens entirely on autopilot — while the contractor is on a roof and the homeowner is making lunch. Nobody did anything. The AI closed the job on both ends simultaneously.

**The three brains:**
- **Brain 1 (built):** Admin brain — Jose's command layer. Sees everything, takes action across the whole system, answers strategy questions with live data.
- **Brain 2 (built):** Contractor AI SMS — runs the contractor's business via text. Calendar, blocking, job outcomes, setup steps. No login needed. Habit-forming.
- **Brain 3 (✅ BUILT — session 16):** Homeowner AI SMS — books homeowners conversationally over text. No browser, no link, no form. A 4-message exchange that ends with a confirmed appointment and a door-to-door navigation link sent to the contractor.

**The full homeowner AI SMS conversation (what it looks like in production):**
```
Contractor misses a call while on a job.

Tractify → homeowner: "Hey! Sorry we missed you at Premier Comfort HVAC. 
I'm their scheduling assistant — what's the address that needs service?"

Homeowner: "1234 Maple Ave, Bellevue"

AI: "Got it. What's going on — heating, cooling, or something else?"

Homeowner: "AC isn't cooling the house"

AI: "Understood. Mike has openings Tue 10am, Tue 2pm, or Wed 9am. 
Which works best?"

Homeowner: "Tuesday 2pm"

AI: "You're booked. Mike will be at 1234 Maple Ave Tuesday at 2pm. 
You'll get a reminder morning of. Reply STOP to opt out."
```
Contractor gets an instant booking alert with address + door-to-door Maps link. Job is on the calendar. The contractor was on a rooftop the entire time. Zero human involvement on either side.

**Why this changes every channel's value:**
The missed call channel stops being a recovery mechanism ("we sent them a link") and becomes the most efficient booking channel in the system. Every channel that gives Tractify a phone number now becomes a full automated booking conversation instead of a link that may or may not get clicked:
- **Missed call** → homeowner AI books them in 4 messages
- **Van wrap / SMS keyword** → someone texts the truck's number → same homeowner AI flow
- **Facebook Lead Ads webhook** → Tractify has their phone immediately → homeowner AI texts them before they've left Facebook → booked
- **GBP click-to-call** → called, missed → homeowner AI picks it up → booked

Every single channel converges on the same outcome: a confirmed appointment with an address, booked entirely over SMS, with zero browser required.

**The new north star statement:**
Not just "contractor logs in once, everything after is a text message." The booking happens entirely automatically, on both sides, over text, while the contractor is on a roof and the homeowner is making lunch. The AI closes the deal on both ends simultaneously. Neither party did anything except have a conversation with what felt like a real person.

**This is a category of product that does not exist anywhere else in home services.** Every competitor, when a contractor misses a call, that lead dies. The homeowner calls the next guy. With Brain 3, every missed call is a fully automated booking conversation that closes in minutes. The contractor finds out when they get a notification.

**Technical build — what needs to be created:**

New table `homeowner_sms_sessions`:
```sql
id, phone, contractor_id,
state TEXT -- 'greeting' | 'awaiting_address' | 'awaiting_service' | 'awaiting_slot' | 'confirmed'
name TEXT, address TEXT, service_description TEXT,
offered_slots JSONB, -- the 3 slots shown, maps "Tuesday 2pm" to a real datetime
created_at, updated_at
```

New file `backend/services/homeownerSmsAI.js`:
- `handleHomeownerSms(phone, contractorId, incomingText, session)` — Claude Haiku
- Tools: `fetch_available_slots` (pulls live open slots for next 7 days), `book_appointment` (creates lead + appointment, fires contractor alert)
- Warm, human tone. Never reveals it's AI. Max 320 chars per message.
- System prompt knows: contractor name, company, niche (HVAC/plumbing/etc), service area

Routing update in `backend/routes/twilio.js` inbound-sms handler (after contractor detection):
1. Contractor phone? → contractor AI brain
2. Active homeowner session for this phone + contractor? → homeowner AI brain
3. No session but missed-call lead pending for this phone? → start homeowner session
4. Unknown number → generic: "[Business Name] — reply with your address and we'll get you scheduled."

Missed call webhook update (`/api/twilio/missed-call`):
- Instead of immediately texting a booking link → start a homeowner SMS session, state = 'greeting'
- First text: "Hey! Sorry we missed you at [Business Name]. I'm their scheduling assistant — what's the address that needs service?"
- Create `homeowner_sms_sessions` row with `contractor_id`, `phone`, `state = 'awaiting_address'`

Facebook Lead Ads webhook update (`/api/leads/facebook`):
- Already has name + phone + email from Facebook
- Instead of just sending booking link → start homeowner session with name pre-populated, state = 'awaiting_address'
- First text: "Hey [name]! We got your request. What's the address that needs service?"

Address capture for form-based channels (immediate build, separate from AI flow):
- Add `address TEXT` to leads table (migration in db.js)
- Add address field to HVAC template lead form (required)
- Add address field to Facebook Lead Ads form
- Add address field to DirectBooking.jsx
- Show address in booking alert email to contractor + in SMS booking notification
- Show address in contractor portal appointment view
- Maps deep link upgrade: `maps.apple.com/?daddr=ADDRESS+CITY+STATE` (door-to-door navigation, not ZIP-level)

**The data that Brain 3 generates — why it compounds:**
Every homeowner conversation that Brain 3 has gets logged. Over time, Tractify knows:
- Which opening message gets the highest response rate
- Which service questions convert best
- How many messages it takes to close a booking on average per channel
- Which time slots get picked most (helps with availability optimization suggestions to contractors)
- Homeowner phone numbers that have booked before → recognized and greeted differently on re-contact

This is homeowner behavioral data no competitor has because no competitor is running conversations with homeowners at this level. It feeds back into the admin brain and makes every future homeowner interaction smarter.

**Build order: ✅ ALL COMPLETE (session 16)**
1. ✅ Address field — form + DB + contractor notifications
2. ✅ `homeowner_sms_sessions` table + `homeownerSmsAI.js` base
3. ✅ Missed call webhook starts homeowner session instead of sending link
4. ✅ Facebook Lead Ads webhook starts homeowner session
5. ✅ Inbound-sms routing detects and routes homeowner conversations
6. ✅ Bug fix: twilio.js inbound-sms SELECT now includes sms_power_message_sent + sms_calendar_training_sent

**July 30, 2026 — Ad strategy reframe. The single point of failure gets its answer.**

The single point of failure for Tractify has always been the same question: can we actually deliver jobs? Not deploy sites, not build channels, not automate setup — actually get booked appointments onto a contractor's calendar fast enough to matter. Everything in the business lives or dies on this.

Brain 3 (homeowner AI SMS) directly attacks this in the simplest and most aggressive way possible. And it changes the ad strategy completely.

**The old ad goal:** Get a homeowner to click a link → land on a page → fill out a form → navigate a calendar → book a slot. Five steps, drop-off at every single one. The creative had to carry the full weight of converting someone all the way through. Expensive, fragile, hard to scale.

**The new ad goal:** Get a phone number or a call. That's it. One step. Brain 3 handles everything after.

- Facebook Lead Ad → two pre-filled fields, they tap submit → Brain 3 texts them immediately, books them in 4 messages
- Google Call-Only ad → they tap, call rings, contractor misses it → Brain 3 catches it, books them in 4 messages  
- Nextdoor ad → they call or text → Brain 3 catches it, books them
- Van wrap, business card, fridge magnet → they text the number → Brain 3 books them

The ad's only job is to get them to raise their hand. Brain 3 converts. Which means:
- Ad creative gets simpler (just get the number or call, nothing else)
- Targeting gets broader (don't need someone ready to navigate a booking calendar, just someone who needs HVAC)
- Cost per lead goes down (removed all friction from the conversion path)
- Cost per booked job drops dramatically

**The call-only ad insight — the contractor's biggest weakness becomes the trigger:**

Call-Only ads on Google have always had a reputation for bad ROI in home services because contractors miss calls constantly — on rooftops, under houses, can't answer. The ROI looks bad when half the calls go to voicemail. Every competitor treats missed calls as a weakness to minimize.

Tractify flips it. A missed call is now the best possible outcome. Brain 3 catches every single one and opens a booking conversation in seconds. You can run Call-Only ads knowing the contractor will miss most calls and still have the best conversion rate of any channel — because the miss is the trigger, not the failure.

This is not a workaround. It's a structural competitive advantage built on the fact that contractors miss calls. The more calls they miss, the more Brain 3 works. You're not fighting that reality. You're weaponizing it.

**What this does to job delivery math:**

A contractor missing 10 calls per week (normal for an active HVAC contractor) is now 10 homeowner AI conversations happening automatically. At 30% close rate: 3 extra booked jobs per week from a channel that was previously dead. That's on top of everything else — GBP, Nextdoor, Facebook, reviewer outreach.

At 20 contractors, Brain 3 is having 200 homeowner conversations per week. 60 bookings. Zero human involvement from Tractify. The jobs compound automatically as contractors get busier and miss more calls.

**The simplest description of what Tractify does now:**

Jose finds homeowners who need the service. Gets their phone number or gets them to call. Brain 3 books them. Contractor shows up. Every part of that sentence is as simple as it sounds. The sophistication is invisible.

**The lead channel priority with Brain 3 active:**

1. Call-Only Google ads → contractor misses → Brain 3 books (highest intent: actively searching, ready to hire right now)
2. Facebook Lead Ads → pre-filled form, they submit → Brain 3 books immediately (frictionless, catches them while still in buying mode)
3. Missed calls from any source → Brain 3 books (zero additional ad spend, pure conversion improvement)
4. SMS keyword / van wrap → they text → Brain 3 books (long-tail, compounds forever)

Every single one of these channels converges on the same outcome: homeowner AI has a 4-message conversation, job is on the calendar, contractor gets a notification with the address and a Maps link. The channel complexity is Tractify's problem, not the contractor's and not the homeowner's.

**Why none of this gets lost:**

The 3-way SMS AI attack answers the make-or-break question (can we deliver jobs?) with something so simple it's almost offensive: get their number, let Brain 3 talk to them. That's it. Every session from here forward starts with that as the baseline assumption — not "how do we get homeowners to a booking page" but "how do we get their number so Brain 3 can close them." The ad strategy, the channel strategy, and the job delivery strategy all collapse into one thing.

**July 30, 2026 — Zero ongoing cost physical channels locked. The long-tail compounding play.**

Two physical channel ideas identified that feed Brain 3 with zero ongoing cost after setup. Both exploit the same insight: a physical object that someone touches and keeps is a permanent booking channel in their home, not a one-time ad impression.

**Channel A — Fridge magnet (left at every completed job):**
After every appointment is marked complete, the contractor leaves a fridge magnet at the home. Magnet has the business name, the Twilio number, and one line: "Text us anytime to book service." Six months later the homeowner's AC breaks, they look up, see the magnet, text the number. Brain 3 picks up instantly — "Hey! This is [Business]. Happy to help — what's the address that needs service?" — and closes the booking in 4 messages. The magnet cost pennies. The Twilio message costs cents. The job is worth $1,200+.

The compounding math: every completed job seeds a permanent passive booking channel in that home. Month 1: 50 jobs = 50 magnets. Month 12: thousands of magnets across the service area generating random inbound bookings with zero incremental cost. This is a channel that gets more powerful automatically just by the business running — no maintenance, no renewal, no algorithm.

**Channel B — Scratch ticket mailer to homeowners in service zip codes:**
Same mechanic as the contractor scratch ticket play but targeting homeowners directly. Mail to top 150-200 homeowner addresses in the contractor's service zips (pulled from public records or data sources). Scratch to reveal: "Free HVAC diagnostic — text [number] to claim." Underneath is the contractor's Brain 3 Twilio number. Physical scratch mechanic guarantees they interact with it before discarding — engagement rate dramatically higher than any digital ad. A homeowner who scratches and texts is warm. Brain 3 is waiting.

Cost: $0.50-1.50 per scratch ticket + $0.60 envelope + stamp = $2-3 total per homeowner. 150 mailers = $300-450 total. One job from that batch = $1,200 revenue. Break-even is under 1% response rate.

**Why both of these matter strategically:**
Every other channel Tractify runs has ongoing cost — ad spend per day, content creation time, Twilio per-message. These two channels have a one-time cost and then compound forever. The fridge magnet especially — it's a self-replicating network of physical booking triggers that expands automatically with every job delivered. No competitor is building this. They're all optimizing their Facebook CPMs while Tractify is quietly installing a permanent booking infrastructure in thousands of homes.

**Build needed:** Add fridge magnet as a reminder/prompt in the post-appointment flow — after contractor marks appointment complete, portal shows: "Leave a magnet at this job. Every magnet is a future booking." Physical magnet design: simple, clean, business name + Twilio number + "Text to book anytime." Order in bulk at $0.10-0.20 each. Future automation: cron sends contractor a text after every completed job: "Great work today — did you leave a magnet at [address]?"

**July 31, 2026 — Scratch ticket play fully expanded. Two targets, same mechanic, completely different effect.**

The scratch ticket was originally conceived for contractor acquisition. The same mechanic applies to homeowner acquisition and is potentially more powerful because the market is orders of magnitude larger.

**Scratch ticket — contractor side (acquisition):**
Mail to top 100-150 HVAC contractors in the service area. Scratch to reveal: "You won: 5 Free Booked Jobs." QR code underneath → intake.tractifyhq.com?src=scratch_mail. $2-3 per mailer total. One relationship with one converting contractor = $2,000 setup fee + ongoing per-job billing. Break-even on the mailer is a fraction of one conversion. The scratch mechanic guarantees physical interaction — they can't ignore it the way they ignore a postcard. Tag: ?src=scratch_mail.

**Scratch ticket — homeowner side (job delivery):**
Mail to 150-200 homeowner addresses in the contractor's service zips. Scratch to reveal: "Free HVAC diagnostic — text [Twilio number] to claim." Underneath is the contractor's Brain 3 number. Homeowner scratches, texts, Brain 3 opens a diagnostic conversation. Cost: $2-3 per mailer. 150 mailers = $300-450. One job from that batch = $1,200+ revenue. Break-even is under 1% response rate. The scratch interaction creates physical engagement that any digital ad can't replicate — they've already committed a physical action before they text.

**The two-touch combination for contractors:**
Scratch ticket arrives Tuesday. Jose DMs them Thursday: "Did you get the scratch card? The 5 free jobs offer is real." DM is now warm — they've already held something physical from Tractify. Response rate jumps from ~2% cold to 15-20% warm. Tag: ?src=scratch_dm_followup.

**July 31, 2026 — "Diagnose by text" — the biggest channel discovery in Tractify's history. A category that doesn't exist yet.**

This is not a booking channel. This is a category-defining product hidden inside a booking business.

**The concept:**
Instead of "text to book," the offer is "text us what your AC is doing and our AI will tell you what's actually wrong — for free." Brain 3, powered by Claude, gives a real HVAC diagnosis via SMS. Grinding noise = fan motor bearings. Squealing = belt or bearings. Hissing = refrigerant leak. Running constantly = low refrigerant, dirty filter, undersized unit. Banging = loose blower wheel. Real answers, not runaround. Then naturally: "That sounds like it needs a tech — want us to come take a look?" Brain 3 books them.

**Why this is a completely different category:**
Every competitor's CTA is "call us" or "book an appointment." That's a sales ask. "Find out what's wrong with your AC for free" is a help offer. Completely different psychological trigger. The homeowner isn't being sold to — they're getting help. Trust is established before the booking conversation starts. By the time Brain 3 says "sounds like you need service," the homeowner already trusts it completely. The diagnostic IS the close. Close rate on these bookings will be dramatically higher than any cold channel.

**The ad creative:**
"AC making a grinding noise? Squealing? Running constantly but not cooling? Text us — our AI will tell you what's actually wrong. Free." This stops the scroll because it solves a problem someone has RIGHT NOW. Not a future problem. Not a vague offer. Their specific AC symptom, answered immediately.

**The timing advantage:**
HVAC breaks at the worst moments — 10pm Saturday, middle of a heat wave, holidays. Nobody's answering phones. Brain 3 is there 24/7, immediately helpful, genuinely useful. The emotional moment when something actually helps you at 11pm on a hot Saturday creates loyalty no ad can manufacture. That homeowner tells their neighbors.

**The word of mouth mechanic:**
"I texted this number and it told me exactly what was wrong with my AC" is a story people tell. It's remarkable. Remarkable things spread without ad spend. One satisfied diagnosis = multiple neighbor referrals. The viral coefficient is built into the product experience.

**The self-selection magic:**
People who text because their AC is making a noise have a broken AC. They are not browsing. They are not curious. They have an urgent problem. Every lead is pre-qualified by the act of texting. There is no better lead quality than "person who already knows they have a problem and is actively seeking help right now."

**The expansion is the endgame:**
Same mechanic works for every home services niche identically. Pipe dripping? Electrical panel buzzing? Roof showing dark spots? Water heater making noise? Brain 3 diagnoses all of it. Tractify is not building an HVAC booking tool — it's building the diagnostic AI for every home problem that exists. That is a category no competitor has touched and cannot replicate without the same AI infrastructure.

**Ad strategy with this offer:**
Run Facebook/Instagram ads targeting homeowners with specific symptom creative — not generic "HVAC service" ads. "Is your AC making this sound?" with a short audio clip or description. People who recognize their exact symptom engage immediately. The creative relevance score goes up, CPM goes down, cost per lead drops. The diagnostic offer outperforms every booking CTA tested in this space because it's genuinely useful content, not an ad.

**What Brain 3 needs for diagnostic mode:**
The system prompt needs HVAC diagnostic knowledge baked in — common symptoms, likely causes, urgency level, honest "you might not need service" answers when appropriate. Honesty when service isn't needed builds MORE trust than always saying "come in" — it establishes Brain 3 as a trusted advisor, not a sales bot. The contractor who tells a homeowner "actually your filter is just dirty, change it first" gets called back for every real problem forever.

**The category-defining statement:**
Tractify is not a booking platform. Tractify is the AI that diagnoses your home and connects you with a trusted contractor when you actually need one. That positioning beats every competitor in home services because it comes from a place of genuine help, not a sales funnel.

**July 31, 2026 — The complete homeowner acquisition strategy locked. All pieces in the brain.**

Everything from this session is now the operating playbook. The decisions that are locked:

(1) **Two-audience, two-offer model.** Contractor-facing: "5 free booked jobs." Homeowner-facing: "Diagnose by text, free." These never mix. The contractor offer is about business outcomes. The homeowner offer is about help. Brain 3 is the conversion engine behind both — contractors text to manage their calendar, homeowners text to diagnose their home. Same SMS infrastructure, completely different offer and framing per audience.

(2) **Diagnostic ad is the primary homeowner creative from this point forward.** Not "book now." Not "licensed and insured." Symptom-specific creative that triggers zero sales resistance. "Is your AC making a grinding noise? Text us — our AI will tell you what's actually wrong. Free." The diagnostic ad will outperform every previous homeowner creative on click rate, conversion rate, and word of mouth. It is also the only ad concept that naturally scales to every niche with a two-word swap. This is the brand.

(3) **Proven creative compounds across zip codes — never start from zero.** Test symptom A vs symptom B in the first zip code. Find the winner. Every new contractor deployment runs the winning creative on day one. By contractor 20 you have tested creative across multiple markets. By contractor 50 you have enough data to know which symptoms convert best by season, by demographic, by niche. The creative database is worth real money — a competitor starting from scratch in a new zip code is guessing. Tractify is deploying proven.

(4) **Google Call-Only ads + Brain 3 is the closed loop.** This combination is the most underpriced homeowner acquisition channel available because everyone else's Call-Only campaigns are penalized by missed-call drop-off. Tractify's missed calls are the trigger, not the failure. Every Call-Only click becomes a Brain 3 conversation. Run at $5-10/day per contractor alongside RSA campaigns. Tag: `google_call`.

(5) **Physical channels compound forever.** Fridge magnet at every completed job = permanent passive booking channel in that home. Scratch ticket mailer works for both contractor acquisition (5 free jobs on the contractor side) and homeowner job delivery (free diagnostic on the homeowner side). These don't require budget renewal, algorithm updates, or creative refreshes. They just work for years.

(6) **The brand position is the endgame.** Homeowners across America think of Tractify as "the number you text when something in your house is broken." ServiceTitan owns contractor software. Tractify owns homeowner trust. Homeowner trust is the demand side of the entire market. That's the moat no one can buy their way into — it's built one honest diagnostic conversation at a time.

**July 31, 2026 — RAG diagnostic knowledge system built and deployed. Brain 3 audit fully closed.**

RAG system is live in production. Full stack: pgvector + Voyage AI voyage-3-lite (512 dims) + `diagnostic_knowledge` table + `embeddings.js` + `diagnosticKnowledge.js` + `loadDiagnosticKnowledge.js`. Five niches seeded: HVAC (~28 chunks covering AC cooling, furnace heating, heat pumps, mini-splits, oil tanks, boilers, air quality, ductwork, thermostats, 4 safety overrides), Roofing (~9 chunks), Electrical (~10 chunks), Plumbing (~11 chunks), Landscaping (~12 chunks). Total: ~70 knowledge chunks covering every common homeowner symptom across all primary niches. Brain 3 now retrieves the 3-5 most semantically relevant chunks per homeowner message — never the whole encyclopedia, just what's relevant. Cost per homeowner conversation: fractions of a penny (Voyage AI). Safety-flagged chunks (gas smell, CO alarm, smoke, no heat in extreme cold) always surface first regardless of similarity score.

Three Brain 3 logic gaps also closed this session (completing the 5-gap audit from session 17):
1. **getLastConfirmedBooking + awaiting_email** — homeowners who book but never reply with their email are now recognized as returning on next contact (state='awaiting_email' added to the IN clause).
2. **Double-booking race condition** — 23505 unique_violation caught in handleSlotPick. Instead of generic error, re-fetches fresh slots and re-offers with "That slot just got taken — here are the next available times."
3. **facebook.js returning homeowner greeting** — now uses `isReturning` flag from `startHomeownerSession`. Returning homeowners get "Great to hear from you again" instead of being asked for their address again.

**Key implementation note:** CLAUDE.md previously spec'd OpenAI text-embedding-3-small (1536 dims) and `OPENAI_API_KEY`. The actual implementation uses Voyage AI voyage-3-lite (512 dims) and `VOYAGE_API_KEY`. These are different. Do not use OpenAI for embeddings. The DB column is `VECTOR(512)` not `VECTOR(1536)`. If a new Claude session tries to build anything related to embeddings, it must use Voyage AI and `VOYAGE_API_KEY`.

*[Add entries here every time something is tested, a result comes in, a decision is made, or a pattern is spotted. Format: Date — what was tested — what happened — what changed as a result.]*

---

## Case Studies — Auto-Generated from System Data (No Chasing Contractors)

Case studies don't require filming, chasing contractors, or getting anyone on camera. The system already logs everything. The data IS the proof.

**How it works:**
- System logs every booking with a timestamp, contractor, and (when source tracking is added) which channel drove it
- When a contractor gets their 5 jobs, pull the data: "Day 1 live. Day 2: first booking. Day 4: all 5 done."
- Screenshot of their portal showing 5 confirmed appointments with dates = the ad
- No contractor involvement, no filming, no chasing

**With revenue logging added (see Planned Features below):**
"Week 1: 5 jobs booked, 4 closed, $7,200 in revenue generated." That's the Facebook ad copy. Automatically true because the system tracked it.

**The case study format for ads:**
- Contractor name + city
- Day they went live
- Number of jobs and timeline ("5 jobs in 4 days")
- Revenue generated (once revenue logging is built)
- Channel breakdown (once source tracking is built: "2 from Google Business Profile, 2 from paid ads, 1 missed call recovered")
- Screenshot of the portal as visual proof

**Why this is powerful:** No competitor is showing this level of transparency. Real numbers, real timestamps, real contractor. The screenshot of the actual portal makes it impossible to fake and instantly credible.

---

## Diagnostic Knowledge Architecture — Brain 3 Intelligence Layer (July 31, 2026)

*Decision locked: build RAG (pgvector) from day one. Reasoning and full technical spec below. The admin brain reads this on every query related to Brain 3 capability, niche expansion, or diagnostic quality.*

---

### Why This Matters

The diagnostic ad is the entire homeowner acquisition strategy. "Is your AC making a grinding noise? Text us — our AI will tell you what's actually wrong. Free." That ad only works if Brain 3 actually gives a real, trustworthy answer. A vague or wrong diagnosis destroys the trust the ad was built on, kills the booking, and generates negative word of mouth instead of positive.

Brain 3 runs on Claude Haiku. Haiku is smart but it needs structured domain knowledge in its context to give expert-level diagnostic answers — not just general AI reasoning. The Diagnostic Knowledge Architecture is how that expert knowledge gets into Brain 3's context for every homeowner conversation.

---

### Why RAG (pgvector) and Not Simple Knowledge Files

**Option A — Niche knowledge files per contractor:**
Each niche gets a JS/JSON file (hvac.js, roofing.js, etc.). Brain 3 loads the whole file for the contractor's niche on every message. Simple, fast to build, works for single-niche contractors.

Limitations:
- The entire niche knowledge file loads on every message — expensive at scale and eventually hits context limits as knowledge deepens
- Cross-niche queries fail (homeowner texts an HVAC contractor about a plumbing smell)
- Adding deep niche knowledge (oil tanks, boilers, geothermal, mini-splits) makes files huge
- No semantic matching — Brain 3 gets ALL the knowledge whether relevant or not
- Updating knowledge = editing code files = deployment required

**Option B — pgvector RAG (chosen architecture):**
Knowledge stored as chunks in PostgreSQL with vector embeddings. On each homeowner message, embed the message, retrieve only the 3-5 most semantically relevant knowledge chunks, inject only those into Brain 3's context. The rest stays in the DB untouched.

Why this wins:
- **Only relevant knowledge loads per message** — Brain 3 gets "banging noise on startup" knowledge, not the entire HVAC encyclopedia
- **Scales to any niche with zero code changes** — adding roofing = inserting rows. Adding electrical = inserting rows. No new files, no deployments, no code
- **Knowledge updates without deployment** — fix a wrong diagnosis by updating a DB row
- **Cross-niche capability** — a homeowner can text about AC and a burning smell (could be electrical) and Brain 3 retrieves knowledge from both niches simultaneously
- **The knowledge compounds as data grows** — every new symptom added is searchable immediately
- **Speed to new verticals is a database INSERT, not a code change** — this is the key business unlock. Month 2: roofing contractor signs up. Roofing knowledge is already in the DB. Brain 3 is already a roofing expert. Zero build time per new niche after initial setup.
- **The data moat** — every homeowner conversation that Brain 3 has teaches you which knowledge chunks are most retrieved, which symptoms are most common per region and season. That data refines the knowledge base automatically over time and is uncopiable.

**Why build B from day one instead of starting with A:**
Speed kills in business — but the right kind of speed. Building A now means rebuilding into B in 6 weeks when scale demands it, while mid-expansion. Building B now costs one extra session (3-4 hours) and means every niche from month 2 onward is a database operation, not a development cycle. The compounding advantage of having the right foundation starts on day one of the first HVAC deployment. Every homeowner conversation from that point forward is building the data moat. Starting with A delays that by weeks and creates technical debt at the worst possible time (when you're trying to scale fast across multiple verticals).

---

### Full Technical Specification

**Infrastructure (✅ ALL BUILT — session 18):**
- pgvector PostgreSQL extension — enabled via: `CREATE EXTENSION IF NOT EXISTS vector;`
- **Voyage AI voyage-3-lite** — for generating embeddings. ⚠️ NOT OpenAI. 512 dimensions. Anthropic-endorsed. Fractions of a penny per call. Railway env var: `VOYAGE_API_KEY`

**Table (live in production):**
```sql
CREATE TABLE IF NOT EXISTS diagnostic_knowledge (
  id SERIAL PRIMARY KEY,
  niche TEXT NOT NULL,              -- 'hvac', 'roofing', 'electrical', 'plumbing', 'oil_tank', etc.
  category TEXT,                    -- 'cooling', 'heating', 'safety', 'structural', etc.
  symptom_tags TEXT[],              -- ['grinding', 'noise', 'ac', 'startup'] — keyword backup search
  content TEXT NOT NULL,            -- the actual diagnostic knowledge chunk
  embedding VECTOR(512),            -- voyage-3-lite dimension (512, NOT 1536)
  urgency TEXT DEFAULT 'schedule',  -- 'immediate', 'this_week', 'schedule', 'diy_first', 'emergency_911'
  safety_flag BOOLEAN DEFAULT FALSE,-- true = this chunk involves safety risk
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON diagnostic_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Files (all built and live):**
- `backend/services/embeddings.js` — Voyage AI wrapper. `embed(text)` → 512-dim float vector. 4-retry exponential backoff on 429s (delays: 5s, 10s, 20s, 30s). `embedBatch(texts)` for bulk. Both exported. Uses `VOYAGE_API_KEY`. Model: `voyage-3-lite`.
- `backend/services/diagnosticKnowledge.js` — RAG retrieval service. `getRelevantKnowledge(messageText, nicheName, limit=5)` → embeds message → cosine similarity search (`ORDER BY embedding <=> $1::vector`) filtered by niche → safety-flagged chunks surfaced first → returns formatted string for prompt injection. Fails gracefully (returns `''` if Voyage is down or table is empty — Brain 3 still responds). Also exports: `storeKnowledgeChunk({niche, category, symptom_tags, content, urgency, safety_flag})`, `storeKnowledgeBatch(chunks)` (embeds one at a time with 500ms pause to avoid rate limits), `clearNicheKnowledge(nicheName)` (wipes all chunks for a niche before reloading).
- `backend/scripts/loadDiagnosticKnowledge.js` — one-time seeder. Run with `cd backend && node scripts/loadDiagnosticKnowledge.js` or `--niche=hvac` flag. Handles `DATABASE_PUBLIC_URL` swap for Railway local runs. Contains full knowledge arrays for: HVAC (AC cooling, furnace heating, heat pumps, mini-splits, oil tanks, boilers, air quality, ductwork, thermostats, safety — ~28 chunks), Roofing (~9 chunks), Electrical (~10 chunks), Plumbing (~11 chunks), Landscaping (~12 chunks). All niches loaded as of session 18.
- `backend/services/homeownerSmsAI.js` — calls `getRelevantKnowledge(incomingMessage, contractor.niche)` on every message and injects into Brain 3 system prompt.

**Niche normalization map in `diagnosticKnowledge.js`:**
```javascript
const NICHE_MAP = {
  'hvac': 'hvac', 'HVAC': 'hvac',
  'Roofing': 'roofing', 'roofing': 'roofing',
  'Electrical': 'electrical', 'electrical': 'electrical',
  'Plumbing': 'plumbing', 'plumbing': 'plumbing',
  'Landscaping': 'landscaping', 'landscaping': 'landscaping',
  'Painting': 'painting', 'painting': 'painting',
  'General Contracting': 'general', 'general contracting': 'general',
};
```
Adding a new niche: if the intake form uses a name not in this map, add one line here. Then insert knowledge rows via `storeKnowledgeBatch()`. That's the entire expansion procedure — zero other code changes.

**How to expand to a new niche (zero code required after adding to NICHE_MAP):**
1. Add the niche name string to `NICHE_MAP` in `diagnosticKnowledge.js` if needed
2. Write knowledge chunks (or have Claude Sonnet generate them) in the format used in `loadDiagnosticKnowledge.js`
3. Add a `const YOURNICHE_KNOWLEDGE = [...]` array to the load script and call `storeKnowledgeBatch(YOURNICHE_KNOWLEDGE)` at the bottom
4. Run: `cd backend && node scripts/loadDiagnosticKnowledge.js`
5. Done — Brain 3 is now an expert in that niche for any contractor with that niche_id

**To update existing niche knowledge (if a diagnosis was wrong):**
1. `clearNicheKnowledge('hvac')` — wipes all existing chunks for that niche
2. Update the knowledge array in the load script
3. Re-run the script
4. No deployment needed — just DB rows

**Safety overrides — hardcoded in base system prompt, never in RAG:**
```
SAFETY OVERRIDES — respond to these BEFORE anything else, before any diagnostic:
- Gas smell, rotten egg smell → "Stop everything. Leave your home now and call your gas company or 911. Do not text me — handle this first."
- Burning smell, electrical smell, smoke → "Turn your system off at the breaker right now. This is a fire risk. Once you're safe, text me back."
- Carbon monoxide detector going off → "Leave immediately. Call 911. Do not re-enter."
- No heat in extreme cold with elderly or infants → treat as urgent, offer same-day slot first before anything else
```

**Prompt injection pattern in homeownerSmsAI.js:**
```
RELEVANT DIAGNOSTIC KNOWLEDGE FOR THIS CONVERSATION:
[chunks injected from getRelevantKnowledge()]

Use the above knowledge to give a specific, honest answer. If the symptom doesn't clearly match any of the above, say so honestly — "that could be a few things, I'd want a tech to take a look" is better than guessing.
```

---

### Niche Expansion Timeline (enabled by this architecture)

| Month | Action | Build required |
|---|---|---|
| ✅ August | HVAC, Roofing, Electrical, Plumbing, Landscaping knowledge loaded | Built session 18 — `loadDiagnosticKnowledge.js` |
| Month 2-3 | Painting, general contracting knowledge (if needed) | DB inserts only, zero code |
| Month 6+ | Any new niche a contractor requests | DB inserts only, zero code |

All five primary niches are already seeded with comprehensive knowledge. Adding any new niche = write the knowledge chunks, run the load script, done.

---

### Build Time

- **Option A (niche files):** 1 session (~3-4 hours). Works. Wrong foundation.
- **Option B (pgvector RAG):** ✅ Built session 18. Right foundation. Every niche after the first costs hours, not a development cycle. Every homeowner conversation from day one builds the data moat.

**Decision: Build Option B. ✅ COMPLETE.**

---

## Planned Features (Build Order — Post First 3 Clients)

These are confirmed ideas from the July 21 brainstorm. Not building yet — get first clients first, then build in this order.

### 0. Three Channel Enhancements (Build Before/During First Contractors)

These are quick wins that strengthen job delivery for the first free trial contractors. Build alongside or just before first client activation, not after.

**A. Facebook Pixel + Retargeting on HVAC Template**
Add `fbPixelId: ""` to `buildClientConfig()` in `deploy.js`. Add pixel snippet to `hvac-template/index.html` — only fires when `fbPixelId` is non-empty. Jose sets the pixel ID per contractor when deploying. Run one retargeting campaign from Jose's Business Manager using URL-based custom audiences per contractor subdomain. Retargeting CPCs are 50-70% cheaper than cold traffic and convert 2-3x better.

**B. Messenger + Instagram DM Auto-Reply (Step 7 in Onboarding Checklist)**
No Tractify code needed. Jose/Daniel sets up the auto-reply in Meta Business Suite during the contractor's first week (5 min per contractor). Add Step 7 to the onboarding checklist UI in `ContractorPortal.jsx` with copy-paste reply text pre-filled with their booking link. Reply text: *"Thanks for reaching out to [Business Name]! Book a time here: [slug] — takes 60 seconds."*

**C. Missed Call Follow-Up Text (2 Hours, No Booking)**
After the initial missed call SMS fires, schedule a 2-hour delayed check. If the caller hasn't booked → send one follow-up text: *"Just checking in — still happy to help. Here's that booking link: [slug]"*. One follow-up only, never a third. Implementation: `setTimeout` or a lightweight queue in the Twilio webhook handler (`backend/routes/twilio.js`). Check `appointments` table for a booking tied to that caller phone + contractor within the 2-hour window before sending.

**D. Abandoned Booking Follow-Up**
When a homeowner submits the lead form on the HVAC template but doesn't pick a time from the slot picker, they're the hottest possible lead — they filled out the form, they just got interrupted. 1 hour after form submission with no corresponding appointment, Tractify auto-texts them: *"Hey, looks like you got pulled away — here's your booking link to grab a time whenever you're ready: [link]."* Implementation: cron job that checks `leads` table for entries created 1 hour ago with `status = 'new'` (no appointment yet) and fires a Twilio SMS. Log in `lead_events`.

**E. 12-Month Past Customer Re-Engagement**
Every completed job seeds an automatic booking 12 months later. On the anniversary of a completed appointment, Tractify auto-texts the homeowner: *"It's been a year since [Business Name] serviced your system — most units need an annual tune-up to stay efficient. Book yours here: [link]."* Pure automated recurring revenue that compounds as the customer base grows — month 1 you have nothing, month 13 the re-bookings start arriving with zero ad spend. Implementation: cron job running daily, checks `appointments` where `status = 'completed'` and `created_at` is ~365 days ago, fires Twilio SMS to the homeowner contact stored in the lead record.

**F. Post-Job Referral Text**
3 days after an appointment is marked complete, Tractify auto-texts the homeowner: *"Really glad we could help — if you know anyone who needs HVAC work, here's a link they can use to book directly: [link]."* No incentive needed — HVAC is one of the highest-referral service categories, people actively recommend their contractors. This makes that recommendation frictionless and automatic. Implementation: cron job or `setTimeout` triggered when appointment status flips to `completed`. Fires 3 days later via Twilio. Log in `lead_events`.

**G. Facebook Lead Ads → Tractify Webhook (Channel 9)**
New route `backend/routes/facebook.js`. Facebook fires a webhook when a homeowner submits a Lead Ad form. Flow: webhook received → call Graph API with `lead_id` to retrieve name/phone/email → create lead in Tractify → send homeowner SMS with booking link immediately. Requires: `FB_PAGE_ACCESS_TOKEN` Railway env var (a Page-level access token from Jose's Business Manager), Facebook webhook verification challenge handler (Facebook sends a GET with `hub.challenge` on setup — must echo it back). Jose sets up one Lead Ad campaign per contractor in his Business Manager targeting homeowners in their zip codes, pointing the lead webhook to `https://tractifyhq.com/api/leads/facebook`. 3-5x higher conversion than click-to-website ads — no landing page, form is pre-filled from Facebook account.

**H. SMS Keyword / Inbound SMS Handler (Channel 10)**
Add inbound SMS handling to `backend/routes/twilio.js`. When anyone texts the contractor's Twilio number (any message), Tractify looks up the contractor by Twilio number and auto-replies with their booking link: *"Book online with [Business Name]: tractifyhq.com/schedule/[slug] — takes 60 seconds."* In Twilio console, set the "A message comes in" webhook on the contractor's number to `https://tractifyhq.com/api/twilio/inbound-sms` (separate from the voice webhook at `/api/twilio/missed-call`). Powers every physical touchpoint — truck wrap, business cards, invoices, fridge magnets left at completed jobs, door hangers. The truck becomes a rolling lead generation machine. The fridge magnet becomes a permanent re-booking channel from every past customer's home forever.

### 1. Booking Source Tracking — ✅ BUILT (session 11)
Every booking is tagged with which ad channel drove it. The AI brain can now see conversion speed and volume per channel in real time.

**Source taxonomy:**
- `google_search` — Google Search ad (homeowner searched "AC repair near me")
- `bing_search` — Bing/Microsoft Search ad
- `facebook_ad` — Facebook/Instagram click-to-website ad
- `facebook_lead_ad` — Facebook Lead Ad (zero-friction, never left Facebook) — auto-set from `lead.source_site`
- `nextdoor_ad` — Nextdoor paid ad
- `nextdoor_organic` — Nextdoor organic post
- `facebook_group` — Facebook community group post
- `gbp` — Google Business Profile booking button
- `missed_call` — Twilio missed call text-back — auto-appended as `?src=missed_call` in the SMS link
- `sms_keyword` — Physical touchpoint inbound SMS (van wrap, business card, fridge magnet) — auto-appended as `?src=sms_keyword`
- `google_reviewer` — Past Google reviewer re-engaged
- `direct` — Direct booking (personal /schedule/:slug page with no ad source)
- `unknown` — Token-based booking with no source tracked

**How it flows end-to-end:**
1. Jose runs Google Search ad → homeowner clicks → lands on `contractor.tractifyhq.com?src=google_search`
2. HVAC template reads `?src=` from URL on page load → `_ibookSource = 'google_search'`
3. Homeowner books → `POST /api/bookings/book` with `booking_source: 'google_search'`
4. Backend saves to `appointments.booking_source` column
5. Query: `SELECT booking_source, COUNT(*), AVG(extract(epoch from (created_at - l.created_at))/3600) as avg_hours_to_book FROM appointments JOIN leads l ON ... GROUP BY booking_source ORDER BY avg_hours_to_book` → tells you exactly which channels convert fastest

**Files changed:**
- `backend/server.js` — startup migration adds `booking_source TEXT` column
- `backend/routes/bookings.js` — both `/book` and `/book-direct` accept + save `booking_source`. Token bookings fall back to `lead.source_site` if no explicit source passed.
- `backend/routes/twilio.js` — missed-call SMS link gets `?src=missed_call`, inbound SMS homeowner reply gets `?src=sms_keyword`
- `hvac-template/index.html` + `backend/templates/hvac-template.html` — both read `?src=` URL param into `_ibookSource`, pass it in the booking confirm POST body

### 2. Contractor Dashboard — Live Stats
The contractor portal homepage should show the machine running every time they log in. This is the primary churn-prevention tool — contractors who see their own numbers don't leave.

**Stats to show (big, front and center):**
- Jobs booked this month
- Revenue generated this month (requires Revenue Logging below)
- Missed calls recovered (Twilio fires → SMS sent → booking confirmed = recovered call)
- Close rate this month (closed / total completed)
- Total jobs all time
- Next upcoming appointment

**Why this kills churn:** Every time they open the portal they see "Revenue generated through Tractify this month: $6,400." Leaving means that number goes to zero. No other pitch needed.

### 3. Job Milestone Trigger — Automated Conversion (No Call Needed)
When job 3 is confirmed on the calendar, the contractor gets a portal notification + email automatically. The message is data-aware:

- **If they've logged revenue:** *"3 jobs in — you've already made $[their actual logged number] through Tractify. Here's what happens after job 5: [link]"*
- **If no revenue logged yet:** *"3 jobs on your calendar. At the average HVAC job value of $1,200, that's $3,600+ in potential new revenue. Here's what happens after job 5: [link]"*

The link shows a simple page inside the portal explaining continuation — what $2,000 setup covers, what $800/month includes, what happens to their site and Twilio number if they don't continue.

After job 5: *"Your 5 free jobs are done. Ready to keep this going?"* → One click to Stripe payment page. No call, no invoice, no back and forth. They pay, the system knows, everything keeps running.

**Why data-awareness matters:** Contractors who've logged their own revenue see THEIR number, not an estimate. That number hits differently because they put it in themselves. It also subtly rewards revenue logging behavior — the more accurate data they give, the more personalized and emotionally resonant the product becomes.

### 4. Revenue + Outcome Logging on Appointments
After an appointment is marked complete, the contractor gets a small inline prompt in the portal: "Did this job close? Yes / No" — if yes: "How much? $____"

**New columns on `appointments`:**
- `did_close INTEGER` (NULL = not yet logged, 0 = no, 1 = yes)
- `closed_value NUMERIC` (dollar amount, nullable)

**The "not logged" state matters:** Don't show $0 for un-logged appointments. Show "2 of 5 logged" and nudge them to fill in the rest. Accurate data requires the contractor to actually enter it.

**Why this compounds:**
- Retention: contractor sees their own revenue number every time they log in
- Case studies: system auto-generates "5 jobs, 4 closed, $7,200" from the logged data
- Tractify intelligence: you'll know which contractors close well (80%+) vs. which need coaching (30%). Route more leads to high-closers.
- Phase 2 price justification: "Tractify generated $X for you last month" is an inarguable anchor for raising the retainer

### 5. Automatic Review Request After Completed Appointments
After every appointment is marked complete, Tractify automatically texts the homeowner 3 hours later:
*"Hi [Name], thanks for choosing [Business Name] today — if everything went great, a quick Google review would mean the world to them: [direct review link]"*

The direct review link (not just the GBP URL — the link that opens the review box immediately) is stored on the contractor's profile. One tap, review box is open.

**The compound loop this creates:**
More reviews → higher Google rating → better placement in "HVAC near me" searches → more organic GBP traffic → more jobs through Channel 3 with zero ad spend → more Tractify value → more painful to leave. The review request feeds directly back into the channel system. It also shows in the contractor portal ("Reviews requested: 14") and monthly results report — Tractify silently building their reputation while they work.

**Implementation:** Store Google review link on contractor profile. Add cron trigger 3 hours after appointment status flips to "completed." Send SMS via Twilio.

### 6. Monthly Results Report (Auto-Generated)
At the end of each month, Tractify automatically emails each contractor a results summary:
- Jobs booked this month
- Missed calls recovered
- Reviews requested (and Google rating if trackable)
- Revenue generated (from outcome logging)
- Close rate
- Month-over-month comparison

Zero manual work. Fully automated. Runs on node-cron at end of month. Makes the value of Tractify visible every single month — the contractor gets proof delivered to their inbox whether they logged in or not. Pure retention tool.

### 7. Contractor Referral Program
Each paying contractor gets a unique referral link. When another contractor signs up through that link AND converts to a paying client (not just free trial), the referrer gets one month of retainer free.

- Reward is conversion-only — not free trial signups. Prevents gaming.
- Turns every happy client into a sales channel automatically.
- HVAC contractors talk to each other constantly. One happy client in a market can unlock the whole market.

### 8. Broadcast SMS + Seasonal Campaigns
*(See Idea 4 above for full details)*
Build after first 3 paying clients are stable. Requires A2P 10DLC registration through Twilio before any bulk sends.

### 9. Self-Serve Onboarding Checklist — ✅ BUILT (July 23, 2026)
⚠️ **Revisit and optimize before August 3rd** — checklist is functional and live but needs a polish pass before first real contractor sees it. Do this AFTER subdomain auto-deploy is complete.
The onboarding call was planned, then removed. The checklist replaced it entirely before the first client ever signed up.

**What was built:**
- First-login modal: appears the first time a contractor logs in, shows all 6 steps, "Start Setup →" button takes them to the Setup tab
- Persistent Setup tab in the sidebar with progress badge (e.g. "2/6") that disappears when all steps are done
- 6 expandable step cards with: description, platform-specific instructions, copy-paste text (booking link pre-filled), and "Mark as done" button
- 48hr nudge: if contractor started setup but hasn't completed all steps after 48hrs, cron job sends nudge email to contractor + Jose + Daniel
- localStorage flag prevents the modal from showing again after the first view (keyed by contractor ID)

**The 6 steps:**
1. Confirm your availability (portal calendar link)
2. Set up missed call forwarding (Twilio number shown when assigned, iPhone/Android instructions)
3. Add booking link to Google Business Profile (exact steps for business.google.com)
4. Post in a local Nextdoor neighborhood (pre-written post copy with booking link)
5. Post in a local Facebook community group (pre-written post copy)
6. Message your top Google reviewers (pre-written message template)

### 10. Subdomain Auto-Deploy — ✅ CONFIRMED LIVE (July 25, 2026)
**The final automation piece. The entire pipeline from ad click to contractor going live is fully hands-off and confirmed working in production.**

Form submission → Cloudflare Worker → `POST /api/deploy` on Tractify → auto-create contractor account + API key → inject CLIENT config into HVAC template → deploy to Cloudflare Pages via Wrangler CLI → register `{slug}.tractifyhq.com` subdomain → pre-populate availability from intake hours → send contractor welcome email (portal URL + temp password) → send Jose admin alert.

**Confirmed live:** `evergreenhomeheatingandenergy.tractifyhq.com` — first contractor site deployed end-to-end via automated pipeline (July 25, 2026).

**Files built:**
- `backend/services/cloudflare.js` — Cloudflare API wrapper. `deployToPages` uses **Wrangler CLI** (not raw Direct Upload API). `addPagesDomain` checks domain status first — skips re-registration if already active.
- `backend/routes/deploy.js` — main deploy endpoint (`POST /api/deploy`, auth via `DEPLOY_SECRET` Bearer header). Pages deploy step is **non-fatal** — contractor account and emails always complete even if deploy errors.
- `backend/templates/hvac-template.html` — HVAC template copy with `<!-- TRACTIFY_CONFIG_START/END -->` markers for config injection
- `backend/services/notifications.js` — added `sendContractorWelcomeEmail` + `sendDeployAlertToAdmin`
- `hvac-template/index.html` — added `<!-- TRACTIFY_CONFIG_START/END -->` markers around the `<script>` config block
- `hvac-template/intake-form.html` — added `hoursRaw` to Worker payload (wdOpen/wdClose/satOpen/satClose/sunOpen/sunClose)
- `NewWorkerScript-auto-deploy.js` — updated Worker that calls `/api/deploy` fire-and-forget after R2 save

**Wrangler CLI deployment (critical implementation detail):**
The raw Cloudflare Pages Direct Upload API was tried extensively but produced HTTP 500 on the deployed site regardless of gzip vs raw, manifest key format, or content-type. Root cause was never isolated — likely a per-part Content-Encoding issue with Node.js native FormData. Solution: install `wrangler` as a backend npm dependency and invoke it as a child process. Wrangler handles all upload internals (compression, hashing, multipart format) and is battle-tested. Wrangler is in `backend/package.json` dependencies. Binary path: `backend/node_modules/.bin/wrangler` → resolved in code as `path.join(__dirname, '../node_modules/.bin/wrangler')` from `backend/services/`.

**Default config values injected when intake form fields are empty:**
- `logoImg` — Tractify logo embedded as base64 data URL (no external URL needed, never breaks)
- `coverPhoto` — HVAC stock photo from Unsplash (`images.unsplash.com/photo-1621905252507-b35492cc74b4`)
- Both get replaced with contractor's real assets at conversion (add to Client Go-Live Checklist step)

**Railway env vars added (July 24):**
- `DEPLOY_SECRET` — shared secret between Tractify and the Worker
- `ADMIN_EMAIL` — `ayc98223@gmail.com` (admin alert emails)

**Cloudflare Worker secret added (July 24):**
- `TRACTIFY_DEPLOY_KEY` = same value as `DEPLOY_SECRET` (set via `wrangler secret put`)

**Slug generation:** business name → lowercase → strip non-alphanumeric → e.g. "Premier Comfort HVAC" → "premiercomforthvac" → live at `premiercomforthvac.tractifyhq.com`. Booking slug auto-set to same value → direct booking at `tractifyhq.com/schedule/{slug}`.

### 11. The Proactive Outreach Play
*(See Scaling Plan below for full details)*
Phase 3 only — after full onboarding automation + 5-10 paying clients. Find contractor, deploy subdomain automatically, spend on ads, call them with a real booked job. Close rate near 100%.

---

### Cold Calling (Retired July 18, 2026)
Cold calling served its purpose — it proved the pitch, sharpened the script, and identified the pain points contractors actually have. That foundation now lives in the content. The script still exists in `Tractify-Sales-Script.docx` for reference. The offer is the same — 5 free booked jobs, no strings. The delivery is different — content and ads at scale instead of 1:1 phone calls.

---

### Team Structure (August 2026)
- **Jose** — product, strategy, content creation, paid ads, building
- **Daniel** — co-founder and equal partner (50/50 ownership). Content creation, distribution, community engagement in contractor groups.
- Both heads down on content and ads all of August. This is the do-or-die month — generate revenue or go back to jobs. The product is real, the offer is real, the funnel is real. August is about getting it in front of as many contractors as possible.
- **North star for all decisions:** take Jose and Daniel out of the picture. Every system, every feature, every process should move toward full automation. If something requires one of them to do it manually at scale, it needs to eventually be automated or eliminated.

**The three-person company that scales to exit:** Tractify is intentionally built to run with three people permanently — Jose, Daniel, and AI. Jose handles product, strategy, and execution decisions. Daniel handles content and distribution. The AI layer handles everything that would normally require a customer success team, operations manager, analyst, and marketing coordinator. This isn't a temporary startup phase — it's the permanent structure. Most companies hire people to compensate for broken systems. Tractify builds the systems first so the people never become necessary.

**The long-term AI compounding play — why this becomes unstoppable:** The AI brain starts learning the moment the first contractor goes live. Month 1 it knows basic numbers. Month 6 it knows which markets convert fastest, which channels deliver jobs quickest, which contractor profiles predict Stripe conversions. Month 12 it's making recommendations backed by data from hundreds of deployments that no competitor can replicate. Every dollar of ad spend, every contractor acceleration decision, every channel investment — all backed by real pattern data that gets sharper automatically just by the business running. The AI is invisible to contractors but running everything on the backend. They don't know it's AI, don't need to know, don't care — they just see results. This is the opposite of every competitor who is slapping AI on their front end as a marketing gimmick. Tractify's AI is the infrastructure, not the pitch. That distinction is what makes this ahead of its time and what compounds into unicorn exit numbers.

**Company positioning — results only, hands off:** Tractify is a results-driven software company. The only thing Tractify does is hand contractors booked appointments. We are not a marketing consultant, not a website company, not a customer success team. We do not get involved in questions about how to grow their business, how to get more homeowners, or how to use their tools. The product delivers results or it doesn't — that's the entire relationship. This is a power position, not a limitation. It's what allows Tractify to scale without getting tied down by individual clients.

**Every inbound contractor question is a bug report, not a support ticket.** If a contractor is reaching out to ask something, it means the product or portal failed to answer it first. The fix is always the product, never a conversation. The onboarding checklist and portal help section must be airtight enough that a contractor can set up every channel, understand what's happening, and know what to expect — without ever contacting Jose or Daniel. A contractor with jobs on their calendar doesn't ask questions. The goal is a calendar full enough that there's nothing to ask.

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
TWILIO_ACCOUNT_SID   → set (July 21) ← missed call text-back
TWILIO_AUTH_TOKEN    → set (July 21) ← missed call text-back
DEPLOY_SECRET        → set (July 24) ← shared secret with Cloudflare Worker
ADMIN_EMAIL          → ayc98223@gmail.com (July 24) ← admin alert emails
GOOGLE_CLIENT_ID     → not set yet
GOOGLE_CLIENT_SECRET → not set yet
GOOGLE_REDIRECT_URI  → not set yet
SENTRY_DSN           → not set yet (optional — add to enable error monitoring)
FB_PAGE_ACCESS_TOKEN → not set yet (needed for Facebook Lead Ads webhook — get from Business Manager → App → Page token)
FB_VERIFY_TOKEN      → not set yet (any secret string Jose picks — used only for webhook verification setup)
FB_APP_SECRET        → not set yet (optional — enables X-Hub-Signature-256 validation on webhook posts)
VOYAGE_API_KEY       → set (session 18) ← Voyage AI embeddings for RAG diagnostic knowledge (voyage-3-lite, 512 dims)
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
│   │   ├── smsAI.js          ← Two-way AI SMS brain: handleContractorSms, sendSetupStepText, sendWelcomeText
│   │   ├── homeownerSmsAI.js ← Brain 3: handleHomeownerSms, startHomeownerSession, getActiveSession, routeHomeownerSms, startRebookSession
│   │   └── cron.js           ← node-cron: 24hr reminders, onboarding nudge, SMS setup drip (hourly :30), pre-appt confirmation SMS (7:30am daily), review request SMS (hourly :50), post-job close tracking SMS (hourly :45), 72hr silence alert (every 6h)
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
sms_conversation JSONB DEFAULT '[]', ← last 20 messages with AI (10 exchanges), persisted across texts
last_setup_sms_at TIMESTAMPTZ,   ← when drip cron last texted this contractor (throttle: 23h)
sms_welcome_sent INTEGER DEFAULT 0, ← 1 after welcome text fires on first Twilio number assignment
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
- Each contractor can have a `booking_slug` (e.g. `'book'`) set in the DB
- `tractifyhq.com/schedule/book` loads `DirectBooking.jsx` which looks up the contractor by slug
- Visitor fills out name + email + phone (required) + optional notes
- Picks date/time from the contractor's live availability
- Books via `POST /api/bookings/book-direct` — creates appointment with `lead_id = NULL`, sends branded emails to both parties via notifications.js
- No lead, no token, no email step — fully self-contained

**Jose's slug:** `book` → `tractifyhq.com/schedule/book` ✅ LIVE (display name = "The Tractify Team")

**Use case:** Available if Jose or Daniel ever want to send a booking link manually, but the primary funnel is fully automated through `intake.tractifyhq.com`. No personal demo close — the product proves itself when jobs appear on the contractor's calendar.

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

Direct bookings (via `/schedule/:slug`) use `sendDirectBookingConfirmation` (to homeowner) and `sendDirectBookingContractorAlert` (to contractor) — both in `notifications.js`, using the same branded `emailBase()` template as all other emails. Updated July 18.

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

## Missed Call Text-Back (Twilio)
Built July 21, 2026. Every missed call a contractor gets becomes a booked appointment automatically.

**How the flow works:**
1. Contractor buys a Twilio phone number (~$1/month) in the Twilio console
2. On the onboarding call, contractor forwards their business number to the Twilio number (5 min setup on their iPhone/Android)
3. When a homeowner calls and the contractor doesn't answer, the call forwards to Twilio
4. Twilio fires `POST https://tractifyhq.com/api/twilio/missed-call`
5. Tractify looks up the contractor by their Twilio number, sends the caller an SMS with a booking link
6. Twilio plays a voice message and hangs up

**The SMS text (Brain 3 — session 16+):**
Missed calls no longer send a booking link — instead Brain 3 starts a conversational session:
> "Hey! Sorry we missed you at [Business Name] — we're out on a job. I'm their scheduling assistant. What's the address that needs service?"
Brain 3 closes the booking in 4 messages. Homeowner never needs to click a link or open a browser.

**Follow-up text (sent ~2 hours later if no booking):**
> "Just checking in — still happy to help. Here's that booking link if you'd like to grab a time: tractifyhq.com/schedule/[slug]"
- Only fires if the caller has NOT booked within 2 hours of the initial text — no spam if they already converted
- One follow-up only (no third text)
- **Build needed:** cron job or `setTimeout` in the Twilio webhook handler. After sending the initial SMS, schedule a 2-hour delayed check: query `appointments` for a booking tied to that phone number + contractor within the last 2 hours. If none found, send the follow-up via Twilio. Log the follow-up in `lead_events` so the admin can see it.

**The voice message (read by Twilio's Alice voice):**
> "Thanks for calling [Business Name]. We're out on a job right now but we just texted you a link to book a time that works for you. Check your messages!"

**Twilio webhook URLs to set in Twilio console (two separate webhooks, same number):**
- **Voice (missed call):** `https://tractifyhq.com/api/twilio/missed-call` → set on "A call comes in"
- **SMS (two-way AI):** `https://tractifyhq.com/api/twilio/inbound-sms` → set on "A message comes in"

Both run on the same Twilio number. Voice webhook fires on missed calls → starts Brain 3 session (conversational booking). SMS webhook fires on any inbound text → routing:
1. If sender matches contractor's own phone → contractor AI assistant (smsAI.js)
2. If homeowner texts "CANCEL" → find + cancel their upcoming appointment → start Brain 3 rebook session → reply with available times
3. If active Brain 3 session exists for this homeowner + contractor → route to Brain 3 (routeHomeownerSms)
4. No session → start new Brain 3 session (van wrap / SMS keyword source)
Homeowners replying STOP are handled by Twilio natively — all outbound SMS include "Reply STOP to opt out."

**Railway env vars needed:**
- `TWILIO_ACCOUNT_SID` — from Twilio console (Account SID)
- `TWILIO_AUTH_TOKEN` — from Twilio console (Auth Token)

**Per-contractor setup (Admin Dashboard):**
1. Buy a Twilio phone number for the contractor in Twilio console — buy in their area code so it looks local to homeowners
2. Set the webhook URL on that number to `https://tractifyhq.com/api/twilio/missed-call`
3. In Admin Dashboard → Contractors → click "Set Twilio #" on their card → enter the number in E.164 format (`+12065551234`)
4. On the onboarding call, have the contractor enable call forwarding to that Twilio number (2 min on their iPhone/Android)

**How call forwarding works (important to understand):**
- The contractor keeps their existing business number — nothing changes for them
- They enable "unanswered call forwarding" on their carrier — native feature, free, built into every phone
- When a homeowner calls and they don't answer, their carrier forwards the call to the Twilio number after 4-5 rings
- Twilio receives the forwarded call and fires the webhook — it doesn't know or care about the contractor's real number
- Every call that reaches the Twilio number is by definition a missed call — so the webhook always fires correctly
- The SMS comes from the Twilio number, not the contractor's real number — this is fine because the message is clearly branded with their business name
- Long term upgrade: port their number to Twilio (~$3, 2-4 weeks) so the text comes from their actual number — offer this as a premium feature later

**Twilio account setup (Jose's account — done July 21):**
- Account created at twilio.com — Pay as you go plan ($20 starting balance)
- Business compliance profile submitted — pending review (up to 48 business hours)
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` already added to Railway env vars ✅
- ⚠️ Cannot buy numbers until compliance profile is approved — waiting on Twilio review
- Once approved: buy a local number (SMS + MMS + Voice), set webhook, test end-to-end flow

**Files:**
- `backend/routes/twilio.js` — the webhook handler
- `backend/server.js` — startup migration for `twilio_number` column, route registration
- `backend/routes/contractors.js` — `twilio_number` added to SELECT + PUT

**Twilio signature validation:**
The webhook validates Twilio's `X-Twilio-Signature` header using `TWILIO_AUTH_TOKEN`. If the header is invalid, it logs a warning and still returns a valid TwiML `<Hangup/>` response (so Twilio doesn't retry). Validation only runs if `TWILIO_AUTH_TOKEN` is set — safe to test locally without it.

---

## Facebook Lead Ads — Full Setup Guide

**What this does:** Homeowner sees a Facebook ad → pre-filled form opens inside Facebook → two taps to submit → Tractify receives the lead via webhook → instant SMS with booking link sent from the contractor's Twilio number within seconds. Homeowner never leaves Facebook for the lead capture step. Sub-60-second response while intent is still hot.

**Backend is fully built and deployed.** Route: `backend/routes/facebook.js`. Registered at `POST /api/leads/facebook` and `GET /api/leads/facebook`. The only things left are the one-time Business Manager setup (below) and per-contractor campaign creation.

---

### Part 1 — One-Time Facebook App + Webhook Setup

Do this once. Takes ~15 minutes.

**Step 1: Create a Facebook App**
1. Go to developers.facebook.com → My Apps → Create App
2. Choose "Business" as the app type
3. App name: "Tractify" — connect it to your Business Manager
4. Once created, go to the app dashboard → note your **App ID** and **App Secret** (Settings → Basic)
5. Add `FB_APP_SECRET` to Railway env vars (optional but recommended for security)

**Step 2: Add the Lead Ads product**
1. In your app dashboard → Add Product → "Lead Ads Retrieval" → Set Up
2. This enables the leadgen webhook subscription

**Step 3: Set your Verify Token in Railway**
1. Go to Railway → your project → Variables
2. Add: `FB_VERIFY_TOKEN` = any secret string you choose (e.g. `tractify-fb-webhook-2026`)
3. Keep a copy — you'll paste it into Facebook in Step 4

**Step 4: Connect the webhook**
1. In your Facebook App → Products → Webhooks → New Subscription → choose "Page"
2. Callback URL: `https://tractifyhq.com/api/leads/facebook`
3. Verify Token: paste the same string you just added to Railway
4. Click Verify and Save — Facebook sends a GET request with a challenge, Tractify echoes it back. If this succeeds, you'll see "Verified" in the Facebook dashboard.
5. Under Subscription Fields, check `leadgen` → Save

**Step 5: Get a Page Access Token**
1. In your Facebook App → Tools → Graph API Explorer
2. Select your App from the dropdown
3. Select your Business Page from the "User or Page" dropdown (the page you'll run Lead Ads from)
4. Click "Generate Access Token" → approve permissions (leads_retrieval, pages_read_engagement)
5. Copy the token — this expires. For a never-expiring token:
   - Take the short-lived token from above
   - Call: `GET https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}`
   - This gives you a long-lived page token (60 days, but Page tokens often don't expire)
6. Add `FB_PAGE_ACCESS_TOKEN` = the token to Railway env vars

**Step 6: Subscribe your Page to leadgen events**
1. In Graph API Explorer, make a POST request:
   `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen&access_token={PAGE_ACCESS_TOKEN}`
2. Response should be `{ "success": true }`
3. Your Page is now subscribed — any Lead Ad submission on this Page fires your webhook

**Verify it's all working:**
- Facebook App → Webhooks → your Page subscription → click "Test" next to leadgen
- This fires a test event to Tractify
- Check Railway logs for `[FACEBOOK] Lead received — leadgen_id: ...`
- If you see it, the webhook is live

---

### Part 2 — Per-Contractor Lead Ad Campaign

Do this for each contractor. Takes ~10 minutes per contractor in Ads Manager.

**Step 1: Create the campaign**
1. Facebook Ads Manager → Create Campaign
2. Objective: **Leads** (not Traffic — Leads gives you the native Lead Ad form)
3. Campaign name: `[Contractor Name] — Homeowner Delivery`
4. Budget: $10-15/day at the campaign level

**Step 2: Create the ad set**
1. Conversion location: **Instant Forms**
2. Targeting:
   - Location: enter the contractor's service zip codes one by one (you have these in the DB)
   - Age: 30-65
   - Homeowner behavior (under Detailed Targeting → Demographics → Home → Homeownership → Homeowners)
   - No other interest targeting — everyone in those zips is a potential HVAC customer
3. Placement: Facebook Feed + Instagram Feed only (remove Audience Network and Messenger)
4. Budget: set at campaign level, leave this as "Use Campaign Budget"

**Step 3: Create the Lead Ad form (critical — this is where routing happens)**
1. In the ad creative step → Lead Form → Create New Form
2. Form type: **More Volume** (fewer fields = higher completion)
3. Intro: headline "Need HVAC help in [City]?" — keep it simple
4. Questions — keep ONLY:
   - Full Name (pre-filled from Facebook)
   - Email (pre-filled from Facebook)
   - Phone Number (pre-filled from Facebook)
5. **Add a hidden field** — this is what routes the lead to the right contractor:
   - Field label: `contractor_slug`
   - Pre-filled value: the contractor's booking slug exactly as it appears in the DB (e.g. `premiercomforthvac`)
   - This field is invisible to the homeowner — they never see it
6. Privacy policy URL: `https://tractifyhq.com` (add a privacy policy page before running ads)
7. Thank you screen: "Thanks! We'll text you a link to pick a time in the next few minutes."
8. Save the form

**Step 4: Create the ad creative**
- Simple image or short video
- Headline: "Book HVAC service online in [City] — no phone call needed"
- Body: "Pick a time that works for you. We confirm instantly."
- CTA button: **Get Quote** or **Sign Up**

**Step 5: Publish and monitor**
- Publish the campaign
- When a homeowner submits: Facebook fires webhook → Tractify retrieves name/phone/email → creates lead in DB → sends SMS from contractor's Twilio number within 60 seconds
- Check Railway logs for `[FACEBOOK] Instant SMS sent to...` to confirm the flow is working
- Pause the campaign the moment the contractor hits 5 confirmed bookings

---

### What to check in Railway logs per lead
When a lead comes in, you should see this sequence in Railway logs:
```
[FACEBOOK] Lead received — leadgen_id: 123456, page_id: 789
[FACEBOOK] Lead fields: {"full_name":"Sarah Johnson","email":"sarah@...","phone":"206...","contractor_slug":"premiercomforthvac"}
[FACEBOOK] Lead created — Sarah Johnson → contractor Premier Comfort HVAC (lead: uuid)
[FACEBOOK] Instant SMS sent to +1206... (lead uuid)
[FACEBOOK] Booking link email sent to sarah@... (lead uuid)
```
If you see the first two lines but not the SMS line — Twilio number isn't assigned to that contractor. Set it in Admin Dashboard → Contractors.
If you see nothing after "Lead received" — check that `FB_PAGE_ACCESS_TOKEN` is set in Railway and hasn't expired.

---

### The routing system in plain English
- One webhook URL handles all contractors: `https://tractifyhq.com/api/leads/facebook`
- Routing is done by the hidden `contractor_slug` field in each Lead Ad form
- Jose creates one Lead Ad campaign per contractor in Ads Manager, each with a different slug in the hidden field
- Tractify looks up the contractor by that slug and sends the lead + SMS to them
- At 20 contractors: 20 ad sets, 20 different hidden field values, one webhook, zero extra infrastructure

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

**Auto-deploy: `spawn /app/node_modules/.bin/wrangler ENOENT`**
→ Wrong wrangler binary path. Wrangler is in `backend/node_modules/` (it's in `backend/package.json`). The correct path from `backend/services/cloudflare.js` is `path.join(__dirname, '../node_modules/.bin/wrangler')` which resolves to `/app/backend/node_modules/.bin/wrangler`. Do NOT use `../../node_modules/.bin/wrangler` (that would look in the project root `/app/node_modules/`).

**Auto-deploy: Pages deploy succeeds but site serves HTTP 500**
→ This was the reason we abandoned the raw Cloudflare Pages Direct Upload API and switched to Wrangler CLI. The raw API accepted uploads (gzip or plain) but served 500 — likely corrupted project state from multiple failed deploy attempts. Wrangler CLI (`wrangler pages deploy <dir>`) handles all multipart upload complexity correctly. If this ever recurs, delete the Pages project in the Cloudflare dashboard and redeploy fresh via Wrangler.

**Auto-deploy: Contractor emails not arriving even though Wrangler deploy succeeded**
→ Check `deploy.js` — the Pages deploy step must be wrapped in try/catch that does NOT re-throw on failure. If it throws, execution stops before Steps 7 (welcome email) and 8 (admin alert). The catch block should log the error and continue.

**Auto-deploy: "Powered by Tractify" badge shows broken image instead of logo**
→ FIXED (July 25, session 7). `probooklogo.png` was deployed as a separate file via `extraAssets` but Cloudflare Pages didn't consistently serve it. Fix: embedded as base64 data URL directly in `backend/templates/hvac-template.html` and `hvac-template/index.html`. No separate file needed — it's self-contained in the HTML forever. If the badge ever breaks again, check that the base64 string in the template wasn't accidentally truncated on a git edit.

**Auto-deploy: Site loads but contractor logo is missing (nav/header)**
→ Normal for new contractors — they don't upload a logo during the intake form. `buildClientConfig` in `deploy.js` defaults `logoImg` to `""` (empty string) so only the company name text shows in nav. At conversion, swap in their real logo by setting `logoImg` to their uploaded URL and redeploying via Wrangler.

**Inline booking on HVAC template shows demo/fake slots instead of real availability**
→ Two causes: (1) API key is not linked to a contractor — go to Admin → API Keys, edit the key, set the Contractor field. Without this, `contractor_id` is null in the API response and demo mode runs. (2) CORS not configured — `/api/availability` and `/api/bookings/book` must have wildcard CORS set in server.js (already done July 18).

**Inline booking shows "No openings in the next 2 weeks"**
→ API key IS linked to a contractor but the open-slots fetch is failing. Check: (1) CORS headers in server.js, (2) contractor has weekly availability set in the portal, (3) fetch URL uses `TRACTIFY_API = 'https://tractifyhq.com'` (not the old Railway URL).

**intake.tractifyhq.com shows old content after deploying the intake form**
→ Two separate causes that can stack:
1. **Wrong branch:** The `probook-intake` Cloudflare Pages project has two environments — `production` (what intake.tractifyhq.com serves) and `main` (preview). `wrangler pages deploy` WITHOUT `--branch=production` deploys to the `main` preview — the live custom domain never sees it. ALWAYS use `--branch=production`.
2. **CDN cache:** Even after a correct production deploy, Cloudflare CDN may serve the old HTML for minutes. Fix: Cloudflare dashboard → tractifyhq.com zone → Caching → Purge Cache → Purge Everything.
→ To verify which version is live: `view-source:https://intake.tractifyhq.com` and look for your marker comment (e.g. `<!-- v3-flags -->`).

**"0 files (1 already uploaded)" from wrangler deploy — did it fail?**
→ NOT a failure. This means the file's content hash already exists in Cloudflare's blob store (from a previous upload with identical content). Wrangler still creates a new deployment pointing to that blob — the production deployment IS updated. You can confirm by checking the Cloudflare Pages dashboard and looking for a new deployment timestamp.

**Feature flags (emergency, warranty, financing, nate, commercial) showing as `undefined` in Railway debug log**
→ The intake form was sending the correct fields but the old version of the form was live on intake.tractifyhq.com due to Cloudflare Pages branch confusion (see above). Root cause was every wrangler deploy going to the `main` preview branch, not `production`. Fix: always deploy with `--branch=production` and purge CDN cache after. Confirmed working as of July 25 session 8.

**How the feature flags pipeline works end-to-end (for debugging)**
1. Intake form `submitForm()` (lines ~2252-2260 of intake-form.html) sends boolean flags:
   `emergency`, `warranty`, `financing`, `nate`, `commercial` (true/false)
   Plus value fields: `warrantyYears`, `financingFrom`, `emergencyAvail`
2. Worker receives payload → saves to R2 → calls `POST /api/deploy` on Tractify backend
3. `deploy.js` `buildClientConfig()` reads `data.emergency`, `data.warranty`, etc. → injects into `<!-- TRACTIFY_CONFIG_START/END -->` markers in hvac-template HTML
4. `deploy.js` has a debug log at line ~251: `log('DEBUG fields — emergency:${data.emergency} warranty:${data.warranty}...')` — visible in Railway logs. Use this to verify fields are arriving.
5. Deployed site reads `CLIENT.emergency`, `CLIENT.warrantyYears`, etc. from the injected config
→ If debug log shows `undefined`: the intake form version live on intake.tractifyhq.com is old. Fix the branch + purge cache and redeploy.
→ If debug log shows correct values but site still shows wrong content: clear browser cache or check for hardcoded HTML in the template that doesn't check the CLIENT flag.

**`$ sign missing from financing amount (shows "55/mo" instead of "$55/mo")**
→ Contractor entered "55" without the $ prefix. deploy.js auto-prepends it:
`financingFrom: "${esc(data.financingFrom ? (String(data.financingFrom).startsWith('$') ? data.financingFrom : '$' + data.financingFrom) : '')}"`
This is already in production — no action needed. But if it ever breaks: the logic is in `buildClientConfig()` in `backend/routes/deploy.js`.

---

## Launch Status (as of July 25, 2026)

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
- ✅ CORS fix — `/api/availability`, `/api/bookings/book`, `/api/bookings/book-direct`, `/api/contractors/public` all accept cross-origin requests (July 18–20)
- ✅ AssemblyAI key secured — removed hardcoded key from transcribe-call.py, now reads from `ASSEMBLYAI_API_KEY` env var in ~/.zshrc
- ✅ Master cold call script — Tractify-Sales-Script.docx created, cheat sheet PDF updated with new pitch
- ✅ DirectBooking.jsx updated — headline "Claim Your 5 Free Booked Jobs", Tractify branding, phone formatting
- ✅ Intake form rebuilt (July 20) — down to 4 steps (~5 min): Your Info → Numbers & Hours → Services & Coverage → Review & Submit. Branding step, headline step, and About section removed.
- ✅ Intake overlay conversion-optimized (July 20) — "Claim Your 5 Free Booked Jobs." headline, urgency badge, 3-step flow, confirm-step booking, sessionStorage refresh restore, "Don't have a Google listing?" path
- ✅ Missed call text-back via Twilio — fully built (July 21). `POST /api/twilio/missed-call` webhook, `twilio_number` column on contractors, Admin Dashboard "Set Twilio #" per-contractor UI.
- ✅ Self-serve onboarding checklist — built July 23. First-login modal + persistent Setup tab with 6 steps, copy-paste text, platform-specific instructions, 48hr nudge email to contractor + Jose + Daniel if incomplete. Replaces onboarding call entirely.
- ✅ Subdomain auto-deploy — CONFIRMED LIVE July 25. Intake form submit → fully automated pipeline: contractor account + API key + Cloudflare Pages deploy (via Wrangler CLI) + custom domain + availability pre-population + welcome email + admin alert. Zero Jose involvement. First live site: `evergreenhomeheatingandenergy.tractifyhq.com`. Default Tractify logo (base64) + default cover photo (`./Coverphoto.jpg`) injected when contractor hasn't provided assets yet.
- ✅ Comprehensive field audit — all 24 fields `deploy.js` reads from `data.*` verified present in `submitForm()` payload. Two gaps fixed: `licenseNumber` (`g('f-license')`) and `serviceArea` (`g('f-service-area') || g('f-city')`) were missing, now added.
- ✅ Feature flags fully wired — `emergency`, `financing`, `warranty`, `nate`, `commercial` all sent in payload and read correctly in `buildClientConfig()`. `warrantyYears` and `financingFrom` also transfer correctly.
- ✅ probooklogo.png — embedded as base64 data URL directly in both `backend/templates/hvac-template.html` and `hvac-template/index.html`. No longer a separate file that can go missing on Cloudflare Pages deploys. Cover photo (`Coverphoto.jpg`) continues to deploy as a file (hardcoded in CSS, not via CLIENT config).
- ✅ Intake form redeployed to `intake.tractifyhq.com` with licenseNumber + serviceArea fix.
- ✅ Feature flag pipeline fully debugged (July 25, session 8) — root cause was wrangler deploying to `main` preview branch instead of `production`. Fixed deploy command in hvac-template/CLAUDE.md + added CDN purge step. All flags (emergency, warranty, financing, nate, commercial) confirmed transferring correctly.
- ✅ Financing section made generic (July 25, session 8) — removed hardcoded terms ("12-month 0% APR", "60-month low payment", "Same-day approval", military discount, no-money-down). Both `hvac-template/index.html` AND `backend/templates/hvac-template.html` updated with generic copy that works for any contractor.
- ✅ `$` auto-prepend for financingFrom in deploy.js — contractor entering "55" now correctly injects "$55" into the template.
- ✅ Google Reviews Pull — live July 26. Places API fetches top 3 real Google reviews on deploy, injects into CLIENT.reviews, renders automatically on contractor site. Real reviewer names, real dates, real text pulled from their actual Google listing. Reviews section hides itself cleanly if no placeId captured (manual entry path). Confirmed working on evergreenhomeheatingandenergy.tractifyhq.com — zero manual work.
- ✅ Full end-to-end retest passed (July 25, session 8) — emergency toggle OFF removes all 24/7 sections, warranty years transfer correctly, financing amount shows with $ sign, NATE toggle off removes NATE badge, years in business transfers correctly.
- ✅ **Dynamic services** (July 27, session 9) — `CLIENT.services` wired into `buildClientConfig()` in `deploy.js`. Both templates now have a `renderServices()` IIFE with a 10-item CATALOG object mapping intake service names → {title, val, desc, icon SVG}. Renders to 3 targets: `#services-grid` (cards), `#h-service` (lead form dropdown), `#footer-services-list` (footer links). First card gets "⭐ Most Requested" badge. Commercial card appended only if `CLIENT.features.commercial`. Falls back to 5 defaults if `CLIENT.services` is empty. Replaces all hardcoded service HTML. Service catalog keys: `'AC Repair'`, `'AC Installation'`, `'Furnace Repair'`, `'Furnace Installation'`, `'Heat Pump'`, `'Duct Cleaning'`, `'Mini-Splits'`, `'Maintenance Plans'`, `'Indoor Air Quality'`, `'Thermostat Install'`. Default set: `['AC Repair','Furnace Repair','Heat Pump','Indoor Air Quality','Maintenance Plans']`.
- ✅ **Intake form trimmed for conversion** (July 27, session 9) — removed: Service Area Description field, entire Brands card (Equipment Brands You Service), FAQ Section toggle, Map in Footer toggle, extra socials block (Instagram/TikTok/YouTube/Nextdoor hidden behind `<details>`). Updated services hint text to explain homeowners see these options. Updated both `saveProgress()` forEach arrays (removed `feat-faq`, `feat-map`). footerTagline updated to "dedicated to doing the job right" (replace_all — both the submitForm payload and admin panel preview). Shorter form = higher completion rate.
- ✅ **Intake form success screen rewritten** (July 27, session 9) — removed slot picker and "15-min onboarding call" copy entirely (that flow no longer exists). Replaced with 3-step pipeline messaging using existing `.success-steps` CSS: (1) Your pipeline is being set up, (2) Check your email for login details, (3) Jobs start coming in after you complete setup. Honest about what actually happens next.
- ✅ **Welcome email rewritten to pipeline language** (July 27, session 9) — subject: "Welcome to Tractify — your booking pipeline is live." Headline: "Your booking pipeline is live." Credential box redesigned: each field (URL/Email/Password) now has a labeled header + monospace div block styled for easy copy-paste (white background, purple border, monospace font). "Jose & Daniel — Tractify" sign-off removed — just "Questions? Reply to this email — we respond same day."
- ✅ **24/7 spacing fix** (July 27, session 9) — changed `24/7` to `24 / 7` on the why-card stat in both templates. Better visual breathing room between slash and 7. Applies to new contractor deploys going forward (live Evergreen site needs redeploy to see it).
- ✅ **Form validation field highlighting** (July 27, session 9) — lead form on HVAC template now highlights empty required fields with red glow border on submit attempt. Auto-scrolls to and focuses the first empty field. Each field self-clears the highlight on input/change. Error message updated: "Please fill in all highlighted fields before submitting." Applied to both `hvac-template/index.html` and `backend/templates/hvac-template.html`.
- ✅ **Warranty why-card hides when warranty is off** (July 27, session 9) — added `id="why-card-warranty"` to the warranty stat card in both templates. Added `if (!CLIENT.warranty) { hide('why-card-warranty'); }` to the feature flag hide block alongside the emergency247 logic. When a contractor doesn't offer a warranty, the card disappears — the remaining 3 why-cards fill the grid cleanly. Same pattern as all other feature flags.
- ✅ **TDZ crash fix in ContractorPortal.jsx** (July 28, session 10) — two `useEffect` hooks were referencing variables (`slots`, `contractorProfile`, `markStep`) in their dependency arrays before those variables were declared via `useQuery`/`useMutation`. `const` has a Temporal Dead Zone — synchronous dep array evaluation threw `ReferenceError` on every render, causing a blank white page. Fix: moved both effects (`autoCompletedAvailabilityRef` and `greetingFiredRef`) to after all their dependencies are declared. Left a comment at the original location explaining the move so future Claude sessions don't re-introduce the same bug.
- ✅ **"Why" callouts on each setup step** (July 28, session 10) — each of the 7 setup step cards in ContractorPortal.jsx now has a `why` field. When a step is expanded, a amber-50 callout box with a 💡 icon shows one punchy sentence explaining the cost of skipping it. Builds trust, drives completion. Examples: "HVAC contractors miss calls constantly — you're on rooftops, under houses, can't pick up. Every one of those calls used to be a lost job. This catches them automatically." / "Homeowners searching 'HVAC near me' right now can book directly from your Google listing. This is the highest-intent traffic that exists, and it costs nothing."
- ✅ **'messenger' step added to complete_setup_step enum** (July 28, session 10) — the 7th onboarding step was missing from the AI tool enum in `aiChat.js`. Fixed. AI can now mark all 7 steps complete via tool use.
- ✅ **Two-way AI SMS system — FULLY BUILT** (July 28, session 10) — the entire north star vision is live in production. Full details below.

**Two-way AI SMS — what was built (session 10):**
- `backend/services/smsAI.js` — new service. `handleContractorSms(contractor, incomingText)`: loads full contractor context (appointments, availability, checklist), calls Claude Haiku with SMS-optimized prompt (≤320 chars, no markdown, one thing at a time), runs same tool-use loop as aiChat.js (block_time, cancel_appointment, complete_setup_step for all 7 steps), persists last 20 messages to `sms_conversation` JSONB column, returns plain text reply for Twilio. `sendSetupStepText(contractor, twilioClient)`: finds next incomplete step, sends targeted drip text, updates `last_setup_sms_at`. `sendWelcomeText(contractor, twilioClient)`: one-time welcome on first Twilio number assignment, sets `sms_welcome_sent = 1`.
- `POST /api/twilio/inbound-sms` added to `backend/routes/twilio.js` — routing: normalize last 10 digits of sender vs `contractor.phone`. Contractor's own number → AI assistant. Any other number → homeowner booking link reply. Twilio signature validation included.
- Welcome SMS trigger in `backend/routes/contractors.js` PUT /:id — fires when `twilio_number` changes from null to a value and `sms_welcome_sent = 0`. Non-fatal — contractor update always succeeds even if SMS fails.
- Setup drip cron added to `backend/services/cron.js` — runs hourly at :30. Finds contractors with Twilio assigned + welcome sent + incomplete steps + no SMS in 23 hours → sends next step text. Only fires if Twilio credentials are set (safe while compliance pending).
- DB migrations in `backend/database/db.js`: `sms_conversation JSONB DEFAULT '[]'`, `last_setup_sms_at TIMESTAMPTZ`, `sms_welcome_sent INTEGER DEFAULT 0`.
- **Twilio console setup (do when compliance approved):** On each contractor's Twilio number, set BOTH webhooks: "A call comes in" → `https://tractifyhq.com/api/twilio/missed-call`, "A message comes in" → `https://tractifyhq.com/api/twilio/inbound-sms`.

**Remaining — fine-tuning before first real contractor (do in order):**
- ✅ **Remove debug log from deploy.js** — done. Railway logs are clean.
- [ ] **Retest full pipeline** — delete test contractor, submit fresh intake form at `intake.tractifyhq.com`, verify: (1) "Powered by Tractify" badge shows logo correctly at bottom right, (2) cover photo is the HVAC image (not Unsplash), (3) feature flags match what was entered on form (test emergency off, financing on, warranty off), (4) both emails arrive (contractor welcome + admin alert), (5) services on deployed site match what was selected on intake form, (6) warranty card absent when warranty toggled off.
- [ ] **Onboarding checklist polish pass** — ⚠️ flagged for review before August 3rd. Go through all 6 steps as if you're a new contractor. Fix any confusing copy, broken links, or missing Twilio number display issues.
- [ ] **Twilio compliance approval** — pending (emailed trusthub-verify@twilio.com with CP 575B on July 23). Once approved: buy local number for contractor, set BOTH webhooks in Twilio console ("A call comes in" → `/api/twilio/missed-call`, "A message comes in" → `/api/twilio/inbound-sms`), set number on contractor in admin dashboard, test end-to-end. All code is already live — zero build work remaining once compliance clears.
- ✅ **Legal + compliance (session 12 final)** — Privacy Policy live at `/privacy`, Terms of Service live at `/terms`. Both route to React pages (PrivacyPolicy.jsx, TermsOfService.jsx) registered in App.jsx. Footer links on LandingPage.jsx. SMS consent + STOP opt-out disclosure added to both HVAC templates (index.html + backend/templates/hvac-template.html) below the form submit button. STOP reply added to all outbound homeowner Twilio SMS (missed-call + inbound-sms handlers). Welcome text to contractors updated with STOP opt-out. Terms acceptance checkbox on intake-form.html Step 4 — blocks submission if unchecked, links to /terms and /privacy. Rate limiter on both AI chat endpoints (20 req/15min) — admin brain + contractor chat. Security audit passed (see Security section below).
- [ ] **Training videos for contractors** — short screen recordings showing: (1) how to block time slots for jobs booked outside Tractify (phone calls, word of mouth, walk-ins) so double bookings don't happen, (2) how to use the portal day-to-day. Embed in the onboarding checklist or portal help section. Critical before first real contractor — this is their main support resource.
- [ ] **Empty availability alert** — if a contractor's calendar still has zero availability slots set 24 hours after deploy, send an automated nudge email/SMS. Dead calendar = no bookings possible = silent failure. Add to the cron job in `cron.js`.
- [ ] **Real-time booking alert to Jose** — when a homeowner actually books through a contractor's Tractify site, Jose needs to know immediately (not by checking the dashboard). Add a push notification or email alert to `notifications.js` that fires on every new booking during the trial period. This is how Jose monitors whether the machine is working in real time during August.
- [ ] **Contractor portal first-login experience polish** — beyond the checklist, audit what a brand new contractor actually sees on first login. Does it feel like a professional product? Fix anything that looks like a dev tool or feels unfinished. First impression affects checklist completion rate.
- [ ] **Portal help section / FAQ** — every question a contractor might think to ask Jose should be answered inside the portal. This is non-negotiable for keeping Tractify hands-off at scale. Topics to cover: what happens after setup, how long until jobs appear, how to block time for jobs booked outside Tractify, what the channels are and how they work, what happens at job 5, how to contact support. If a contractor is emailing Jose, the portal failed — treat every question as a product gap to close.
- ✅ **AI chat assistant inside contractor portal — BUILT (session ~8)** — live at `POST /api/contractor/ai-chat`. Chat widget in ContractorPortal.jsx → Claude Haiku with full contractor context → tool-use loop (block_time, complete_setup_step, cancel_appointment) → returns reply + action. Proactive greeting on setup tab open. Auto-completes step 1 if availability already set.

- ✅ **Two-way AI SMS interface — BUILT (session 10)** — fully deployed. See "Two-way AI SMS — what was built" in the Launch Status section above. The portal chat and SMS brain share the same tool logic. North star is live.
- [ ] **Unified AI brain across the entire pipeline (Phase 3 — long game)** — right now each piece of the system operates in isolation. The intake form collects, the worker deploys, the template serves homeowners, the backend runs bookings. Phase 3 connects all of them with shared intelligence. The intake form qualifies contractors in real time before they submit. The worker makes intelligent deployment decisions based on contractor profile — urban contractor with 80 reviews gets different channel prioritization than rural contractor with 10. The template dynamically serves what's converting best across all active sites. Booking data feeds back into intake form prioritization. One continuous learning loop across the entire pipeline — every part talking to every other part, getting smarter as data flows through. Build after the admin brain is live and real data exists to learn from. You can't train a system on data you don't have yet.

**How to build the brain properly as the business grows — the layered approach:**
The brain can't be built all at once. It has to be layered in the right order as real data accumulates:
- **Layer 1 (now — August):** Clean data infrastructure. Booking source tracking, revenue logging, checklist completion status all flowing into the database consistently. This is the training data for everything that comes after. No shortcuts here — bad data makes a dumb brain.
- **Layer 2 (after first 5 contractors):** Admin brain goes live. AI chat in the admin dashboard with full CLAUDE.md context + live database access. Jose starts asking questions and getting answers. Every decision Jose makes gets logged — which contractors got ad spend, what the result was, which channels underperformed. The brain starts building memory.
- **Layer 3 (after 10-15 contractors):** Pattern recognition kicks in. Enough data exists to spot things no human would catch manually — zip code densities converting faster, review counts predicting close rates, checklist completion order correlating with job delivery speed. Brain goes from reactive (answering questions) to proactive (surfacing insights unprompted). "Three contractors haven't had a booking in 5 days — here's what's different about them."
- **Layer 4 (after 25+ contractors):** Predictions replace suggestions. "Last time you put $20/day behind a contractor with this profile in this market, they hit 5 jobs in 6 days." The brain stops learning from individual decisions and starts learning from patterns across the entire portfolio. Intake form qualification becomes automated. Deployment decisions become intelligent. The unified pipeline brain comes online.
- **The north star:** Jose feels like he has a world-class operations team, growth team, and analyst team working 24/7 without hiring a single person. Every hard decision — which contractors to accelerate, where to spend money, what's broken, what's working — gets made faster and smarter because the brain has seen it before.

- [ ] **Unified AI brain across the entire pipeline (Phase 3 — long game)** — right now each piece of the system operates in isolation. The intake form collects, the worker deploys, the template serves homeowners, the backend runs bookings. Phase 3 connects all of them with shared intelligence. The intake form qualifies contractors in real time before they submit. The worker makes intelligent deployment decisions based on contractor profile — urban contractor with 80 reviews gets different channel prioritization than rural contractor with 10. The template dynamically serves what's converting best across all active sites. Booking data feeds back into intake form prioritization. One continuous learning loop across the entire pipeline — every part talking to every other part, getting smarter as data flows through. Build after the admin brain is live and real data exists to learn from. You can't train a system on data you don't have yet.
- ✅ **AI business brain embedded in admin dashboard — BUILT + UPGRADED TO FULL TOOL USE (session 12).** Right-side drawer panel (pinned 🧠 tab trigger, slides in from right edge). Live DB context pulled on every query. Brain now TAKES ACTIONS via tool-use agentic loop (same pattern as aiChat.js): `set_twilio_number`, `approve_contractor`, `decline_contractor`, `update_contractor` (city/phone/company/etc), `assign_lead`, `cancel_appointment`, `delete_appointment`, `delete_lead`. After any action, `AdminDashboard.jsx` auto-invalidates the affected React Query cache so the dashboard refreshes instantly. Quick prompts include action shortcuts ("Delete all test leads", "Approve all pending contractors"). Subtitle: "Ask questions · Take actions". Files: `backend/routes/adminAI.js` + right-side drawer widget in `AdminDashboard.jsx`.
- [ ] **AI-personalized monthly business report (Phase 2 — major feature)** — replace the generic cron report with an AI that knows each contractor's specific numbers, channels, history, and patterns. Instead of a generic email, the contractor gets a message that reads like a business partner who's been watching their growth: "Hey Mike — July was your best month. 8 jobs booked, 6 closed, $9,400 in revenue. Your missed call text-back recovered 3 that would have been gone forever. You have 12 past reviewers who haven't been re-engaged — want us to reach out?" Completely automated, completely personal, zero Jose involvement. The AI gets smarter about each contractor every month — slow seasons, best channels, close rate patterns. This transforms the monthly report from a retention tool into a genuine business intelligence service. Leaving Tractify stops meaning "losing a booking tool" and starts meaning "losing the only thing that understands my business." That's when churn becomes functionally zero — not because they're locked in technically, but because the relationship has real value they can't replicate anywhere else. This is the long game version of what Tractify becomes at scale.
- [ ] **No-availability fallback on contractor site** — if a homeowner submits the lead form but the contractor has no available slots in the next 2 weeks, they hit a dead end. Need a graceful fallback: "We'll be in touch within 24 hours to schedule your appointment" + capture their info. Currently shows "No openings" with nothing else.
- [ ] **Admin checklist completion visibility** — can Jose see from the admin dashboard which contractors have completed which checklist steps? If not, add it. In August Jose needs to know at a glance who is set up properly and who has stalled.
- [ ] Jose expand availability in contractor portal (for /schedule/book — not blocking client onboarding)
- [ ] Railway database backups — requires Pro plan ($20/month). Do NOT upgrade until first paying client.

**Remaining — must do before first client converts (Aug 4 with Daniel):**
- [ ] **Open business bank account** — EIN in hand (42-4017025, issued July 23). Do this first.
- [ ] **Stripe integration** — self-serve conversion at job 5. Job 5 milestone trigger → Stripe payment page → $2,000 setup fee + $800/month retainer → system flips them to paid. No manual invoicing. Set up with Daniel on August 4th — this is the crowning piece of the whole business model.
- [ ] Job milestone trigger (job 3 + job 5) — portal notification + email, data-aware messaging (see Planned Features)
- [ ] Revenue + outcome logging — "Did this job close? How much?" after each completed appointment

**Remaining — makes the business smarter (build in parallel):**
- ✅ Booking source tracking — BUILT (session 11). `booking_source` on every appointment. See Planned Features → Section 1 for full details.
- ✅ Contractor acquisition source tracking — BUILT (session 12). `acquisition_source` on contractors table. Intake form reads `?src=` URL param, passes through Worker to deploy.js INSERT. Admin brain reports which content/ads drove contractor signups. ✅ Worker fix confirmed unnecessary (session 14) — intake form already sends `acquisitionSource` in payload, Worker passes full payload to `/api/deploy`, deploy.js already saves it. End-to-end confirmed working.
- ✅ Admin AI brain — BUILT (session 12). Floating 🧠 on admin dashboard. Live DB queries: contractor status, channel performance, acquisition sources, stalled alerts, Stripe conversion progress. Ask plain-language questions, get data-backed answers. Files: `backend/routes/adminAI.js`, `frontend/src/pages/AdminDashboard.jsx`.
- [ ] Contractor dashboard live stats — jobs this month, revenue this month, total all time, next appointment (see Planned Features)
- [ ] Automatic review request — SMS to homeowner 3 hours after appointment completed (see Planned Features)
- [ ] Intake funnel view in admin dashboard (data collecting, UI not built)
- [ ] Flip bridge ON once first contractor is onboarded (script properties only — no code changes)
- [ ] Google Calendar credentials (deferred — add to Railway when ready)

---

## Security Audit — Completed July 28, 2026

Full audit passed. Summary of what was verified:

- **No hardcoded secrets** — all credentials read from Railway env vars. `.env` only used locally.
- **SQL injection** — 220+ parameterized queries (`$1, $2` style). One dynamic field in adminAI.js (`update_contractor`) is safe: `field` is validated against a strict allowlist before the query runs.
- **CORS** — wildcard only on 5 external-client paths (inbound, availability, book, book-direct, public contractor). All other routes restricted to FRONTEND_URL. Wildcard paths secured by API key or booking token at route level.
- **Auth** — JWT required on all admin and contractor routes. bcryptjs (cost 10) on all password storage and comparison.
- **Webhooks** — Twilio signature validation on both missed-call and inbound-sms. Facebook X-Hub-Signature-256 validation when FB_APP_SECRET is set.
- **Headers** — Helmet.js active on all responses. CSP, X-Frame-Options, HSTS all configured.
- **Rate limiting** — 8 rate limiters covering all abuse-prone surfaces: public leads, bookings, auth login, contractor apply, inbound API, intake tracking, self-service cancel/reschedule, and AI chat (admin + contractor, 20/15min to protect Anthropic bill).
- **Logs** — No passwords, tokens, or secrets logged anywhere in backend source.

**One manual action required (not blocking launch):**
- **Google Places API key** (`AIzaSyAbRXd2xYGaBMVkZV_qvi2B3Funw3-grRk`) is publicly visible in `intake-form.html` client-side JS — this is expected and unavoidable for browser-based Places Autocomplete. Restrict it to `intake.tractifyhq.com` in Google Cloud Console → APIs & Services → Credentials → Edit key → Restrict by HTTP referrer. This prevents abuse from external sites using the key. Won't affect the intake form.

---

## ⚡ PICK UP HERE — First Contractor + Stripe

**Context:** Every SMS brain is fully written, tested, and polished. The machine is built end-to-end. Focus is on (1) SMS flow testing tomorrow, (2) Stripe on August 4 with Daniel, (3) first real contractor live the moment Twilio compliance clears.

**Waiting on external:** Twilio compliance approval — code is 100% built, zero work left. Once approved: buy local number → set two webhooks in Twilio console → assign in admin dashboard.

**Next session (SMS test):** Build `POST /api/twilio/test-sms` (admin-protected) that accepts `{ phone, message, role }` and runs the message through the exact same routing logic as the real Twilio webhook. Lets Jose simulate full contractor + homeowner conversations via curl/Postman — no Twilio needed. When compliance clears, just point the webhook at the real endpoint. It's already tested.

**Next builds in order:**
1. **SMS test endpoint** — tomorrow. Simulate contractor + homeowner conversations without Twilio.
2. **Stripe integration** — August 4 with Daniel. Job 5 fires → automated Stripe payment page → $2,000 setup fee → per-appointment billing at $75/confirmed booking. No retainer, no contract.
3. **Contractor dashboard live stats** — jobs by source, this month, upcoming. Churn prevention.
4. **Job milestone trigger (job 3 + job 5)** — portal notification + data-aware email. Job 5 fires Stripe automatically.
5. **Revenue + outcome logging** — post-appointment "did it close?" prompt in portal.

**✅ Complete as of session 19 (SMS drip rewrite + Brain 3 final audit):**
- **All smsAI.js drip messages rewritten** — urgency-first, no soft language, no portal references. Every step message is specific about cost of skipping, action is a 60-second win. Welcome, power message, calendar training, capabilities guide, and post-appointment close text all rewritten.
- **Availability step is now portal-free** — `sendSetupStepText` queries `availability_slots` DB for contractor's hours, formats them via `formatAvailabilityForSms` helper, shows them inline in the text. Contractor replies YES to confirm or texts corrections — never touches the portal.
- **`update_availability_slot` tool added to handleContractorSms** — DELETE + INSERT pattern. Contractor texts "change Monday to 8am-4pm" → AI calls the tool → recurring weekly slot updated instantly. No portal login required, ever.
- **Brain 3 final audit — 3 fixes in homeownerSmsAI.js:**
  - `handleService` state race condition fixed — service_description saved first, state only advances to `awaiting_slot` after confirming slots exist. Previously a slot-fetch failure left homeowners stuck in `awaiting_slot` with empty offered_slots.
  - "Fully booked — I'll have someone call you" broken promise removed. Changed to "Text us again in a few days."
  - `handleEmail` confirmation SMS now includes actual appointment date + time: "See you Friday August 2nd at 2:00 PM." Appointment data was already fetched in scope — just wasn't being used in the reply.

---

### ✅ ALL PRE-AD GAPS CLOSED (session 14)

All four gaps identified session 13 are resolved. The funnel is ready for real contractors and ad spend.

**Gap 1 — Checklist mismatch ✅ FIXED (session 14)**
Contractor portal now shows exactly 2 required steps (confirm availability + call forwarding). The 5 other channel steps are gone from the UI entirely. Replaced with a single line: "Everything else is handled by Tractify — you'll get a text as each channel goes live." First-login modal rewritten to "You do 2 things. We handle the rest." Sidebar nav badge shows `!` only until those 2 steps are done. AI SMS drip is the onboarding mechanism for all channels beyond step 2.

**Gap 2 — No visibility into trial failure ✅ BUILT (session 14)**
Two alerts live:
- **Instant booking alert:** fires to Jose (ADMIN_EMAIL) the moment any homeowner books through any contractor's site. Shows contractor, homeowner name + phone, date/time, channel (booking_source), and job progress ("Job 3 of 5 — 2 more to Stripe"). At job 5 the email says "STRIPE SHOULD FIRE 🚀". Triggered from both `/book` and `/book-direct` routes in `bookings.js`.
- **72-hour silence alert:** cron job runs every 6 hours. Finds contractors live 72+ hours with zero non-cancelled bookings, fires one email to Jose with investigation checklist. `trial_silence_alert_sent_at` column (added via db.js migration) prevents duplicate alerts.
- Files changed: `backend/services/notifications.js` (`sendTrialBookingAlertToJose`, `sendTrialSilenceAlertToJose`), `backend/routes/bookings.js` (both booking routes), `backend/services/cron.js` (every-6h silence job), `backend/database/db.js` (migration).

**Gap 3 — Post-access channel automation ✅ SCRATCHED (session 14)**
Decision: do not build this. The AI SMS drip handles channel setup. Self-filtering is intentional — a contractor who won't text back is not a client Tractify wants. GBP API also blocked at 0 QPM until Google approves. Revisit only if manual overhead becomes a real problem at 10+ contractors.

**Gap 4 — Track 1 contractor economics risk ✅ IRRELEVANT (session 14)**
Burst ad spend model was scratched. New model: organic channels first, ads as finishers only when signal exists. Economics are naturally protected — no blind $150/day commitment to any contractor. This gap no longer exists.

**Worker acquisitionSource fix ✅ CONFIRMED ALREADY WORKING (session 14)**
Intake form already sends `acquisitionSource` in the submit payload. Worker passes the full JSON payload to `/api/deploy` unchanged. `deploy.js` already reads and saves `data.acquisitionSource` to `contractors.acquisition_source`. End-to-end confirmed. No fix needed.

---

**✅ Complete as of session 17 (SMS maximization):**
- **Phone-only HVAC form** — both `hvac-template/index.html` and `backend/templates/hvac-template.html` stripped to a single phone field. On submit: `POST /api/leads/inbound` with phone only → backend creates lead + starts Brain 3 session → homeowner gets a conversational SMS asking for address. No slot picker, no email capture, no inline booking UI. Success screen shows "Check Your Texts!" Instead. `handleLeadForm` rewritten to phone-only path. Removed ZIP validation, service-select handler, CTA scroll to old fields. CTA scroll now focuses `h-phone` only. Enter on phone field submits.
- **`startRebookSession` exported from homeownerSmsAI.js** — new function that creates a Brain 3 session with state `awaiting_slot`, pre-populated name/address/service from an existing lead, and offered_slots fetched immediately. Returns SMS text with 3 slot options. Used for post-cancel rebook flows.
- **Cancelled appointment → Brain 3 rebook SMS** — both cancel routes in `backend/routes/bookings.js`: (1) `PUT /:id/cancel` (contractor cancels), (2) `POST /cancel-token/:token` (homeowner cancels). After the existing email fires, a Brain 3 rebook session starts non-blocking (fire-and-forget `.then().catch()`). Homeowner gets an SMS with available times within seconds of the cancellation.
- **CANCEL keyword in inbound-sms** — added to `backend/routes/twilio.js` homeowner branch before Brain 3 session check. When a homeowner texts "CANCEL", finds their next confirmed appointment (within 7 days), cancels it, and calls `startRebookSession` to offer new times in the same reply. Phone normalization via SQL `REPLACE` chain handles all stored formats.
- **Morning-of confirmation SMS cron** — runs at 7:30 AM daily (`'30 7 * * *'`). Finds confirmed appointments for today with `pre_appt_sms_sent_at IS NULL`. Texts homeowner: "Hey [firstName]! Just confirming your appointment with [Business] today at [time]. Reply CANCEL if you need to cancel." Updates `pre_appt_sms_sent_at = NOW()` after send.
- **Review request SMS cron** — runs hourly at :50 (`'50 * * * *'`). Finds appointments with `status = 'completed'`, `updated_at` 2-4 hours ago, `homeowner_review_sms_sent_at IS NULL`, and contractor has `place_id`. Uses Google review deep link: `https://search.google.com/local/writereview?placeid={place_id}`. Updates `homeowner_review_sms_sent_at = NOW()` after send.
- **DB columns in use**: `pre_appt_sms_sent_at TIMESTAMPTZ`, `homeowner_review_sms_sent_at TIMESTAMPTZ` on appointments (already migrated via db.js). `leads.name` and `leads.email` are nullable (already migrated).

**✅ Complete as of session 16:**
- All three SMS drip missing pieces: power message, calendar blocking training, post-appointment close tracking cron (hourly at :45)
- Bug fixed: twilio.js inbound-sms SELECT was missing `sms_power_message_sent` + `sms_calendar_training_sent` — specialty messages could fire repeatedly on every availability confirm
- Brain 3 (homeownerSmsAI.js) — full conversational homeowner booking over SMS, 4-message close, contractor gets door-to-door Maps link alert
- Missed call webhook now starts Brain 3 session instead of sending a booking link
- All DB migrations in place: `homeowner_sms_sessions`, `did_close`, `closed_value`, `post_job_sms_sent_at`, all drip columns

**Three missing pieces in the SMS drip (identified July 30, 2026) — ✅ ALL BUILT (session 16):**

**A. The power message** — contractors coming through ads have no idea the SMS interface can manage their calendar. After step 1 (availability) is confirmed, fire a message that makes the capability feel like they just unlocked something: "You can text me anything, anytime. 'What's on my calendar tomorrow?' 'Block Thursday 3-6pm.' 'Cancel my Monday morning.' It all updates automatically. Try it right now." The last line drives an immediate test reply — first time they text a question and get a real answer back in 10 seconds, the product becomes real to them. No portal UI ever achieves that moment.

**B. Calendar blocking training** — critical gap that causes double bookings. Contractors book jobs via referrals, word of mouth, repeat customers calling direct. They don't log into the portal to block that time. Someone then books that slot through Tractify. Double booking, angry homeowner, contractor blames Tractify. The fix: early in the drip, make blocking time via text feel obvious and natural before the first job lands. "Any job you book outside Tractify — just text me to block that time. Like: 'block Wednesday 10am to 2pm.' I'll hold it so nobody double-books you." Must arrive before jobs start flowing, not after the first conflict happens.

**C. Post-appointment close tracking via SMS** — revenue logging is a planned portal feature (did_close + closed_value) that nobody will use if it requires logging in. The SMS version: a cron fires 30-60 minutes after the scheduled appointment time and texts the contractor: "Hey — how'd your 2pm go with [homeowner name]? Did the job close? Reply YES $[amount] or just NO." Contractor is on their phone, just finished the job, 5-second reply. AI handles the response and logs did_close + closed_value to the appointment record. This feeds: monthly results report, job 3 milestone message, Stripe conversion page anchor, and case studies — all from one text. Also keeps the SMS channel active permanently so it never goes quiet after setup is done.

**The bigger architectural shift these three create:**
The drip is currently an onboarding tool that ends when setup is done. These three additions make it a permanent business interface. Phase 1 (setup, days 1-7) trains the texting habit covertly — they reply YES seven times without thinking of it as behavior change. Phase 2 (power message + calendar training, woven into Phase 1) makes it conscious — they know they have this tool. Phase 3 (post-appointment follow-ups, ongoing) keeps the channel alive forever. A contractor who texts Tractify daily is a contractor who never cancels. Leaving means losing the assistant they text every morning — completely different retention story than losing a booking website.

### The admin brain — what it knows + what it can do (built session 12)

The 🧠 tab on the right edge of the admin dashboard opens a slide-out panel backed by Claude Sonnet. It pulls live DB data on every query and can take real actions via tool use.

**Data it sees:**
- Every contractor: setup completion %, bookings, acquisition source, city, days live, last booking
- Stalled contractors (active but <4 steps done or zero bookings after 5+ days)
- Channel performance: which ad source produces bookings fastest (avg hours to book, volume)
- Acquisition source breakdown: which intake URL tags drove contractor signups
- All-time bookings by contractor: confirmed, completed, cancelled
- Lead status breakdown (last 30 days)

**Actions it can take (tool use — agentic loop):**
- `set_twilio_number` — "Set Twilio to +12065551234 for Evergreen" → done
- `approve_contractor` / `decline_contractor` — fires approval/decline email automatically
- `update_contractor` — update city, phone, company_name, name, acquisition_source, twilio_number
- `assign_lead` — reassign a lead to a different contractor
- `cancel_appointment` — cancel a booking
- `delete_appointment` / `delete_lead` — clean up test data
- After any action: React Query cache invalidated → affected dashboard tab refreshes instantly

**Admin brain files:**
- `backend/routes/adminAI.js` — POST /api/admin/ai-chat. Requires admin JWT. 6 parallel DB queries, rich context, full tool-use agentic loop, calls claude-sonnet-4-6.
- `backend/server.js` — `app.use('/api/admin/ai-chat', require('./routes/adminAI'));`
- `frontend/src/pages/AdminDashboard.jsx` — right-side drawer (slides from right edge, pinned 🧠 tab trigger). Subtitle "Ask questions · Take actions". Auto-invalidates queries after actions.

**Brain cost architecture (decided session 12):**
- Full CLAUDE.md injected on every query — complete business context always available
- Prompt caching enabled (`anthropic-beta: prompt-caching-2024-07-31`) — CLAUDE.md marked as `cache_control: ephemeral`. First message in a session ~$0.08, subsequent messages in same 5-min window ~$0.01 (90% discount on cache hits)
- Estimated cost: ~$7-15/month at normal usage. Acceptable for internal admin tool.
- **Deferred: smart model routing (build when bill hits $50/month).** Route operational commands (set Twilio, delete, approve, assign) to Haiku ($0.25/MTok — 20x cheaper). Route strategic questions ("should I", "recommend", "best move") to Sonnet. Simple keyword classifier on message content. Would reduce costs another 80%. Not worth the complexity until usage is heavy enough to matter.

### Acquisition source tracking — how it works (built session 11-12)

**Goal:** Know which specific video, ad, or content piece drove each contractor to sign up.

**How Jose tags a campaign:**
- Run Facebook video ad → use intake URL: `intake.tractifyhq.com?src=fb_video_hvac_roof`
- Run Google Search ad → use intake URL: `intake.tractifyhq.com?src=google_search_hvac`
- Post organic content → use intake URL: `intake.tractifyhq.com?src=fb_organic_jul28`

**Flow end-to-end:**
1. Intake form reads `?src=` from URL → stores in `ACQUISITION_SOURCE` JS constant
2. `submitForm()` payload includes `acquisitionSource: ACQUISITION_SOURCE`
3. Cloudflare Worker passes `acquisitionSource` through to `POST /api/deploy` body
4. `deploy.js` saves to `contractors.acquisition_source` column at INSERT time
5. Admin brain reports: "fb_video_hvac_roof: 3 contractors signed up, 2 active, 11 setup steps completed"

**⚠️ Worker still needs one manual change:** In `probook-upload-worker/src/index.js`, in the `/submit` handler, add `acquisitionSource: body.acquisitionSource || null` to the JSON body sent to `POST /api/deploy`. This is the only thing not in lead-booking-app. Make this change and `npx wrangler deploy` from that folder.

### Channel setup — what URL to use for each ad

| Channel | Ad Platform | Landing URL | ?src= tag |
|---------|-------------|-------------|-----------|
| Google Search | Google Ads | `{slug}.tractifyhq.com?src=google_search` | `google_search` |
| Bing Search | Microsoft Ads | `{slug}.tractifyhq.com?src=bing_search` | `bing_search` |
| Facebook/Instagram ad | Meta Ads Manager | `{slug}.tractifyhq.com?src=facebook_ad` | `facebook_ad` |
| Facebook Lead Ad | Meta Ads Manager | (no URL — Lead Ad form, routed by `contractor_slug` hidden field) | auto from `lead.source_site` |
| Nextdoor paid | Nextdoor Ads | `{slug}.tractifyhq.com?src=nextdoor_ad` | `nextdoor_ad` |
| GBP booking button | Google Business Profile | `{slug}.tractifyhq.com?src=gbp` | `gbp` |
| Missed call text-back | Twilio (auto) | auto-appended `?src=missed_call` | `missed_call` |
| Inbound SMS / van wrap | Twilio (auto) | auto-appended `?src=sms_keyword` | `sms_keyword` |

**Within-platform attribution (within Google or Facebook):** Use different `?src=` values per creative — e.g. `?src=fb_video_roof` vs `?src=fb_image_offer`. The admin brain sees which specific creative is producing bookings, not just which platform. You're optimizing on booked appointments, not clicks — a better signal than what Facebook/Google optimize for natively.

**Suggested starting budget per contractor (trial period only):**
- Google Search: $10/day, Bing Search: $5/day, Facebook/Instagram: $10/day, Facebook Lead Ad: $10/day, Nextdoor: $5/day
- Total: ~$40/day per contractor. Run 7-10 days. $280-400 per contractor trial.

**The booking source query** (run from psql — don't paste in zsh):
```sql
SELECT booking_source, COUNT(*) as bookings,
  ROUND(AVG(EXTRACT(epoch FROM (a.created_at - l.created_at))/3600), 1) as avg_hours_to_book
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
WHERE a.status != 'cancelled'
GROUP BY booking_source
ORDER BY avg_hours_to_book ASC;
```
Connect to psql first: `railway run psql $DATABASE_URL` then paste at `=#`. (Pasting SQL directly in zsh breaks on `*` and parentheses.)

**Ask the brain instead** — open 🧠 on the admin dashboard and ask "which channels are converting fastest?" — it runs the same query and answers in plain English.

### What to build next (in order)
1. **Stripe integration** — August 4 with Daniel. Job 5 fires → automated Stripe payment page → $2,000 setup fee → system marks paid → $75/confirmed booking auto-billed after that. No retainer. No contract. Self-serve, no Jose involvement.
2. **Contractor dashboard live stats** — jobs by source, jobs this month, upcoming, next appointment. Primary churn prevention — contractor who sees their own numbers every login never cancels.
3. **Job milestone trigger (job 3 + job 5)** — portal notification + email, data-aware. Job 3: "You've made $X through Tractify — here's what happens at job 5." Job 5: Stripe fires automatically.
4. **Revenue + outcome logging** — "Did this job close? YES $850 or NO" prompt in portal after appointment completed. Feeds monthly results report and case studies.

**Already complete — do not rebuild:**
- ✅ Real-time booking alert to Jose (session 14) — fires on every booking
- ✅ Worker acquisitionSource fix (session 14) — confirmed already working end-to-end
- ✅ AI SMS drip all three pieces (session 16) — power message, calendar training, post-appointment close tracking
- ✅ Brain 3 homeowner AI SMS (session 16) — full conversational booking, 4-message close, no browser required
- ✅ Phone-only HVAC form (session 17) — both templates stripped to phone field, Brain 3 fires on submit
- ✅ `startRebookSession` (session 17) — exported from homeownerSmsAI.js, pre-populates name/address/service, state=awaiting_slot
- ✅ Cancelled appointment → Brain 3 rebook SMS (session 17) — both contractor cancel + homeowner cancel-token routes in bookings.js
- ✅ CANCEL keyword in inbound-sms (session 17) — cancels upcoming appointment + starts rebook session in one SMS reply
- ✅ Morning-of confirmation SMS cron (session 17) — 7:30 AM daily, `pre_appt_sms_sent_at` prevents duplicates
- ✅ Review request SMS cron (session 17) — hourly at :50, 2-4 hours post-completion, Google review deep link via `place_id`
5. **Admin checklist completion visibility** — currently the brain answers this via chat; building it as a column in the Contractors tab is a polish item.

---

## Client Go-Live Checklist (HVAC Pipeline Bundle)

**As of July 24, 2026 — fully automated.** Contractor submits intake form → everything below happens automatically with zero Jose involvement.

### What happens automatically (zero manual steps)
1. Worker receives intake form submission → saves to R2 → calls `POST /api/deploy`
2. Tractify creates contractor account (email = contactEmail, temp password generated)
3. Tractify creates API key linked to contractor, `allowed_origins` = their subdomain
4. Tractify builds CLIENT config from form data, injects into HVAC template (default Tractify logo + Unsplash cover photo if no assets uploaded)
5. Tractify deploys to Cloudflare Pages via **Wrangler CLI** (`wrangler pages deploy`) — creates project if it doesn't exist, handles all upload complexity
6. Tractify registers custom domain `{slug}.tractifyhq.com` on the Pages project via `addPagesDomain()` — Cloudflare handles DNS automatically (no manual CNAME needed)
7. Tractify pre-populates availability slots from their intake form hours
8. Contractor receives welcome email: portal URL + login email + temp password
9. Jose receives admin alert email: contractor info + site URL
10. Contractor logs in → first-login modal → completes 7-step self-serve checklist

**CONFIRMED LIVE July 25, 2026** — `evergreenhomeheatingandenergy.tractifyhq.com` deployed end-to-end with zero manual steps.

### Jose's only post-deploy decisions
- [ ] Decide whether this contractor gets paid ad spend (selective — not automatic for everyone)
- [ ] If Twilio is approved: buy local number, set webhook, set number in admin → contractor handles forwarding themselves via checklist
- [ ] Set GBP booking button manually (2 min — see Manual GBP Booking Button Setup below)

### Manual GBP Booking Button Setup (do for every trial contractor, first week)
GBP API automation is blocked pending Google approval. Set the booking button manually:
1. Go to business.google.com and sign in with the contractor's Google account (or ask them to do it — takes 2 min)
2. Click on their business listing → Edit profile
3. Scroll to "Booking" or click "Contact" section
4. Find "Add a booking button" or "Links" → "Appointment links"
5. Paste their Tractify booking URL: `tractifyhq.com/schedule/{slug}`
6. Save
That's it. The "Book" button now appears on their Google listing and Maps entry — highest-intent free traffic immediately active.

**Alternative if contractor does it themselves (preferred):**
The AI SMS drip already prompts them on this step. If they reply "done" the AI marks it complete. Fastest path: let the AI handle it via the checklist SMS — zero Jose involvement.

### Conversion (paid — stays on subdomain)
Contractor stays on their Tractify subdomain permanently — no domain purchase, no DNS changes, no extra build. The only thing that changes at conversion:
1. [ ] Stripe payment fires ($2,000 setup + $800/month retainer) — automated at job 5 once Stripe is integrated
2. [ ] System marks contractor as paid — everything else keeps running exactly as-is
3. [ ] Swap in client's real logo + cover photo if they provide them (redeploy to Cloudflare Pages via Wrangler)

**That's it.** Zero infrastructure work on conversion. The subdomain, the booking flow, the API key, the Twilio number — all already live and running. Stripe fires, they're paid, done.

### If auto-deploy ever fails (fallback — manual process)
1. Edit CLIENT config in `~/Desktop/hvac-template/index.html` with client info
2. Deploy to new Cloudflare Pages project → note `.pages.dev` URL
3. In Cloudflare DNS, add CNAME: `{slug}` → `{project}.pages.dev`
4. Create contractor account in Admin → Contractors → Add Contractor
5. Create API key in Admin → API Keys → New Key → link to contractor → set `allowed_origins`
6. Paste key into `tractifyKey` in CLIENT config, redeploy

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
- **Get first client jobs fast:** All 6 channels activate through the self-serve checklist — missed call text-back (Twilio), Google Business Profile booking button, Nextdoor, Facebook groups, Google reviewers. No call needed. The contractor does it themselves. Jose selectively runs paid ads behind contractors he believes are winners — not automatic for everyone.
- **New niches:** Add contractors under different niches — matching engine handles routing automatically
- **New cities:** Add contractors with their service zip codes — same paid ad playbook per market
- **Email campaign:** After 2-3 case study results exist, run cold email via burner domain + Instantly.ai to scale contractor acquisition. Never send from tractifyhq.com.
- **Payments:** Add Stripe to charge contractors $2,000 setup + $800/month retainer at conversion
- **Missed call text-back as standalone SaaS:** Eventually pitch to contractors who don't want a full site — pure Twilio play, works with any existing website
- **Broadcast SMS + seasonal campaigns:** Contractors text their existing customer list — seasonal promos, re-engagement blasts, booking reminders. Seasonal campaigns run automatically on Tractify's schedule. Both built on the same Twilio infrastructure.
- **Monthly results report:** Auto-generated report sent to each contractor at end of month — jobs booked, missed calls recovered, estimated revenue generated. Pure retention tool. Makes the value of Tractify visible every single month. Build into the product — everything automated, no manual work.
- **Contractor referral program:** Each paying contractor gets a referral link. When another contractor goes through the free trial AND converts to paid, the referrer gets one month of retainer free. Reward is only on confirmed conversions — not free trial signups. Turns every happy client into a sales channel automatically.
- **The proactive outreach play (Phase 3 — after automation + 5-10 paying clients):** Find a contractor who hasn't heard of Tractify. Deploy their subdomain automatically. Spend $20 on ads targeting their zip codes. When a real job books, call them: "We just booked you an appointment — customer's name is X, they're scheduled for Y. Want us to keep going?" They never filled out a form. They never got on a call. The product already worked before they knew it existed. Close rate on that conversation is near 100% — there's nothing to decide. **Timing is critical:** this play only works once onboarding is fully automated (zero manual setup time per attempt) and after 5-10 paying clients are generating revenue to fund the ad spend and case studies to back it up. At that point the cost per attempt is $20 and an hour of time. No one in this industry is doing this. When it's ready it changes everything.

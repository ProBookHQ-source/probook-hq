# Tractify — Master Context Document
*Last updated: July 25, 2026 (session 8 — feature flag transfer pipeline fully debugged and confirmed working end-to-end. Root cause was Cloudflare Pages production vs. main branch confusion + CDN caching. Financing section made generic across both templates. Google Reviews pull set as next build target.)*

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
- ⬜ Facebook Lead Ads webhook — new route `backend/routes/facebook.js`. Receive lead webhook, call Graph API to get name/phone/email, create lead, send booking link SMS. Needs `FB_PAGE_ACCESS_TOKEN` in Railway env vars.
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

## Pricing Strategy (July 21, 2026)

**The core principle:** Price reflects value delivered, not cost to serve. Costs stay flat. Value to the contractor compounds every month.

### Phase 1 — Proving It (First 3-5 clients)
- **Setup fee:** $2,000 (one-time — covers contractor account setup, API key, Twilio number, channel activation, ad spend to deliver the 5 free jobs)
- **Actual cost to Tractify per contractor:** ~$1.80 (Twilio number) + selective ad spend. Twilio numbers from non-converting trials are released back to the pool and reused for new contractors.
- **Retainer:** $800/month
  - $500 stays in pocket
  - $300 goes toward paid Facebook/Instagram ad spend for that contractor during active period
- **Why $800 and not more:** First clients are buying on trust, not proof. Risk feels real to them. $800 is low enough to be an easy yes, high enough to not signal desperation.

### Phase 2 — Scaling with Proof (After 3-5 wins)
- **Retainer:** $1,500-2,000/month
- Justified by case studies showing real booked jobs and revenue generated
- At this point you're not selling potential — you're selling documented results
- Switching cost is also real by now: booking history in your system, customer list integrated, calendar running through Tractify

### Phase 3 — Full Growth Partner (Scale)
- **Retainer:** $2,000-5,000/month depending on market size and services included
- Includes: booking site, missed call text-back, paid ads management, broadcast SMS campaigns, seasonal promos
- At this level you're a contractor's entire marketing arm, not a software vendor

### The Retainer Growth Logic
Every month a contractor stays, leaving gets more expensive for them. Their booking history, customer data, availability patterns, and ad performance data all live in Tractify. That compounding lock-in justifies aggressive price increases after the proof phase — not as punishment, but as accurate pricing of a product that's delivering more value over time.

**Document everything from client one.** Every booked job, every missed call that converted, every text blast result. Screenshots, numbers, before/after. This documentation is the entire sales pitch for every client after the first three.

**Document every result obsessively from day one.** Job delivered, channel it came from, how fast, revenue logged. When the data is clean and the numbers are real, the product sells itself to the next contractor without saying a word. The case study becomes the ad. The machine feeds itself.

**The math at scale:** 10 clients at $1,500/month = $180,000/year. 10 clients at $2,500/month = $300,000/year. With broadcast SMS added as a retainer-justified feature, $3,000+/month per client is realistic for established contractors in large markets.

---

### Content + Ads Strategy (August 2026)

**Both Jose and Daniel are on camera.** Faces convert better than faceless content. Real people building a real product for real contractors.

**Platforms in order of priority:**
- Facebook — HVAC owners are 35-55, they're in contractor groups, this is the primary channel
- Instagram — secondary, repurpose Facebook content
- TikTok — younger contractors, organic reach still massive

**The content formula that converts:**
Hook with a pain point the contractor feels daily → show the solution working → end with the offer. Example: "You're on a roof right now and your phone is ringing. You can't answer. That customer is already calling someone else. Here's what Tractify does about that." 30 seconds. Shot on an iPhone. No production needed. That video as a paid ad targeting HVAC contractors on Facebook will outperform anything polished because it's real.

**Content types that work:**
- Short video: Jose or Daniel talking directly to camera. Hook in first 2 seconds. Show the booking flow. Real, raw, no production needed.
- Screen recordings: show what it looks like when a job lands on a contractor's calendar automatically
- Case study content: auto-generated from system data — no chasing contractors needed (see Case Studies section below)
- Behind the scenes: building the company, the vision, the mission. People root for founders they can see.

**The hook that works:** *"HVAC contractors — we're giving away 5 free booked jobs."* That's the scroll-stopper. Everything else follows.

**Paid ads:**
- Run the best-performing organic video as a paid ad
- Target: HVAC business owners, Washington state to start, expand nationally as it proves out
- Budget: $20/day to start. Scale what converts, kill what doesn't.
- Drive directly to `intake.tractifyhq.com` — form first, inline slot picker shown on success screen
- Track cost per completed form — that's the conversion metric that matters

**The compounding flywheel:**
Content → inbound contractor fills intake form → pipeline auto-deploys → 10 channels activate → 5 jobs delivered → Stripe conversion at job 5 → case study auto-generated from system data → better content → more contractors → repeat. Every case study makes the next ad more powerful. The 5 free trial clients aren't just the first clients — they are the ad creative for every client after them.

**The Facebook group runs alongside content from day one:**
Start building "Home Service Contractors — More Booked Jobs" (or similar non-niche-specific name) aggressively in August alongside content creation. Not HVAC-specific — applies to all home service niches as Tractify expands. The group is a long play: build it with genuine value (tactical posts, win posts, question posts, behind-the-scenes), let trust compound over weeks, contractors self-convert to the intake form after seeing real results. Group members convert at higher rates than cold ad traffic because the trust is already built. The group becomes the best sales channel over time — an audience Tractify owns permanently.

**The warm traffic funnel:**
Facebook ad (HomeAdvisor targeting) → join the group → weeks of value content + win posts → contractor self-selects to intake form → form → onboarding → 5 free jobs → conversion. This path produces better-quality clients than cold-to-form because they already know and trust the brand.

**Ads Playbook:** All targeting strategy, audience breakdowns, creative formulas, what works, what to test, and cost tracking lives in `ads-playbook.md`. That document is the living marketing brain — update it every time something is proven, disproven, or discovered. The goal is for it to become smart enough that ads eventually run on autopilot with minimal human oversight.

**AI automation (future):** Once the creative formula is proven, train AI to generate ad variations, test hooks, and distribute at scale. Cold calling can never be automated this way. Content can.

**Rules that never change:**
- Never mention website, system, or technology — only booked jobs and outcomes
- The offer is always 5 free booked jobs, no strings, we want the case study
- Every piece of content drives to `intake.tractifyhq.com`
- The funnel is fully automated — no personal sales calls, no demo close, no onboarding call. Stripe handles conversion at job 5.

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

### 1. Booking Source Tracking
Add a `booking_source` field to the `appointments` table. Every booking gets tagged with which channel drove it:
- `"paid_ad"` — came from Facebook/Instagram ad
- `"missed_call"` — Twilio missed call text-back converted
- `"google_biz"` — came from Google Business Profile booking button
- `"nextdoor"` — came from Nextdoor post/ad
- `"google_reviewer"` — past reviewer re-engaged
- `"facebook_group"` — came from Facebook community group
- `"direct"` — came from the contractor sharing their link directly

**Why this is a weapon:** You'll know exactly which channels perform best per market and per contractor type. Double down on what works, fix or cut what doesn't. The channel breakdown also becomes the most compelling part of the case study ad: "2 Google Business Profile, 2 paid ads, 1 missed call recovered" shows the machine working on multiple fronts simultaneously.

**Implementation when ready:**
- Add `booking_source TEXT` column to `appointments` via startup migration
- Pass source as optional param through `POST /api/bookings/book` and `POST /api/bookings/book-direct`
- HVAC template can pass the source based on how the homeowner arrived (URL param `?src=ad` etc.)
- Twilio webhook always passes `booking_source: 'missed_call'` when it creates/converts a booking
- Contractor portal stats bar shows breakdown by channel

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
FB_PAGE_ACCESS_TOKEN → not set yet (needed for Facebook Lead Ads webhook — Channel 9)
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

**The SMS text:**
> "Hey! This is [Business Name] — sorry we missed your call, we're out on a job. Book a time that works for you here: tractifyhq.com/schedule/[slug] — takes 60 seconds and we'll confirm right away."

**Follow-up text (sent ~2 hours later if no booking):**
> "Just checking in — still happy to help. Here's that booking link if you'd like to grab a time: tractifyhq.com/schedule/[slug]"
- Only fires if the caller has NOT booked within 2 hours of the initial text — no spam if they already converted
- One follow-up only (no third text)
- **Build needed:** cron job or `setTimeout` in the Twilio webhook handler. After sending the initial SMS, schedule a 2-hour delayed check: query `appointments` for a booking tied to that phone number + contractor within the last 2 hours. If none found, send the follow-up via Twilio. Log the follow-up in `lead_events` so the admin can see it.

**The voice message (read by Twilio's Alice voice):**
> "Thanks for calling [Business Name]. We're out on a job right now but we just texted you a link to book a time that works for you. Check your messages!"

**Twilio webhook URL to paste in Twilio console:**
`https://tractifyhq.com/api/twilio/missed-call`
(Paste this in the Twilio number's "A call comes in" → Webhook URL field)

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

**Remaining — fine-tuning before first real contractor (do in order):**
- ✅ **Google Reviews Pull** — DONE July 26 — pull top 3 Google reviews from Places API and display on contractor sites. Plan: (1) capture `placeId` from Google Places autocomplete in intake form (it's already returned by the autocomplete — just need to store it), (2) pass `placeId` in Worker payload, (3) `deploy.js` calls Places API → gets top 3 reviews sorted by rating, (4) inject as `CLIENT.reviews = [{author, text, rating, date}, ...]`, (5) template renders reviews section from `CLIENT.reviews`. Google Places API key: `AIzaSyAbRXd2xYGaBMVkZV_qvi2B3Funw3-grRk` (already in intake form for autocomplete). Places Details endpoint: `GET https://maps.googleapis.com/maps/api/place/details/json?place_id={id}&fields=reviews&key={key}`. Returns up to 5 reviews sorted by `most_relevant` by default — take top 3 with rating ≥ 4.
- [ ] **Remove debug log from deploy.js** — the `DEBUG fields —` log at line ~251 of `backend/routes/deploy.js` is intentionally left in while building. Remove before first real contractor goes live.
- [ ] **Retest full pipeline** — delete test contractor, submit fresh intake form at `intake.tractifyhq.com`, verify: (1) "Powered by Tractify" badge shows logo correctly at bottom right, (2) cover photo is the HVAC image (not Unsplash), (3) feature flags match what was entered on form (test emergency off, financing on), (4) both emails arrive (contractor welcome + admin alert), (5) check `CLIENT.licenseNumber` and `CLIENT.serviceArea` in browser console match form inputs.
- [ ] **Onboarding checklist polish pass** — ⚠️ flagged for review before August 3rd. Go through all 6 steps as if you're a new contractor. Fix any confusing copy, broken links, or missing Twilio number display issues.
- [ ] **Twilio compliance approval** — pending (emailed trusthub-verify@twilio.com with CP 575B on July 23). Once approved: buy local number, set webhook to `https://tractifyhq.com/api/twilio/missed-call`, set on contractor in admin, test end-to-end.
- [ ] **Service agreement** — simple 1-page terms on intake form. Defines: free trial = 5 booked appointments (not 5 closed jobs), what retainer covers, cancellation terms. Add acceptance checkbox, store timestamp in DB.
- [ ] **Intake form success screen update** — currently shows inline booking for Jose's calendar (onboarding call flow that no longer exists). Needs to reflect the real automated flow. Exact copy TBD — defer until ready to focus on it.
- [ ] **Training videos for contractors** — short screen recordings showing: (1) how to block time slots for jobs booked outside Tractify (phone calls, word of mouth, walk-ins) so double bookings don't happen, (2) how to use the portal day-to-day. Embed in the onboarding checklist or portal help section. Critical before first real contractor — this is their main support resource.
- [ ] **Empty availability alert** — if a contractor's calendar still has zero availability slots set 24 hours after deploy, send an automated nudge email/SMS. Dead calendar = no bookings possible = silent failure. Add to the cron job in `cron.js`.
- [ ] **Real-time booking alert to Jose** — when a homeowner actually books through a contractor's Tractify site, Jose needs to know immediately (not by checking the dashboard). Add a push notification or email alert to `notifications.js` that fires on every new booking during the trial period. This is how Jose monitors whether the machine is working in real time during August.
- [ ] **Contractor portal first-login experience polish** — beyond the checklist, audit what a brand new contractor actually sees on first login. Does it feel like a professional product? Fix anything that looks like a dev tool or feels unfinished. First impression affects checklist completion rate.
- [ ] **Portal help section / FAQ** — every question a contractor might think to ask Jose should be answered inside the portal. This is non-negotiable for keeping Tractify hands-off at scale. Topics to cover: what happens after setup, how long until jobs appear, how to block time for jobs booked outside Tractify, what the channels are and how they work, what happens at job 5, how to contact support. If a contractor is emailing Jose, the portal failed — treat every question as a product gap to close.
- [ ] **AI natural language calendar blocking (post first 3 clients — major friction eliminator)** — contractor opens browser on phone or computer and types or says "got a job Tuesday 2pm, expect it to take 2 hours, block it." The AI parses the message, blocks the time on their calendar, and confirms back. No portal navigation, no clicking around, no learning curve — just a text or voice message. Built for the contractor who hates technology and has been running his business on a phone for 20 years. This eliminates the double booking risk entirely — the barrier to blocking time goes from "learn the portal" to "send a text." Every contractor knows how to send a text. Voice input on mobile means they can do it hands-free between jobs without even opening an app. The AI learns their patterns over time — always 2-hour blocks, never Sundays, "morning" means 9am — and gets faster and smarter the longer they use it. Turns the biggest friction point in the whole product into a competitive advantage no competitor is offering. ServiceTitan has a full desktop portal that requires training. GoHighLevel is even more complex. Tractify has a guy texting from a job site and it just works.
- [ ] **AI chat assistant inside contractor portal (post first 3 clients)** — instead of a direct text/chat line to Jose, embed an AI-powered chat widget in the portal. Contractor types a question, gets an instant answer. Claude with full Tractify context injected handles 95% of what contractors ever ask — checklist steps, how channels work, what to do when something isn't working, what happens at job 5. The 5% it can't handle escalates to Jose on his terms, not reactively. This keeps Tractify fully hands-off at scale while contractors still feel supported. Build after first contractors are live so real questions shape what the assistant is trained on.
- [ ] **Unified AI brain across the entire pipeline (Phase 3 — long game)** — right now each piece of the system operates in isolation. The intake form collects, the worker deploys, the template serves homeowners, the backend runs bookings. Phase 3 connects all of them with shared intelligence. The intake form qualifies contractors in real time before they submit. The worker makes intelligent deployment decisions based on contractor profile — urban contractor with 80 reviews gets different channel prioritization than rural contractor with 10. The template dynamically serves what's converting best across all active sites. Booking data feeds back into intake form prioritization. One continuous learning loop across the entire pipeline — every part talking to every other part, getting smarter as data flows through. Build after the admin brain is live and real data exists to learn from. You can't train a system on data you don't have yet.

**How to build the brain properly as the business grows — the layered approach:**
The brain can't be built all at once. It has to be layered in the right order as real data accumulates:
- **Layer 1 (now — August):** Clean data infrastructure. Booking source tracking, revenue logging, checklist completion status all flowing into the database consistently. This is the training data for everything that comes after. No shortcuts here — bad data makes a dumb brain.
- **Layer 2 (after first 5 contractors):** Admin brain goes live. AI chat in the admin dashboard with full CLAUDE.md context + live database access. Jose starts asking questions and getting answers. Every decision Jose makes gets logged — which contractors got ad spend, what the result was, which channels underperformed. The brain starts building memory.
- **Layer 3 (after 10-15 contractors):** Pattern recognition kicks in. Enough data exists to spot things no human would catch manually — zip code densities converting faster, review counts predicting close rates, checklist completion order correlating with job delivery speed. Brain goes from reactive (answering questions) to proactive (surfacing insights unprompted). "Three contractors haven't had a booking in 5 days — here's what's different about them."
- **Layer 4 (after 25+ contractors):** Predictions replace suggestions. "Last time you put $20/day behind a contractor with this profile in this market, they hit 5 jobs in 6 days." The brain stops learning from individual decisions and starts learning from patterns across the entire portfolio. Intake form qualification becomes automated. Deployment decisions become intelligent. The unified pipeline brain comes online.
- **The north star:** Jose feels like he has a world-class operations team, growth team, and analyst team working 24/7 without hiring a single person. Every hard decision — which contractors to accelerate, where to spend money, what's broken, what's working — gets made faster and smarter because the brain has seen it before.

- [ ] **Unified AI brain across the entire pipeline (Phase 3 — long game)** — right now each piece of the system operates in isolation. The intake form collects, the worker deploys, the template serves homeowners, the backend runs bookings. Phase 3 connects all of them with shared intelligence. The intake form qualifies contractors in real time before they submit. The worker makes intelligent deployment decisions based on contractor profile — urban contractor with 80 reviews gets different channel prioritization than rural contractor with 10. The template dynamically serves what's converting best across all active sites. Booking data feeds back into intake form prioritization. One continuous learning loop across the entire pipeline — every part talking to every other part, getting smarter as data flows through. Build after the admin brain is live and real data exists to learn from. You can't train a system on data you don't have yet.
- [ ] **AI business brain embedded in admin dashboard (Phase 2 — most important feature)** — plug the full Tractify context + live database data into an AI chat interface on the admin side. This is Jose's command center. Instead of manually analyzing contractor performance, Jose asks plain questions and gets instant answers backed by real data: "Which contractors should I put ad spend behind this week?" "Why is this contractor getting zero bookings?" "Which channels are converting best across all active trials?" The AI sees every contractor, every booking, every checklist step, every channel, every job — and helps Jose make every hard decision fast. Which trials to accelerate, which to deprioritize, what's working vs. what needs fixing, where to spend money and where to pull back. Implementation: AI chat widget in the admin dashboard with full CLAUDE.md context injected plus live query access to the PostgreSQL database — contractors, appointments, availability, checklist status, booking sources all fed in real time. This transforms Jose from someone managing a dashboard into someone running a business with an always-on partner that knows every number cold and never sleeps. Build after first contractors are live so real data shapes what questions actually matter.
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
- [ ] Booking source tracking — `booking_source` field on appointments. Know which channels perform. (see Planned Features)
- [ ] Contractor dashboard live stats — jobs this month, revenue this month, total all time, next appointment (see Planned Features)
- [ ] Automatic review request — SMS to homeowner 3 hours after appointment completed (see Planned Features)
- [ ] Intake funnel view in admin dashboard (data collecting, UI not built)
- [ ] Flip bridge ON once first contractor is onboarded (script properties only — no code changes)
- [ ] Google Calendar credentials (deferred — add to Railway when ready)

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
10. Contractor logs in → first-login modal → completes 6-step self-serve checklist

**CONFIRMED LIVE July 25, 2026** — `evergreenhomeheatingandenergy.tractifyhq.com` deployed end-to-end with zero manual steps.

### Jose's only post-deploy decisions
- [ ] Decide whether this contractor gets paid ad spend (selective — not automatic for everyone)
- [ ] If Twilio is approved: buy local number, set webhook, set number in admin → contractor handles forwarding themselves via checklist

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

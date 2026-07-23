# Tractify — Master Context Document
*Last updated: July 21, 2026 (brainstorm session 2).*

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

**The full lead flow (general matching engine path):**
1. Homeowner fills out the lead form on the contractor's Tractify-powered site
2. Tractify receives the lead via the inbound API (API key tied to that contractor)
3. Homeowner gets an email with a personal booking link (48hr expiry)
4. Homeowner picks a time from the contractor's live availability calendar
5. Appointment confirmed — both parties notified, synced to Google Calendar

**⚡ Dedicated contractor path (HVAC template with API key linked to contractor):**
Steps 3-4 above are replaced by inline booking. After form submit, the slot picker appears immediately on the same page. Homeowner books without waiting for an email or leaving the site. The booking link email is suppressed entirely on this path — `POST /api/leads/inbound` returns a `booking_token` + `contractor_id` directly in the JSON response, and the HVAC template uses those to show the calendar inline.

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
CTA: *"Fill out our quick setup form and claim your 5 free jobs."* → intake.tractifyhq.com

**The flow:**
1. Contractor fills out intake form → success screen shows inline slot picker → contractor books 15-min onboarding call (3 days out) → deploy on subdomain in that window → onboarding call → they get 5 free jobs
2. After jobs 2-3: check-in call — let them tell you it's working
3. After 5 jobs: conversion call — $2,000 setup + $800/month retainer
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

**Why the combination is a breakthrough:**
All six channels feed the same booking infrastructure that's already live. Together they create something no competitor is doing — a complete done-for-you demand generation machine:
- Paid ads drive NEW homeowners who've never heard of the contractor
- Missed call text-back captures homeowners who already called and got no answer
- Google Business Profile captures people actively searching right now
- Nextdoor captures neighborhood trust traffic
- Google reviewers re-engage past customers who already love the contractor
- Facebook groups capture homeowners mid-search in real time

The result: a contractor goes live on a Friday. By Monday, jobs are appearing on their calendar from every direction. They didn't share a link, they didn't do anything. Tractify did it for them.

**Why this speeds up the whole business model:**
- 5 free jobs happen in days, not weeks
- Contractor sees value immediately → emotional hook before they've paid a dollar
- Conversion call happens faster → revenue comes faster
- Free trial filters itself: contractors who don't engage self-select out, costs Jose nothing

**The onboarding call sets up ALL of this in under 30 minutes:**
1. Set weekly availability in contractor portal (5 min)
2. Enable call forwarding to Twilio number (2 min)
3. Add booking link to Google Business Profile under "Appointments" (10 min)
4. Post in one local Nextdoor neighborhood + one local Facebook group (5 min)
5. Send booking link messages to top 10-20 Google reviewers (5 min)
6. Jose turns on paid ads targeting their zip codes after the call

**The innovation in one sentence:** Tractify doesn't just give contractors a booking tool — it activates every channel they already have, drives new traffic from multiple directions, and delivers the booked jobs. The contractor just shows up.

**Build status:**
- ✅ Inline booking already live (July 18)
- ✅ Paid ads — no code needed, just a Facebook ad account and budget
- ✅ Missed call text-back via Twilio — built July 21 (see Twilio section below)
- ✅ Google Business Profile, Nextdoor, Facebook groups, Google reviewers — no code needed, done on onboarding call

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
This is the piece that makes everything else click together. One template + variable substitution from intake form data = deployment can be fully automated. "Contractor fills out form" to "contractor is live with 6 channels running" with zero human involvement. That's always been the destination — this is what gets you there.

**The constraint IS the product:**
By not offering custom sites, you lock yourself into selling outcomes instead of deliverables. You literally can't sell websites because you don't have a web design service. You only have booked jobs. Every conversation starts and ends there. Not a pitch — just true.

**Why this unlocks the proactive outreach play at scale:**
When you're ready to find contractors, deploy their site, run $20 in ads, and call them with a booked job — you can do it for any niche in minutes. Swap the cover photo. Same form. Same API key flow. Same 6 channels. Same conversion call. The playbook doesn't change per niche, only the photo does. Without this, each new niche is a design project. With this, each new niche is a folder copy.

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

**Current phase:** Content + paid ads — both Jose and Daniel heads down creating content and running paid ads targeting HVAC contractors. Cold calling is retired. The offer is strong enough to convert at scale without it. The goal is to get the offer in front of as many contractors as possible and let the product sell itself.

**Why this is the right move:** Cold calling is 1:1. An ad runs 24/7 and reaches thousands simultaneously. Contractors who respond to an ad are already interested — they're half sold before the 15-minute call even starts. The free trial offer (5 booked jobs, zero risk) is strong enough to stop the scroll and convert. This is how you build a company at scale, not a local service business.

**The funnel:**
Ad or organic content → contractor fills out intake form at `intake.tractifyhq.com` → success screen shows inline slot picker → contractor books 15-min onboarding call (3 days out minimum) → Jose deploys subdomain in that window → onboarding call walks contractor through setting availability + Twilio forward + GBP book button + Nextdoor post + Facebook group post + Google reviewer messages → Jose turns on paid ads after the call → 5 jobs delivered across all 6 channels → conversion call → $2,000 setup + $800/month retainer

**Why the call moved to after the form (July 19 pivot):**
- Sending cold traffic directly to a booking link adds friction — form first converts better
- The intake form is simple enough that contractors self-onboard without needing a call first
- The onboarding call is now a pure setup call, not a sales call — contractor already committed by filling out the form
- 3-day buffer between form submit and earliest call slot gives Jose time to deploy the subdomain, create the contractor account + API key, link it, set allowed_origins, and test end to end
- Jose manages the 3-day buffer through availability settings in the contractor portal — block the next 2-3 days, only show slots from day 3 forward. No code needed.
- The success screen after form submit immediately shows an inline slot picker — contractor books the onboarding call right there without leaving the page. Strikes while they're engaged, no link to click, no new tab.

**The onboarding call gets removed after the first 3 clients (north star):**
The call exists only to manually walk contractors through setup steps. Once the self-serve onboarding flow is built into the contractor portal (see Planned Features), the call is no longer needed and becomes a bottleneck. After first 3 clients prove the process, the call is retired entirely. Contractor fills out form → auto-deployed on subdomain → logs into portal → guided checklist walks them through every setup step themselves, at their own pace, no Jose or Daniel involved. That's the Shopify model and that's what makes scale possible — the bottleneck becomes traffic, not time.

---

## Pricing Strategy (July 21, 2026)

**The core principle:** Price reflects value delivered, not cost to serve. Costs stay flat. Value to the contractor compounds every month.

### Phase 1 — Proving It (First 3-5 clients)
- **Setup fee:** $2,000 (one-time — covers subdomain deploy, contractor account setup, API key, onboarding call, Twilio setup)
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
Content → inbound contractor books call → onboard on free trial → deliver 5 jobs → contractor converts → case study auto-generated from system data → better content → more contractors → repeat. Every case study makes the next ad more powerful. The 5 free trial clients aren't just the first clients — they are the ad creative for every client after them.

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
- The sales call opener never changes: *"Before I say anything — you just booked this call the exact same way your customers are going to book jobs with you. That's the whole product right there."*

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

### 4. Automatic Review Request After Completed Appointments
After every appointment is marked complete, Tractify automatically texts the homeowner 3 hours later:
*"Hi [Name], thanks for choosing [Business Name] today — if everything went great, a quick Google review would mean the world to them: [direct review link]"*

The direct review link (not just the GBP URL — the link that opens the review box immediately) is stored on the contractor's profile. One tap, review box is open.

**The compound loop this creates:**
More reviews → higher Google rating → better placement in "HVAC near me" searches → more organic GBP traffic → more jobs through Channel 3 with zero ad spend → more Tractify value → more painful to leave. The review request feeds directly back into the channel system. It also shows in the contractor portal ("Reviews requested: 14") and monthly results report — Tractify silently building their reputation while they work.

**Implementation:** Store Google review link on contractor profile. Add cron trigger 3 hours after appointment status flips to "completed." Send SMS via Twilio.

### 5. Monthly Results Report (Auto-Generated)
At the end of each month, Tractify automatically emails each contractor a results summary:
- Jobs booked this month
- Missed calls recovered
- Reviews requested (and Google rating if trackable)
- Revenue generated (from outcome logging)
- Close rate
- Month-over-month comparison

Zero manual work. Fully automated. Runs on node-cron at end of month. Makes the value of Tractify visible every single month — the contractor gets proof delivered to their inbox whether they logged in or not. Pure retention tool.

### 6. Contractor Referral Program
Each paying contractor gets a unique referral link. When another contractor signs up through that link AND converts to a paying client (not just free trial), the referrer gets one month of retainer free.

- Reward is conversion-only — not free trial signups. Prevents gaming.
- Turns every happy client into a sales channel automatically.
- HVAC contractors talk to each other constantly. One happy client in a market can unlock the whole market.

### 7. Broadcast SMS + Seasonal Campaigns
*(See Idea 4 above for full details)*
Build after first 3 paying clients are stable. Requires A2P 10DLC registration through Twilio before any bulk sends.

### 7. Self-Serve Onboarding Flow (Removes the Call Entirely)
After the first 3 clients prove the manual process, build a guided setup checklist inside the contractor portal. This is the Shopify model — contractor logs in for the first time and sees a step-by-step flow instead of a blank dashboard.

**The checklist steps (everything currently done on the onboarding call):**
1. Set your weekly availability (already exists in portal — just needs to be surfaced as step 1 with a prompt)
2. Enable call forwarding to your Twilio number (step-by-step instructions with iPhone/Android screenshots, carrier-specific guides)
3. Add your booking link to Google Business Profile under "Appointments" (screenshots, exact steps)
4. Post in a local Nextdoor neighborhood (suggested copy they can paste, link to Nextdoor)
5. Post in a local Facebook community group (suggested copy, instructions)
6. Message your top Google reviewers (template message ready to copy-paste, instructions on finding them)

**UX details:**
- Progress tracker: "3 of 6 setup steps complete"
- Each step has a "Mark as done" checkbox
- Automated follow-up email if steps aren't completed within 48 hours
- Steps are explained well enough that a non-technical contractor can do all of them without calling anyone

**Why this is the most important scale unlock:**
Once this is built, the onboarding call is gone. Contractor fills out form → auto-deployed on subdomain → receives portal login → completes checklist at their own pace. Jose and Daniel are completely out of the onboarding process. The bottleneck shifts from "how many calls can we do" to "how much traffic can we drive." That's when 50 clients a month becomes operationally possible.

**Build after:** First 3 clients onboarded manually. Use those 3 to document exactly what the call covers, then encode every step into the checklist.

### 8. Subdomain Auto-Deploy
After the self-serve onboarding checklist is built, automate the subdomain deployment itself. Form submission triggers: auto-create contractor account → auto-generate API key linked to that contractor → auto-deploy subdomain via Cloudflare Pages API → auto-set CNAME in Cloudflare DNS → auto-email contractor their portal login. Zero human involvement from form submit to contractor going live. This is the final piece that makes the full pipeline hands-off.

**Build after:** Self-serve onboarding flow is live and proven with 3+ clients.

### 9. The Proactive Outreach Play
*(See Scaling Plan below for full details)*
Phase 3 only — after full onboarding automation + 5-10 paying clients. Find contractor, deploy subdomain automatically, spend on ads, call them with a real booked job. Close rate near 100%.

---

### Cold Calling (Retired July 18, 2026)
Cold calling served its purpose — it proved the pitch, sharpened the script, and identified the pain points contractors actually have. That foundation now lives in the content. The script still exists in `Tractify-Sales-Script.docx` for reference. The offer and the opener are still the same — they just get delivered through content now instead of a phone.

---

### Team Structure (August 2026)
- **Jose** — product, strategy, content creation, paid ads, building
- **Daniel** — co-founder and equal partner (50/50 ownership). Content creation, distribution, community engagement in contractor groups.
- Both heads down on content and ads all of August. This is the do-or-die month — generate revenue or go back to jobs. The product is real, the offer is real, the funnel is real. August is about getting it in front of as many contractors as possible.
- **North star for all decisions:** take Jose and Daniel out of the picture. Every system, every feature, every process should move toward full automation. If something requires one of them to do it manually at scale, it needs to eventually be automated or eliminated.

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
- Each contractor can have a `booking_slug` (e.g. `'book'`) set in the DB
- `tractifyhq.com/schedule/book` loads `DirectBooking.jsx` which looks up the contractor by slug
- Visitor fills out name + email + phone (required) + optional notes
- Picks date/time from the contractor's live availability
- Books via `POST /api/bookings/book-direct` — creates appointment with `lead_id = NULL`, sends branded emails to both parties via notifications.js
- No lead, no token, no email step — fully self-contained

**Jose's slug:** `book` → `tractifyhq.com/schedule/book` ✅ LIVE (display name = "The Tractify Team")

**Use case:** Jose texts this link to every prospect after a cold call. They book the 15-min setup call. He opens with: "You just booked this call the exact same way your customers will book jobs with you."

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

**Inline booking on HVAC template shows demo/fake slots instead of real availability**
→ Two causes: (1) API key is not linked to a contractor — go to Admin → API Keys, edit the key, set the Contractor field. Without this, `contractor_id` is null in the API response and demo mode runs. (2) CORS not configured — `/api/availability` and `/api/bookings/book` must have wildcard CORS set in server.js (already done July 18).

**Inline booking shows "No openings in the next 2 weeks"**
→ API key IS linked to a contractor but the open-slots fetch is failing. Check: (1) CORS headers in server.js, (2) contractor has weekly availability set in the portal, (3) fetch URL uses `TRACTIFY_API = 'https://tractifyhq.com'` (not the old Railway URL).

---

## Launch Status (as of July 20, 2026)

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

**Remaining — must do before first client:**
- [ ] ⚠️ Twilio compliance approval (pending — up to 48 business hours from July 21). Once approved: buy local number, set webhook, test end-to-end flow (call from another phone, don't answer, verify SMS arrives with booking link)
- [ ] ⚠️ Jose set availability in contractor portal (currently only Monday 9–12 set — expand before clients)
- [ ] UptimeRobot monitoring — 15 min setup. Ping /health every 5 min, SMS alert if down. Free tier.
- [ ] Railway database backups — requires Railway Pro plan ($20/month). Do NOT upgrade until first paying client. Once first client pays, upgrade to Pro and enable backups immediately.
- [ ] Service agreement — simple 1-page terms on intake form. Defines: free trial = 5 booked appointments (not 5 closed jobs), what retainer covers, cancellation terms. Add acceptance checkbox to intake form, store timestamp in DB.
- [ ] Full end-to-end test with a real contractor before any client goes live (see test steps below)

**Remaining — must do before first client converts (not day 1 blocking):**
- [ ] Stripe integration — contractor conversion must be self-serve. Job 5 milestone trigger → Stripe payment page → $2,000 setup fee → system flips them to paid automatically. No manual invoicing at scale.
- [ ] Job milestone trigger (job 3 + job 5) — portal notification + email, data-aware messaging (see Planned Features)
- [ ] Revenue + outcome logging — "Did this job close? How much?" after each completed appointment

**Remaining — makes the business smarter (build in parallel):**
- [ ] Booking source tracking — `booking_source` field on appointments. Know which channels perform. (see Planned Features)
- [ ] Contractor dashboard live stats — jobs this month, revenue this month, total all time, next appointment (see Planned Features)
- [ ] Automatic review request — SMS to homeowner 3 hours after appointment completed (see Planned Features)

**Remaining — post first 3 clients:**
- [ ] Self-serve onboarding checklist (replaces onboarding call — see Planned Features)
- [ ] Subdomain auto-deploy (see Planned Features)
- [ ] Intake funnel view in admin dashboard (data collecting, UI not built)
- [ ] Flip bridge ON once first contractor is onboarded (script properties only — no code changes)
- [ ] Google Calendar credentials (deferred — add to Railway when ready)

---

## ⚠️ Client Go-Live Checklist (HVAC Pipeline Bundle)
**Run through this every single time you onboard a new HVAC client. Do not skip steps.**

**New onboarding flow (July 19):** Contractor fills out intake form → success screen shows inline slot picker → contractor books onboarding call (3 days out minimum) → Jose does steps 1-8 below in that window → onboarding call walks contractor through availability setup + Twilio forward.

### Free Trial Setup (subdomain — no domain purchase)
1. [ ] Contractor submits intake form at `intake.tractifyhq.com` — their info comes to you via email + R2
2. [ ] Edit CLIENT config in `~/Desktop/hvac-template/index.html` with client info from the form
3. [ ] Deploy to a new Cloudflare Pages project → note the `.pages.dev` URL
4. [ ] In Cloudflare DNS, add CNAME: `[clientslug]` → `[their-pages-project].pages.dev`
   - Client is now live at `clientslug.tractifyhq.com`
5. [ ] Create contractor account in Tractify admin → Contractors → Add Contractor
6. [ ] Create API key in Tractify admin → API Keys → New Key
   - Name: client's business name
   - Source slug: their subdomain slug
   - **Link to their contractor account** ← required for inline booking to work
   - **⚠️ Set `Allowed Origins` to `https://clientslug.tractifyhq.com`**
7. [ ] Copy the generated API key — shown once only
8. [ ] Paste the key into `tractifyKey` in the CLIENT config, redeploy to Cloudflare Pages
9. [ ] On the onboarding call: walk contractor through setting weekly availability in the portal
10. [ ] On the onboarding call: have contractor forward their number to Twilio number (2 min)
11. [ ] On the onboarding call: add booking link to Google Business Profile under "Appointments" (10 min)
12. [ ] On the onboarding call: post in one local Nextdoor neighborhood + one local Facebook group (5 min)
13. [ ] On the onboarding call: send booking link message to top 10-20 Google reviewers (5 min)
14. [ ] After the call: Jose turns on paid Facebook/Instagram ads targeting their zip codes ($5-10/day)
15. [ ] Test: submit the lead form → inline slot picker should show with real slots → book a test appointment
16. [ ] Send contractor their portal login

### Conversion (paid — real domain)
1. [ ] Buy their real domain
2. [ ] Add as custom domain in the existing Cloudflare Pages project (same project, no redeploy)
3. [ ] Update `allowed_origins` in the API key to include the real domain
4. [ ] Charge $2,000 setup + $800/month retainer
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
- **Get first client jobs fast:** All 6 channels activated on the onboarding call — paid ads, missed call text-back, Google Business Profile, Nextdoor, Google reviewers, Facebook groups. 5 jobs in 48-72 hours for the right contractor.
- **New niches:** Add contractors under different niches — matching engine handles routing automatically
- **New cities:** Add contractors with their service zip codes — same paid ad playbook per market
- **Email campaign:** After 2-3 case study results exist, run cold email via burner domain + Instantly.ai to scale contractor acquisition. Never send from tractifyhq.com.
- **Payments:** Add Stripe to charge contractors $2,000 setup + $800/month retainer at conversion
- **Missed call text-back as standalone SaaS:** Eventually pitch to contractors who don't want a full site — pure Twilio play, works with any existing website
- **Broadcast SMS + seasonal campaigns:** Contractors text their existing customer list — seasonal promos, re-engagement blasts, booking reminders. Seasonal campaigns run automatically on Tractify's schedule. Both built on the same Twilio infrastructure.
- **Monthly results report:** Auto-generated report sent to each contractor at end of month — jobs booked, missed calls recovered, estimated revenue generated. Pure retention tool. Makes the value of Tractify visible every single month. Build into the product — everything automated, no manual work.
- **Contractor referral program:** Each paying contractor gets a referral link. When another contractor goes through the free trial AND converts to paid, the referrer gets one month of retainer free. Reward is only on confirmed conversions — not free trial signups. Turns every happy client into a sales channel automatically.
- **The proactive outreach play (Phase 3 — after automation + 5-10 paying clients):** Find a contractor who hasn't heard of Tractify. Deploy their subdomain automatically. Spend $20 on ads targeting their zip codes. When a real job books, call them: "We just booked you an appointment — customer's name is X, they're scheduled for Y. Want us to keep going?" They never filled out a form. They never got on a call. The product already worked before they knew it existed. Close rate on that conversation is near 100% — there's nothing to decide. **Timing is critical:** this play only works once onboarding is fully automated (zero manual setup time per attempt) and after 5-10 paying clients are generating revenue to fund the ad spend and case studies to back it up. At that point the cost per attempt is $20 and an hour of time. No one in this industry is doing this. When it's ready it changes everything.

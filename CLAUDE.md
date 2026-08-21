# Tractify — Master Context Document
*Last updated: August 21, 2026 (session 29 continued once more, still later the same night — the real root cause behind every "schedule doesn't save" symptom tonight was finally found, via Railway Deploy Logs Jose pulled up directly rather than another guess-and-patch cycle. The logs showed the exact production error firing on every single call: `[SMS-AI] update_availability_slot error: null value in column "id" of relation "availability_slots" violates not-null constraint` — immediately followed, in the very same log window, by the AI sending Marios Landscaping a fully confident "Got your service area and hours locked in — Monday through Friday 8am to 5pm, closed weekends" message. This is more fundamental than either of the two fixes filed just before it (task #39's `complete_setup_step` verification gate, and the `max_tokens` truncation fix) — those were both real and worth keeping, but neither was the actual reason nothing was saving. The real bug: `update_availability_slot`'s INSERT statement in `smsAI.js` omitted the `id` column entirely — `availability_slots.id` has no DB default and is `NOT NULL`, so every single call failed silently at the database layer, was caught, and the tool_result returned to Claude never surfaced this failure clearly enough to stop the AI from still narrating success afterward. Checked the rest of the codebase for the same mistake via `grep -n "INSERT INTO availability_slots"` across all three call sites — `routes/availability.js` and `contractorSignup.js`'s `seedAvailability()` both already correctly generate an `id` via `uuidv4()` before inserting; `smsAI.js` was the only offender. Fixed by adding `id: uuidv4()` to the INSERT (uuid's `v4` import was already present at the top of the file, used nowhere near this bug until now):
```js
// id has no DB default and is NOT NULL — omitting it here was the
// actual root cause of every SMS-driven availability change silently
// failing (confirmed live via Railway logs: "null value in column
// 'id' ... violates not-null constraint" on every single call).
// contractorSignup.js's seedAvailability() already generates one
// via uuidv4() for the initial intake-time seed — this INSERT just
// never matched that pattern.
await db.query(
  `INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time, is_active)
   VALUES ($1, $2, $3, $4, $5, 1)`,
  [uuidv4(), contractorId, day_of_week, start_time, end_time]
);
```
Verified via `node --check backend/services/smsAI.js` — passed clean. This is the single most consequential fix of the night: task #39's verification gate (requiring at least one real row in `availability_slots` before `complete_setup_step` can mark availability done) was a correct and worthwhile safety net on its own, but without this fix underneath it, that gate would have permanently blocked every contractor from ever completing the availability step, since the underlying save was silently failing 100% of the time regardless of how the contractor answered. Filed as its own item, task #41, distinct from task #39 despite touching the same feature. Pushed live and **re-verified for real the same night** — Jose picked up exactly where Marios Landscaping's test had stalled (a multi-day hours correction: "Wait actually I'm closed Monday Tuesday wensday the other days I'm 9am to 5pm"), and this time the AI correctly asked about the remaining days (Thursday/Friday/Saturday) in one message instead of looping, confirmed once he answered "Yeah those are all 9-5" with "Perfect! Your schedule and service area are all set," and — critically — a screenshot of the real admin "View Calendar" impersonation view for Marios Landscaping showed Thursday/Friday/Saturday toggled ON at 9:00 AM–5:00 PM and Sunday/Monday/Tuesday/Wednesday correctly toggled OFF, matching exactly what was said over text. The gap between what the AI claims and what's actually in the database — the entire failure mode from earlier tonight — is closed and confirmed closed with a live side-by-side. Two other fixes from tonight's batch were incidentally confirmed live in the same screenshot set: the power message fired immediately after availability was confirmed and now says "it's blocked" (not "held" — task #20's fix, live), and the `set_business_phone` question ("Is (425) 309-9782 the number your customers call, or do you have a different business line?") fired correctly as the very next step before any call-forwarding instructions were given — that question's answer isn't shown yet in what Jose shared, so the business-phone branch and the `send_forwarding_code` tool (task #21) are still first-verification-pending, not yet confirmed live.) *Last narrative entry before this — August 21, 2026 (session 29 continued once more, later the same night — Jose confirmed the earlier max_tokens/manual-hours fixes were pushed and live, then kept testing and hit two more real issues plus asked to finally clear every remaining item sitting on the fix list instead of letting things linger. (1) Live-confirmed and fixed: `complete_setup_step` could mark the availability step "done" — and have Brain 2 tell the contractor "your service area and schedule are locked in" — without any real rows ever landing in `availability_slots`. Root cause: `complete_setup_step` only ever flipped a JSON flag on `contractors.onboarding_steps`; it had zero coupling to whether `update_availability_slot` had actually run/succeeded that turn. Confirmed via Jose's own admin "View Calendar" impersonation of the live contractor mid-test — the Weekly Schedule view showed every day toggled off while the SMS thread claimed it was all set. Fixed by adding a verification gate: `complete_setup_step` now refuses `step_key='availability'` unless at least one real row exists in `availability_slots` for that contractor, and returns an error tool_result telling the AI to actually save first instead of letting it repeat a false "locked in" message. Filed as task #39 for live re-verification next test — the fix is code-level only right now, not yet re-run against real Twilio traffic. (2) Jose then clarified a standing instruction for the rest of the night: when he says "fix it," that means clear everything sitting on the pending list, not just the one item just discussed — filed bugs shouldn't linger indefinitely once there's time to actually build them. Cleared every remaining pending item from the list in this pass: task #20 ("held" → "blocked" in the power message, one-word copy fix). Task #21 (send call-forwarding dial codes as their own standalone SMS) — built properly rather than just as a wording change: added a new `send_forwarding_code` tool that computes the AT&T/T-Mobile or Verizon code deterministically server-side from the contractor's real Tractify number and fires it as its own separate Twilio message ~1.5s after the main reply, instead of trusting the model to type the exact code correctly inline — this also closes off a recurrence risk of task #19's original "wrong code" bug, since the code no longer comes from model generation at all. The `twilio` step's guide text was rewritten to call this tool the moment device=iphone + a real carrier is known, instead of writing the code itself. Task #22 (delay the forwarding-test call ~10s + make "don't answer" explicit) — `forwardingTest.js`'s `startForwardingTest()` now wraps the actual `client.calls.create()` in a `setTimeout(..., 10000)` instead of firing immediately, and the `twilio` step's guide text now has Brain 2 say "Give me about 10 seconds, I'm going to test that myself — don't answer if you see a call come in, that's just the test" before calling `run_forwarding_test`. Task #38 (no-schedule availability step asking day-by-day instead of the whole week) — live-confirmed the exact failure mode Jose flagged: he said "I'm closed Monday" and it just moved on to asking about Tuesday next instead of asking for the full week in one message, burning a turn per day. Rewrote the "No schedule set" branch of the availability guide to ask for the whole week up front in one message, only falling back to asking about a specific day if the contractor's answer left something genuinely ambiguous. All touched files (`smsAI.js`, `forwardingTest.js`) verified via `node --check`. Not yet committed/pushed — same sandbox git-lock workflow, Jose needs to run the usual manual commands from his own Terminal. The still-outstanding fresh live end-to-end retest now needs to specifically re-exercise: a multi-day hours change actually persisting before the step is marked done (task #39), the new standalone forwarding-code text message, and the 10-second delay + explicit "don't answer" wording on the test call — none of tonight's fixes have been run against real Twilio traffic yet.) *Last narrative entry before this — August 21, 2026 (session 29 continued yet again — Jose ran a fresh live end-to-end test starting from a clean manual-entry contractor (Marios Landscaping, skipping the Google Places lookup) and hit two more real, live-confirmed bugs, both fixed same session and both must go out with the next push. (1) The intake form's hidden hours fields (`hoursRaw`) had hardcoded placeholder values baked directly into the HTML (`value="7:00 AM"` etc) and the payload-construction JS also `||`-defaulted to the same placeholders — so a manual-entry signup with zero real hours data still submitted a full, confident-looking schedule. Brain 2's availability-confirm step then read that fabricated schedule back to the contractor as if it were real ("You're currently showing Monday through Friday 7am-7pm...") instead of admitting it had nothing on file. Fixed at the source: the hidden inputs now start genuinely empty, and the payload no longer backfills placeholder strings — real hours only ever get in there via `applyGoogleHours()` when a real Places listing was actually selected. `contractorSignup.js`'s `seedAvailability()` already correctly no-ops on any day that doesn't parse, so no server-side change was needed there; the existing `liveScheduleText === 'No schedule set'` fallback already used elsewhere in smsAI.js's prompt now actually gets exercised for these contractors. Wired a matching branch into the `availability` step's guide text in `buildStepGuides()` (smsAI.js) — when there's truly no schedule on file it tells the AI to ask for hours from scratch, day by day, instead of trying to confirm hours that were never real; `buildStepGuides()`'s signature gained a `liveScheduleText` parameter (defaulted to `'No schedule set'`) so this branch is reachable from both call sites, including `getNextStepPromptForContractor()` (used by forwardingTest.js's background notify path), which didn't previously fetch availability_slots at all and now does. (2) The bigger one — mid-test, Jose replied to the availability-confirm question with a real multi-day change ("Closed saturdays, Monday to Friday I'm open 9-5") and the conversation stalled: got back "Got it! Give me just a second and text me again if you don't hear back shortly." and then genuinely nothing, no matter how long he waited. Root cause: `update_availability_slot` only updates one day per call, so a change like that requires Claude to emit 6 separate tool_use blocks (Mon-Fri + Sat) in a single turn — and both `client.messages.create()` calls in handleContractorSms's tool loop were capped at `max_tokens: 300`, nowhere near enough room for 6 tool_use blocks plus a closing sentence. When generation got cut off mid-turn, the response came back with `stop_reason: 'max_tokens'` instead of `'tool_use'` — and the while loop only continues on `'tool_use'`, so the tool calls in that truncated response were never processed at all (nothing saved, silently) and the code fell straight to the hardcoded fallback string. That fallback text was itself misleading on top of the underlying bug — nothing in the codebase schedules any kind of automatic retry or follow-up text, so "text me again if you don't hear back shortly" was a promise the system had no way of keeping; the only thing that ever moves the conversation forward is the contractor manually texting in again, which is exactly what Jose had to do. Fixed both: `max_tokens` raised from 300 to 1024 on both calls (enough real headroom for a full multi-day change in one turn), and the fallback string rewritten to `"Didn't quite catch that — mind sending it again?"` so it stops implying an automatic follow-up that was never real. This is a real, still-open class of risk worth flagging even after the immediate fix: any sufficiently large single-turn tool-use batch could still in principle hit even the new 1024-token ceiling (e.g. a contractor rattling off a much longer list of changes) — 1024 was sized to comfortably cover the worst realistic case observed (6 tool calls) with real margin, not proven as a hard ceiling for every conceivable input. Both fixes verified via `node --check` (smsAI.js) and a Python script extracting and syntax-checking the intake form's inline `<script>` block. Not yet committed/pushed — same sandbox git-lock workflow as always, Jose needs to run the usual `rm -f .git/index.lock .git/HEAD.lock` + `git add -A` + commit + push from his own Terminal, this time bundled together with the previous entry's uncommitted phone-reuse-leak fix since neither got pushed before this round of testing restarted. New task filed and closed same session: task #37 (manual-entry hours defaulting). The still-outstanding fresh live end-to-end retest — now including this session's own two fixes — remains the real bar nothing in this file has fully cleared yet.) *Last narrative entry before this — August 21, 2026 (session 29 continued once more — the last item filed by the state-machine audit, the phone-number-reuse stale-session leak in getLastConfirmedBooking (task #36), was picked (Jose: "what do you think is best ill let you make the call then build it out now") and built same session. Chosen fix combines two layers rather than relying on either alone: (1) getLastConfirmedBooking now only considers a prior booking "returning" if it happened within the last 180 days (`updated_at > NOW() - INTERVAL '180 days'`) — rough padding over how long carriers typically quarantine a recycled number before reassigning it, with a comment explaining this alone doesn't fully solve the risk since a same-day shared household phone isn't touched by any time bound. (2) A new session state, `awaiting_address_confirm`, sits between session start and `awaiting_service` for any homeowner flagged as returning — instead of silently trusting the pre-filled name/address and skipping straight to "what's going on," Brain 3 now explicitly asks "still at [address]?" before that address is ever used for a real dispatch, and a new `handleAddressConfirm()` handler in homeownerSmsAI.js processes the reply: a clear yes advances to awaiting_service unchanged; a reply that looks like a real address (contains a digit, length > 6) is treated as a correction — re-runs the same isInServiceArea() check a fresh address would get, patches the lead record if one exists, and advances; anything else (a bare "no," confusion, etc) falls back to plain state `awaiting_address` and asks the address question outright, letting the normal handleAddress() extraction path take it from there on the next reply. startHomeownerSession()'s returning-homeowner INSERT now sets state to `awaiting_address_confirm` instead of `awaiting_service`. All three "returning homeowner" greeting strings in twilio.js (`/missed-call`, the `/inbound-sms` unsolicited-text path, and the `/test-sms` simulator) were updated in parity — each now says "Great to hear from you again — still at [address]? Reply YES or send the correct address" instead of jumping straight to "what's going on this time?" This closes the actual harm (a stranger's old address getting used for a real truck dispatch) regardless of which root cause produced it — recycled number or shared phone — since neither one survives an explicit confirmation step. Both homeownerSmsAI.js and twilio.js verified via `node --check` after the edits. Separately, Jose pushed back on the earlier claim that Twilio webhook idempotency "wasn't a five-minute fix" given how fast it actually got built — worth the honest distinction: the general problem (full exactly-once processing under all failure modes) is genuinely hard, but Twilio's actual retry shape is narrow (same MessageSid/CallSid resent), so the fix only needed one table + one atomic INSERT-ON-CONFLICT check, not a broader idempotency system. To back that up empirically rather than just asserting it, ran a real concurrency stress test against a throwaway embedded Postgres instance (same technique as session 27's Twilio-pool verification) using the exact `claimWebhook()` SQL from twilio.js: sequential retries of the same sid (realistic Twilio behavior) — 1st claimed, next 3 correctly rejected as duplicates; 25 truly simultaneous requests carrying the same sid (harder than Twilio would ever actually produce) — exactly 1 of 25 claimed, the rest correctly rejected, proving the primary-key constraint gives atomicity with no timing window regardless of how hard it's hit; 25 concurrent requests with 25 different sids — all 25 claimed, confirming normal traffic is never falsely blocked; simulated a DB outage mid-check — claimWebhook correctly failed open (returned true) rather than silently dropping a real inbound message. All four results matched the intended design exactly. This was a code-level concurrency test only — it did not touch the live server process, the real `/inbound-sms` route, or actual Twilio infrastructure, so the still-outstanding live end-to-end retest (see below) remains the real bar this hasn't cleared yet. Task #36 is now closed; every item from the state-machine audit two sessions ago is fixed except task #29's low-priority aiChat.js parity note (already filed separately, not urgent) — the audit's full backlog (webhook idempotency, phone-reuse leak) is done. Still not committed/pushed from the sandbox as of this entry — same recurring git-lock workflow applies, Jose needs to run the usual `rm -f .git/index.lock .git/HEAD.lock` + `git add -A` + commit + push from his own Terminal. Still pending, unchanged: task #5, #20, #21, #22, and the still-outstanding fresh live end-to-end retest of every fix made across the last several sessions — none of the state-machine-audit fixes (including this one) have been exercised against real Twilio traffic yet, only syntax-checked and logically reasoned through.) *Last narrative entry before this — August 20, 2026 (session 29 continued — Jose asked for a deliberate, systematic bug-hunting pass instead of relying only on live-test discovery, after the service-area radius fix raised the question "is there anything else huge like that." Two read-only audits run in parallel: (1) a full field-parity check tracing every field the old pre-pivot 4-step intake form used to collect against what the new single-screen form + SMS-only onboarding drip actually replaces — came back clean, no new instance of the zip-code bug class found; the service-area/radius fix already holds up across every consumer (isInServiceArea, matchingEngine's contractorServesZip, both set_service_zip_codes tool copies), and everything else the old form used to collect (contact name/email, branding, headline, About text, services/brands chip pickers, review score/count, years in business, Google URL, social links, logo/cover uploads, design mode) was confirmed fully and correctly deleted with zero dangling references anywhere in the codebase, not silently orphaned — that whole per-contractor website template genuinely doesn't exist anymore post-pivot, it wasn't half-killed. (2) A full line-by-line pass of the Brain 2 (smsAI.js) and Brain 3 (homeownerSmsAI.js) state machines, plus twilio.js's routing and bookings.js for comparison, hunting specifically for race conditions, fail-open blind spots with no logging, dead-end states, input-validation gaps, and cross-implementation drift between smsAI.js and its parallel portal-chat cousin aiChat.js. This pass found five confirmed, real bugs, all fixed same session: (1) aiChat.js had the identical multi-tool_use-block crash bug already fixed in smsAI.js after a real production 400 (confirmed via Sentry, see session 28) — aiChat.js is a fully separate implementation of the same tool-use agentic loop and never got the same fix; mirrored the exact .filter()-and-resolve-every-block pattern into it (task #29, now closed). (2) Brain 3 could book a homeowner straight past a contractor's configured max_appointments_per_day — every other booking path (bookings.js's /book and /book-direct) already enforced this daily cap, Brain 3's getOpenSlots()/handleSlotPick() never did; fixed by excluding already-full days from the offered slots and adding a race-safe recheck immediately before the INSERT, mirroring bookings.js's existing check exactly. (3) twilio.js's CANCEL-keyword phone-matching SQL was asymmetric — it stripped dashes, spaces, and a literal "+1" from the stored lead phone but never handled a bare leading "1" with no plus sign and never truncated to 10 digits, while the inbound From number was truncated to its last 10 digits; a lead phone stored as "12065551234" (11 digits, no plus — a format this codebase's own history shows it has produced inconsistently) would never match, meaning a real homeowner with a real upcoming appointment could text CANCEL and get told no appointment was found. Fixed by normalizing both sides identically via REGEXP_REPLACE to strip all non-digits and comparing the last 10 on each side. (4) smsAI.js's block_time duplicate-slot guard checked `e.message?.includes('UNIQUE')` to silently skip an expected conflict — that's a SQLite error-string check, and this app runs entirely on Postgres, whose unique-violation message never contains the literal word "UNIQUE"; every real overlap (e.g. a contractor blocking a multi-hour window that overlaps an existing appointment) re-threw instead of being silently skipped as intended, aborting the rest of the block loop and surfacing a raw error string back through the AI. Fixed to check `e.code === '23505'`, the same Postgres error-code pattern already used correctly everywhere else in this codebase (bookings.js, homeownerSmsAI.js). (5) Two of Brain 3's fail-open error branches — isInServiceArea() and the getRelevantKnowledge() RAG lookup — had zero logging on any of their permissive-default paths. This is a deliberate and reasonable policy on its own (never block a legitimate booking over a parsing hiccup or a downed embeddings API), but it's also exactly the blind spot that let the original unbounded-wildcard service-area bug sit invisible in production for weeks — the code never threw, it just silently did the wrong thing. Added console.warn logging to every fail-open branch in both functions (except the expected/common "no data configured yet" case, which stayed silent on purpose) so if either one starts firing constantly in production, it now shows up in logs instead of nobody ever finding out. Two items surfaced by the same audit were filed but not fixed, since both require a real design decision rather than a quick patch: Twilio webhook idempotency (there is no dedup anywhere on MessageSid/CallSid; the inbound-sms handler does up to two sequential Anthropic calls plus a Voyage AI embedding call — with a worst-case retry backoff of 65 seconds — fully synchronously before responding, meaning a slow response under real load risks Twilio retrying the same webhook as a brand-new request, which could double-send a "sorry we missed you" greeting and silently reset an in-progress homeowner session, or re-enter handleSlotPick mid-race on a slot pick), and a theoretical phone-number-reuse stale-session leak in getLastConfirmedBooking (no time bound on the "is this a returning homeowner" lookup, so a recycled or shared phone number's new owner could be greeted by name and have a previous stranger's address pre-filled into a new booking). Jose asked for the webhook-idempotency item to be built next — done, same session. New `twilio_webhook_events` table (sid TEXT PRIMARY KEY, created_at) added via a db.js migration; new `claimWebhook(sid)` helper in twilio.js does an atomic `INSERT ... ON CONFLICT DO NOTHING`, returns true (safe to process) the first time a given MessageSid/CallSid is seen and false on any duplicate delivery, fails open (returns true) on any DB error so a broken dedup check can never be the reason a real inbound message goes unanswered. Wired into both `/missed-call` (checked right after signature validation, before the contractor lookup — a duplicate gets the same polite `<Hangup/>` TwiML already used for the "no active contractor" case) and `/inbound-sms` (same placement, duplicate gets an empty `<Response/>` since the real reply already went out on the first delivery and Twilio doesn't need a second outbound message for the retry). Did not touch `/forwarding-test-status` — that webhook's own dual-race resolution (services/forwardingTest.js) was already confirmed atomic in the same audit that found this gap, no double-fire risk there. Added a daily 2:15am cron prune (deletes twilio_webhook_events rows older than 24 hours — generous padding over Twilio's actual retry window, which is seconds to low minutes) so the dedup table doesn't grow by one row per real inbound call/text forever. All fixes from both audits were committed from the sandbox as usual but require Jose's manual `git push origin main` per the established workflow, including working around the same recurring sandbox git-lock quirk (`.git/index.lock`/`.git/HEAD.lock` un-removable from inside the sandbox on some attempts, resolved by Jose running `rm -f` on his own machine before committing).) *Last narrative entry before this — August 20, 2026 (session 29 — continuation of session 28's first-ever real end-to-end Twilio test, this time with a roofing contractor (Daniel testing as the homeowner via a second real number), which surfaced four more real bugs, all found live and fixed same session: (1) Brain 3's opening diagnostic question was hardcoded HVAC-specific ("AC, heating, or something else?") regardless of the contractor's actual niche — a roofing homeowner describing failing drywall got asked about air conditioning. Fixed with a NICHE_SERVICE_QUESTIONS map (13 niches) in homeownerSmsAI.js and a getServiceQuestion(nicheName) helper, replacing the single hardcoded string. (2) The homeowner's name was leaking into the extracted address field (e.g. "Daniel and 19222 Crown Ridge Blvd" saved as the address) — Claude's own address-extraction call in handleAddress could return an address string that still contained the name even when name was separately parsed correctly. Fixed by strengthening the extraction prompt to explicitly forbid this, plus a regex safety-net that strips a detected leading "{name} and/,/-/: " pattern off the extracted address as a second layer. (3) The customer-facing booking-confirmation email showed the literal placeholder word "there" as the homeowner's Name (session.name || 'there' leaking straight into the template) — fixed by passing an empty string instead and making notifications.js conditionally omit the Name row entirely when blank, matching the existing pattern already used for the optional Address row. (4) The big one, and Jose's explicit instruction, quoted: "so we need the number or ai brain to be smart enough to know which niche the number is set two but also smart enough to filter someone that needs drywall when that number offers roofing and not let them schedule when its a diffretn service they need" — niche-aware phrasing alone (fix #1 above) wasn't enough, because Brain 3 would still happily book an appointment for a service completely outside a contractor's trade. Root cause: handleService committed state='awaiting_slot' and offered_slots to the session BEFORE the Claude diagnostic/clarifying-question call even ran, so the state machine had already locked in "expect a slot number next" regardless of what the AI's own generated reply text said. Fixed by adding classifyServiceScope(nicheName, combinedText) — a dedicated Claude Haiku JSON-classification call returning {scope: 'in_scope'|'unclear'|'out_of_scope', message}, fails open to in_scope on any API error — that now runs and completes BEFORE any state or slot mutation, branching the conversation: out_of_scope politely declines and closes the session with no slots ever offered, unclear asks one clarifying question and stays in awaiting_service (combining the homeowner's prior + new text on their next reply), and in_scope proceeds exactly as before. Separately, task #11 (Brain-3-booked appointments not appearing on the contractor portal's weekly Calendar grid, even though they showed correctly in the Home tab's upcoming-jobs list) was root-caused for real this time — the previous session's to_char() fix was wrong and had caused a live production crash, already reverted. Actual cause, found via careful comparison against schema.sql rather than guesswork: homeownerSmsAI.js's getOpenSlots() was writing appointments.scheduled_time as "HH:MM:00" (with trailing seconds) while every other part of the system — schema.sql's documented format, the normal token-booking generator, and the calendar grid's own hour labels — used plain "HH:MM" with no seconds, so the grid's strict === comparison never matched a Brain-3-booked slot. Fixed at the source (removed the trailing :00) plus defensive .slice(0,5) normalization on both the write-side bookedSet construction in getOpenSlots() and the read-side grid cell-matching comparison in ContractorPortal.jsx, mirroring an existing .slice(0,5) pattern already used nearby for customStart/customEnd, so the grid is now resilient to this class of mismatch even if it's reintroduced elsewhere later. Separately from the live-test bugs, Jose flagged a systemic gap after reviewing what THE PIVOT actually removed, quoted: "we never ask contractors to put in all the areas zip codes they service, not having that were not checking that when the person gives us their adress that they are actually in range and should be booked because that contractors covers that zip code" — confirmed via investigation to be a real, 100%-of-post-pivot-contractors bug: the old 4-step intake form used to collect service-area zip codes explicitly, the new single-screen form dropped that field, and the planned "derive it automatically from the geocoded address" replacement was never actually built — contractorSignup.js has hardcoded service_zip_codes to the wildcard ["*"] for every contractor created since the pivot (both the intake-form path and the waitlist-promote path, since both funnel through the same createContractorAccount()), which made Brain 3's isInServiceArea() check a permanent no-op that silently accepted a booking from any address anywhere. Fixed by adding a new service_area onboarding step to the SMS drip (asked conversationally, same established pattern as every other post-pivot onboarding step, first in the step order since it gates whether a booking should even be accepted), with a set_service_zip_codes tool built in both smsAI.js (the SMS drip) and aiChat.js (the portal's separate Help-chat implementation) for parity, plus ContractorPortal.jsx UI changes consolidating four previously-independently-duplicated hardcoded ['availability','twilio'] required-step arrays into one shared REQUIRED_STEP_KEYS constant so the count/percentage/copy everywhere in the portal stays in sync automatically. Jose immediately caught the obvious remaining hole in that fix, quoted verbatim: "if a contractor says ill go anywhere we still need like a certain radius they are willing to travel because i go anyhwere and theyre in washington mwans someone from oregon can text the number and book and appoiment right?" — correct: the no_limit=true escape hatch still saved a true unbounded wildcard ["*"] with zero distance enforcement, reproducing the exact same unlimited-service-area bug just gated behind one extra conversational step. Fixed by requiring a real radius_miles number from the contractor whenever no_limit is set (both smsAI.js's and aiChat.js's tool schemas and handlers updated in parity, Brain 2's guide text now instructs it to ask "about how many miles from your shop are you willing to drive?" before ever calling the tool with no_limit=true), stored in the existing-but-previously-unused contractors.service_radius_miles column, and enforced in homeownerSmsAI.js's isInServiceArea() (signature changed from (address, service_zip_codes) to (address, contractor) so it has the contractor's own address + radius available) using the already-installed zipcodes npm package — computes real offline mileage between the contractor's business zip and the homeowner's zip via zipcodes.distance(), no new API key, no geocoding infrastructure, no network call, same package matchingEngine.js already depends on elsewhere in the codebase; falls back to a 25-mile default radius if a contractor's radius was somehow never set. Asked directly afterward to audit the whole codebase for "anything else huge like that" — a full audit found one more live instance of the identical bug, in a sibling function: matchingEngine.js's contractorServesZip() (used by the public /get-quote lead form, the external /api/leads/inbound bridge for any API key not linked to a specific contractor, and admin's manual match/reassign actions) also short-circuited '*' to true before its own separate service_radius_miles fallback ever ran — meaning any brand-new contractor (which, per the bug above, is every contractor until they complete the service_area SMS step) could be matched to and sent a lead from literally anywhere in the country through this separate matching path, with not even the 25-mile default the Brain 3 path now has. Fixed identically — the wildcard branch now checks real distance from the contractor's business address via zipcodes.distance() before falling through, and fails closed (returns no match) rather than open if the contractor's address can't be resolved to a zip, since an unmatched lead is recoverable/visible to admin but a wrongly-routed one isn't. The rest of that audit came back clean: contractors.city is never populated by the post-pivot signup flow but nothing anywhere branches on it, purely cosmetic (blank in the admin dashboard until Jose fills it in manually); the "Pending Review" niche placeholder (a contractor who picked "Something else" on the niche dropdown) degrades gracefully everywhere it's touched — generic diagnostic questions, generic scope description, empty RAG knowledge string — rather than throwing or mis-routing, confirmed as intentional pending-review-queue design rather than a pivot regression; place_id gaps (manual "no Google listing" signups, waitlist-promoted contractors) are already null-checked at every consumer (aiChat.js's conditional interpolation, cron.js's review-request query explicitly filtering `place_id IS NOT NULL`); and every old-intake-form-only field with no live use today (services/brands chip pickers, Google review score/count, social links, logo/cover uploads, design mode) belonged exclusively to the now-dead per-contractor website template that THE PIVOT killed outright, correctly abandoned rather than silently defaulted to a placeholder. One low-priority, not-yet-fixed gap flagged by that same audit: aiChat.js (the portal's in-app Help chat) still has no set_business_phone tool, so a contractor asking about call-forwarding through the portal chat instead of texting Brain 2 directly has no way to record a separate business line — only the SMS drip path can do that; filed as a parity gap, same low-urgency bucket as the already-known aiChat.js .find()-vs-.filter() tool_use bug (task #29) since both only affect the less-used portal-chat path, not the primary SMS drip. None of this session's commits (or session 28's) were pushed from the sandbox environment — no GitHub credentials configured there by design, Jose pushes manually from his own Terminal per the established workflow — including working around a recurring sandbox-side git lock (.git/index.lock / .git/HEAD.lock left behind by a crashed or interrupted git process, un-removable from inside the sandbox due to a cross-mount permission quirk) by having Jose run `rm -f .git/index.lock .git/HEAD.lock` on his own machine before each commit/push when it recurred. Still pending, not yet done, unchanged from before this session: task #5 (how-to video links on setup steps, deferred content-production work), task #20 (rewording "held" to "blocked" in the power-message copy), task #21 (sending call-forwarding dial codes as their own standalone, easier-to-copy SMS message), task #22 (delaying the automated forwarding-test call ~10 seconds and making the "don't answer this call" instruction explicit in the confirmation text), task #29 (aiChat.js's .find()-vs-.filter() tool_use parity fix), and — most importantly — a genuine fresh live end-to-end retest of every fix made this session (niche-aware Brain 3 questions, the name/address extraction fix, the scope-check gate, the calendar grid time-format fix, the service-area zip-code collection step, and the radius-bounding fix in both isInServiceArea() and matchingEngine.js's contractorServesZip()) against real Twilio traffic — none of it has been re-verified live yet, only syntax-checked and logically reasoned through.) *Last narrative entry before this — August 19, 2026 (session 28 — Twilio compliance fully cleared end-to-end (Brand, Campaign, Sender, both webhooks, verified emergency address — see STEP 0 in ⚡ PICK UP HERE for full detail) and, for the first time ever, a real end-to-end product test was run through live Twilio infrastructure instead of the /api/twilio/test-sms simulator: a real contractor account (Premier Comfort HVAC, Jose's own real phone) went through the full Brain 2 setup drip, then a second number (Google Voice, simulating a homeowner) texted in and Brain 3 closed a real booking end-to-end — diagnostic response, three real time slots offered, slot picked, appointment created, contractor alerted. The booking loop itself worked. The test surfaced 15 real UX/correctness bugs, all found live and fixed same night (14 of 15 — the 15th, adding how-to video links to setup steps, is deferred content work, not a bug). Full list, in the order found: (1) a genuine production crash — Claude can return multiple tool_use blocks in one turn, and the tool-dispatch loop in smsAI.js only resolved the first one via .find(), leaving the rest unresolved and triggering a real Anthropic API 400 (confirmed via a live Sentry error report) that surfaced to the contractor as a broken "log in at tractifyhq.com" fallback message — fixed by switching to .filter() and resolving every tool_use block in the turn before continuing. (2) Multiple "log in"/"portal"/"dashboard" references were still baked into smsAI.js's fallback strings, directly contradicting the no-login, text-only product positioning — removed. (3) The availability-confirmation drip step was marking itself done based on an earlier unrelated "yes" instead of actually reading the hours back and asking "does that look right?" — rewritten to require an explicit confirmation of the stated hours. (4) The call-forwarding step is the most consequential fix of the night: the original guide told contractors to use iPhone's Settings → Phone → Call Forwarding, which is unconditional — it forwards every call immediately with zero rings, not just missed ones. This silently redirected Jose's real phone line for the entire test (confirmed when a real call from a colleague never rang and wasn't logged as missed). Rewritten twice: first pass gave carrier dial-code instructions but incorrectly claimed Verizon has no conditional-forwarding option at all; corrected via web search mid-session — Verizon supports it too, just via a different, simpler code (*71 + number) than AT&T/T-Mobile's GSM-style code (**61*number*11*20#). Final version: asks device + carrier first, gives the correct code per carrier, has the contractor place one real test call to confirm it only forwards after ringing (not instantly) before marking the step done, includes the turn-off codes (##61# / *73) in case something goes wrong, and warns iPhone iOS17+ users that the "Live Voicemail" feature can silently block conditional forwarding from working. (5) The drip went quiet after each step instead of immediately continuing into the next incomplete step in the same message — fixed. (6) Nextdoor was removed from the setup checklist entirely (Jose's call — most target contractors aren't on it, and requiring a new account isn't worth it at the free-trial stage). (7) Multiple jargon/unexplained phrases flagged live during testing ("I hold it immediately" instead of explaining it prevents double-booking, "map links" with no explanation of what they link to) were rewritten in plain language — this is also where Jose set the standing "idiot-proof" standard now applied to all SMS drip and Brain 3 copy going forward: no assumed prior knowledge, no jargon, explicit escape hatches when the reader might be stuck. (8) Brain 3's slot-offer message ("Reply 1, 2, or 3") never explained what the numbers were for or what to do if none of the times worked — rewritten to explain itself and, if a homeowner says none of the offered times work, actually fetch and offer a fresh batch instead of repeating the same three. (9) A real, separate bug found by comparing dashboard vs. calendar views after the test booking landed: the appointment showed on the Home tab's upcoming-jobs list but not in the correct day cell of the weekly Calendar grid. ⚠️ CORRECTED same night, August 20 — the original diagnosis here was wrong and the "fix" it produced was a live regression, caught within hours via a Sentry alert when Jose reproduced the crash on a fresh intake test: `appointments.scheduled_date` is actually a `TEXT` column (schema.sql confirms — plain `"YYYY-MM-DD"` strings, never a Postgres `DATE` type), so wrapping it in `to_char(a.scheduled_date, 'YYYY-MM-DD')` in the GET /bookings/contractor/:id and admin GET /bookings queries didn't fix anything — `to_char` has no text-argument overload, so it threw `function to_char(text, unknown) does not exist` on every single load of the admin Appointments tab and the contractor portal's calendar for the rest of the night. Reverted both queries back to plain `a.scheduled_date`. The real cause of the original grid symptom is still open — task #11 reopened. Leading theory, not yet confirmed: the calendar grid only fetches appointments for the currently-viewed week (`from`/`to` = `weekStart`..`weekStart+6`), so a booking landing outside that window simply wouldn't appear without navigating to the right week — a UX/scoping question, not a data bug. Do not touch `scheduled_date`'s type or add casts to it again without re-checking `schema.sql` first. (10) The new-appointment alert text sent to the contractor was a raw bullet-style dump (name · phone · date · address) — rewritten into a plain sentence with a formatted, human-readable phone number. (11) Root-caused and fixed a real missing-data bug: Brain 3's address-extraction prompt (handleAddress in homeownerSmsAI.js) has always assumed the greeting asked for "your name and the address," but all three actual greeting strings in twilio.js (missed-call webhook, inbound-sms webhook, and the /test-sms simulator) only ever asked for the address — meaning Brain 3 was never actually capturing a homeowner's name on a fresh conversation. Fixed all three. (12) Phone numbers shown to contractors (in the "jobs today" cheat-sheet listing and the new-booking alert) were raw E.164 strings — added a fmtPhone() helper to both smsAI.js and homeownerSmsAI.js and applied it everywhere a phone number is shown to a human. (13) A final language sweep confirmed no remaining "call us" / "log in" / "portal" references anywhere in the contractor- or homeowner-facing SMS copy — one leftover "Call us" in the CANCEL-keyword error fallback (twilio.js) was also caught and replaced, since telling a homeowner to call a business that misses calls constantly defeats the entire point of the product. Two commits made this session (4dfea7c, 3e72c29) covering all of the above — not yet pushed to GitHub from this sandbox (no push credentials here by design; Jose pushes from his own terminal per the existing workflow). Pending, not yet done: task #5 (how-to video links on setup steps, deferred content work) and an actual real end-to-end retest confirming the call-forwarding fix + calendar grid fix work correctly on real Twilio traffic — tonight's fixes were made and syntax-checked but not yet re-verified live end-to-end the way the original bugs were discovered.) *Last narrative entry before this — August 17, 2026 (session 27 continued again — pricing model reversed back to flat monthly retainer, Jose's final call. Supersedes the per-delivery model locked session 25 (August 12). Same three buckets (grouped by ticket size/frequency, not niche), now priced: bucket 1 (lawn care, pest control, cleaning) $500/month + $600 activation; bucket 2 (HVAC, plumbing, electrical) $1,000/month + $2,000 activation; bucket 3 (solar, roofing, window tinting) $1,800/month + $3,500 activation. Full reasoning per bucket, plus the explicit tradeoff being accepted (retainer caps revenue from the busiest contractors — the exact problem the per-delivery model was built to solve, reintroduced on purpose for pricing simplicity), is under "Pricing — flat monthly retainer + niche-bucketed activation fee, restored" near the top of the file. Key strategic note baked into the reasoning: because retainer revenue doesn't scale with contractor volume the way per-delivery did, the activation fee now has to do more of the CAC-recovery work — each bucket's activation number was sized to realistically cover the cost of an accelerated, real-money ad push behind a promising signup (Track 2-style), so putting paid spend behind winners is never a bet made against future retainer revenue that hasn't arrived yet. The old per-delivery pricing section and the niche-adaptive per-booking rate table are both left intact further down, explicitly marked superseded rather than deleted, since the day-of billing/cancel/reschedule logic in them may get reused if per-delivery billing is ever revisited for a specific bucket. STEP 3 in ⚡ PICK UP HERE updated to reflect the simpler build this creates — flat recurring Stripe subscriptions per bucket instead of day-of per-appointment charging, cutting the original 6-10 day estimate to roughly 3-4. Session 27 (continued once more, later the same day) — landing page finishing pass, declared done by Jose after this round. Section order swapped: "WHAT WE DO" (ONE SYSTEM. EVERY CHANNEL.) is now (01) and "WHO WE ARE" is now (03), with "MARKET INSIGHT" staying at (02) in between — leads with the product mechanic before the founder story. Hero closing line changed from the niche-specific "so you can be at your kid's game instead of your desk" to the broader "So you can be anywhere else." The "It's one system with more doors into it" line was replaced with the less-jargon "Same system. Just more ways for a job to reach it." The Market Insight (02) section was rewritten twice: first pass swapped a plain "27% of business calls go unanswered" stat for a punchier "respond in 5 minutes and you're 100x more likely to reach the customer than if you wait 30" headline (kept the properly-sourced Invoca/HBR 42-hour-average-response stat as the subhead — deliberately did NOT use a commonly-repeated "62% of calls go unanswered" figure after tracing it back to its actual Invoca source and finding it was a misattribution of an unrelated stat); second pass added three supporting cards below the headline (In The Moment / Not About Skill / One Shot) after Jose felt the single-stat section needed more angles — tried icon badges first (rejected, the page already uses icons heavily), then large gradient numerals (rejected, the page already uses numbered PageNumber badges everywhere), landed on inline `<mark>` text-highlighting as the final treatment since it's a pattern not used anywhere else on the page. Footer got real clickable social icons — TikTok (custom inline SVG, lucide-react has no TikTok glyph), Instagram, YouTube, Facebook, all linking to the actual live Tractify accounts — and the "© OMNIANCEGROUP LLC" line was moved to centered at the bottom below the icon row. The Section 07 "Getting Started" illustration (`frontend/public/illustrations/undraw_plug-in_hy0z.svg`) was edited directly at the SVG source level per Jose's request: the monitor's screen rect (previously fill `#2f2e41`, i.e. black) is now the same Tractify brand blue (`#6366f1`) used in the page's gradient system, with the Tractify "T" logo mark centered on it as a base64-embedded `<image>` (no external file dependency, renders correctly regardless of how the SVG is loaded). Session 27 (continued yet again, same day) — the Twilio number pool build (STEP 2a, above) was verified live rather than trusted on read-through, after Jose flagged that he has no way to sanity-check backend changes himself. Built a throwaway local PostgreSQL instance inside the sandbox (via the `embedded-postgres` npm package — installable and runnable with zero root/sudo, works around the sandbox having no system Postgres and no apt access) and booted the real `server.js` against it, then drove the actual HTTP endpoints end-to-end: admin register/login, `POST /api/twilio-pool` number registration, waitlist signup → promote (the real `createContractorAccount()` path), decline, and a manual `twilio_number` override. This caught four real bugs a read-through missed: (1) the "gone dark" cron queried `contractors.payment_status`, a column that existed only in this doc's prose and had never actually been migrated — the job would have thrown silently every night forever; added the missing migration. (2) `addNumberToPool` returned a freshly-generated id even when `ON CONFLICT DO NOTHING` silently no-op'd on a duplicate phone number, handing back an id that pointed at nothing — fixed via `ON CONFLICT DO UPDATE ... RETURNING id` so the real row's id always comes back. (3) The admin add-number endpoint's phone normalization would leave stray spaces/dashes in a number that already had a leading `+` (e.g. `+1 206-555-1234` stored as-is instead of clean E.164), which would silently break exact-match lookups against Twilio's webhook payloads later — rewrote `normalizePhoneNumber()` to always reduce to digits-only before reconstructing. (4) The manual-override consistency guard in `contractors.js` restored `twilio_number` after `releasePoolNumber()`'s side effects but left `sms_welcome_sent` reset to 0 even though the contractor had clearly already been welcomed — could cause a duplicate welcome text on a future pool reassignment; now restores it to 1 in the same guard. All four fixed and then re-verified against the live instance (including a raw DB row check for the `sms_welcome_sent` fix, since the `GET /api/contractors/:id` route's explicit column list — the same recurring pattern flagged elsewhere in this file — doesn't expose that field, so the HTTP-level assertion for it was a false negative even though the fix was correct). One real sandbox quirk discovered and worked around along the way, worth knowing for any future session that needs to spin up a local Postgres the same way: `embedded-postgres`'s package.json `exports` field fails to resolve when required via an absolute path from a process whose cwd is inside one of the mounted project folders (`Cannot find module`, even though the file demonstrably exists) — requiring the compiled entry point directly (`embedded-postgres/dist/index.js`) instead of the bare package specifier sidesteps it. Also confirmed `/tmp` does not reliably persist state (particularly `node_modules` visibility to freshly-spawned background child processes) across separate tool calls in this sandbox — anything needing a background process plus files it depends on has to happen within one call, and even a same-process (non-backgrounded) approach is safer than spawning a child process at all. Session 27 (earlier this same day) — full staleness audit of this file against the actual codebase, requested by Jose after the earlier waitlist-documentation gap raised the question of what else was stale. Found and fixed: the file tree was missing 5 route files (`adminAI.js`, `aiChat.js`, `facebook.js`, `intake.js`, `twilio.js`), 3 service files (`cloudflare.js`, `diagnosticKnowledge.js`, `embeddings.js`), and 2 page components (`PrivacyPolicy.jsx`, `TermsOfService.jsx`); the `niches` table description still listed the original pre-pivot 7-niche seed list and didn't mention the `status` column at all; the `contractors` table was missing ~15 real columns (`twilio_number`, `business_phone`, `place_id`, `acquisition_source`, `requested_niche_text`, Stripe fields, etc); `leads` and `appointments` were each missing several real columns (booking_source, did_close/closed_value, the SMS-cron timestamp columns); the doc claimed a `booking_tokens.abuse_count` column that has never existed anywhere in the codebase — the real reschedule-abuse field is `leads.reschedule_count`; the `brain_context` table (written to by the admin AI brain) was undocumented anywhere in this file; the admin brain's own endpoint (`POST /api/admin/ai-chat`) and the contractor portal's AI chat endpoint (`POST /api/contractor/ai-chat`) were both extensively described in prose but had zero entries in the Key API Endpoints tables, along with a dozen smaller undocumented routes (`/api/niches/public`, the Facebook/Twilio webhooks, `/api/deploy`, admin impersonation, etc); and the Railway env var list was missing `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID` — three secrets the entire Wrangler auto-deploy pipeline depends on. Separately, `hvac-template/CLAUDE.md` had gone badly stale on its own most-important section: "The Intake Form" still described a 4-step form with contact-email/services/brands/ZIP fields and a slot-picker success screen booking a 15-min onboarding call — none of which exist anymore. The actual form (rewritten session 25, THE PIVOT) is a single "Confirm Your Info" screen with just name/phone/address/hours/niche, no onboarding call, no contactEmail field at all. That whole section was rewritten to match the live file, and the pricing/funnel language at the top of that file was pointed at this main doc as the source of truth instead of repeating numbers that go stale fast. Landing page redesign finished and hardened. Found and fixed a real layout-shift bug reported by Jose testing on his phone: illustration `<img>` tags had no reserved width/height so sections visibly grew/collapsed as SVGs loaded, and separately the "Proof Before You Pay" section's animated trial tracker was changing height inside an `items-center` grid row — any height change there re-centered the whole row and shifted the section's top edge every ~10s on a loop. Fixed by giving every illustration its real intrinsic dimensions and by making the trial-complete banner permanently reserve its space (opacity-only toggle, zero height change ever) instead of animating height/margin. Softened hero copy from present-tense product claims to future-tense so the page doesn't state Brain 3 is live when Twilio A2P Brand registration is still blocked (see the new note under ⚡ PICK UP HERE STEP 0). Replaced the "What's Next" roadmap section with a proper FAQ accordion — the objection-handling section the page was missing, now numbered/expandable and matches the rest of the page's icon-badge visual language. Also documented session 26's waitlist system for the first time in this file (it was built and shipped — table, routes, admin tab, `/waitlist` page, `contractorSignup.js` extraction — but never actually written up here): `waitlist_signups` table, `routes/waitlist.js`, `services/contractorSignup.js` (shared account-creation logic used by both the intake form and the waitlist promote flow), `pages/Waitlist.jsx`, and the admin Waitlist tab. This is the real current acquisition path while Twilio Step 0 stays blocked. Session 26 — Twilio Brand creation hit the same EIN/legal-name mismatch as the Business Profile did, even though the profile is now approved — confirmed it's an independent, still-lagging automated check, follow-up sent in the existing ticket thread, waiting on Twilio. Real intake form testing on intake.tractifyhq.com found and fixed the actual pivot-breaking bug: deploy.js was still hard-requiring a contactEmail field the new SMS-first form never sends, silently rejecting every real signup with a 400 — full rewrite removes the email/login requirement entirely, matches THE PIVOT's no-portal-login design. Niche handling reverted from free-text auto-create back to a curated <select> dropdown + manual admin-review queue (Jose's explicit call — free text was silently orphaning contractors from pricing and RAG knowledge with no compliance guardrail). Built the pending-review flow end to end: niches.status column, GET /api/niches/public, contractors.requested_niche_text, admin alert email with an excluded-category heuristic warning, one-tap resolve UI on the contractor card. Also built admin "View Calendar" impersonation (short-lived contractor-scoped JWT, sessionStorage-isolated so it can never corrupt an admin's real session) since post-pivot contractors never get a real password and Jose had no way to verify a contractor's calendar/availability visually. Found and fixed a real CORS bug along the way — /api/niches/public and /api/intake/track were both being silently overwritten by the restricted global CORS middleware because they weren't on its skip-list; same root cause, logged in Common Issues and Fixes so it doesn't recur on the next new public endpoint. Intake form and backend both verified live end-to-end with a real test submission. Session 25 — see the dedicated "⚡ THE PIVOT" section and "⚡ PICK UP HERE" section further down for the full horizontal SMS-first business model rewrite, email routing fix, and Twilio compliance history — those are current and authoritative, this paragraph is legacy narrative kept for continuity. Session 23 — Brain 3 slot pick bug fixed and fully verified end-to-end. Bug was in homeownerSmsAI.js handleSlotPick: PostgreSQL's pg library auto-deserializes JSONB columns into JS objects, so session.offered_slots arrives as a JS array already. The old code called JSON.parse(jsArray) which converts it to "[object Object],[object Object]" via .toString() — invalid JSON — silently caught → offeredSlots = [] → slot never matched → Brain 3 stuck in awaiting_slot re-asking "Reply 1, 2, or 3". Fix: Array.isArray(raw) ? raw : JSON.parse(raw || '[]'). Verified via POST /api/twilio/test-sms full 4-turn conversation — "2" now returns "Confirmed! Evergreen Home Heating and Energy will be there at 1234 Maple Ave Bellevue on Wed, Aug 5 at 8:30 AM" + state: awaiting_email. Booking alert email also fired correctly showing channel: sms_brain3 and job progress. Brain 3 is fully working end to end and ready for real Twilio traffic the moment compliance clears. Session 22 — SMS test endpoint built: POST /api/twilio/test-sms (admin-protected, simulates Brain 2 + Brain 3 full conversations via curl/Postman without Twilio credentials). Session 22 strategy decisions locked: social media post monitoring evaluated and deferred, multi-brand obfuscation strategy evaluated and rejected, content principle locked (show results never the recipe). Session 21 — RAG knowledge expanded to 11 niches: Solar, Water Damage, Tree Service, Lawn Care, Pool Service, and Pest Control seeded into Railway DB. All approved niches in the roster now have Brain 3 diagnostic intelligence. Session 20 — Autonomous capital deployment endgame + automation design constraint locked: every build decision evaluated against whether it feeds autonomous operation at scale. Content automation layer documented — Brain 1 generates strategy/scripts from Brain 3 data, humans deliver on camera, 80% of content automatable. Full endgame in "What Tractify Is" section. Single-number unified intelligence architecture locked (future build): one Tractify SMS number feeds all three brains simultaneously, building a homeowner demand moat as the second compounding data asset alongside the contractor behavioral moat. Full architecture in "What Tractify Is" section. Niche-adaptive pricing model locked. Per-booking rate is now niche-specific, not $75 flat. Two pricing structures defined: per-appointment for one-time/irregular service niches, per-new-client for recurring service niches. Approved niche roster finalized with prices. General Contracting, Garage Door, and Appliance Repair dropped. Solar, Water Damage, Tree Service, Pool Service, Pest Control added. Session 19 — SMS drip fully rewritten + Brain 3 final audit. Session 19 changes: (1) All smsAI.js drip messages rewritten — urgency-first, no soft language, no portal references. Availability step now portal-free: pulls contractor's hours from availability_slots DB at drip time, shows them inline in the text, asks contractor to confirm or text corrections. (2) formatAvailabilityForSms helper added to smsAI.js — formats DB slots into compact readable string for SMS. (3) update_availability_slot tool added to handleContractorSms — DELETE + INSERT pattern lets AI update recurring weekly availability slots entirely over text, no portal login required. (4) Brain 3 final audit — 3 fixes in homeownerSmsAI.js: handleService state race condition fixed (service_description saved first, state only advances to awaiting_slot after confirming slots exist — previously a slot-fetch failure left homeowners stuck in awaiting_slot with empty offered_slots); "We're fully booked — I'll have someone call you" broken promise removed (changed to "Text us again in a few days"); handleEmail confirmation SMS now includes the actual appointment date + time instead of just "check your email." (5) Session 18 — RAG diagnostic knowledge system built and live. Brain 3 audit fully closed: all 5 logic gaps fixed across sessions 17-18. Three Brain 3 fixes this session: (1) getLastConfirmedBooking now covers awaiting_email state so homeowners who book but never reply with their email are still recognized as returning on next contact. (2) Double-booking race condition — 23505 unique_violation now caught in handleSlotPick, re-fetches fresh slots and re-offers instead of returning generic error. (3) facebook.js returning homeowner greeting fixed — uses isReturning flag from startHomeownerSession so returning homeowners no longer get asked for their address again. RAG system built: pgvector + Voyage AI voyage-3-lite (512 dims, NOT OpenAI 1536) for semantic retrieval. Files: embeddings.js (Voyage AI wrapper with 4-retry exponential backoff), diagnosticKnowledge.js (getRelevantKnowledge + storeKnowledgeBatch + clearNicheKnowledge), loadDiagnosticKnowledge.js (one-time seeder — HVAC + Roofing + Electrical + Plumbing + Landscaping knowledge loaded). VOYAGE_API_KEY added to Railway env vars. Expanding to a new niche = DB inserts only, zero code changes. Session 17 — SMS maximization complete. Five major builds: (1) HVAC templates (both index.html + backend/templates/hvac-template.html) stripped to phone-only form — single phone field, submit fires Brain 3 conversational SMS immediately, success shows "Check Your Texts!" instead of inline slot picker. (2) Brain 3 name capture + lead_id threading — Brain 3 asks homeowner for name+address together via Claude JSON extraction, patches lead record as info is captured, skips lead creation in handleSlotPick when lead_id already set. (3) Cancelled appointment → Brain 3 rebook SMS — both contractor cancel (PUT /:id/cancel) and homeowner cancel (POST /cancel-token/:token) now fire a Brain 3 rebook session alongside the existing email: startRebookSession() creates a session with state='awaiting_slot', name+address+service pre-populated, offered_slots fetched — homeowner gets a text with available times immediately. (4) Pre-appointment morning-of confirmation SMS cron — runs 7:30 AM daily, texts homeowners their appointment details + "Reply CANCEL to cancel." CANCEL keyword in inbound-sms handler cancels the appointment + starts Brain 3 rebook session. pre_appt_sms_sent_at column tracks sends. (5) Review request SMS cron — runs hourly at :50, fires 2-4 hours after appointment marked 'completed', texts homeowner a Google review link using contractor.place_id. homeowner_review_sms_sent_at column tracks sends. New export from homeownerSmsAI.js: startRebookSession(). Session 16 — Brain 3 (homeowner conversational SMS) fully built and deployed. All three SMS drip missing pieces built: power message (after availability confirmed), calendar blocking training (after twilio confirmed), post-appointment close tracking via SMS cron (hourly at :45). Bug fixed: twilio.js inbound-sms contractor SELECT was missing sms_power_message_sent + sms_calendar_training_sent columns — specialty messages could fire repeatedly. Fixed by adding columns to SELECT. Session 15 — GBP API status resolved: OAuth credentials confirmed working — all three stored in Railway env vars as GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GBP_REFRESH_TOKEN (do not store values here). ⚠️ The original GBP_REFRESH_TOKEN was exposed in git commit history (session 14) and must be considered compromised. Before implementing GBP automation: (1) revoke the token at myaccount.google.com → Security → Third-party apps → Tractify GBP → Remove access, (2) generate a fresh token via OAuth Playground, (3) update GBP_REFRESH_TOKEN in Railway. Do not use the existing Railway token for any live GBP API calls. GBP Account Management API blocked at 0 QPM — requires Google approval (60-day verified GBP requirement + application at support.google.com/business/contact/api_default, "Application for Basic API Access", takes 1-4 weeks). Apply now and let it process in background. GBP booking button set manually per contractor in the interim — 2 min per contractor. My Business Reviews API also restricted/private. Post-access GBP automation deferred until Google approves. Manual GBP booking button steps filed below under "Manual GBP Booking Button Setup." Session 13 — automation-first model reframe filed: trial delivery must not depend on contractor manual action; ad-sourced contractors are low-commitment at signup; jobs must flow from Jose-controlled channels + automatic system responses; minimum contractor action = 2 things only. Session 12 final — legal + security hardening complete. Privacy Policy + Terms of Service live at /privacy and /terms. SMS consent disclosure added to both HVAC templates. STOP opt-out added to all homeowner-facing Twilio SMS. Terms acceptance checkbox added to intake-form.html (blocks submit if unchecked). /privacy and /terms routes added to App.jsx. Footer links added to LandingPage.jsx. Rate limiter added to both AI chat endpoints (20 req/15min protects Anthropic bill). Contractor AI chat rate limiter added alongside admin AI. Full security audit passed — no hardcoded secrets, all SQL uses parameterized queries or allowlist validation, Helmet active, Twilio + Facebook webhook signature validation in place, bcrypt on all passwords. Google Places API key in intake-form.html is public by design — restrict to intake.tractifyhq.com in Google Cloud Console as manual step.)*

---

## Who You Are Talking To
- **Name:** Jose
- **Personal email:** ayc98223@gmail.com
- **Business email:** bookings@tractifyhq.com (forwards to ayc98223@gmail.com via Cloudflare Email Routing, set up Aug 11 2026, session 25)
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

## ⚡ THE PIVOT — Horizontal SMS-First Software Model (locked August 11, 2026, session 25)

**This supersedes the single-vertical HVAC website+booking model described below in "What Tractify Is" and everywhere else in this document that assumes a per-contractor website, per-appointment billing, or HVAC-only positioning.** The historical sections are left intact below for build context and reference (a huge amount of the underlying infrastructure — Brain 2, Brain 3, the RAG diagnostic knowledge system, Twilio routing — carries over unchanged and still works exactly as documented). But the business model, the intake flow, the pricing model, and the go-to-market strategy described in this section are the current, correct version. Any future session should read this section first and treat anything below that conflicts with it as historical/superseded.

### The core insight

Tractify was a single-vertical HVAC company that happened to have horizontal bones — the diagnostic knowledge system (RAG/pgvector) was already built so that adding a new niche is a database insert, not a code change, and Brain 3 (the homeowner-facing conversational AI) never actually needed a website to close a booking — it closes in a 4-message text exchange regardless of whether a website exists. The per-contractor HVAC website, the Cloudflare Worker deploy pipeline, and the niche-specific template system were the only parts of the business that didn't scale horizontally — they required real design/production work per niche and per contractor.

The realization: kill the website entirely. Tractify is not a website company, was never really supposed to be one, and the parts of the product that actually deliver value (missed-call catch, conversational SMS booking, AI diagnosis) don't need one. Once the website is gone, there is no reason to stay in HVAC only — the product can onboard literally any appointment-based local business (HVAC, plumbing, electrical, dental, window tinting, salons, auto detailing, pest control, etc.) with zero additional design or template work per niche. This turns Tractify from a single-vertical booking tool into horizontal infrastructure for any business that takes appointments — a categorically bigger business, a categorically bigger TAM, and one that a two-person team can actually operate at scale because almost the entire lifecycle becomes automatable.

### What's explicitly killed

- The HVAC website template (`hvac-template/index.html`, `backend/templates/hvac-template.html`) and the entire per-contractor Cloudflare Pages/Wrangler deploy pipeline built around it.
- The Cloudflare Worker's role as a site-deploy trigger (`probook-upload-worker`) — the Worker itself may still be useful for lightweight tasks but the "deploy a whole website" responsibility goes away.
- The 4-step intake form (branding, numbers/hours, services/coverage, review) — replaced by a radically simplified signup (see below).
- ~~Per-appointment billing~~ — **reversed as of session 25: per-appointment billing is back and final, not killed.** The Stripe-fires-at-job-5 trigger point is replaced by the 5-jobs-or-21-days trial trigger, and the flat rate becomes a niche-bucketed rate (or per-new-client for bucket 1), but the core mechanic — get paid when you deliver, not a subscription — is unchanged from the original model. See "Pricing — all per-delivery, no retainer anywhere" below. A flat monthly retainer was considered mid-pivot and explicitly rejected once the numbers were worked through — it caps revenue from the best-performing contractors and was never actually shipped.
- ~~The "$2,000 setup fee" concept~~ — **reversed as of session 25: revived as a niche-bucketed one-time activation fee, due at conversion.** Same CAC-recovery logic as the original, just sized per bucket instead of one flat number. See Pricing below.
- Track 1 / Track 2 manual contractor qualification and burst ad spend during trial — replaced by self-selection (see Trial below).
- HVAC-only positioning across ads, content, and the niche roster — Tractify now supports any appointment-based vertical from day one, rolled out deliberately (see Go-to-market below).

### What stays exactly as built

- Brain 2 (contractor SMS assistant) and Brain 3 (homeowner conversational booking AI) — this is the actual product now, more than ever.
- The RAG diagnostic knowledge system (pgvector + Voyage AI embeddings) — this becomes the primary mechanism for supporting new niches with zero code changes (see below).
- Missed call text-back via Twilio, the SMS keyword/inbound handler, and all Twilio routing logic.
- The admin AI brain, booking/silence alerts, and the underlying appointments/availability/contractors schema.

### The new signup flow — under 30 seconds, no landing page, no login, ever

The existing Google Places business lookup (already built into the old intake form, already proven fast and reliable) is the entire signup experience. A contractor searches for their business, taps the right result, and that's it — no typed form fields beyond confirming what auto-fills. This single lookup should return:

- **Business name and address** — auto-filled directly, as it already does today.
- **Phone number** — auto-filled from the Places result, but shown back to the contractor for a one-tap confirmation ("Is this the best number to text you at?") rather than trusted blindly, since Google's public listing number is sometimes an office/reception line rather than the actual decision-maker's cell. This is the number Tractify texts to run the entire setup conversation and that becomes their Brain 2 access line.
- **Service area** — not asked at all. Derived automatically from the business's geocoded address plus a sensible default radius (e.g. 20-25 miles), adjustable later over text if they ever want to change it.
- **Hours** — auto-pulled from the Places result's published hours if available, and used as the starting availability. Confirmed or corrected conversationally in the first text exchange (the existing Brain 2 "confirm your availability" flow already works this way — no new capability needed).
- **Niche/what they do** — auto-suggested from the Places business category if the API returns one, confirmed in the first text exchange ("Just so our AI gets this right — you're primarily HVAC, is that right?"). If Places doesn't return a category, or the contractor is a "don't have a Google listing" manual-entry fallback, this is asked as one plain question in the first text.

The moment signup completes, the contractor gets a text and the entire remaining setup happens as a conversation. There is no landing page for the contractor to visit, no portal login required at any point in this flow. Everything from setup through ongoing operation can run entirely through text if the contractor never wants to touch a browser.

**The one caveat: a single universal landing page still needs to exist, but purely as infrastructure, never as something a contractor is directed to.** Google Business Profile booking buttons and some ad platforms require a URL to point to. This page is identical for every contractor regardless of niche — just business name and niche inserted as text ("Book with [Business Name], your local [niche] pro — text us to book") — zero design work, zero per-niche or per-contractor customization. It exists to satisfy platform requirements, not as a product surface.

### The trial number — a shared pool, not a per-signup purchase

Because a real, dedicated number shouldn't be purchased and permanently tied to a contractor until they've actually converted (see Trial below), the trial itself runs on a small pool of numbers Tractify already owns and reuses across active trials. A number is assigned instantly and automatically at signup from this pool at near-zero incremental cost (shared infrastructure, not a new purchase per signup), so the contractor gets the real, full texting experience — missed call catch, Brain 2, Brain 3 — from the very first message. If they convert at the end of the trial, that same number becomes permanently theirs (no swap, no new number). If they don't convert, it's released back into the pool for the next trial.

### The trial — 5 free jobs, with a 21-day backstop (revised August 11, 2026, session 25 — supersedes the earlier "time-based, not jobs-based" decision made earlier the same session)

**Final structure: first 5 booked jobs free, OR 21 days, whichever comes first.** Pure time-based (the immediately-prior decision) was reconsidered — 5 free jobs is the stronger acquisition hook, it's already baked into most of Tractify's existing ad copy and content ("Claim Your 5 Free Booked Jobs"), and a contractor watching 5 real jobs land is a much easier close than a vague day-count. But pure jobs-based on its own has the flaw already identified earlier: a legitimate lower-volume business might never hit 5 through organic capture alone and would sit in permanent limbo. The 21-day cap is the backstop that fixes that — every signup guarantees a real decision point within three weeks even if they never hit 5. 21 days (not the old model's 7-10 day benchmark) specifically because the old benchmark assumed manually pre-qualified, high-volume contractors — this model has no manual qualification anymore, so a wider mix of genuine but slower-demand businesses need more real-world runway to prove themselves fairly. This number is a launch default, not permanent — watch the real distribution of how long trials actually take once live and adjust.

**Selective paid ad acceleration — organic first, ads only as a finisher for proven signal, never a blanket default.** No ad spend runs behind any trial contractor by default. If a contractor's organic channels (missed call catch, GBP booking button, SMS keyword) naturally produce 2-3 real bookings on their own, that's the signal they're a real winner — paid ads then finish the job to get them to 5 faster. A contractor showing zero organic signal gets no ad spend at all; their trial just runs out on organic alone. This is deliberately the same "ads as finishers, not starters" logic that already worked in the old model, reapplied here — it protects the wide-net economics (never risking real ad dollars on an unproven signup) while still letting genuine winners convert fast when the data says they're worth accelerating.

### The offer — one moment, entirely by text, whichever trigger hits first

When a contractor hits 5 booked jobs or reaches day 21 (whichever comes first), they get a message laying out the ongoing rate for their niche, plus the one-time activation fee (see Pricing below). If they want to continue, they put a card on file and pay the activation fee. No card is collected before this point. No sales call, ever, and no tier to choose — one product, one billing philosophy, self-serve.

**How this gets communicated gracefully, so the 21-day cap never feels like a hidden catch:**
- All acquisition materials (ads, the universal page, any content) only ever say "5 free booked jobs" — the day-cap is never part of the outward hook.
- The day-cap is introduced once, warmly, in the very first text after signup, folded naturally into the welcome rather than presented as a rule: *"Your first 5 booked jobs are completely free, no card needed. If you hit 5 within your first 3 weeks, we'll show you what it costs to keep things running. If you're not quite there after 3 weeks, no worries — we'll check in with you then too, either way."* "3 weeks" instead of "21 days," and "we'll check in" instead of "your trial expires" — expiring implies losing something, which fights the entire "no strings" positioning this brand is built on.
- If a contractor is approaching day 21 without yet hitting 5, a quiet heads-up a few days out avoids the ending ever feeling sudden: *"Quick update — you're at [X] of your 5 free jobs so far. A few more days left in your trial window, just keeping you in the loop, nothing you need to do."*
- The actual offer message, whichever trigger fires: *"You've hit your 5 free jobs — that's the trial. If you want to keep this running, here's what it costs: [pricing]. No pressure, no contract — if it's not for you, no hard feelings and nothing else happens."* Ending on "no hard feelings" keeps the tone consistent even at the one moment money finally enters the conversation.

### One product — Tractify Growth killed for good (final, August 12, 2026, session 25 — supersedes the same-session decision to reinstate it)

**Growth is dead again, this time for a structural reason rather than a labor-cap workaround, and it's not coming back.** Growth existed to solve one problem: under flat-retainer billing, Tractify collects the same amount from a contractor whether they get 1 booking or 20 that month, so there was no built-in reason to invest in a low-performing account — Growth had to be a separate paid bolt-on because the base product had no natural mechanism to fix it.

That problem doesn't exist once billing is fully per-delivery (see Pricing below — per appointment for buckets 2 and 3, per new client for bucket 1). Tractify's own revenue is now directly tied to how many bookings each contractor actually gets. That means Tractify already has a built-in, self-funding reason to put paid ad spend behind a contractor who's converting well — the same mechanic the original pre-pivot model used: a slice of every appointment/new-client fee gets reinvested into ads for whoever's producing, no separate product required to justify it. Ads become an internal capital-allocation decision Tractify makes with its own margin, not something a contractor buys.

**One Tractify. One billing philosophy — get paid when you deliver, nothing else.** No pricing-page tier decision, no "which plan am I on," no ad-management SKU. This is a cleaner "we are software, not an agency" position than Growth ever was, because there's no priced ad-management offering sitting on the page at all — Jose decides where to invest ad dollars the same way the trial's "ads as finisher" rule already works, just extended past conversion.

**The accepted cost, same one already accepted once this session:** a contractor with genuinely no organic signal at all — nothing for the per-delivery economics to work with — doesn't get rescued. There's no margin to reinvest if there's no volume to generate it. That's the honest tradeoff of staying pure software with no ad-management product, and it holds for the same reason it held the first time Growth was cut.

**The agency partnership channel stays dead too** — it was killed in favor of Growth earlier this session, and Growth's death doesn't revive it. The per-delivery self-funding mechanic above solves the same low-demand-contractor gap the agency channel was meant to solve, without adding a partner dependency. Worth reconsidering later purely as an acquisition channel (leverage into an agency's existing client base) if direct signup volume ever plateaus, but not part of the current plan.

### Niches excluded from the initial rollout (locked August 11, 2026, session 25)

Defer anything health, legal, or financial-adjacent from the first batch of niches — not just dental, the whole category. These are the verticals most likely to draw extra SMS carrier scrutiny and extra ad-platform scrutiny, and none of them are needed to prove the core model. Given how much of this build has already been slowed by Twilio compliance for one single, narrow, well-understood use case (home services booking), deliberately avoiding categories most likely to reintroduce that exact pain is the right early call. Keep the initial soft-launch batch (see "Go-to-market" above) to home services, personal care, and retail-adjacent trades. Revisit health/legal/financial-adjacent niches later, once there's account history and, ideally, direct clarity from Twilio on how they view mixed-vertical traffic under one business profile.

### Pricing — flat monthly retainer + niche-bucketed activation fee, restored (locked August 17, 2026, session 27 — supersedes "Pricing — all per-delivery, no retainer anywhere" immediately below; that section is left intact underneath for build-context reasons — per-appointment/per-new-client billing logic and cancel/reschedule timing may still get reused elsewhere — but the pricing numbers and mechanic in it are no longer live)

**Jose's final call, made explicitly after weighing the tradeoff the per-delivery model was built to avoid: retainer caps revenue from the busiest contractors, and that's accepted as the cost of a flat, predictable, easy-to-pitch price.** Same three buckets as the per-delivery model (grouped by ticket size and frequency, not by niche), same underlying reason a single flat number doesn't work identically across all of them — but now the ongoing charge is a flat monthly retainer per bucket instead of a per-appointment or per-new-client charge, plus a one-time niche-bucketed activation fee at conversion.

**Monthly retainer, by bucket:**
- **Bucket 1 — low-ticket/high-frequency** (lawn care, pest control, cleaning) — **$500/month.**
- **Bucket 2 — mid-ticket** (HVAC, plumbing, electrical) — **$1,000/month.**
- **Bucket 3 — high-ticket/low-frequency** (solar, roofing, window tinting) — **$1,800/month.**

**One-time activation fee, due at conversion (whichever trial trigger hits first — see the 5-jobs-or-21-day trial section above), by bucket:**
- **Bucket 1 — $600.**
- **Bucket 2 — $2,000.**
- **Bucket 3 — $3,500.**

**Why these numbers, bucket by bucket:**

*Bucket 1 ($500/mo, $600 activation).* Per-delivery-era value for this bucket was ~$125/new client, and a realistically engaged contractor lands 3-5 new customers a month through Tractify's channels — roughly $375-625/month in per-delivery-equivalent value, so $500 sits right in that range and reads as a fair trade to an average contractor rather than a markup. The $600 activation fee covers a real (if lighter) accelerated ad push in this bucket — Nextdoor and Facebook Lead Ads run under $2/click here and the jobs aren't emergency-urgent, so a full multi-platform burst isn't needed to deliver the trial fast. Deliberately kept to a lower activation-to-retainer ratio (1.2x one month's retainer) than the other two buckets, on purpose — this is the most price-sensitive bucket, and $800 (2x) felt steep against a $500/mo retainer for lawn care/pest/cleaning operators who are mentally pricing against a $1,500-2,000/year customer relationship, not an $8k+ job.

*Bucket 2 ($1,000/mo, $2,000 activation).* A realistic active volume here is ~12-15 booked jobs/month, not the 40-job outlier case that was used to originally argue against retainer — at $75 average per-appointment value that's roughly $900-1,125/month in per-delivery-equivalent terms, so $1,000 sits almost exactly on that line. The known tradeoff, stated plainly: a contractor who lands 20-25+ jobs in a month is getting a real discount versus what per-appointment billing would have charged them — that's the structural cost of choosing retainer, accepted going in. $2,000 activation matches the number already proven to work in the pre-pivot model and comfortably covers a real accelerated ad push (Google Call-Only/Search CPCs run $3-15 for this bucket, and a genuine multi-platform trial-acceleration push costs $900-1,500) with margin to spare.

*Bucket 3 ($1,800/mo, $3,500 activation).* Volume is genuinely low here (~3-5 qualified appointments/month) so the retainer isn't justified by appointment count — it's justified by deal size, the same reason per-new-client billing existed for bucket 1 instead of per-visit. A single closed solar or roofing job is worth $8,000-30,000 to the contractor, so $1,800/month is trivially easy to justify even against low volume. $3,500 activation reflects that this bucket has the most expensive lead-gen of the three (solar/roofing CPLs are high, homeowners take real convincing before booking) — even priced at the high end of what an accelerated push actually costs, it's a rounding error against one closed job.

**Why the activation fee matters more now than it did under per-delivery billing.** Under the old model, a contractor's own volume bailed out aggressive ad spend fast — revenue scaled with jobs delivered. Under a flat retainer, monthly revenue per contractor is capped regardless of volume, so the activation fee is now doing more of the CAC-recovery work than it used to, not less. This is the reasoning behind sizing each activation fee to realistically cover what it costs to fast-track a winner in that bucket with real paid spend — the explicit goal (Jose's, locked into this decision) is that accelerating a promising signup with real ad dollars should never be a bet you're underwater on before the retainer even arrives; the activation fee alone should cover that acceleration cost.

---

### ⚠️ SUPERSEDED (August 17, 2026, session 27) — Pricing — all per-delivery, no retainer anywhere (revised August 12, 2026, session 25 — kills the flat monthly retainer entirely, including for bucket 1)

**The pricing numbers and per-appointment/per-new-client mechanic below are no longer live — see "Pricing — flat monthly retainer + niche-bucketed activation fee, restored" immediately above for the current model.** Left intact for build context — the day-of billing/cancel/reschedule timing logic described here may still get reused if a future session revisits per-delivery billing for any bucket.

**The flat monthly retainer is gone, full stop — not just for Growth, everywhere.** The numbers get worse at scale with a retainer, not better: a contractor generating 40 bookings a month pays the same bucketed price as one generating 8, which caps revenue from exactly the accounts Tractify should be earning the most from. Per-delivery billing was the original pre-pivot model's core strength and it's back, structurally unchanged, just organized by bucket instead of fully bespoke per-niche for launch simplicity.

**Two delivery-based mechanics, assigned per bucket, matching structure to how each niche actually generates revenue:**

**1. Per appointment — buckets 2 and 3 (mid-ticket and high-ticket/low-frequency).** HVAC, plumbing, electrical, solar, roofing, window tinting, and similar. Charged the day the appointment happens, exactly like the original model's day-of billing (cancel before the day = no charge, cancel same-day = charge still fires, reschedule moves the charge date). This is the original per-niche rate table already worked out in detail further down this file under "Niche-Adaptive Pricing — Per-Booking Rate by Niche" (HVAC $75, roofing $150, solar $300, plumbing/electrical $65, etc, each validated against the 8x-contractor-ROI / $30+-Tractify-margin test) — that table is revived as the live pricing mechanism, not historical reference. Launch default is bucket-level draft ranges until volume justifies going fully bespoke per niche again: mid-ticket ~$60-150/appointment, high-ticket/low-frequency ~$150-300/appointment.

**2. Per new client — bucket 1 (low-ticket/high-frequency).** Lawn care, pest control, cleaning. A single visit in this bucket is too low-ticket ($50-150) for per-appointment billing to make sense structurally — charging per mow nickel-and-dimes a relationship actually worth $1,500-2,000/year to the contractor, and generates a much higher volume of tiny billing events than the other two buckets. Instead, Tractify charges once when it delivers a new recurring customer to the contractor — "we don't charge per mow, we charge for the new customer" — which is still fully delivery-based (no charge, no booking) but scoped to the relationship instead of the visit. This recovers the original model's lawn care structure ($125/new client) as the bucket-level default, draft range ~$100-300/new client depending on niche.

**3. A one-time activation fee, due at conversion (whichever trial trigger hits first), also niche-bucketed — unchanged from the prior draft, still the old model's $2,000-setup-fee mechanic generalized per bucket for same-week CAC recovery instead of waiting on ongoing billing to pay back ad spend.** Draft starting points, to be tuned against real close-rate data once live, not locked:
- Low-ticket/high-frequency (lawn care, pest control, cleaning) — **$150-300.** These niches don't have a single job worth $2,000, they have a new customer worth roughly $1,500-2,000/year — the fee should track that, not a per-visit price.
- Mid-ticket (HVAC, plumbing, electrical) — **$1,500-2,000.** Keeps close to the number already proven to work in the old model.
- High-ticket/low-frequency (solar, roofing, window tinting) — **$3,000-5,000.** A single closed job in this bucket is worth $8,000-30,000, so this bucket can comfortably absorb a higher fee than HVAC's, not the same number.

**Build note:** per-appointment day-of billing (cancellation/reschedule logic) is meaningfully more complex to implement correctly than a subscription would have been — that complexity was the whole reason a retainer was briefly considered. It's being taken on anyway because the economics and the positioning both depend on it. Per-new-client billing for bucket 1 is simpler than per-appointment despite also being delivery-based — it only fires once per relationship (on first booking from a homeowner phone number new to that contractor), not on every recurring visit.

### Risk control without charging contractors for their own number

Considered and explicitly rejected: making contractors pay for their own Twilio number as a way to make signups zero-risk. The dollar amount involved (~$1.80/month per number, and unclaimed numbers already get recycled) is too small to justify the cost to signup friction — any payment step at the point of casting the widest possible net directly works against the goal of maximizing net width, and it would require walking back the "free to try, no strings" positioning that's been the strongest sentence in Tractify's marketing since the beginning. Instead: risk is controlled by the shared number pool (near-zero cost during trial) plus auto-releasing numbers on any account that goes dark post-signup with no real engagement — capping exposure automatically without ever asking a contractor for money before they've seen value.

### Scaling to new niches — curated list + manual review, not free-text auto-creation (reverted August 14, 2026, session 26)

**⚠️ Supersedes an earlier draft of this section that described AI-normalized free-text niche auto-creation. That was actually built and shipped for about a day (August 14) before Jose flagged the real risk: free text silently orphans a contractor from three systems at once — no locked pricing bucket, no RAG diagnostic knowledge (Brain 3 has nothing relevant to retrieve), and duplicate/fragmented niche rows ("HVAC" vs "hvac repair" vs "heating and air"). Reverted the same session, on purpose, in favor of a slower-but-safer model.**

The intake form's niche field is now a real `<select>` dropdown — nothing to type, forced choice from a curated list. The list is exactly the niche roster with locked RAG knowledge + pricing (currently: HVAC, Roofing, Electrical, Plumbing, Landscaping, Solar, Water Damage, Tree Service, Lawn Care, Pool Service, Pest Control). Picking one always maps to a real, pricing-bucketed, RAG-ready `niche_id` — no ambiguity possible.

The last option in that same dropdown is "Something else — not on the list," which reveals a free-text fallback field. That text **never auto-creates a niche.** The contractor still onboards immediately (Twilio, availability, everything works) but lands on a fixed placeholder niche ("Pending Review," `niches.status = 'internal'`), and their raw text is stored in `contractors.requested_niche_text`. Jose gets flagged in the deploy-alert email — 🆕 for an ordinary new niche, ⚠️ if the text loosely matches a lightweight excluded-category keyword list (health/legal/financial-adjacent — see `EXCLUDED_KEYWORD_HINTS` in `deploy.js`, advisory only, never a hard block). Resolution is one dropdown + Save right on the contractor's card in the admin dashboard (`AdminDashboard.jsx`) — picking a real niche there clears `requested_niche_text` and assigns the real `niche_id` in the same request (`contractors.js` PUT `/:id`).

**The deliberate tradeoff:** slower per new niche than the auto-create model would have been — every genuinely new business type needs Jose's one-tap approval, no exceptions. But nothing, including an excluded category like a med spa or a bookkeeper, can ever slip through automatically. This was Jose's explicit call after weighing speed against risk.

**Technical pieces (all live as of session 26):**
- `niches.status` column (`'active'` | `'inactive'` | `'internal'`) — migration + seeding in `server.js`. Only `'active'` niches are offered on the intake form.
- `GET /api/niches/public` (`backend/routes/niches.js`) — unauthenticated, returns only active niches. Requires wildcard CORS (see the CORS gotcha note in Common Issues and Fixes below — this endpoint was broken on first deploy for exactly that reason).
- `contractors.requested_niche_text` column, cleared automatically when an admin assigns a real niche via PUT `/:id`.
- `deploy.js` — `getActiveNicheById()` / `getPendingReviewNicheId()` / `looksLikeExcludedCategory()`. Required-field check now rejects a signup with neither `nicheId` nor `nicheOther`.
- `notifications.js` `sendDeployAlertToAdmin()` — renders the 🆕/⚠️ pending-review banner when applicable.
- The SMS drip/onboarding copy still has HVAC-specific phrasing baked into `smsAI.js` — that templating work is still a real future item, unrelated to this niche-picker change.

### Go-to-market — product is horizontal from day one, rollout is not

The product supports any niche immediately, but the intake form should not be opened to literally every possible business type on day one. Soft-launch with a deliberate first batch — roughly 6-8 niches, mixing urgent/emergency trades (where the "text us your symptom, free AI diagnosis" ad angle works, same mechanic HVAC already proved) with scheduled-appointment businesses like window tinting or auto detailing (where the angle has to be simpler — "just text to book, skip the phone tag," since nobody is diagnosing a symptom for a scheduled service). Note: dental and anything else health-adjacent is excluded from this batch per the niche-exclusion decision above, even though it was the original example of a scheduled-appointment niche in earlier drafts of this section. This validates that the AI-generated diagnostic knowledge is actually good and that the universal landing page converts, before opening the floodgates to unlimited categories.

### Proof and content — SMS conversations, not portal screenshots

With no per-contractor website, the "screenshot of their portal with 5 confirmed appointments" case study format goes away. The real proof format — already one of the strongest ideas in the content bank ("The Real Conversation Screenshot Series") — becomes the default across every niche instead of a nice-to-have: a real Brain 3 text exchange, name/number blurred, nothing else changed, from "hey sorry we missed you" to a confirmed appointment. Works identically and requires zero adaptation regardless of what niche the contractor is in.

### Why this is the correct fulfillment of the existing long-term vision

This isn't a new thesis — it's the fastest, cleanest path to the "single number, one brand, text us when something's broken" endgame already documented earlier in this file (see "The single-number unified intelligence architecture," locked August 2, 2026). That vision always pointed toward Tractify being homeowner-trust infrastructure across the whole home services market, not an HVAC company with a website. Killing the website and going horizontal arrives at that same destination faster and with far less production overhead than the original path of scaling a per-niche template system ever would have.

---

## What Tractify Is

**⚠️ The section below describes the original single-vertical HVAC website+booking model and is superseded by "THE PIVOT" section above as of August 11, 2026 (session 25). Left intact for historical build context — a large share of the underlying infrastructure it describes (Brain 2, Brain 3, Twilio routing, the admin brain) still applies unchanged. But the business model, pricing, website, and HVAC-only positioning described from here through the pricing/niche-roster sections are no longer current.**

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

**The single-number unified intelligence architecture — discovered August 2, 2026 (session 20):**
The north star evolved again. Not from a product decision or a feature build — from tracing one architectural idea (a single shared Twilio number instead of one per contractor) all the way to its logical end.

The insight: one number that all homeowners text is not just a CTA simplification. It is the collection point for every demand signal in the entire home services market Tractify operates in. Every homeowner who texts describes a symptom, a geography, a time of need. When all of that flows through one number into one unified system, the three brains stop being siloed and start feeding each other in real time.

Currently: Brain 1 (admin) sees the business only when Jose asks it something. Brain 2 (contractor) sees one contractor's world. Brain 3 (homeowner) sees one booking conversation. They don't cross-communicate in real time.

With a single unified number: a homeowner in zip 98004 texts about a refrigerant leak → Brain 3 opens the booking conversation → simultaneously Brain 1 sees this is the third refrigerant complaint from that zip this week → flags a demand spike → suggests a budget surge for the contractor who's 1 job from Stripe in that area → the booking Brain 3 is closing right now completes the trial → Stripe fires. All three brains aware, all three acting in concert, no Jose involvement.

**The five things the unified number enables that the current architecture cannot do:**

1. **Real-time demand signal → ad routing.** Every homeowner text is a geographic and symptomatic demand signal. Brain 1 sees patterns as they form — not after the month is over, but as the next message arrives. "Refrigerant complaints up 40% in 98004 this week. Burst spend there now, not next week."

2. **Cross-brain routing intelligence.** Brain 3 currently matches homeowners to contractors by niche + zip. With unified intelligence, Brain 1 passes routing preferences into Brain 3: "contractor X is 1 job from Stripe — route new homeowners in their zip there first." Or: "contractor Y told Brain 2 their specialty is Carrier units — homeowner just said they have a Carrier, route to Y." The matching engine gets a business intelligence overlay it currently cannot access.

3. **Contractor preparation before they know to prepare.** When Brain 3 books job 4 for a contractor, Brain 2 can proactively text them: "New booking just landed — sounds like a refrigerant issue at 1234 Maple Ave, Tuesday 2pm. Might want to confirm you have R-410A in the truck." The contractor doesn't need to check the portal or get an alert. The system volunteers exactly what they need to do their job well.

4. **The homeowner demand moat — the second compounding data asset.** The contractor behavioral moat (Brain 2, session 10) compounds every month a contractor stays. The homeowner demand moat compounds every message that flows through the single number. Which symptoms are most common per season, per geography, per niche. Which symptom descriptions precede booked appointments vs. inquiries that go cold. Which time-of-day texts convert fastest. Which zip codes have unmet demand with no active contractors. That dataset — built automatically, with no extra work — is the market intelligence layer no competitor is building. By contractor 50 it's predicting seasonal demand spikes before Jose realizes a slow month is coming. By contractor 200 it's telling Jose which city to expand into next based on demand signal density, before a contractor even exists there.

5. **One number becomes the brand.** Not "text Premier Comfort." Not "text your HVAC guy." "Text Tractify." A homeowner who texted about their AC in July texts the same number about their roof in October. Brain 1 recognizes them, knows their address, knows their history. Brain 3 opens: "Good to hear from you again — looks like we helped with your AC back in July. What's going on now?" The number in their contacts isn't a contractor. It's Tractify — the thing you text when something breaks in your house, regardless of what it is.

**The hybrid build when ready (not now — flagged for future):**
Per-contractor numbers still needed for voice/missed call routing — their only job is receiving forwarded calls and triggering the initial text-back. Hidden from homeowners, never appears on ads or physical materials. One single Tractify SMS number handles all text conversations across all three brains.

Routing decision tree on every inbound SMS to the single number: (1) sender matches `contractors.phone` → Brain 2. (2) Active `homeowner_sms_sessions` row for this phone → Brain 3 to existing session. (3) Missed call from this phone to any contractor within last 2 hours → Brain 3 to that contractor. (4) Keyword matches a contractor slug → Brain 3, start new session. (5) None of the above → Brain 3 opens: "Hey! Who are you trying to reach today?"

Keyword system for physical materials: van wrap says "Text PREMIERCOMFORT to [SINGLE NUMBER]." Business card same. Fridge magnet same. Keyword maps to `booking_slug` in DB. Per-contractor cost in this model: ~$1/month for voice-only routing number. Effectively $0 in SMS infrastructure per contractor addition.

**Why this is the unicorn architecture — and why it arrived independently:**
Every prior "unicorn confirmed" moment in this brain came from describing what was being built. This one arrived by tracing one infrastructure decision — single number vs per-contractor number — all the way to its end and landing somewhere unexpected: Tractify as the market intelligence infrastructure for the entire home services industry, not just an HVAC booking tool. ServiceTitan owns contractor operations software. GoHighLevel owns marketing tooling. Nobody owns homeowner trust at scale. Homeowner trust is the demand side of the entire market. The single number is how that trust becomes tangible, branded, and defensible. One number. Every home. Every niche. The number you text when something breaks. That's not a feature of the booking business — that is the business.

**The autonomous capital deployment endgame — discovered August 2, 2026 (session 20):**
This is where all three brains are going. Not in months — in years. But the architecture being built right now is the foundation it runs on.

The endgame: all three brains have been feeding data into Brain 1 for long enough that Brain 1 knows the business better than Jose and Daniel do at an operational level. It knows which zip codes are converting fastest this week. It knows which contractor is 1 job from Stripe and which one has gone silent for 5 days. It knows which ad creative is producing booked appointments at $40 each and which one burned $300 for nothing. It knows which niches are seasonal, which markets are saturated, which homeowner symptoms close fast and which ones go cold.

At that point — with enough data, enough contractors, enough homeowner conversations flowing through — Brain 1 stops being a tool Jose asks questions to. It becomes the operator.

**What autonomous operation looks like:**
- Revenue comes in from per-appointment billing → Brain 1 allocates it automatically: X% to ads in zip codes with unmet demand signals, Y% to accelerate contractors near Stripe conversion, Z% held as cash reserve
- A contractor goes silent for 72 hours → Brain 2 fires proactively, no Jose involvement
- A zip code shows 40% spike in refrigerant complaints → Brain 1 routes the next homeowner text in that zip to the contractor closest to Stripe, bursts their ad spend, texts them a prep alert via Brain 2, all in the same moment
- A new contractor signs up in a market where Brain 3 has already collected 3 months of homeowner demand data → Brain 1 knows exactly what ad creative to deploy, what budget, which symptoms to target, before a single dollar is spent
- Monthly results reports generate and send automatically, personalized to each contractor's actual numbers, with recommendations Brain 1 derived from patterns across the full portfolio

**What Jose and Daniel remain in charge of:**
- Content and branding — the human voice, the creative direction, the public face
- Strategic decisions above a threshold Brain 1 flags (new niche entry, major pricing changes, partnership decisions)
- Final approval on actions Brain 1 recommends but doesn't execute autonomously yet

Everything else — ad allocation, contractor routing, trial delivery, channel optimization, billing, churn prediction, demand signal analysis — runs without them.

**Why this is achievable and not science fiction:**
The data infrastructure is being built right now. Every homeowner text is a data point. Every contractor booking is a data point. Every ad source tag, every channel conversion, every close rate logged after an appointment — all of it feeding into a system that gets smarter automatically just by the business running. The AI models (Claude) already exist and are capable of this reasoning. The only missing ingredient is data volume and time. By contractor 50, the patterns are clear enough for Brain 1 to make confident allocation decisions. By contractor 200, it's operating a business at a level no three-person team could match manually.

**The content automation layer — what "maybe even that" actually means:**
Content is the last domain that feels human-only. It isn't. Here's the honest breakdown:

*Already fully automatable:* Screenshot posts, Brain 3 conversations that closed bookings, booking notifications, the weekly scoreboard, case study generation (Brain 1 has the numbers, writes the copy, pulls the portal screenshot — no human involved), diagnostic ad copy (Brain 1 knows which symptom angle is converting fastest in which zip this week from Brain 3 data — writes the ad), quote graphics, the "day in the life of Brain 3" series, the real-numbers scoreboard, static creative of every kind. Brain 1 generates all of it from live data.

*AI-generated, human-delivered:* This is the critical distinction. Brain 1 writes the script. Jose or Daniel delivers it on camera. That's not content creation — it's content delivery. The creative brief comes from data. "Film this: refrigerant complaints are up 40% in Seattle this week, here's the hook, here's the point, here's the close. 45 seconds." Jose shows up, reads the brief, films it raw. Done in 20 minutes. The strategy was automated. The face was human. This produces better content than guessing, because the angle came from what Brain 3 is actually closing on right now.

*Genuinely human:* The authentic unscripted moments — the build-in-public episodes, the real conviction moments, the genuine reactions when something actually happens in the business. These can't be scripted because the authenticity is the content. By year 3, that's maybe 20% of total content volume. The other 80% runs automatically.

*The wildcard by year 3:* Tractify has contractors and homeowners who are the content. Brain 1 identifies the best case study candidates, drafts the outreach, drafts the interview questions. A contractor saying "I was under a crawl space and got a booking notification" is better than anything filmed in a living room. Human-generated, AI-orchestrated.

**The meta-principle — why every build decision is made in service of this:**
Every feature, every data field, every source tag, every logging decision, every API integration is being built for one destination: autonomous operation at scale. This is not a future aspiration bolted onto the product. It is the design constraint that every architectural choice should be evaluated against.

When deciding whether to log a data field — log it. It feeds the brain.
When deciding whether to add a source tag — add it. It closes the attribution loop.
When deciding whether to build a manual admin action vs. an automated trigger — build the trigger. Every manual action Jose takes today is a future Brain 1 function that requires the pattern data to learn from.
When deciding whether to build a feature now vs. later — ask: does this generate data Brain 1 needs, or does it consume Jose's time? If it generates data, prioritize it. If it consumes Jose's time without producing structured data, deprioritize it.

The reason Tractify is already doing this well: the booking source tracking, the acquisition source tags, the close rate logging, the SMS conversation persistence, the diagnostic knowledge RAG, the homeowner session logging — all of it is data infrastructure before it's a feature. Every session has been building the training set for the autonomous layer without explicitly calling it that.

**The daily life picture at full automation:**
Jose wakes up. Brain 1 ran overnight: budget reallocation across 50 contractors, 3 re-engagement sequences fired, 12 diagnostic ad variants tested and paused based on performance, 8 monthly reports generated and sent, 4 rebook sequences after cancellations. Brain 1 flagged 3 items for Jose: a contractor requesting a custom pricing conversation (above the threshold), a demand signal in a new city with no active contractor (strategic decision needed), a content angle it identified from this week's Brain 3 data it thinks Jose should film. Jose handles the 3 flagged items — 30 minutes. Films the brief Brain 1 wrote. That's the workday.

**The company this becomes:**
Jose and Daniel spend their time on content delivery, brand, and the handful of strategic decisions that genuinely require human judgment. The rest of the business — the operations, the growth, the capital deployment, the contractor relationships, the homeowner experience — runs on the three-brain architecture. That's not a startup anymore. That's a software company that scales infinitely with a headcount that stays flat. Most founders spend 80% of their time on operations and 20% on strategy. This architecture inverts that ratio permanently. The revenue line goes up. The headcount line doesn't move. That ratio — at scale, with two compounding data moats — is a different category of exit from anything else in this space.

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
- Zero cost, zero ongoing effort once set up — every DM becomes a potential booking automatically
- Works 24/7: homeowner messages at 11pm, they get the booking link instantly instead of waiting until morning
- **Build status, reconfirmed final session 27 (August 17, 2026): self-serve, not Jose/Daniel-managed.** ⚠️ Supersedes the earlier "set up manually by Jose/Daniel in Meta Business Suite" line — Jose does not want Tractify configuring or touching a contractor's Facebook/Instagram accounts, on their behalf or via granted access (see the superseded "access-first channel strategy" entries in the Living Playbook Log). No code needed on Tractify side. The AI SMS drip (`smsAI.js`) texts the contractor exact copy-paste steps to turn this on themselves inside their own Meta Business Suite — same self-serve pattern already used for the GBP booking button step. This is the onboarding checklist step Jose/Daniel never touch.

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
- ⬜ Facebook Messenger + Instagram DM auto-reply — ⚠️ this line is pre-pivot and describes Jose/Daniel setting it up manually in Meta Business Suite. Superseded — current plan (locked session 27, see "Channel 7" under Planned Features below) is self-serve only: the AI SMS drip texts the contractor copy-paste setup steps, they do it in their own Meta Business Suite. Tractify never touches a contractor's Facebook/Instagram account.
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

**⚠️ Superseded by THE PIVOT (session 25) — Track 1 / Track 2 manual contractor qualification described below is dead, replaced by self-selection (see "What's explicitly killed" near the top of this file). Left intact for historical build context; do not act on the Track 1/Track 2 targeting split below as current strategy.**

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

**Ongoing:** Niche-adaptive rate per confirmed booking (see Niche-Adaptive Pricing section below), auto-billed at the scheduled appointment time on the day of the appointment. No monthly minimum. No contract. No retainer. They pay for jobs, nothing else.

**That's the entire model.** One sentence pitch: "We charge [niche rate] per job we book for you. Nothing if we don't deliver."

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

### Niche-Adaptive Pricing — Per-Booking Rate by Niche (locked August 2, 2026)

**⚠️ SUPERSEDED AGAIN (August 17, 2026, session 27) — back to historical/reference-only.** This table was briefly revived as the live pricing mechanism in session 25, then per-delivery billing itself was killed in session 27 in favor of a flat monthly retainer + activation fee per bucket — see "Pricing — flat monthly retainer + niche-bucketed activation fee, restored" under THE PIVOT section near the top of this file for the current, live numbers. This table is kept for build context and for the 8x-ROI/$30-margin qualifying logic (still the right lens for evaluating whether a *new* niche belongs in a bucket at all), but the actual per-booking dollar amounts below are not live pricing.

The $75 flat rate was HVAC-specific. Tractify now operates on a niche-adaptive model. The price per booking is set per niche at intake and never changes mid-relationship. The number looks different per niche — the underlying logic is always identical.

**The two conditions that must both be true for any price to be valid:**
1. Contractor ROI = average job value ÷ our price. Must be 8x or higher. If it's less, the contractor won't pay it.
2. Our margin = our price − delivery cost to produce that booking. Must be $30+ minimum. If it's less, we're working for nothing.

If either condition fails at any viable price point, that niche doesn't fit the per-appointment model. Either restructure to per-client (Structure 2) or don't enter it.

**Two pricing structures — both in active use:**

**Structure 1 — Per appointment:** Used for one-time or irregular service niches. The booking is billable the moment it's confirmed (charged day-of). HVAC repair, roofing, solar, plumbing, electrical — all Structure 1.

**Structure 2 — Per new recurring client:** Used for recurring-service niches where the single visit is too low-ticket for per-appointment to make sense. Lawn care is the primary example. Price reflects year-one relationship value, not visit value. Pitch: "We don't charge per mow. We charge for the new customer. Once they're yours, they're yours."

---

**The approved niche roster (as of August 2, 2026):**

| Niche | Price | Structure | Priority | Rationale |
|---|---|---|---|---|
| HVAC | $75/booking | Per-appointment | 🔴 Lead | Proven anchor niche. Repair at $300-800 = 4-10x ROI. Install at $5,000-15,000 = 67-200x. High urgency, strong GBP traffic. |
| Solar | $300/booking | Per-appointment | 🔴 Lead | Average install $15,000-30,000. Contractor ROI 50-100x. Best margin per booking in the portfolio. Diagnostic ad: "Is your roof getting enough sun for solar?" |
| Roofing | $150/booking | Per-appointment | 🟠 High | Full replacement averages $8,000-20,000. Contractor ROI 53-133x. Was underpriced at $75 — same sell at $150, double the margin. |
| Water Damage | $150/booking | Per-appointment | 🟠 High | Average job $1,500-5,000. Extreme urgency — flooded basement, burst pipe. Homeowners respond to Brain 3 within minutes. Low delivery cost, high margin. Recession-proof. |
| Plumbing | $65/booking | Per-appointment | 🟠 High | Blended average $400-700. Urgency is high — burst pipe, water heater failure are emergencies. Brain 3 closes fast. $25-35 margin. |
| Electrical | $65/booking | Per-appointment | 🟠 High | Blended average $400-800. Diagnostic angle strong — "circuit breaker keeps tripping" is a fear search. $25-35 margin. |
| Tree Service | $75/booking | Per-appointment | 🟡 Mid | Trimming $200-800, removal $300-2,000, storm damage $1,000-5,000. Storm emergency angle is powerful — contractor misses calls during cleanup, Brain 3 catches them. |
| Painting | $75/booking | Per-appointment | 🟡 Mid | Blended average $1,500-3,000. ROI 20-40x. Longer consideration cycle than emergency trades — lower urgency means slower trial delivery. Works economically, lower priority. |
| Landscaping (design/install) | $100/booking | Per-appointment | 🟡 Mid | Design and installation only — $3,000-20,000 projects. Do NOT apply to lawn maintenance or mowing (wrong structure). ROI 30-200x. |
| Lawn Care | $125/new client | Per-client | 🟡 Mid | Recurring maintenance — mowing, lawn care, fertilization. Per-appointment is structurally incompatible with $50-150 visits. Per-client: one new customer worth $1,500-2,000/year. Contractor ROI 12-16x year-one. We net $85-95. |
| Pool Service/Repair | $85/booking | Per-appointment | 🟢 Regional | Equipment repair $300-2,000. Warm markets only — Phoenix, Miami, Tampa, LA, Dallas, Houston. Pool pump failure in July = same emergency dynamic as AC failure in same markets. |
| Pest Control | $55/booking | Per-appointment | 🟢 Later | Average $150-400. Urgency is high (cockroaches, bed bugs = homeowner wants help today). Margin $25-30 — works but thinner. Lower priority than emergency trades. |

**Dropped niches and why:**

| Niche | Decision | Reason |
|---|---|---|
| General Contracting | ❌ Dropped | Sales cycle (4-8 weeks to close) breaks the 7-10 day trial model. Jobs don't close before Stripe fires. Come back when Tractify has enough credibility for a longer trial. |
| Garage Door | ❌ Dropped | Works economically but lowest margin in the list ($30-40/booking). Not worth the complexity at this stage. |
| Appliance Repair | ❌ Dropped | Thinnest margin in the portfolio ($15-25/booking). Requires high volume to justify. Not a priority niche. |

**The urgency filter — first test before entering any new niche:**
Before spending a dollar on any new niche, ask: does a homeowner in this niche need help TODAY or are they planning ahead? Emergency/same-day need = Brain 3 closes fast, missed call text-back is powerful, 5 jobs in 7 days is achievable. Planning/consideration = longer cycle, higher trial cost, harder to prove value fast enough. Every niche in the lead and high priority tiers above passes the urgency test. Painting and landscaping (design) are exceptions that work due to ticket size — they're slow but high enough value to justify the slower close. Any new niche that fails the urgency test AND has low ticket size should not be entered.

**The niche qualifier rule (same two-condition test, applied before any new niche is added):**
- Average job value ÷ proposed price ≥ 8x → contractor ROI is obvious
- Proposed price − estimated delivery cost ≥ $30 → Tractify margin is viable

Both must pass. One passing without the other is not enough.

**Volume tiers apply within each niche, not across niches.** A high-volume HVAC contractor getting volume discounts stays at HVAC pricing. A roofing contractor on the same volume tier stays at roofing pricing. The tiers exist within niche brackets, never as a cross-niche blending mechanism.

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

**The setup fee makes CAC almost irrelevant — this is a key strategic insight:**
The $2,000 setup fee means Tractify could theoretically spend $1,800 in ads to deliver 5 jobs to one contractor, collect $2,000 the same day, and be profitable on that contractor before a single $75 ever fires. CAC is recovered immediately at conversion — not over months like every other subscription or retainer model. This gives Tractify an acquisition aggression advantage no competitor in this space has. A competitor charging monthly retainer has to wait 2-3 months to recover CAC. Tractify recovers it the same week the contractor converts. And as the system gets more efficient — better creative, smarter targeting, proven channels — CAC drops naturally while the $2,000 ceiling stays fixed. The spread between what Tractify could spend and what it actually spends is pure margin expansion that compounds automatically just by getting better at job delivery.

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

#### Content Ideas Bank (Pull From This — Add To It Every Session)

*Every idea here can be filmed anywhere — living room, parking lot, coffee shop. No job site needed. No production setup. Just a phone and the product working in real time. Daniel handles creative execution. Jose handles the product demos and on-camera explanations. Both on camera together for the high-conviction ones.*

---

**CONTRACTOR-FACING (acquisition side) — film these first**

| Idea | Who Films | Format | Priority |
|------|-----------|--------|----------|
| "The worst product ever created is FREE" | Jose or Daniel | Talking head, hook drives curiosity | 🔥 Film first |
| "I ran $20 in ads while sleeping and this happened" | Jose | Phone screen recording + voiceover | 🔥 Film first |
| Before/after calendar — empty Monday, booked Friday | Jose | Screen recording, zero words needed | 🔥 Film first |
| "We called 10 HVAC contractors at 2pm on a Tuesday" | Both | All go to voicemail. Brain 3 catches it. | 🔥 Film first |
| Live Brain 3 screen recording — homeowner booked in 4 texts | Jose | Raw screen capture, no acting | 🔥 Film first |
| "This is why your competitor is busier than you" | Jose or Daniel | Talking head — not skill, not reviews, just automation | High |
| Before/after — contractor missing calls vs Brain 3 catching every one | Both | Split screen or cut | High |
| Series: doing random things while jobs book automatically | Both | Tennis, cooking, driving — notification comes in | High |
| Interview style — contractor explains what changed | Both (when case study exists) | Raw interview, no script | High — wait for first client |
| Case study drop — real contractor, real jobs, real timeline | Both | First one changes everything — wait for real data | 🚀 Most important video ever made |

---

**HOMEOWNER-FACING (diagnostic side) — the trust + word of mouth engine**

| Idea | Who Films | Format | Priority |
|------|-----------|--------|----------|
| "I texted a number about my AC and it told me exactly what was wrong for free" | Jose or Daniel | POV homeowner, film the actual conversation | 🔥 Film first |
| Common HVAC sounds with live diagnosis | Jose | Audio clip + text overlay, funnels to Brain 3 | High |
| "AC running but not cooling? Before you call anyone, text this" | Jose or Daniel | Catches peak intent mid-problem | High |
| "We told 10 homeowners they didn't need a repair" | Both | Honesty content — trust flywheel | High |
| Free diagnostic text angle — show the full conversation | Jose | Real Brain 3 chat, no editing | 🔥 Film first |

---

**CONTENT THAT WRITES ITSELF (zero effort, maximum impact)**

- **Billing policy education:** "We charge when the appointment happens, not when it's booked." Explain it straight to camera. Every contractor who watches it wants it immediately. Educational content that is also a conversion driver.
- **"How Tractify actually makes money":** Full transparency on the model. Contractors who understand the aligned incentives trust it completely. Radical transparency as a marketing strategy.
- **Notification content:** Every real booking that comes in during August — screenshot the notification, post it. No context needed. Volume of these compounds fast.
- **Comment response videos:** When contractors ask "how does this work?" in comments — answer it as a video. Infinite content from real questions.

---

**THE VOLUME + VARIATION STRATEGY — how Tractify wins at social media**
Film the same core concept 30 different ways and post all of them to organic. Different hook, different angle, different person on camera, different first line, different location. Post everything. One takes off — that's the proven formula. That video becomes the paid ad. You're not guessing what converts, organic already proved it before a dollar is spent.

This applies to both sides:
- Contractor side: "missed call → booked job" filmed 30 ways. Different hooks, different framings, different presenters.
- Diagnostic side: every HVAC symptom is its own video. "AC grinding noise" is one. "AC running but not cooling" is another. "AC leaking water" is another. Same format, same CTA, different symptom catches a different homeowner at a different moment of pain.

Most creators post one polished video a week and hope. Tractify posts 30 variations, finds the one that gets 50k views, and runs it as a paid ad with full confidence. Volume plus variation plus data beats polish every time. Treat content like a scientist not an artist.

---

**APPROVED CONTENT ATTACK ANGLES (locked August 1, 2026)**

These three angles were selected from a larger batch because they generate the most sub-content, require no job site access, and work across both audiences simultaneously.

**1. The Transparency Play**
Full honesty about the model — how Tractify makes money, what happens at job 5, how the billing works, why no contract, what happens if we don't deliver. Most companies hide this. Tractify leads with it. Radical transparency is both a trust signal and a conversion driver because contractors who understand the aligned incentives immediately want it.

Sub-content that stems from this angle:
- "Here's exactly how Tractify makes money" (Jose straight to camera, no frills)
- "Why we charge when the appointment happens, not when it books" (the billing policy as a standalone video — every contractor who watches it immediately trusts us more than any competitor)
- "What happens if we don't deliver your 5 jobs?" (honest answer: you owe us nothing. The honesty is the close)
- "Why there's no contract" (transparency about why we don't need one — if it's not delivering, you should leave)
- "Here's the math — what Tractify costs vs what it generates" (show the actual ROI calculator on camera)
- "How the setup fee works and what it covers" (demystify — contractors worry about hidden costs)
- "Why we only make money when you make money" (aligned incentives, no competitor can match this)

This angle has infinite sub-content because every business decision Tractify makes is a piece of transparency content. The billing policy alone is 5 videos. The model itself is a 10-part series. Run this continuously — not a one-time thing.

**2. The Pain Point Series**
One video per specific HVAC contractor pain. Not generic "grow your business" — specific, named, lived-in problems. The contractor watching it should feel like you're describing their exact Tuesday. Each video ends with "here's exactly how Tractify fixes this."

Pain points to cover (each is its own video, film 30-second and 60-second versions of each):
- Missed calls while on a job (they're on a roof, phone rings, job gone forever)
- The "I'll call you back" homeowner who never calls back
- Slow January — nothing on the calendar, no way to predict it or fix it
- Chasing leads — calling back voicemails, texting people who already moved on
- Competitors with worse reviews getting more jobs (they have better web presence)
- Not knowing which marketing is working (spending $500/mo on Google ads, no idea what's converting)
- Triple-booking — homeowner called, left voicemail, texted — contractor calls back all three without realizing they're the same person
- "I hate doing the admin stuff" — contractors who want to be on tools, not on their phone managing bookings
- Seasonal dip — every spring and fall the calendar swings wildly, zero predictability
- Losing a job to a competitor because they offered online booking and the contractor didn't

Each video is: name the pain specifically → show how Tractify solves it → offer the 5 free jobs. Never generic. Always specific enough that a contractor says "wait that's me."

**3. Build in Public**
Real numbers, real timeline, real wins and real setbacks. Show the machine being built and run live. Contractors follow this because they're small business owners themselves — they understand what it means to build something from scratch. This angle builds brand loyalty before the product ever reaches them.

Sub-content:
- "Day 1 of August — here's exactly what we're doing and why" (sets up the narrative arc for the whole month)
- "We just deployed contractor #[X]'s site — here's what happened next" (every deployment is a content moment)
- "First real booking just came in — from this exact channel" (screenshot or phone notification on camera, no setup needed)
- "We tested two ad creatives this week — here's which one won and why"
- "A contractor ghosted us after signing up — here's what we learned" (honest setbacks build more trust than wins)
- "August numbers: [X] contractors live, [X] jobs delivered, $[X] in setup fees collected" (monthly public P&L — the transparency play and build in public overlap perfectly here)
- "The moment we knew the machine was working" (the first case study moment — film it or reconstruct it with data)

Build in public works because it turns the audience into invested followers. They're rooting for the win. When the case study drops, they've been watching the whole story — the conversion rate from follower to contractor signup is dramatically higher than cold traffic because the trust is already built.

**4. The Competitor Autopsy**
Pick a named competitor (ServiceTitan, GoHighLevel, Jobber) and break down exactly why their model fails the small HVAC contractor. Not an attack — a clinical breakdown. "Here's what they charge, here's what you have to do yourself, here's who actually benefits from their model." Then: "here's what Tractify does differently." Contractors who've tried these tools and felt burned will watch this video 3 times. The hook is just naming the competitor — "GoHighLevel for HVAC contractors — here's the truth." One video per competitor. No job site needed. Jose or Daniel straight to camera.

**5. The "$75 vs $0" Series**
Pure math content. "If Tractify charges you $75 for a booking and the job closes at $1,200, what did you actually pay?" Walk through the numbers live on camera — phone calculator, whiteboard, whatever. Film 10 versions with 10 different job values ($800, $1,200, $2,500, $4,000 HVAC install). Make the ROI undeniable every single time. Short, clean, no fluff. This series doubles as paid ad creative because the math IS the close. Every HVAC contractor watching knows exactly what their average job is worth — the moment you put their number on screen they're sold.

**6. The "What I'd Do If I Were You" Series**
Jose talks directly to one specific contractor type per video — the solo operator, the guy with one truck, the contractor with 80 Google reviews who's still slow, the 5-year operator with no web presence. "If I were you, with your exact setup, here's what I'd do this week." Tactical and specific — no product pitch in the first 45 seconds. Massive trust builder because it's genuinely useful. Then: "and here's how Tractify handles all of it automatically." The personalization is what stops the scroll — contractors self-select into the video that describes them. Film one per contractor profile, no job site needed.

**7. The Objection Killer**
One video per real objection. Direct format — Jose or Daniel to camera: "I hear this all the time. Here's the honest answer." Objections to cover (each is a standalone video):
- "I already have enough work" — the answer changes their mind about slow season
- "My customers find me on Google just fine" — wait until they see what they're missing
- "I tried something like this before and it didn't work" — this is the trust reset video
- "I don't want to pay for leads" — reframe: you're paying per appointment, not per lead
- "I need to think about it" — the no-contract, no-risk close
Each one is 30-60 seconds. The contractor who has that exact objection feels seen — the video does the entire sales conversation automatically.

**8. The "What Happens at Job 5" Explainer**
Walk through the Stripe moment on camera. "When your 5th job books, here's exactly what happens." Show the SMS text, explain the $2,000 setup fee (what it covers — trial delivery, ad spend, full pipeline built and running), explain $75/booking day-of, explain no contract. Make the conversion moment feel exciting and completely fair. Contractors who watch this video before they hit job 5 convert at dramatically higher rates because there's nothing to figure out — they already know what's coming and they want it. This video pre-sells the payment page before they ever see it. Also works as objection killer for "what happens after the free trial."

**9. The "Two Founders, One Mission" Series**
Jose and Daniel on camera together. No script feel — real conversation. One topic per video: why you started Tractify, what surprised you about HVAC contractors, what you're betting August on, what you thought would work that didn't. Two-person conversation content feels like overhearing something real, not being pitched. 60-90 seconds of genuine back and forth. Builds the brand as a company, not just a product.

**10. The "Before Tractify, After Tractify" Day-in-the-Life**
Contractor's actual Tuesday — morning to end of day — before and after. The centerpiece is the SMS interface: show every capability running through texts in real time. Before: missed calls from yesterday, chasing people who already moved on, praying the phone rings. After: wakes up to three bookings already confirmed, one from a missed call at 9pm, calendar blocked from a text he sent at 8am, AI already handled a rebook overnight. Everything runs through the texts — calendar management, availability, cancellations, new bookings, job outcomes. The product IS the text thread and this video shows it all.

**11. The "I Texted Our Own Number" Video**
Jose texts the Brain 3 number live on camera — full conversation, real time, no cuts. "I'm going to show you exactly what a homeowner experiences when they reach out." 90 seconds from first text to confirmed appointment. Anyone watching can text the number themselves and verify it live. This is the most credible demo possible — no editing, no description, just the product working.

**12. The Price Comparison Breakdown — Full Series**
Not just software competitors. Two separate tracks:

*Track A — Software (ServiceTitan, GoHighLevel, Jobber, Housecall Pro):* Side-by-side pricing, what you get, what you have to do yourself, who actually benefits from their model. The close: "We only make money when you make money. None of them can say that."

*Track B — Marketing agencies and lead gen companies:* This is the bigger opportunity. Every agency selling HVAC contractors "more leads" or "growth services" charges a flat retainer whether jobs show up or not. They own the ads, they own the data, they own the relationship. Contractors pay $1,500/month hoping it works. Tractify charges $75 per confirmed appointment. No guesswork. No retainer if nothing delivers. The contrast between Tractify and agencies is even more damning than the software comparison — agencies are the main competition at the acquisition level. Film the math side by side: "Agency: $1,500/month retainer, 10 leads delivered, 3 booked, $500 per booking. Tractify: $750 for 10 confirmed appointments, zero if we don't deliver." One video per competitor type. Infinite series — there's a new agency ad every day to respond to.

**13. The "Wrong and Right" Format**
Two versions of the same situation, fast cut between them. Wrong: contractor misses a call, homeowner calls competitor, job gone. Right: same missed call, Tractify texts in 10 seconds, homeowner books Tuesday, contractor gets notification. No talking for the first 15 seconds — the contrast IS the hook. End with one line: "Which one are you right now?" Then the offer. No job site, no setup, film on a phone.

**14. The "Real Conversation" Screenshot Series**
Post actual Brain 3 conversations — names/numbers blurred, nothing else changed. No explanation — just the SMS thread from "sorry we missed you" to "you're booked, see you Tuesday." Caption: "This is what happens when a contractor misses a call now." Static image posts, zero filming required. Post 5 per week as organic. Each one is a proof point that compounds. Works on Facebook and Instagram feed where static posts still outperform in reach per post. Also becomes background visual for video content.

**15. The "This Is What $75 Actually Buys You" Reaction**
Hook is a $75 food order — Chipotle for four, a pizza night, whatever looks real in a regular feed. Film it looking like normal food content. Then: "Or — the same $75 can put a $1,200 job on your calendar." The post looks like lifestyle content until the second sentence. Contractors scroll past a hundred marketing ads — they don't scroll past a burrito. The contrast does the entire job. Then layer in the agency comparison: "marketing agencies charge $1,500/month — Tractify charges $75 per confirmed appointment. Zero if we don't deliver." Can also react to real agency ads using this framing.

**16. The "Text Me Your Problem" Live Capture — Homeowner Series**
Jose or Daniel posts on Facebook or Instagram: "AC acting up? Text this number and our AI will tell you what's wrong — free." Then films themselves watching real conversations come in live. Brain 3 is diagnosing actual homeowners in real time while they watch. No script, no setup — the product creates the content. Every response is a new video. Infinite series — every homeowner who texts and gets a real answer is a proof point that compounds into word of mouth.

**17. The "This Is What Happened While He Was Out With His Family" Series**
Screen recordings of real activity inside the system — the notification, the Brain 3 thread, the calendar update — all timestamped. Narrated in voiceover: "This happened at 11:47pm last Tuesday. Contractor was out with his family. Here's what Tractify did while he wasn't looking." Each clip is 30-45 seconds. No face needed, no job site. The timestamp is the hook — it proves the machine runs 24/7 without them. Every real booking that comes in is another episode. The library compounds automatically as the business runs.

**18. The "Our Competitors' Best Day Is Our Worst Day" Video**
ServiceTitan sends a contractor a lead — they still have to call back, schedule, confirm, manage it. GoHighLevel gives them a CRM — they still run it. Marketing agency delivers 10 leads — contractor still has to close them. "Our competitors' best day — when everything works perfectly — is still worse than Tractify's average Tuesday." High conviction, no hedging, no softening. One video, straight to camera.

**19. The "Before They Reply, It's Already Done" Format**
*Originated from Jose + sharpened together.* Show a homeowner texting about a broken AC at 10pm — "hey is anyone available?" Cut to Brain 3's reply firing in under 10 seconds. Cut to the appointment on the contractor's calendar the next morning. Total elapsed time: 47 seconds. Contractor never touched their phone. Three screens in sequence, no narration needed — the timestamps tell the whole story. Endlessly repeatable: every real Brain 3 conversation that closes a booking is a new episode. The series grows automatically as the business runs.

**20. The "Nobody Else Is Doing This" Series**
Walk through one Tractify mechanic per video and ask out loud: "Does anyone else do this?" Missed call fires a conversational AI that books in 4 texts — does anyone else do this? Charges you on the day of the appointment, not when it books — does anyone else do this? 5 jobs free before you pay a cent — does anyone else do this? Each question is its own 20-30 second video. Pairs naturally with the Competitor Autopsy series — "Nobody Else Is Doing This" makes the claim, Competitor Autopsy proves why. Both formats are infinitely repeatable: every Tractify feature and every competitor angle is its own episode.

**21. The "What Your Competitor Is Doing Right Now" Hook**
"While you watch this video, your competitor's booking page just captured a homeowner who called you and got no answer." No proof needed — statistically true for any HVAC contractor missing calls. Then pivot immediately into how easy Tractify is: text the number, show Brain 3 answer in seconds, show the booking land. The emotional hook activates competitive instinct in the first line, the ease of the demo closes them before the video ends. Different contractor pain = different version: "while you're reading this, a homeowner on your street just picked someone else." One hook, unlimited variations.

**22. The Agency Receipts Series**
*Jose: this one is huge.* Find real contractor Facebook groups. Screenshot posts where contractors complain about marketing agencies that didn't deliver — "paid $1,800/month for 3 months and got 4 leads that never closed." Black out names. Show the post. Then: "Tractify charges $75 per confirmed appointment. Zero if we don't deliver. Here's what happened instead" — pull a real Brain 3 conversation. The contractor's own words are the hook, their pain is the setup, Brain 3 is the resolution. Infinite series: there is a new contractor complaint post in some Facebook group every single day. Every one is a new episode. As Tractify grows and contractors have their own stories to tell, those become episodes too.

**23. The "One Text Changed Everything" Series**
One real text exchange per episode. Contractor texts Brain 3 at 7am — "what's on my calendar today" — gets a full answer in seconds. Or: "block Tuesday 2pm" — done, confirmed. Or: homeowner texts the van number at 8pm — conversation ends with a booked appointment. Each episode is just the text thread, timestamped, with a one-line caption. Zero filming required. Every real interaction that happens is a new episode automatically. The series builds a library of proof that compounds forever.

**24. The "Text Me Anything" Challenge**
*High-engagement play — could be a breakthrough moment.* Jose or Daniel posts: "Text our contractor line right now. Try to break it. Ask it anything." Then films responses coming in live — contractors testing edge cases, asking weird things, trying to trip it up. Brain 3 handles it. When it doesn't fail, that's the content. The challenge mechanic drives massive engagement because people want to see if it breaks. Every session is different — unlimited episodes, zero prep, the audience creates the content. This could go viral in contractor Facebook groups the first time it runs.

**25. The "I Found This in a Facebook Group" Reaction Series**
Screenshot of a real contractor post — slow season complaints, marketing agency that didn't deliver, homeowner who ghosted, missed call frustration. React to it: "I found this in a contractor group. Let me tell you exactly what's happening here and what I'd do." Solve the problem first, pitch second or not at all. Contractors watching feel seen — the problem in the post is always one Tractify solves. New post = new episode. Unlimited supply, the audience self-selects based on which pain they recognize.

**26. The "Same Question, Different Contractor" Series**
One question, answered differently by contractor profile. "What should a solo HVAC operator do this week?" Answer one. "What should a 3-truck operation do?" Different answer. "What should a contractor with 80 Google reviews but still slow do right now?" Different again. Same format every time. Infinitely repeatable: any question × any contractor type = new episode. The contractor who watches the one that describes them exactly stops scrolling.

**27. The "[Industry] Math That Will Piss You Off" Series**
"HVAC Math That Will Piss You Off." Show the typical contractor: 15 calls/week, misses 8. Those 8 × $1,400 average job = $11,200 walked out the door every single week. Then: "We catch every one of those." Different contractor profile per episode — solo operator, busy season, slow season, 3-truck shop. The title does the emotional work before they watch a single frame. Infinitely repeatable across profiles, seasons, and niches.

**28. The "How I'd Spend $300 to Get You 5 Jobs" Breakdown**
Pull up a whiteboard or notes app on camera. Walk through exactly where the money goes — Nextdoor $100, Facebook Lead Ads $100, Google Call-Only $100. Show what each channel is expected to produce. Real numbers, real logic, real allocation. "This is exactly how we run the trial budget for every contractor." Educational content that also tells the contractor exactly what they're getting. Different market or different budget = new episode. Contractors who watch this understand the machine before they sign up — they convert faster and churn less.

**29. The Funny HVAC Review Reaction Series**
Find the funniest, most outrageous, most dramatic one-star HVAC contractor reviews on Google — homeowners going scorched earth over a $200 AC checkup. React to them live. Pure entertainment content that anyone can watch, contractor or not. Broad audience reach, zero barrier to entry. The closing hook every episode: "Text us what's wrong before this happens to you — our AI will tell you if you actually need a tech." Bridges entertainment → homeowner diagnostic offer without it feeling forced. The reviews are already out there, infinite supply, a new one every day somewhere.

**30. The "Reply to This If You're an HVAC Contractor" Post**
Static post, no video. "Reply to this if you're an HVAC contractor and you've ever missed a call while on a job." Just that. The replies are warm leads who self-identified. Every reply gets a warm follow-up DM: "I saw your reply — we actually built something specifically for that." Different pain per post, endless variations: "Reply if you've ever lost a job to a competitor who had online booking." "Reply if you've ever paid a marketing agency and got nothing." Works on Facebook, Instagram, LinkedIn. The post is lead gen dressed as community content.

**31. The "Anatomy of a Booked Job" Series**
Break down exactly how one specific booking happened — source to calendar. "This job came in Tuesday at 9pm. Here's exactly what happened." Homeowner searched Google, clicked Call-Only ad, missed call, Brain 3 fired in 10 seconds, four texts, booked. Show the actual data trail. Each episode is a different booking from a different channel. Every real booking is a new episode. Once 20 bookings exist, there are 20 episodes of hard proof. The attribution data the admin brain tracks automatically becomes the content.

**32. The "Steal This" Playbook Series**
"HVAC contractors — steal this." One specific tactic per video, no pitch. "Steal this: text every homeowner who gave you a Google review this exact message." Show the copy-paste message. "This got [X] responses and [Y] bookings." Hyper-practical, hyper-specific, genuinely useful. The tactics are real Tractify onboarding steps — contractors who steal them and do it manually realize fast they could just use Tractify instead. Soft sell that doesn't feel like a sell. One tactic per video, dozens of episodes ready to film. Give away real value, let the product close.

**33. The "What I'd Do in Your City" Series**
Jose looks up one specific city on Google Maps, pulls up the top HVAC contractors, evaluates the top 3 out loud — reviews, GBP listing, online booking, web presence. "If I were an HVAC contractor in Austin right now, here's exactly what I'd do to own this market." No contractor involvement needed. Any city is a new episode. Contractors in that city watch it and feel like it's made for them. The market analysis is free intelligence that makes them want the pipeline running.

**35. The "Before You Pay That Agency" Checklist Series**
One question per video that contractors should ask any marketing agency before signing. "Before you pay that agency, ask them this: if you don't deliver a booked appointment, do I still pay?" Short, direct, one question, 20 seconds. Then: "Here's what Tractify's answer is." The close every episode: "At the very least — get your first 5 jobs free with us before you throw your money at anyone. No risk, no contract, nothing." The checklist format means each video stands alone but the series builds a body of work that makes every agency pitch look weak by comparison. Tailored specifically to Tractify's strengths — aligned incentives, day-of billing, no retainer. Infinite episodes: every bad agency practice is a new question.

**36. The "This Is What Happens When Nobody Answers" Series**
Walk through the exact sequence from a homeowner's perspective. "You need your AC fixed. You call three contractors. All three go to voicemail. You text the fourth one — Tractify responds in 8 seconds. You book. Who got the job?" Homeowner POV, no jargon, no tech. Just the experience. Every homeowner has lived this — calling service companies and hitting voicemail after voicemail. The series works on both sides simultaneously: homeowners recognize themselves, contractors recognize what they're losing. Same story, two audiences, no extra filming.

**37. The "How We Found You" Series**
After each contractor signs up through an ad, post a short clip: "This contractor found us through [channel]. Here's what happened next." Show the intake form, the deploy, the first booking land. Makes the entire acquisition funnel visible and proves the system works end to end — from the ad all the way to a job on their calendar. New contractor = new episode automatically.

**38. The "What If" Series**
One hypothetical per video, designed as a hook. "What if you never had to chase a lead again?" "What if your phone not ringing didn't scare you anymore?" "What if every missed call turned into a booked appointment while you slept?" No product demo, no pitch in the first 30 seconds — just the question sitting there while the contractor imagines it. Then show it happening. The "what if" framing gets past the sales filter because it's imagination, not pitch. Any pain point becomes a new episode.

**39. The "One Missed Call" Mini-Doc Format**
Follow a single missed call from ring to booked appointment. 90 seconds, five scenes: homeowner calls, contractor on roof doesn't answer, Brain 3 fires the text, homeowner responds, appointment confirmed. Real data, real timestamps, narrated like a documentary. Every episode is one job that would have been lost. The mini-doc format earns more watch time than any other format on social — it has a story arc with a resolution. Compounds as a series as real bookings accumulate.

**40. The "In Their Words" Series**
Screenshot or record contractors texting Tractify's Brain 2 — their actual words about what the system is doing for them. Not a testimonial, not an interview — literally their texts. "Just got a booking while I was under a crawl space. Love this thing." Caption it, post it. One screenshot, one line of context, done. Zero effort, pure social proof. Scales automatically as the contractor portfolio grows — every real reaction is a new episode.

**34. The Hot Take Series**
Short, confident, one-sentence takes followed by the explanation. 20-30 seconds each, clips perfectly for Reels and TikTok. Designed to generate comments — debate in the comments is the reach. First hot take: "AI voicemail is still just a voicemail." Every HVAC company is implementing some version of an AI answering service — fancier hold music, a bot that says "we'll call you back." The homeowner still has to wait. Brain 3 doesn't take a message. It has a conversation and closes the booking while the contractor is on the roof. That's not an upgrade to voicemail — it's a completely different product. The hot take positions Tractify against the entire "AI answering service" trend and makes them all look like the same thing. Other hot take angles: "Your Google reviews are worth more than any ad you'll ever run." "The best HVAC marketing channel in 2026 has nothing to do with social media." "Leads are worthless. Booked appointments are what matter." Infinite series — every competitor trend, every industry assumption, every bad marketing practice is a new episode.

**41. The "What I'd Do With Your $1,500" Series**
A contractor says they're about to pay an agency $1,500/month. Walk through exactly what Tractify does with that same money — ad spend allocation, channels activated, expected bookings. Show the math side by side. Different budget per episode: $500, $1,000, $1,500, $2,000. The contractor watching does the comparison themselves before a single word is said about switching. The "$1,500 to an agency vs $1,500 through Tractify" is the sharpest version — agencies take the money and hand you leads you still have to close. Tractify hands you confirmed appointments billed at $75 each. The math is embarrassing for agencies.

**42. The "Rating HVAC Contractor Websites" Series**
Pull up random HVAC contractor websites live on camera and rate them. Fast, entertaining, contractors watching will immediately check their own site. "No online booking — minus 10 points. No reviews showing — minus 10 points. No way to reach them after hours — minus 10." The hook at the end: "Here's what a 100-point site looks like." Then show a Tractify subdomain. Genuinely useful criticism that makes them feel the gap without being called out directly.

**43. The "Day in the Life of Brain 3" Series**
Narrate a full 24-hour window of real Brain 3 activity. "6:47am — homeowner in Bellevue texted about a grinding AC noise. Diagnosed it, offered three slots. 7:12am — contractor blocked Wednesday afternoon via text. 9:33pm — missed call came in. Booked the homeowner before the contractor even knew they called." Timestamped log turned into content. Screen recording only, no face needed. Every 24 hours is a new episode — the business running creates the content automatically.

**44. The "Homeowner POV" Series**
Short first-person clips told from a homeowner's perspective. "My AC broke at 10pm on a Friday. Here's what happened." Walk through the experience: called the contractor, got voicemail, texted the number, Brain 3 responded in seconds, booked for Saturday morning, got a reminder text, contractor showed up. Story format, not a demo. Homeowners who watch it recognize themselves and share it. Contractors who watch it see their missed calls from the other side for the first time.

**45. The "Tractify vs The Old Way" Format**
Same scenario, two outcomes — shown sequentially. Old way: homeowner calls, goes to voicemail, contractor calls back three hours later, homeowner already hired someone else. Tractify way: same homeowner texts, Brain 3 books them in four messages, contractor gets a notification with the address and a Maps link. Two phone screens, no fancy editing, just the contrast. Every channel and every failure mode is its own episode.

**46. The "How Long Does It Take" Series**
Time specific things on camera in real time. Start the timer. Show the action. Stop the timer. The number is the punchline. Contractor-facing: "How long does it take to block time on your calendar?" Text Brain 2. 11 seconds. Done. "How long does it take to find out what's on your schedule tomorrow?" 8 seconds. Homeowner-facing: "How long does it take to book an HVAC appointment?" Text Brain 3. 47 seconds. Confirmed. The homeowner version has massive creative potential — Jose or Daniel booking an appointment while doing something completely unrelated. Making lunch. Eating dinner. Dodging tennis balls. Running on a treadmill. Book the appointment without stopping what you're doing. The contrast between how casual it is and what just happened is the whole joke. Each scenario is its own episode. This series could run for a year.

**47. The Contractor Character Series — "Mike, Jake, and Dave"**
Three recurring illustrated characters — stick figures with personality, not AI avatars. Think simple hand-drawn HVAC workers with distinct visual identities. Each character represents a real contractor archetype. Used across memes, educational content, story arcs, and animated shorts. The characters are the vessel — the business lessons flow through them.

**Mike "Big Mike" Morales** — The Old School Guy. 58, been doing HVAC 35 years, his father taught him the trade. Books everything from memory and a paper planner. Says "I don't need any tech, my reputation speaks for itself." Has 94 Google reviews and doesn't know how to read them. Misses 6-8 calls a day while he's on rooftops. His competitor Danny (28 years old, half Mike's experience) is busier than him and Mike cannot figure out why. Mike's signature pose: phone to ear, missed call notification on screen he can't see. Mike's catchphrase: "Back in my day you just answered the phone." Episodes: the day Mike realizes Danny has online booking. The day Mike's granddaughter books an HVAC appointment in 40 seconds while he watches. The day Mike's first Brain 3 booking lands while he's at dinner.

**Jake Torres** — The Hustle Guy. 31, one truck, works 12-hour days, takes every call he can, books jobs entirely in his head. "I'll sleep when I'm dead" energy. Loses jobs constantly because he can't answer while he's under a house or in an attic. His calendar is chaos — double books regularly, forgets a job every few weeks. Has huge dreams of a 3-truck operation but revenue isn't growing despite working harder. Jake's signature pose: running to his truck with three phones in his hand. Jake's catchphrase: "I just need more hours in the day." Episodes: the week Jake realizes he's working 70 hours and making the same as when he worked 50. Jake texting Brain 2 at 11pm to check his calendar. Jake's first week where he didn't miss a single call.

**Dave Park** — The Growing Guy. 44, 3 trucks, two employees, drowning in coordination. Smart, ambitious, knows he needs to systematize but every tool he tries requires training his crew and they hate change. Pays a marketing agency $1,200/month for "leads" that never convert. Checks his phone 40 times a day managing things that should be automated. Dave's signature pose: three browser tabs open, all the wrong software. Dave's catchphrase: "There has to be a better way." Episodes: Dave getting his first month report from Tractify and doing the math on what he paid the agency for. Dave discovering his guys can text to block time without calling him. Dave's first month where he didn't have to touch a booking.

The animation style is intentionally simple — you're not competing with Pixar, you're competing with sticky relatable content that contractors tag their friends in. One character in one specific situation = one episode. These can be batched fast and they compound: once people know Mike, Jake, and Dave, every new episode gets watched because the audience is invested in the characters.

**48. The "Teach Me to Fish (From My World)" Series**
Jose teaches HVAC contractors how to think about their business — not the trade, the business. He's not teaching HVAC. He's teaching what he knows: systems thinking, automation, marketing, how to stop trading time for money, how to read a number and make a decision from it. "I can't teach you how to fix a heat pump. But I can teach you how to never miss a lead from a heat pump call again. Brain 3 handles the diagnosis. I'll handle the rest." One business concept per video: how to think about your close rate as a number, how to calculate what a missed call is worth in dollars, how to read your busiest weeks and predict your next slow one, why working harder is the wrong answer after a certain point, what it actually costs to hire a marketing agency vs. build a system. The honest framing — "I know business and automation. Brain 3 knows HVAC. Together you have everything." — is more credible than pretending to know the trade.

**49. The "What Happened Next" Series**
Story time with real data. Pick one specific moment — a contractor deploys, a homeowner texts, a missed call comes in — and narrate what happened next in real time with real timestamps. "This contractor went live on a Friday at 3pm. Here's what happened in the next 72 hours." Not a summary. A story with a beginning, middle, and resolution. Every real contractor deployment is a new episode automatically. Works as organic content and as ads — it's a story that answers the exact question every watching contractor has: "does this actually work and how fast?"

**50. The "Real Numbers, No BS" Series**
Actual results with nothing edited out — including the ones that didn't work. A contractor who converted. A contractor who didn't. What the data showed, why it happened, what changed. No agency ever does this because agencies sell illusions. Tractify sells outcomes. The willingness to show a deployment that underperformed and why is the most trust-building thing a company in this space can do. Every contractor watching has been burned before — they can smell when someone is hiding results. Showing the bad ones makes the good ones undeniable.

**51. The "Before You Pay That Agency" Checklist Series** (already in bank as #35 — expanded version)
One video per question contractors should ask any marketing agency before writing a check. "Do you charge me if I don't get results?" "Can I see last month's numbers for a client in my market?" "Who owns the ads — me or you?" Then: "Here's Tractify's answer to each one." Tailored entirely to Tractify's actual strengths — per-appointment billing, day-of charges, no contract, complete transparency. One question per episode. Every bad agency practice is a new video. Works as organic content and as pre-conversion education — contractors who've watched the series understand the billing model before they even see the Stripe page. Close rate on these viewers will be higher.

**52. The Graceful Hot Take Format**
Hot takes that position without attacking. The structure: lead with the trend, then ask the question nobody is asking. "A lot of HVAC companies are implementing AI answering services. I get the appeal — sounds modern, sounds like you're doing something. Here's the question I'd be asking: does the homeowner leave with a confirmed appointment, or do they leave with a promise someone will call them back?" Then show the Brain 3 result. The competitor is never named. The product is never pitched in the first 40 seconds. The take is analytical, not aggressive. Contractors watching who've tried the AI answering service thing will nod along and then find themselves watching Tractify close the same call Brain 3 already handled. The confidence of the offer makes the attack unnecessary — you don't need to say anyone sucks when the product speaks that loudly. One industry trend per episode. New trends emerge constantly. Infinite series.

**53. The "Contractor Q&A Mailbag" Series**
Real questions pulled from HVAC contractor Facebook groups and comment sections, answered on camera without softening. "Someone asked: what if a homeowner books and doesn't show up?" Full honest answer — what the billing policy says, how rare it is, what the numbers look like. "Someone asked: what if I already have a website?" Full answer. "Someone asked: how is this different from the last thing I tried?" Full answer. The questions are real, the answers are direct, nothing is choreographed. Every question a watching contractor has is already in their head — the series answers them before they have to ask. Works as objection handling without ever feeling like a sales video because it was never designed as one.

**54. The "Birth of a Business" Series**
The full story of how Tractify came to be — the cold calls, the pivot, the Twilio compliance hold, the moment the SMS brain started working, the first deployment, the first real booking. Told as it's happening in August, not as a retrospective. Jose and Daniel building something in real time, every decision explained, every setback shown. This is the brand-building series — not what Tractify does but who built it and why. Contractors watching aren't just buying a product; they're backing founders they believe in. The story arc is already written: two guys out of work in August betting on a machine they built from scratch. That's a story people root for. One episode per major milestone. The series exists forever as the company's origin story.

**FILMING NOTES**
- Retro camera with good audio (Daniel's idea) — lo-fi visual, high-fi sound. Forces weight onto what's being said and what's on screen. Perfect contrast with the technology being shown.
- Raw and real beats polished every time. One good take on iPhone beats ten produces ones.
- Both faces on camera for the high-conviction contractor pieces — two founders builds more trust than one.
- Tag every piece of content with a ?src= tag in the link so the brain can tell which video drove contractor signups.

---

#### Content Production System — How 3x/Day Actually Runs (August 2026)

*Locked August 1, 2026. Jose is naturally gifted at business and building — not content creation. The system is designed around that. The parts that don't come naturally get systematized. The parts that do come naturally (business thinking, product knowledge, genuine conviction) are what shows up on camera.*

---

**The core reframe — Jose is not a content creator. He is a founder documenting what's happening.**
Every time he tries to "make content" it feels unnatural and forced. Every time he just talks about something he genuinely thinks or something that just happened in the business, it's good. The system's job is to put him in the second situation constantly and remove all friction in between. The camera is a journal, not a stage.

**Jose's unfair advantage on camera:** He knows more about why this business works than any content creator in this space. He built it from scratch. He understands contractor psychology, homeowner behavior, pricing decisions, channel strategy — all from first principles. Most content creators are performing expertise they read somewhere. Jose has the real thing. Audiences can tell the difference. His job is to get out of his own way and talk about what he actually knows. The system handles everything else.

**Content does not need to be good in a production sense. It needs to be true in a business sense. Those are different things and Jose is already equipped for the second one.**

---

**The three content tiers — what 3x/day is actually made of:**

**Tier 1 — Pre-filmed library (batch days, August grinding):** The evergreen foundation. Hot takes, objection killers, transparency content, character series, how-long-does-it-take, two founders on camera. These get filmed in bulk during August and scheduled to post automatically for months. At 7 finished pieces per filming day × 20 filming days = 140 videos. With repurposing (one 60-second video → full post + 15-second clip + quote graphic + screenshot moment + written version = 6 posts) that 140 becomes 700+ posts from August alone.

**Tier 2 — Reactive content (capture days, 20 min/day max):** Whatever happened in the business that day. Real booking that came in, Brain 3 conversation that closed, contractor text, a decision made and why, something noticed. Voice memo it, film a 30-second version. These are the most authentic posts because they're live and real. The business creates this content — Jose just points his phone at it.

**Tier 3 — Zero production (automatic as the business runs):** Real Brain 3 conversations, booking notifications, contractor milestone texts, First 48 episodes, Real Numbers No BS entries. By month 3 with 10+ contractors and bookings flowing daily, there are enough real interactions happening every day to fuel multiple posts without filming anything new. This tier gets more powerful every week automatically.

---

**The weekly operating structure:**

**Monday and Thursday — batch filming days (2 hours each)**
Jose and Daniel in the same room. Pre-decided concepts from the content bank — at least 3 concepts per session, filmed 3 ways each. That's 9-18 clips per week. Daniel runs the camera. Jose talks. No scripting — just the concept, the hook, and the point. 2 minutes of prep per concept, then film. The session agenda is written the night before. Walk in knowing exactly what's being filmed. No decisions during the session, only execution.

**Tuesday, Wednesday, Friday — capture days (20 min/day max)**
Whatever happened in the business. Voice memo it first (20 seconds), then film a 30-second version. Post directly or hand to Daniel for the queue. These are Tier 2 posts — reactive, live, authentic. No structure required. If nothing happened worth posting, pull a scheduled Tier 1 clip instead.

**Sunday — scheduling day (30 min)**
Load the week's clips into the scheduler. Batch content → 8am automated posts. Capture content → midday and evening slots. After Sunday, don't think about content until the next capture moment or next batch day. Everything else is automatic.

---

**Division of labor between Jose and Daniel:**

**Jose's job:** Be on camera talking about things he actually thinks. Notice when something interesting happens in the business and say "film this." Approve what goes out. Generate the voice memos when insights hit.

**Daniel's job:** Everything else. Camera operation on batch days. Editing and clipping. Posting and scheduling. Pulling the best 15-second clips from longer videos. Making quote graphics. Repurposing long content into short form. Tracking what performs and reporting back. Running the scheduler.

Jose cannot be both the product on camera AND the production manager. Daniel runs the machine. Jose is the product. This is the only division that works at volume.

---

**The voice memo capture habit — the single most important system:**

Jose's natural mode is business thinking. He has product insights, strategic observations, and genuine convictions constantly — but they evaporate before they become content because there's no capture mechanism. The fix is zero-friction: keep a running voice memo. Any time a business thought hits — why a decision was made, something noticed about the market, a contractor behavior that was interesting, a competitor move that's worth a take — voice memo it immediately. Takes 20 seconds. Daniel reviews the voice memos weekly and pulls the ones worth filming into the next batch day agenda.

The pipeline: Jose's head → voice memo → Daniel curates → batch day agenda → camera → scheduled post.

This turns Jose's natural business thinking into content with almost no friction on his end. The thoughts that would have disappeared become a week's worth of filming material.

---

**The repurposing multiplier — where the volume actually comes from:**

One 60-second video filmed in August becomes:
1. Full video post on Facebook (1 post)
2. Same video on Instagram Reel (1 post)
3. Same video on TikTok (1 post)
4. Best 15-second clip pulled from it (1 post)
5. Best line as a quote graphic (1 post)
6. Screenshot of the most resonant moment with caption (1 post)
7. Written version of the same point as a text post (1 post)

= 7 posts from one filming session, across platforms, on different days.

At 7 videos filmed per batch day × 2 batch days/week × 4 weeks = 56 videos × 7 = 392 posts in August alone. That's more than one post per day for a full year from August filming only, before any Tier 2 or Tier 3 content is added.

---

**Additional zero-production formats that fill the daily volume:**

- **Quote graphic posts** — one bold stat on a clean background. "The average HVAC contractor misses 8 calls a day. That's $56,000 a year." 3 minutes in Canva. Can batch 50 in one afternoon.
- **Poll posts** — "HVAC contractors: how many calls did you miss last week?" Zero production. High engagement. Comments from the poll become content topics for next week.
- **Comment response videos** — someone leaves a real comment, film a 30-second reply directed at them. Makes the commenter feel seen and drives everyone else to comment hoping for the same.
- **"Today at Tractify" format** — 30-second voice memo style, no script, no editing. "Today we deployed our third contractor. First booking landed at 7pm from a missed call at 4pm. Here's what Brain 3 said." One per day = 365 posts that build a public track record.
- **The running weekly scoreboard** — simple graphic every Friday: "This week: X contractors live, X jobs booked, X missed calls recovered." 5 minutes to make. 52 of these across a year build undeniable credibility over time.

---

**The honest math on 3x/day:**

3 posts/day × 365 days = 1,095 posts/year. From August filming alone (repurposed) = ~400 posts. Tier 2 reactive content at 1/day = 365 posts. Tier 3 automatic business content at 1/day (starts slow, grows as business scales) = ~200 posts in year 1. Total: ~965 posts. Close enough to cover 3x/day with the weekly scoreboard and quote graphics filling the gaps. The system gets easier as the business grows, not harder — every new contractor and booking adds more Tier 3 material automatically.

---

*The brain should reference this section whenever asked about content strategy, posting cadence, division of labor between Jose and Daniel, or how to think about scaling content volume.*

---

#### Daniel Interviews Jose — Master Question Bank (August 2026)

*Daniel asks these on camera. Jose answers naturally. Hours of authentic footage that cuts into dozens of pieces per session. Pull from this list every batch filming day — 5-7 questions per session. Every answer will be different each time the question is asked because the conversation pulls different angles. Never run out of content.*

---

**The Origin Story**
- What were you actually doing the day you decided to build Tractify?
- What was the exact moment you knew cold calling wasn't the move?
- Walk me through the first phone call you ever made pitching this — what happened?
- What did contractors say that changed how you thought about the whole business?
- When did you first realize this could be a unicorn?
- What did the business look like in your head before you built it versus what it actually became?
- What's the thing you were most wrong about at the beginning?
- Was there a moment you almost quit?

**The Product Decisions**
- Why SMS? Why not an app, why not a dashboard, why text messages?
- Walk me through why you made the HVAC form just a phone field.
- Why did you build Brain 3 before you had a single paying client?
- Why did you kill the onboarding call before you ever had an onboarding call?
- What made you decide to put the AI in the back end instead of making it the marketing angle?
- Why does the contractor stay on a Tractify subdomain permanently instead of getting their own domain?
- What's the feature you almost built that you're glad you didn't?
- Why did you decide to charge per appointment instead of a monthly retainer?

**The Pricing Philosophy**
- Walk me through how you landed on $75 per appointment.
- Why do you charge on the day of the appointment and not when it books?
- What made you decide to do 5 free jobs instead of a free trial period?
- Why is the setup fee $2,000?
- What's your honest answer when a contractor says that's too expensive?
- What happens to a contractor who wants to stop?

**The Competitive Thinking**
- What does ServiceTitan get wrong about HVAC contractors?
- What does GoHighLevel get wrong?
- Why do marketing agencies keep failing contractors?
- What does Tractify do that none of them can copy?
- What would you do if a well-funded competitor tried to build exactly what you built?
- What's the moat that compounds automatically without you doing anything?
- If you had to pick the one thing that makes Tractify genuinely different, what is it?

**The Contractor Psychology**
- Describe the HVAC contractor Tractify is built for.
- What does a day in the life of that contractor actually look like?
- What keeps him up at night that he'd never say out loud?
- Why do contractors keep paying marketing agencies that don't deliver?
- Why does the most experienced contractor sometimes have the worst web presence?
- What did you learn about contractor trust from cold calling?
- Why does a contractor who misses 8 calls a day not realize he's losing $56,000 a year?
- What's the fastest way to lose a contractor's trust?
- What's the fastest way to earn it?

**The Homeowner Psychology**
- What does a homeowner actually want when their AC breaks?
- Why does a homeowner call three contractors and hire whoever responds first?
- Why does the diagnostic offer work better than "book now"?
- What happens emotionally when Brain 3 responds at 11pm and actually helps them?
- Why does a homeowner who texts a number and gets a real answer become a loyal customer?

**The Business Model**
- What does Tractify look like at 50 contractors?
- What does it look like at 500?
- What's the thing that makes this defensible long term?
- How does Tractify get smarter automatically the longer a contractor stays?
- What would you say to someone who thinks this is just a website company?
- What's the version of Tractify that beats ServiceTitan's entire market cap?
- Why is HVAC the right place to start?
- What's the second niche and when do you go there?

**The Strategy**
- Why ads instead of sales?
- Why subdomains forever instead of custom domains?
- Walk me through how 10 channels activate from one contractor signing up.
- What's the diagnostic ad and why does it change everything?
- Why does a missed call become your best asset instead of your biggest problem?
- Why does the billing policy make the product easier to sell?
- What does "contractor logs in once and everything else is a text message" actually mean in practice?
- Why did you decide the machine has to work without Jose or Daniel being involved?

**The Build Process**
- What was the hardest thing to build technically?
- Walk me through the Twilio compliance situation — what actually happened?
- What's the thing that looked impossible that you figured out anyway?
- What broke that you weren't expecting to break?
- What's Brain 3 and what does it actually do?
- What does a Brain 3 conversation look like start to finish?
- How does Tractify know which channel a booking came from?

**The August Bet**
- What's actually at stake in August for you personally?
- What happens if the machine doesn't deliver the 5 jobs?
- What happens if it does?
- What does winning August look like to you?
- What does losing August look like?
- Why are you and Daniel both all-in on this right now?
- What would you tell a contractor who's skeptical this is real?

**The Personal Stuff**
- What do you actually know about HVAC?
- What does your family think you're doing?
- What's the hardest part of building a company with a co-founder?
- What's the thing about building that you're genuinely good at?
- What's the thing you had to build a system around because it doesn't come naturally?
- What does success look like to you in 3 years?
- What do you want this to be before you ever think about selling it?
- What would the version of you from 2 years ago think about what you're building right now?
- What do you know now that you wish you knew at the start?

**The Hot Takes**
- Is AI in home services overhyped?
- Is the monthly retainer model dead?
- What's the worst piece of business advice you ever got?
- What's something the whole marketing industry gets wrong?
- What would you tell an HVAC contractor who says he doesn't need tech?
- What's wrong with how most people think about free trials?
- Is cold calling dead?
- What do you think about "build it and they will come"?
- What's the most dangerous thing a contractor can do with their marketing budget?

**The Forward-Looking Ones**
- What does Tractify look like the day you walk away from it?
- If a massive company tried to acquire Tractify in 3 years, what number makes you take the meeting?
- What niche after HVAC and why?
- What does the AI do in year 3 that it can't do today?
- If you had to bet everything on one thing Tractify does that no competitor will ever replicate, what is it?

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

**⚠️ SUPERSEDED (session 14, confirmed final August 17, 2026, session 27) — the entire access-grant model below (GBP Manager access, Facebook Page Editor access, "post-access automation") was never built and is not the plan.** It was already scratched once — see "Gap 3 — Post-access channel automation ✅ SCRATCHED (session 14)" further down this file. Jose reconfirmed this as final in session 27: Tractify never asks a contractor for account access to Google Business Profile or Facebook/Instagram, and never configures those channels on a contractor's behalf, manually or via granted API access. The actual, current model is the AI SMS drip texting the contractor step-by-step instructions and the contractor doing it themselves in their own accounts — the "AI SMS handles low-friction channels" paragraph a few lines down in this same entry was actually right, it just didn't go far enough; there is no separate access-required tier for GBP reviewer outreach or Facebook group posting either, those are Jose-manual or dropped, not access-automated. Left intact below for the reasoning trail (the "revoke-first" transparency framing was good thinking, just applied to a mechanism that got cut) — do not build any of the "post-access automation" API integrations described here.

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

**August 2, 2026 — The automation endgame is the design constraint, not just the vision. Every build decision evaluated against it.**
The full autonomous operation picture was articulated clearly for the first time across three areas: capital deployment (Brain 1 gets Meta/Google Ads API access with pre-approved budget guardrails, executes without Jose), contractor management (Brain 2 escalates its own behavior based on patterns — close rate drops, Brain 2 fires retention conversation automatically), and content (Brain 1 generates strategy and scripts from Brain 3 data, Jose delivers on camera — content strategy is already 80% automatable today). The meta-principle locked: every feature, every data field, every source tag, every logging decision exists to feed autonomous operation at scale. This is not a future aspiration. It is the active design constraint applied to every build session. Ask before every architectural decision: does this generate data Brain 1 needs, or does it consume Jose's time? If it generates data, prioritize it. The reason Tractify is already doing this well — booking source tracking, acquisition tags, close rate logging, SMS session persistence, RAG diagnostic knowledge, homeowner session logging — is that every session has been building the training set for the autonomous layer without explicitly naming it. Name it now. The destination is: Jose handles 3 flagged decisions per day and films content Brain 1 briefed him on. Everything else runs. Revenue line goes up. Headcount stays flat. That's the exit multiple story.

**August 2, 2026 — Autonomous capital deployment endgame locked. The three-brain architecture's final destination.**
Jose articulated the full endgame clearly for the first time: all three brains feed data into Brain 1 long enough that Brain 1 becomes the operator. Revenue generated auto-deployed by Brain 1 — ad allocation, contractor acceleration, channel optimization, demand routing — all without Jose or Daniel involved. Jose and Daniel remain in charge of content, branding, and strategic decisions above a threshold. Everything else autonomous. Achievable because the data infrastructure is being built right now: every homeowner text, every booking, every source tag, every close rate compounds into a dataset Brain 1 can act on with real confidence by contractor 50, and at genuine portfolio-intelligence level by contractor 200. This is not a feature — it's the architecture's destination. The exit multiple on a three-person company running a self-optimizing capital deployment machine with two compounding data moats is a different category from anything else in this space. Full section added to "What Tractify Is" under "The autonomous capital deployment endgame."

**August 2, 2026 — Single-number Twilio architecture + unified brain intelligence layer locked (future build, not immediate).**
Emerged from a question: what if instead of one Twilio number per contractor, Tractify uses a single shared number for all homeowner and contractor SMS? Tracing the implications all the way out arrived at the third evolution of the north star — and the first "unicorn" conclusion in this brain that came from following an architectural decision rather than describing a feature. Full architecture and strategic rationale documented in the "What Tractify Is" section under "The single-number unified intelligence architecture."

Key decisions locked: (1) Technically viable — single number handles all SMS traffic. Per-contractor voice-only numbers (~$1/month each) still needed for missed call routing only — voice forwarding requires a unique destination number per contractor to identify who the missed call was for. (2) The real unlock is not cost savings but market intelligence — every homeowner text is a geographic and symptomatic demand signal. One collection point = unified view of what homeowners need, where, and when, building automatically with no extra work. (3) Three brains fed simultaneously enables cross-brain routing intelligence that the current siloed architecture cannot do: Brain 1 can push routing preferences into Brain 3 in real time (e.g., "route next homeowner in this zip to contractor X — they're 1 job from Stripe"). Brain 2 gets proactive preparation alerts when Brain 3 books a job. (4) Homeowner demand moat is the second compounding data asset alongside contractor behavioral moat. By contractor 50, predicts seasonal demand spikes. By contractor 200, identifies which city to expand into next based on real demand density. (5) One number becomes the brand: "Text Tractify when something breaks" — not a per-contractor number, not a per-niche number, one trusted identity that homeowners carry forever.

Routing decision tree for single number: (1) sender matches contractors.phone → Brain 2. (2) Active homeowner_sms_sessions row → Brain 3 existing session. (3) Missed call from this phone to any contractor within 2 hours → Brain 3 to that contractor. (4) Keyword matches contractor slug → Brain 3 new session. (5) None → Brain 3: "Hey! Who are you trying to reach today?" Keyword system handles physical channels — van wrap says "Text PREMIERCOMFORT to [NUMBER]" and keyword maps to booking_slug in DB.

NOT BUILDING NOW. Priority is Stripe + trial delivery. Flag this for post-Stripe roadmap.

**August 2, 2026 — Social media post monitoring evaluated and deferred.**
Proposal: have AI constantly scan Nextdoor and Facebook groups in contractor service zip codes for homeowners posting about HVAC problems, then respond with the diagnostic offer automatically. Full evaluation: the Gmail-as-notification-monitor approach is technically viable and ToS-safe — platforms send notification emails to group members when relevant posts appear, those emails can be parsed to detect keywords, AI drafts a comment reply, Jose posts manually within 5-10 minutes of the original post. Reddit also viable via public RSS/API with zero ToS concerns. Decision: too much infrastructure for current stage. Response speed is the critical requirement (posts have a 10-20 minute window before someone else replies) and building the Gmail pipeline + monitoring cron + alerting system before having first paying clients is wrong priority ordering. Manual monitoring — Jose and Daniel joining groups and checking 1-2x per day — is sufficient for the trial cohort. Revisit at 20+ contractors when channel volume justifies the build. The core mechanic (free diagnostic offer in reply to an active homeowner post) is a high-conviction tactic to implement manually now, automated later.

**August 2, 2026 — Multi-brand obfuscation strategy evaluated and rejected at this stage.**
Proposal: split into 3 brands — (1) Tractify stays exactly what it is but looks like a marketing agency to competitors, (2) diagnostic tool built under a separate brand so the two don't obviously connect, (3) third brand for lower-ticket niches (barbers, window tinting, car detailing) on a pure monthly retainer with no ad spend behind them. Full evaluation: the core instinct (don't show competitors the full architecture) is right, but the execution is wrong for this stage. Splitting into 3 brands directly breaks the unified brand moat — the single-number architecture (session 20) requires ONE trusted identity that homeowners carry forever. "Text Tractify when something breaks" is the endgame brand position. Three brands makes that impossible. It also splits Jose and Daniel's focus at the worst possible time — August is about proving the machine delivers 5 jobs per contractor. Managing 3 brand identities, 3 content strategies, and 3 product lines before the first Stripe conversion is the wrong allocation. Decision: single brand, full focus. The diagnostic brand as a separate identity is a Year 1 move after HVAC has traction and at least 3 paying clients generating predictable revenue. Lower-ticket retainer SaaS (barbers, detailers) is a real, viable business — Year 2, separate entity. Competitor obfuscation is handled by content strategy (see below), not brand fragmentation.

**August 2, 2026 — Content strategy principle locked: show results, never the recipe.**
The concern is valid — if competitors understand the full architecture (three brains, single-number routing, diagnostic close mechanic, Brain 3 conversational booking), they could deploy a version with more money and a bigger team. The answer is not brand splitting — it's content discipline. What goes on camera: jobs booked, calendar filling up, a Brain 3 conversation that closed a booking (show the homeowner side, not the system side), real numbers from the system, the before/after of a contractor's week. What never goes on camera or in captions: the three-brain architecture, how Twilio routing works, that it's AI under the hood, the $1.80/month unit economics insight, how Brain 3 handles multiple contractors simultaneously. The product looks like magic from the outside — "I set up this forwarding thing and jobs started showing up." Keep it that way. Competitors who see the surface will think "missed call text-back + booking page." By the time anyone understands what they're actually looking at, Tractify has 12 months of behavioral data and homeowner trust built into thousands of phones across the service area. That data is uncopiable regardless of how much money they have. Show the magic, protect the mechanic.

**August 4, 2026 — Brain 3 slot pick bug found, fixed, and fully verified end-to-end.**
Root cause: PostgreSQL `pg` library auto-deserializes JSONB columns into JS objects on SELECT. `session.offered_slots` arrives as a JS array already — not a JSON string. Old code `JSON.parse(session.offered_slots)` called `.toString()` on the array → `"[object Object],[object Object]"` → SyntaxError → `catch(e){}` silently set `offeredSlots = []` → `chosen` was always null → Brain 3 looped on "Reply 1, 2, or 3" forever regardless of what the homeowner sent. Fix: one-line guard in `handleSlotPick` in `backend/services/homeownerSmsAI.js`: `const raw = session.offered_slots; offeredSlots = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');`. Verified via POST /api/twilio/test-sms with Evergreen contractor — full 4-turn conversation, "2" returned confirmed appointment state. Booking alert email also fired correctly. Brain 3 is production-ready, waiting only on Twilio compliance approval to go live with real homeowners.

**August 2, 2026 — POST /api/twilio/test-sms endpoint built and deployed.**
Admin-protected SMS simulation endpoint that runs Brain 2 (contractor) and Brain 3 (homeowner) through the exact same routing logic as the real /inbound-sms webhook — but accepts contractorId directly, skips Twilio signature validation, and returns the AI reply as JSON instead of sending a real SMS. Lets Jose run full multi-turn conversations via curl or Postman while Twilio compliance approval is pending. Route is automatically registered under the existing `app.use('/api/twilio', ...)` mount — no server.js change needed. File: `backend/routes/twilio.js` — added `requireAdmin` import from `../middleware/auth` and new route at bottom. Brain 2 path: looks up contractor by id, calls `handleContractorSms(contractor, message)`, returns reply. Brain 3 path: looks up contractor by id, checks `getActiveSession(phone, contractorId)`, routes to `routeHomeownerSms` if session exists or `startHomeownerSession` if not, returns reply + sessionState + sessionId for conversation tracking. CANCEL keyword returns an explanation without touching live data. When Twilio compliance clears: point the webhook at `/inbound-sms` (already built and live), nothing else to do.

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
| ✅ August | Solar, Water Damage, Tree Service, Lawn Care, Pool Service, Pest Control knowledge loaded | Seeded session 21 — `loadDiagnosticKnowledge.js` run against Railway DB |
| Month 6+ | Any new niche a contractor requests | DB inserts only, zero code |

All eleven niches are seeded with comprehensive knowledge. Current niche coverage: HVAC (~32 chunks), Roofing (~9), Electrical (~10), Plumbing (~11), Landscaping (~12), Solar (~10), Water Damage (~10), Tree Service (~9), Lawn Care (~9), Pool Service (~11), Pest Control (~11). Adding any new niche = write the knowledge chunks, run the load script, done.

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

**B. Messenger + Instagram DM Auto-Reply (Step 7 in Onboarding Checklist) — self-serve, reconfirmed final session 27**
No Tractify code needed, and Tractify never sets this up on the contractor's behalf — the contractor does it themselves in their own Meta Business Suite, walked through it by the AI SMS drip (same pattern as the GBP step — see "GBP Booking Button Setup" above). Step 7 in the onboarding checklist UI in `ContractorPortal.jsx` gives copy-paste reply text pre-filled with their booking link, which the drip also texts them directly. Reply text: *"Thanks for reaching out to [Business Name]! Book a time here: [slug] — takes 60 seconds."*

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
CLOUDFLARE_ACCOUNT_ID → set ← used by services/cloudflare.js, required for the entire Wrangler-based auto-deploy pipeline. Was missing from this list entirely until this staleness pass — anyone provisioning a fresh environment from just this doc would have missed it.
CLOUDFLARE_API_TOKEN  → set ← same as above
CLOUDFLARE_ZONE_ID    → set ← same as above, needed for custom-domain registration on Cloudflare Pages
```
SMTP_PASS is also referenced in notifications.js as a fallback if RESEND_API_KEY is unset — almost certainly vestigial from before Resend was adopted, not something to configure.

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
│   │   ├── apikeys.js        ← Per-site API key management (admin)
│   │   ├── deploy.js         ← POST /api/deploy — auto-deploy pipeline (contractor account + API key + Cloudflare Pages via Wrangler)
│   │   ├── waitlist.js       ← Built session 26. POST / (public signup, name+phone only), GET / (admin list), POST /:id/promote (admin — turns a waitlist row into a real contractor via contractorSignup.js). Stopgap acquisition channel while Twilio A2P Brand registration is blocked (see ⚡ PICK UP HERE) — lets ads/content keep running without the intake form's "we'll text you in minutes" promise being false.
│   │   ├── twilioPool.js     ← Built session 27. Admin CRUD around the shared trial-number pool (see services/twilioPool.js): GET / (status/counts), POST / (register a number Jose bought), POST /:id/disable, POST /:id/release.
│   │   ├── adminAI.js        ← POST /api/admin/ai-chat — the admin 🧠 brain. Full CLAUDE.md context injected + live DB queries + tool-use loop (set_twilio_number, approve/decline contractor, update_contractor, assign_lead, cancel/delete appointment, delete lead)
│   │   ├── aiChat.js         ← POST /api/contractor/ai-chat — the contractor portal chat assistant. Same tool-use pattern, scoped to one contractor (block_time, complete_setup_step, cancel_appointment)
│   │   ├── facebook.js       ← Facebook Lead Ads webhook (GET verify challenge, POST leadgen) — routes to homeownerSmsAI on receipt
│   │   ├── twilio.js         ← POST /missed-call (voice webhook → starts Brain 3), POST /inbound-sms (routes to Brain 2 or Brain 3), POST /test-sms (admin-only Brain 2/3 simulator, no real Twilio needed)
│   │   └── intake.js         ← POST /api/intake/track (step analytics), GET /api/intake/stats (admin funnel dropoff)
│   ├── services/
│   │   ├── matchingEngine.js ← Round-robin contractor matching by niche + zip + radius
│   │   ├── notifications.js  ← All Resend email templates (HTML-escaped, branded) + sendWaitlistSignupAlert
│   │   ├── googleCalendar.js ← OAuth2 Google Calendar sync
│   │   ├── auditLog.js       ← Lead event logging (lead_events table)
│   │   ├── smsAI.js          ← Two-way AI SMS brain: handleContractorSms, sendSetupStepText, sendWelcomeText
│   │   ├── homeownerSmsAI.js ← Brain 3: handleHomeownerSms, startHomeownerSession, getActiveSession, routeHomeownerSms, startRebookSession
│   │   ├── contractorSignup.js ← Built session 26 (task: "Extract contractor-creation logic into a shared service"). createContractorAccount() — single source of truth for turning {businessName, phone, address, placeId, nicheId/nicheOther, acquisitionSource, hoursRaw} into a real contractor + API key. Used by both deploy.js (intake form path) and waitlist.js (promote path) so account creation logic never has to be duplicated or drift between the two entry points.
│   │   ├── cloudflare.js     ← Cloudflare API wrapper — deployToPages (via Wrangler CLI child process), addPagesDomain. Core of the auto-deploy pipeline deploy.js calls into.
│   │   ├── diagnosticKnowledge.js ← RAG retrieval for Brain 3 — getRelevantKnowledge, storeKnowledgeBatch, clearNicheKnowledge (see "Diagnostic Knowledge Architecture" section below)
│   │   ├── embeddings.js     ← Voyage AI voyage-3-lite wrapper (512-dim embeddings, 4-retry backoff) used by diagnosticKnowledge.js
│   │   ├── twilioPool.js     ← Built session 27. Shared trial-number pool: assignPoolNumber, releasePoolNumber, markPoolNumberConverted (not yet called — Stripe's hook), addNumberToPool, getPoolStats. See "⚡ PICK UP HERE" STEP 2a.
│   │   ├── forwardingTest.js ← Built session 28. Automated call-forwarding verification — startForwardingTest places a real outbound test call to the contractor's number, resolveFromForwardedCall/resolveFromOutboundStatus resolve the result from whichever webhook fires first, sweepTimeouts (cron) catches ones that never resolved. See "Automated call-forwarding verification" note under STEP 2b.
│   │   └── cron.js           ← node-cron: 24hr reminders, onboarding nudge, SMS setup drip (hourly :30), pre-appt confirmation SMS (7:30am daily), review request SMS (hourly :50), post-job close tracking SMS (hourly :45), 72hr silence alert (every 6h), Twilio pool "gone dark" sweep (daily 2am), forwarding-test timeout sweep (every 2min)
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
        │   ├── LandingPage.jsx        ← Public marketing page. Pitch-deck-style redesign (session 27): numbered sections, phone-mockup SMS demo in hero, animated trial tracker, FAQ accordion (section 08 — replaced an earlier "What's Next" roadmap section). Only outbound CTA is "Join the Waitlist" (Twilio still blocked — see ⚡ PICK UP HERE), never a live intake form.
        │   ├── Waitlist.jsx           ← Public /waitlist signup (business name + phone only). Built session 26, polished session 27. Honest copy: "we're finishing up a few things before we can start texting" — deliberately does NOT claim the product is live yet.
        │   ├── LoginPage.jsx          ← Admin + contractor login (role toggle), forgot password link
        │   ├── ForgotPassword.jsx     ← Contractor forgot password form
        │   ├── ResetPassword.jsx      ← Contractor password reset (reads ?token= from URL)
        │   ├── ContractorApply.jsx    ← Public self-signup form for contractors
        │   ├── AdminDashboard.jsx     ← Full lead/contractor/appointment/niche/apikey management
        │   ├── ContractorPortal.jsx   ← Calendar UI, availability, blocking, settings, change password
        │   ├── BookingFlow.jsx        ← Homeowner picks date + time (token-based, from email link)
        │   ├── DirectBooking.jsx      ← Personal booking page (/schedule/:slug) — no token, no lead
        │   ├── PrivacyPolicy.jsx      ← /privacy — built session 12
        │   ├── TermsOfService.jsx     ← /terms — built session 12, linked from the intake form's required acceptance checkbox
        │   ├── LeadIntakeWidget.jsx   ← Embeddable lead form at /get-quote
        │   └── CancelPage.jsx         ← Homeowner self-service cancel/reschedule
        └── utils/formatPhone.js
```

---

## Database Schema
All tables are PostgreSQL. Schema auto-initializes on boot via `db.js`. Additional columns added by startup migrations in `server.js` (safe to re-run — uses `IF NOT EXISTS`).

### Core Tables

**`admins`** — admin accounts (id, email, password_hash, name, created_at)

**`niches`** — service categories. **Roster and `status` column corrected here (previous text was stale — listed the original 7-niche pre-pivot seed, which is wrong).** Has a `status TEXT` column (`'active'` | `'inactive'` | `'internal'`, added via migration, session 26) — the intake form's `GET /api/niches/public` only returns `status = 'active'` niches. Current active roster (11): HVAC, Roofing, Electrical, Plumbing, Landscaping, Solar, Water Damage, Tree Service, Lawn Care, Pool Service, Pest Control. Plus one `status = 'internal'` placeholder niche, "Pending Review," used when a contractor picks "Something else" on the intake form — see "Scaling to new niches" below for the full pending-review flow. Painting and General Contracting (from the original seed list) were dropped from the approved roster back in the niche-adaptive-pricing pass — see "Dropped niches and why" further down.

**`contractors`** — **field list below was missing ~15 real columns as of the staleness audit; added them here.**
```
id, email, password_hash, name, phone, company_name,
niche_id, service_zip_codes (TEXT — JSON array ["98101"] or ["*"]),
status TEXT DEFAULT 'pending',   ← pending | approved | declined
service_radius_miles INTEGER DEFAULT 25, ← added session 25 pivot, sat unused until session 29: every post-pivot contractor is seeded with service_zip_codes=["*"] at signup (contractorSignup.js) until they complete the SMS `service_area` onboarding step, and the wildcard is now bounded by this radius (miles from `address`) instead of meaning literally unlimited — enforced in both homeownerSmsAI.js's isInServiceArea() and matchingEngine.js's contractorServesZip() via the zipcodes npm package (offline, no API key). See session 29 entry at top of file.
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
twilio_number TEXT,              ← the Twilio number assigned to this contractor (missed-call + inbound SMS webhooks)
business_phone TEXT,             ← built session 25. Nullable — NULL means same as `phone`. Only set when the drip resolves a genuinely separate public business line from the contractor's personal cell.
place_id TEXT,                   ← captured from Google Places autocomplete on the intake form — used to pull reviews + set GBP booking button
city TEXT, address TEXT,         ← added alongside the pivot rewrite (session 25/26)
acquisition_source TEXT,         ← which ?src= tag / content piece drove this contractor's signup
requested_niche_text TEXT,       ← built session 26. Raw free-text a contractor entered when picking "Something else" on the niche dropdown — see "Scaling to new niches"
twilio_test_call_at TIMESTAMPTZ,
fwd_test_started_at TIMESTAMPTZ, fwd_test_result TEXT, fwd_test_completed_at TIMESTAMPTZ, ← built session 28, automated call-forwarding verification (see services/forwardingTest.js). fwd_test_result: 'conditional_ok' | 'unconditional_broken' | 'not_forwarding' | 'timeout' | NULL (no test run yet / in flight)
sms_power_message_sent INTEGER DEFAULT 0, sms_calendar_training_sent INTEGER DEFAULT 0, sms_capabilities_sent INTEGER DEFAULT 0, ← one-time SMS drip specialty messages, each fires once
onboarding_steps JSONB, onboarding_started_at TIMESTAMPTZ, onboarding_nudge_sent_at TIMESTAMPTZ,
trial_silence_alert_sent_at TIMESTAMPTZ, ← prevents duplicate 72hr-silence alerts to Jose (see cron.js)
twilio_hold_until TIMESTAMPTZ,   ← churn/offboarding: Twilio number held for 6 months post-deactivation, see "Churn / Offboarding Policy"
stripe_customer_id TEXT, stripe_payment_method_id TEXT, payment_status TEXT DEFAULT 'trial', ← 'trial' | 'paid' | 'churned' — not yet wired to real billing, see ⚡ PICK UP HERE STEP 3
created_at
```

**`leads`**
```
id, name, email, phone, niche_id, zip_code, description,
status TEXT DEFAULT 'new',       ← new | matched | booked | completed | cancelled
assigned_contractor_id,
source_site, external_tier, external_score,
metadata JSONB,                  ← stores qualifying fields from external sites
address TEXT,                    ← added for Brain 3 (homeowner conversational booking needs a real address, not just zip)
reschedule_count INTEGER DEFAULT 0, ← the actual reschedule-abuse-prevention field (see booking_tokens note below — this was previously mis-documented as a column on booking_tokens)
created_at
```

**`appointments`**
```
id, lead_id (nullable — NULL = direct booking or manual block), contractor_id,
scheduled_date, scheduled_time, duration_minutes DEFAULT 60,
status TEXT DEFAULT 'pending',   ← pending | confirmed | cancelled | completed
google_event_id, notes, cancel_token, reschedule_token,
booking_source TEXT,             ← which channel produced this booking (google_search, missed_call, sms_keyword, gbp, direct, etc — see "Booking Source Tracking")
did_close INTEGER,               ← revenue logging: NULL = not yet logged, 0 = no, 1 = yes
closed_value NUMERIC,            ← dollar amount, nullable, paired with did_close
reminder_sent_at TIMESTAMPTZ,    ← 24hr-before reminder cron
pre_appt_sms_sent_at TIMESTAMPTZ,       ← morning-of confirmation SMS cron (7:30am daily)
homeowner_review_sms_sent_at TIMESTAMPTZ, ← review-request SMS cron (hourly :50)
post_job_sms_sent_at TIMESTAMPTZ,       ← post-appointment close-tracking SMS cron (hourly :45)
created_at, updated_at
```
- Direct bookings (from `/schedule/:slug`) have `lead_id = NULL`. Contact info stored as JSON in `notes`.
- Partial unique index prevents double-booking (excludes cancelled rows).

**`availability_slots`** — weekly recurring schedule (contractor_id, day_of_week 0-6, start_time, end_time, is_active)

**`availability_overrides`** — date-specific blocks or custom hours (contractor_id, date, is_available, start_time, end_time, reason)

**`booking_tokens`** — UUID tokens (48hr expiry) for homeowner booking links. Has a `source` field (`'booking'` or `'reschedule'`). **Correction: reschedule abuse prevention does NOT use a column on this table** — the real field is `leads.reschedule_count` (see the `leads` table above). An earlier version of this doc invented an `abuse_count` column on `booking_tokens` that doesn't exist anywhere in the codebase.

**`homeowner_sms_sessions`** — Brain 3's conversation state. `id, phone, contractor_id, state (greeting | awaiting_address | awaiting_service | awaiting_slot | awaiting_email | confirmed), name, address, city, service_description, offered_slots JSONB, lead_id, email, created_at, updated_at`. Fully described in "The 3-way SMS AI attack" playbook entry further down — added here so it's also in the canonical table list.

**`diagnostic_knowledge`** — Brain 3's RAG knowledge base (pgvector). Full schema and column-by-column detail in the dedicated "Diagnostic Knowledge Architecture" section below — added here so it's also in the canonical table list, not just its own section.

**`brain_context`** — **was undocumented anywhere in this file until this staleness pass.** `id, type, summary, detail, created_at`. Written to by the admin AI brain (`adminAI.js`) as a lightweight memory/decision log. Exists and is actively used in code; if you're extending the admin brain's memory behavior, this is the table to look at.

**`round_robin_state`** — tracks last assigned contractor per niche + zip for fair rotation

**`lead_events`** — full audit trail. Every status change, email send, match attempt, etc. (lead_id, event_type, payload JSONB, created_at)

**`inbound_api_keys`** — per-site API keys for inbound lead submissions (id, name, key TEXT plaintext, source_slug, is_active, created_at, last_used_at, contractor_id TEXT → contractors.id, allowed_origins TEXT)
- `contractor_id` is optional. When set, inbound leads from that key skip the matching engine and route directly to that contractor.
- `allowed_origins` is optional. Comma-separated domains. When set, rejects requests whose `Origin` header doesn't match — prevents API key theft.

**`intake_events`** — client onboarding intake form step tracking (id, type, step INTEGER, step_name TEXT, direction TEXT, client_id TEXT, business_name TEXT, ts TIMESTAMPTZ, created_at)

**`waitlist_signups`** — built session 26 (`routes/waitlist.js`). id, business_name, phone (unique — dedupes double-submits), acquisition_source, status TEXT DEFAULT 'waiting' (`waiting` | `promoted`), promoted_contractor_id, promoted_at, created_at. Public signup fires `sendWaitlistSignupAlert` to Jose. Admin promotes a row via `POST /:id/promote` (passes nicheId/nicheOther/address/placeId/hoursRaw) → calls the same `createContractorAccount()` in `contractorSignup.js` that the intake form uses, so a promoted waitlist signup becomes a real contractor through the identical path — no separate/divergent account-creation logic to maintain.

**`twilio_number_pool`** — built session 27 (`services/twilioPool.js`, see "⚡ PICK UP HERE" STEP 2a). id, phone_number (unique), status TEXT DEFAULT 'available' (`available` | `assigned` | `converted` | `disabled`), assigned_contractor_id (FK → contractors, ON DELETE SET NULL), assigned_at, released_at, release_reason, created_at. `contractors.twilio_pool_id` (FK, nullable) links a contractor back to its pool row. Numbers are still bought by hand in the Twilio console — this table only owns the assign/release bookkeeping around numbers already purchased, registered via `POST /api/twilio-pool`.

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
| POST | /api/bookings/cancel-token/:token | Homeowner self-cancel via token (previously documented without the `:token` param) |
| POST | /api/bookings/reschedule-token/:token | Homeowner self-reschedule via token (previously documented without the `:token` param) |
| GET | /api/bookings/cancel-info/:token | Fetch appointment details for the cancel page before the homeowner confirms |
| GET | /api/bookings/reschedule-info/:token | Fetch appointment details for the reschedule page before the homeowner confirms |
| GET | /api/availability/:id/open-slots | Available times for booking |
| GET | /api/niches | List all niches |
| GET | /api/niches/public | Active-only niches (`status = 'active'`) — what the intake form's dropdown actually queries. Requires wildcard CORS; see the CORS gotcha in Common Issues and Fixes, this endpoint broke on first deploy for exactly that reason. |
| POST | /api/auth/contractor/apply | Contractor self-signup |
| POST | /api/auth/contractor/login | Contractor login → JWT |
| POST | /api/auth/contractor/forgot-password | Send password reset email |
| POST | /api/auth/contractor/reset-password | Reset password via token |
| GET | /api/auth/me | Return the current user from a valid JWT (admin or contractor) |
| POST | /api/auth/admin/login | Admin login → JWT |
| POST | /api/auth/admin/register | Create first admin (disabled after one exists) |
| POST | /api/intake/track | Track intake form step event |
| POST | /api/waitlist | Join the waitlist (businessName + phone, dedupes on phone) — the only real conversion path on the current landing page |
| GET/POST | /api/leads/facebook | Facebook Lead Ads webhook — GET handles the verification challenge, POST receives leadgen events and routes into Brain 3 |
| POST | /api/twilio/missed-call | Twilio voice webhook — fires on a missed call, starts a Brain 3 session |
| POST | /api/twilio/inbound-sms | Twilio SMS webhook — routes to Brain 2 (contractor) or Brain 3 (homeowner) depending on sender |
| POST | /api/deploy | Auto-deploy pipeline entry point — called by the Cloudflare Worker after intake form submit, `DEPLOY_SECRET` bearer auth |

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
| PUT | /api/bookings/:id/admin-cancel | Admin cancels any appointment |
| PUT | /api/bookings/:id/admin-complete | Admin marks any appointment completed |
| GET/POST/DELETE | /api/niches | Niche management |
| PUT | /api/niches/:id | Edit a niche (previously undocumented — the row only said GET/POST/DELETE) |
| GET/POST/PUT/DELETE | /api/apikeys | Per-site API key management |
| GET | /api/intake/stats | Intake funnel dropoff stats |
| GET | /api/waitlist | List all waitlist signups |
| POST | /api/waitlist/:id/promote | Turn a waitlist signup into a real contractor account (via contractorSignup.js) |
| GET | /api/twilio-pool | Pool status — counts by status + full row list with assigned contractor names |
| POST | /api/twilio-pool | Register a Twilio number Jose already bought in the console — body: `{ phoneNumber }` |
| POST | /api/twilio-pool/:id/disable | Pull a bad/broken number out of rotation permanently |
| POST | /api/twilio-pool/:id/release | Manually release an assigned number back to 'available' |
| GET | /api/contractors/admin/performance | Backs the Performance tab — conversion rates, contractor stats, booking funnel metrics |
| POST | /api/auth/admin/impersonate-contractor/:id | Mints a short-lived (2h), contractor-scoped JWT for the "View Calendar" admin impersonation feature — see Admin Dashboard Features → Contractors tab |
| POST | /api/admin/ai-chat | The admin 🧠 brain (`adminAI.js`) — was extensively described in prose throughout this file but had zero entry in this table until now |

### Contractor (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contractors/:id | Fetch one contractor's own record |
| PUT | /api/contractors/:id/password | Change password |
| PUT | /api/contractors/:id/onboarding-step | Mark a self-serve onboarding checklist step complete |
| GET | /api/contractors/:id/twilio-test-status | Status of the admin-triggered Twilio number test |
| GET/PUT | /api/availability/:id/slots | Weekly schedule |
| GET/POST/DELETE | /api/availability/:id/overrides | Date overrides |
| POST/DELETE | /api/availability/:id/manual-block | Block/unblock time slots |
| GET | /api/bookings/contractor/:contractorId | This contractor's own appointments |
| PUT | /api/bookings/:id/cancel | Contractor cancels (sends rebook link) |
| PUT | /api/bookings/:id/complete | Mark as completed |
| GET | /api/auth/google/connect/:contractorId | Start Google Calendar OAuth |
| GET | /api/auth/google/callback | Google OAuth callback |
| POST | /api/contractor/ai-chat | The contractor portal AI chat assistant (`aiChat.js`) — was extensively described in prose but had zero entry in this table until now |
| POST | /api/twilio/test-sms | Admin-protected — simulates a full Brain 2 or Brain 3 conversation via curl/Postman, no real Twilio number needed |

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
| `sendContractorApplicationAlert` | Contractor applies | Admin (`ADMIN_EMAIL` env var, currently ayc98223@gmail.com) |
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
- Reschedule abuse prevention: checks `leads.reschedule_count` before cancelling existing appointment
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
Tabs (actual order in the `TABS` array): Leads | Contractors | Appointments | Waitlist (added session 26 — lists every waitlist signup with a one-tap Promote action that creates the real contractor account via the same flow the intake form uses) | API Keys | Performance | Niches

**Leads tab:** Full lead list with status badges, search, manual match trigger, resend booking link, reassign contractor, delete

**Contractors tab:**
- Active contractors list with niche, zip codes, activity status, address (added session 25/26 alongside the deploy.js pivot rewrite)
- "Add Contractor" form (admin-created accounts with temp password)
- Pending applications section with Approve/Decline buttons
- Declined applications with Delete option
- **"View Calendar" button (session 25) — admin impersonation, not a real login.** Post-pivot, contractors are never issued a real password (see THE PIVOT — no portal login is intended), so there's no way for Jose to log into a contractor's account the normal way to eyeball whether their hours/availability propagated correctly from the intake form. This button calls `POST /api/auth/admin/impersonate-contractor/:id` (`auth.js`), which mints a short-lived (2h), contractor-scoped JWT via `signImpersonationToken()` (`middleware/auth.js`) and opens `/contractor?impersonate_token=...&impersonate_user=...` in a new tab. `ContractorPortal.jsx` reads those URL params on load, moves them into `sessionStorage` (never `localStorage` — sessionStorage is tab-isolated by spec, so an admin's real session in another tab can never be corrupted by this), and strips them from the URL. `frontend/src/api/client.js`'s request/response interceptors check `sessionStorage.getItem('impersonate_token')` first, falling back to the normal `localStorage` token. The first-login onboarding modal is suppressed in this view (it's built for the old portal-login-first flow that no longer applies). A banner at the top of the portal makes clear this is an admin viewing someone else's account.
- **"⚠️ Niche needs review" badge (session 26)** — shown when `contractors.requested_niche_text` is set (a contractor picked "Something else" on the intake form). Includes a one-tap resolve dropdown (`resolveNiche` mutation → `PUT /contractors/:id` with `niche_id`) that assigns a real niche and clears `requested_niche_text` in the same request. See "Scaling to new niches" above for the full design.

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

**New public endpoint returns CORS error from intake.tractifyhq.com (or any external client domain) even though the endpoint works fine when opened directly in the browser** — hit this exact bug August 14, 2026 (session 26) on both `/api/niches/public` and `/api/intake/track`.
→ Root cause: opening a URL directly in the browser never triggers CORS — it only applies to cross-origin requests initiated by JS (`fetch`/`XHR`) on a *different* page. `server.js` has a general `cors()` middleware locked to `FRONTEND_URL` (tractifyhq.com only) that runs on every request EXCEPT paths explicitly listed in a skip-list around line 78-90. Any new externally-callable endpoint needs TWO things, not just one: (1) `app.use('/api/your/path', externalClientCors('GET'|'POST'))` for the wildcard headers, AND (2) that same path added to the skip-list's `req.path.startsWith(...)` conditions — without step 2, the general `cors()` middleware runs afterward and silently overwrites the wildcard `Access-Control-Allow-Origin: *` header with `https://tractifyhq.com`, which then rejects every other origin. The browser console shows this exactly: "the 'Access-Control-Allow-Origin' header has a value 'https://tractifyhq.com' that is not equal to the supplied origin." Diagnose fast: fetch the URL directly in a new tab (works fine, proves the route itself is fine) vs check the page's DevTools Console for the red CORS error (proves it's a headers problem, not a route problem).

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

**Remaining — must do before first client converts:**
- ✅ **Open business bank account** — done, no delay on this end.
- [ ] **Stripe integration** — ⚠️ superseded, see "⚡ THE ACTUAL NEXT STEPS" near the bottom of this file for the current build order and structure (per-delivery billing, not job-5-only trigger, not flat $2,000+$800/month).
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

## ⚡ PICK UP HERE — THE ACTUAL NEXT STEPS: Intake Form → Twilio/SMS Hardening → Stripe (locked August 12, 2026, session 25 — supersedes every older "what to build next" list in this file)

**🎉 Twilio approved — manually, this morning, August 12, 2026.** The compliance block that's been open since session 23 (Error 18602 EIN-verification lag, then Error 18606 email-domain mismatch, then a stuck support ticket) is resolved. This unblocks real SMS/voice traffic for the first time ever in this project. Nothing has run on real Twilio traffic yet — everything to date has been simulated via `POST /api/twilio/test-sms`. Treat "Twilio approved" as "the door is open," not "the room is finished" — see the hardening list below before pointing real numbers at real homeowners.

**Locked step-by-step order (added August 12, 2026 — read this list top to bottom to know exactly what's next and why). Each step names what it is, why it's in this position, and what unblocks after it's done. Mark steps done in place as they close.**

**STEP 0 — Confirm A2P 10DLC / campaign registration status.** ✅ FULLY CLEARED (August 19, 2026, session 28). The entire compliance block that had been open since session 23 (Aug 8 — EIN propagation lag, then the Aug 14 Brand-level EIN/legal-name mismatch) is resolved. Brand approved the morning of Aug 19 (BNb79e053f83a0d47dde533c16b2e246e5). Campaign registered same day, use case MIXED, submitted through the Twilio Console with Jose live-filling the form and Claude reviewing each field in real time via screenshots. Campaign SID CM409611e7155bd7701255aadeb7a4371b — approved and VERIFIED same day (~7 hours after submission), far ahead of both the 10-15 day estimate in Twilio's quickstart doc and the 1-3 day estimate in the submission-received email. Messaging Service SID MGecbd3de4950394f4752866174156df03.

The campaign registration itself required two real fixes along the way, both worth knowing for any future campaign edits: (1) Twilio's automated pre-check ("Recipient consent") flags ANY consent description that implies a homeowner can text in first, even when the prose explicitly says it's not a marketing subscription — it appears to be a blunt keyword-level check tied to selecting "Via Text" or "Other" as an opt-in method, not a semantic read of the description. The fix that actually cleared it: uncheck every opt-in method except "Web Form" (fully true and verifiable — contractors opt in through the live intake.tractifyhq.com consent checkbox), and rewrite the homeowner-consent explanation to frame the missed-call text-back purely as an automated callback in response to a phone call the homeowner placed, never using language that could read as "the homeowner opted in by texting us." (2) While diagnosing this, found and fixed a real, separate compliance gap unrelated to the registration tooling itself: several first-touch homeowner SMS messages (`backend/routes/twilio.js`, both the missed-call and inbound-keyword paths, new and returning homeowner) and the post-appointment review-request text (`backend/services/cron.js`) were missing "Reply STOP to opt out" — downstream messages in the same conversations had it, but the very first message a homeowner ever receives didn't. Fixed in both files. Also strengthened SMS consent language at the actual point of opt-in: the intake form's Terms checkbox (`hvac-template/intake-form.html`) now explicitly states "I consent to receive automated text messages (SMS)..." with frequency/rates/STOP-HELP language, instead of only linking to the Terms page where that language lived one click away — and the Privacy Policy's SMS section (`PrivacyPolicy.jsx`) now includes the exact carrier-standard sentence Twilio's vetting explicitly checks for: "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes." All of this was live and deployed before the campaign was submitted, so what Twilio's reviewers saw when they crawled the linked Terms/Privacy pages matched what was described in the registration.

**Sender registration also DONE, same day (August 19, 2026, session 28).** Twilio's own guided "Finish setting up your number" flow (Messaging → Services → Tractify - Main → the "Finish compliance for 1 number and sender" banner → Continue set up) walked through and completed all four remaining checklist items in one pass: compliance profile ✅, messaging service ✅, A2P Brand registration ✅, A2P Campaign registration ✅ — and the number is now attached as a live Sender on the "Tractify - Main" Messaging Service (SID MGecbd3de4950394f4752866174156df03). This was faster than expected — no manual "Add Senders" step was needed, Twilio's own onboarding flow already had the number queued and just needed the compliance chain (Brand + Campaign) to clear before it would let the attachment finish.

**Webhooks + emergency address also fully configured, same session.** On the number's Configuration details page: Voice ("A call comes in") → `https://tractifyhq.com/api/twilio/missed-call`, POST. Messaging ("A message comes in") → `https://tractifyhq.com/api/twilio/inbound-sms`, POST. Both confirmed saved and showing correctly on reload — this is the actual live number wiring, not just Console defaults. Also created and attached a verified emergency address in Trust Hub ("Tractify HQ," OMNIANCEGROUP LLC, 19222 Crown Ridge Blvd, Arlington, WA 98223 — validated: Yes, emergency address: Enabled) to avoid the $75 no-address penalty on this now-voice-capable number. One real Console quirk hit along the way, worth knowing for the next number: the "Edit emergency address" modal on the phone number's Voice page is a select-from-existing dropdown, not a free-text field — typing a new address there returns "No results found" even if it's correct, because it only matches addresses already saved in Trust Hub → Addresses. Fix is to create the address there first (Trust Hub → Addresses → Create address, mark "Is this an emergency address? Yes"), accept Twilio's auto-verified/normalized version of the address when prompted, then go back and it'll appear as a selectable option.

**STEP 0 is now fully closed, end to end — Brand, Campaign, Sender, both webhooks, and emergency address are all live on a real number.** This is no longer a "the door is open" state — the room is finished. The very next action (STEP 2b) is running a real end-to-end test: set this number on a contractor via Admin Dashboard → Contractors → "Set Twilio #", then text it from a real phone and watch Brain 2/3 respond through actual Twilio infrastructure for the first time ever, instead of the `/api/twilio/test-sms` simulator.

**What this unblocks — live now, not pending:** a real Twilio number is fully wired end-to-end (Brand + Campaign verified, attached as a Sender). STEP 2b (real end-to-end phone test — previously task #8, a live contractor + homeowner conversation through actual Twilio infrastructure, not just the `/api/twilio/test-sms` simulator) can run right now. Next action: in Admin Dashboard → Contractors, set this Twilio number on a real (or test) contractor, set BOTH webhooks on the number in Twilio console ("A call comes in" → `/api/twilio/missed-call`, "A message comes in" → `/api/twilio/inbound-sms`), and run a real call + real text through it. Nothing about the shared number pool build (STEP 2a) changes — future contractors' numbers still need this same Sender-attachment step once bought, but the compliance chain (Brand/Campaign) they attach to is now permanently cleared, so it's just a Console step per number going forward, not a new registration cycle.
August 14 update, session 26: Business Profile confirmed approved (per Twilio support email, Aug 14 morning). Went to create the A2P Brand next and hit the exact same "mismatch between your EIN and legal business name" error at Brand creation — this is a hard block, clicking Continue does nothing while the error shows. This confirms the theory from the original ticket: the Business Profile clearing does NOT mean Twilio's automated EIN-verification database has caught up — that's a separate, slower-propagating check, and Brand creation runs its own independent pass against the same data. Legal business name and EIN entered (OMNIANCEGROUP LLC / 42-4017025) were re-verified against the actual CP 575 letter and are correct — not a data-entry problem. Sent a follow-up in the same existing ticket thread (the one already forwarded to Twilio's A2P team for manual review) flagging that the mismatch now blocks Brand registration too, not just the profile, and that Continue is a hard block. Waiting on their reply — do not keep resubmitting the Brand form with reformatted data, it won't help since this isn't a formatting issue.
How to check: Twilio Console → Messaging → Regulatory Compliance → Campaigns (or "A2P 10DLC" in the search bar) — look for a registered Brand and at least one Campaign in "Verified"/"Active" status, not just "In Review." A Twilio MCP connector is available to check this programmatically instead of digging through the console by hand — ask to connect it if useful.

**While Step 0 is blocked: the waitlist system + landing page redesign (built session 26, polished session 27) is what's actually live and running acquisition-wise right now.** With Twilio still not clear, the intake form's old "we'll text you in minutes" promise would be a lie if pointed at real ad traffic. Instead: `tractifyhq.com` now runs a pitch-deck-style landing page whose only CTA is "Join the Waitlist" → `/waitlist` (business name + phone only, `routes/waitlist.js` + `waitlist_signups` table). The waitlist page is upfront that the product isn't live yet ("we're finishing up a few things behind the scenes before we can start texting new businesses") — deliberately not overselling ahead of Step 0 clearing. Admin dashboard has a Waitlist tab with a one-tap Promote action per row that runs the exact same `createContractorAccount()` in `contractorSignup.js` the intake form uses, so the moment Step 0 clears, promoting the whole waitlist in order is a few clicks, not a rebuild. Landing page itself went through a full visual pass session 27: fixed a real layout-shift bug (illustration `<img>` tags had no reserved width/height, so sections collapsed/expanded as SVGs loaded; separately, section 06's trial-tracker animation was changing height inside an `items-center` grid row, which re-centered the whole row and visibly shifted the section's top edge every ~10s — fixed by giving the "Trial complete" banner a permanently-reserved fixed height and toggling only opacity, never height/margin, so nothing in that card ever changes size), softened hero copy from present-tense ("Tractify captures... texts... books...") to future-tense so it doesn't claim live functionality that doesn't exist yet, and replaced a weak "What's Next" roadmap section with a proper FAQ accordion (why join now, what happens after signup, is my number safe, what if I already use another tool, what does it cost) — the objection-handling the page was missing.

**STEP 1 — Finish the intake form completely, end to end.** 🟢 MOSTLY DONE — real signups now reach the backend correctly and create a real contractor + API key. Verified end to end August 14, session 26.
What was actually broken and fixed this session, in order: (1) `deploy.js` hard-required a `contactEmail` field the new SMS-first intake form never sends — every real submission was silently getting rejected with a 400 before any contractor account was created. Rewritten to match the no-portal-login architecture (see "Admin can view a contractor's portal directly" below for how Jose still verifies a contractor's calendar without a real login existing). (2) API key creation was accidentally dropped in that same rewrite, then restored after Jose caught it via a live test. (3) Niche handling reverted from free-text auto-create back to a curated `<select>` dropdown + manual-review queue — see "Scaling to new niches" above, this was a deliberate product decision, not a bug fix. (4) Two CORS bugs found via live testing (`/api/niches/public` and `/api/intake/track` both silently overwritten by the restricted global CORS middleware) — see the CORS gotcha entry in Common Issues and Fixes. Confirmed via a real submission on intake.tractifyhq.com: niche dropdown populates with all 11 niches, contractor account creates correctly, address/niche/API key all show correctly in the admin dashboard. Remaining before calling this fully closed: one more full end-to-end pass confirming the deploy-alert email and pending-review flow both look right in production, not just backend logs.

**STEP 2 — Twilio/SMS hardening. The big one — the whole business runs through this layer, so "good enough" isn't good enough.** 🟡 IN PROGRESS. Sub-steps, roughly in order:
- ✅ 2a. Build the shared Twilio number pool — DONE, session 27 (August 17, 2026). `backend/services/twilioPool.js` owns all pool bookkeeping: `assignPoolNumber(contractorId)` (atomic pick-and-claim via `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)`, fires the welcome SMS the same way `contractors.js` PUT `/:id` already does), `releasePoolNumber(contractorId, reason)`, `markPoolNumberConverted(contractorId)` (exported, not yet called from anywhere — this is the hook STEP 3/Stripe should call at conversion so a paying contractor's number is removed from rotation for good), `addNumberToPool`, `getPoolStats`. New table `twilio_number_pool` (`status`: `available` | `assigned` | `converted` | `disabled`) + `contractors.twilio_pool_id` FK, migration in `server.js`. Hooked into `contractorSignup.js`'s `createContractorAccount()` — both the intake form path and the waitlist-promote path get this automatically since they both call that one function. Numbers still have to be bought by hand in the Twilio console (this doesn't automate the purchase) and registered via the new admin routes in `backend/routes/twilioPool.js` (`GET /api/twilio-pool` for status/counts, `POST /` to register a bought number, `POST /:id/disable`, `POST /:id/release`). Release wired into both decline paths (`routes/auth.js` PUT `/contractor/:id/decline` and `adminAI.js`'s `decline_contractor` tool). A daily 2am cron job in `cron.js` auto-releases numbers from contractors who've been live 30+ days with zero bookings and never converted — a safety net underneath the more precise trial-expiry logic STEP 2e/task #10 will add; tighten the 30-day window to match #10's 21-day trigger once that ships. A consistency guard in `contractors.js` PUT `/:id` releases the old pool row if an admin manually overrides `twilio_number` to something the pool doesn't know about (porting a number, fixing a mistake). Not yet done: an actual purchase-automation step (still manual), and the Stripe-conversion hook into `markPoolNumberConverted`. Also added session 28: `add_number_to_pool` tool on the admin AI brain (`adminAI.js`) — Jose can tell the 🧠 chat "I bought +1... add it to the pool" instead of using the API directly.
- 🟡 2b. Real end-to-end test with an actual phone, not just the simulator — RUN for the first time August 19, 2026 (session 28), immediately after STEP 0 cleared. Real contractor account (Premier Comfort HVAC) + Jose's real phone walked through the full Brain 2 setup drip live on real Twilio infrastructure, then a second number (Google Voice) simulated a homeowner texting in — Brain 3 diagnosed a symptom, offered real slots, booked a real appointment, and alerted the contractor. The booking loop itself worked end-to-end. But the test surfaced 15 real bugs (see the session 28 entry at the top of this file for the full list) — most notably the call-forwarding instructions were actively breaking Jose's real phone line (iPhone's unconditional-forwarding toggle was being used instead of true conditional forwarding). All 14 fixable bugs were fixed same night, syntax-checked, and committed (`4dfea7c`, `3e72c29`) — **not yet re-verified live.** Marking this 🟡 not ✅ until a second real end-to-end pass confirms the call-forwarding fix (device+carrier-specific codes, test-call safeguard) and the calendar-grid date fix actually hold up on real traffic, not just in the source.
  - **Session 29 continued this same live test with a second real contractor (roofing) and a second real phone number (Daniel).** Surfaced and fixed four more real bugs (see the session 29 entry at the top of this file for full detail): the niche-aware Brain 3 opening question fix, the homeowner-name-leaking-into-address extraction fix, the "there" placeholder leaking into the customer confirmation email, and — the big one — a real scope-check gate (`classifyServiceScope`) so Brain 3 can no longer book an appointment for a service outside the contractor's actual trade (e.g. drywall on a roofing number). Also root-caused and fixed task #11 for real this time (calendar grid time-format mismatch, not a `scheduled_date` type issue — the earlier "fix" for this was wrong and caused a live crash, already reverted). Also closed a systemic, 100%-of-post-pivot-contractors gap: no service-area zip codes were ever being collected since the old intake form's zip field was dropped during THE PIVOT, so Brain 3's service-area check was a permanent no-op for every contractor — fixed with a new `service_area` SMS onboarding step, plus a follow-up fix bounding the "I'll go anywhere" wildcard with a real mile radius (both in Brain 3's own check and in a second, more exposed copy of the same bug found in `matchingEngine.js`'s `contractorServesZip()`, used by the public lead form and the external API bridge). **None of this session's fixes have been re-verified live either.** The next real end-to-end test needs to specifically re-exercise: a homeowner describing an out-of-scope service (confirm Brain 3 declines, doesn't book), a homeowner address well outside the contractor's stated zip list or radius (confirm it's declined, not silently accepted), a contractor answering "I'll go anywhere" during setup (confirm the AI actually asks for a mile radius before saving it), and a fresh Brain-3-booked appointment (confirm it now shows on the Calendar grid, not just the Home tab).
  **Automated call-forwarding verification — built same session, right after the live test, as the real fix for the underlying trust problem.** Jose's concern after the phone-breaking incident: 60-70% of the target contractor base isn't technical, dial codes are genuinely error-prone with zero visual confirmation, and the old plan (ask the contractor to call themselves from a second phone and self-report) both adds friction (needs a second phone/willing friend) and depends on them noticing and honestly reporting a failure. New approach — Tractify verifies it itself instead of trusting the contractor's word: the moment they say the code is dialed / toggle is on, Brain 2 calls the new `run_forwarding_test` tool, which places a real outbound call (via `services/forwardingTest.js` → `startForwardingTest()`) from the contractor's Twilio number to their real business number and times what happens next. Two webhooks race to resolve it, whichever fires first wins (atomic `WHERE fwd_test_result IS NULL` claim, see the file for the exact race-safety logic): if the call gets forwarded back to `/api/twilio/missed-call` within ~5 seconds, that's proof it's unconditional (never actually rang) — exactly Jose's phone-breaking bug — and the contractor is texted immediately with the undo code, no self-diagnosis required. If it takes several rings first, that's correct conditional forwarding — the step is marked done automatically, no self-reporting at all. If the outbound call's own Twilio status (new webhook, `POST /api/twilio/forwarding-test-status`) comes back completed/no-answer/busy — meaning it genuinely reached their real phone rather than being redirected — that proves forwarding never activated (bad code, mistyped, didn't hit call) and they're told to retry. A cron sweep every 2 minutes (`sweepTimeouts` in `cron.js`) catches the case where neither webhook ever fires (phone off, call never connects) and lets them know instead of leaving them hanging. New columns: `contractors.fwd_test_started_at` / `fwd_test_result` / `fwd_test_completed_at`. This also directly answers Jose's "what if they can't undo it and blame us" fear architecturally, not just with better copy: SMS and voice are separate channels, so even in the worst case (unconditional forwarding active) the contractor's phone can still send/receive texts normally — Brain 2 can always walk them back out of it over SMS regardless of what state their calls are in. Built and syntax-checked same session as the fix — **not yet tested against a real phone**, since Jose had already manually undone his own forwarding by the time this was built. Next real-world test should specifically exercise this: dial the code, say done, confirm Brain 2 calls the test, and confirm the right outcome (conditional_ok / unconditional_broken / not_forwarding) gets texted back correctly for at least one real conditional-good case and one deliberately-wrong case.
- 2c. Confirm the `business_phone` branching logic (built session 25) holds up in a real conversation, not just by reading the code — the call-forwarding step asking "same number or different" needs a live test. Partially exercised in the 2b test above (Jose's own number, same-number path) — the different-number branch is still untested live.
- 2d. Add basic monitoring/alerting for this layer — no alert currently exists if a webhook silently fails or the AI stops responding. A cheap cron check ("any inbound SMS in the last N hours with no AI reply logged") before this carries real contractors.
- 2e. Build the 5-jobs-or-21-days trial trigger + offer text — pure SMS/cron work, no payment processing. Detect the trigger, fire the offer conversation. Build here, not deferred to Step 3, because it's fully decoupled from Stripe and can ship complete before any billing code exists.
Why here, after Step 1 and Step 0 in parallel: Stripe (Step 3) depends on this layer reliably detecting triggers and reliably talking to the contractor — building billing on an unproven SMS layer means building on an unverified foundation.

**STEP 3 — Stripe and billing, only after Step 2 is solid.** ⬜ NOT STARTED. Business bank account already open, no delay there. **⚠️ Updated August 17, 2026, session 27 — billing model changed from per-delivery back to flat retainer, see "Pricing — flat monthly retainer + niche-bucketed activation fee, restored." This actually simplifies Step 3, not complicates it.**
- 3a. One-time niche-bucketed activation fee flow, charged at conversion ($600 bucket 1, $2,000 bucket 2, $3,500 bucket 3) — reuses existing SMS/webhook patterns. Est. 1-2 days.
- 3b. Ongoing flat monthly retainer billing per bucket ($500 / $1,000 / $1,800) — a standard recurring Stripe subscription per contractor, set once at conversion based on their bucket. No day-of/cancel/reschedule timing logic needed (that complexity was specific to per-appointment billing and is no longer required). Est. 1-2 days, down from the 3-5 day estimate under the old per-delivery model.
- Full estimate for Step 3 end to end: ~3-4 focused days (down from ~6-10 under the old per-delivery model — flat retainer billing is genuinely simpler to build than day-of per-appointment charging was).

---

**August 12, 2026 (session 25 continued) — new intake form live, favicon fixed, and the "which number is which" gap in the AI SMS drip closed.** After the pivot rewrite, `hvac-template/intake-form.html` was rebuilt down to a single-screen 4-field signup (business name, phone-confirm, address, "what do you do") and deployed to intake.tractifyhq.com. Two copy fixes made on the live form: the AI-branding leak ("This is how our AI knows what you do") was changed to "This is how our system knows what to do" — Tractify never tells contractors or homeowners it's AI, per the existing "show results, never the recipe" content principle. Favicon added — the tab icon now shows the actual Tractify logo (reused the exact base64 payload already embedded in the page's header logo `<img>`, verified byte-identical and PNG-valid via script rather than hand-retyped, since a first manual attempt at this introduced a transcription error in the base64 data that was caught before deploy).

**The bigger fix — resolved a real ambiguity in what "Confirm Your Texting Number" actually meant.** The phone field on the intake form auto-fills from Google Places' public business number, but per the existing design intent (already spec'd in THE PIVOT section above) that field is actually meant to become the *personal cell* — the number Brain 2 texts for setup, calendar, and alerts — not necessarily the same number homeowners call to reach the business. For a solo operator these are the same number and nothing needs to happen. For a contractor with an office line, dispatcher, or any other setup where the public business number is different from the owner's cell, the two numbers were being silently conflated — the call-forwarding step would have told them to forward calls on their own personal cell when the actual number needing forwarding is the separate business line. Label and hint on the form rewritten to say this explicitly ("The number you personally carry — not your business line if they're different").

**The real fix lives in the SMS drip, not just the form copy.** Added a `business_phone` column to `contractors` (nullable — NULL means same number as `contractor.phone`, which covers most solo operators; only gets set when the drip resolves a genuinely separate business line). Added a new `set_business_phone` tool to `smsAI.js`'s Brain 2 tool-use loop — the AI now asks "is this the same number your customers call, or is your business line different?" as the *first* thing it does on the call-forwarding step, before giving any forwarding instructions, and saves the answer (confirmed-same or a different number) so all future forwarding guidance references the right number. Both the proactive drip text (`sendSetupStepText`, fired by the hourly cron) and the two-way AI (`handleContractorSms`) were updated with this same branching logic, since a contractor could hit this step either via the outbound drip or by asking mid-conversation.

**Also fixed a latent bug found while making this change: the `STEP_GUIDES` object's per-step `guide` text was defined but never actually injected into the AI's system prompt** — the AI was improvising every setup step from just a label ("Set up missed call forwarding") instead of following the specific instructions written for it. This meant the detailed guidance already written into the file for every step (GBP, Nextdoor, Facebook, reviewers, messenger, twilio) was silently dead weight before this fix. Now the next incomplete step's full `.guide` text is included in the system prompt every time.

**Every place a contractor row gets loaded before reaching Brain 2 had to be checked and fixed individually** — this codebase has a recurring bug pattern (documented earlier this same session, and once before in session 16 for `sms_power_message_sent`/`sms_calendar_training_sent`) where `SELECT` statements use explicit column lists instead of `SELECT *`, so a new column silently doesn't reach the code that needs it unless every call site is updated by hand. Added `business_phone` to: the inbound-sms webhook lookup and the `/api/twilio/test-sms` lookup (`backend/routes/twilio.js`), the setup-drip cron's candidate query (`backend/services/cron.js`), and both the admin list/detail queries plus the PUT update handler (`backend/routes/contractors.js`). Also added `business_phone` to the admin AI brain's `update_contractor` tool schema and field allowlist (`backend/routes/adminAI.js`) so Jose can correct it by hand via the 🧠 chat if the AI ever gets it wrong. All six touched files verified with `node --check` after editing — no syntax errors.

**Not yet done:** none of this has been deployed. The DB migration (`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS business_phone TEXT`, in `server.js`) runs automatically on next Railway deploy — no manual DB step needed. The intake form change still needs the standard Cloudflare Pages redeploy (`wrangler pages deploy ... --branch=production` + CDN purge) to go live on intake.tractifyhq.com.

**Context:** Every SMS brain is fully written, tested, and verified working end-to-end. Brain 3 slot pick bug is fixed and confirmed via the test endpoint. The machine is complete. Focus is on (1) Stripe integration with Daniel, (2) first real contractor the moment Twilio compliance clears.

**Brain 3 is fully verified (August 4, 2026):** Full 4-turn test via POST /api/twilio/test-sms confirmed:
- hello → greeting (awaiting_address) ✅
- 1234 Maple Ave Bellevue → address accepted, asks service (awaiting_service) ✅  
- AC is making a grinding noise → RAG diagnostic fired, real motor bearing diagnosis given, 3 slots offered (awaiting_slot) ✅
- 2 → "Confirmed! Evergreen Home Heating and Energy will be there at 1234 Maple Ave Bellevue on Wed, Aug 5 at 8:30 AM. Want a confirmation email?" (awaiting_email) ✅
- Booking alert email fired to Jose's inbox showing channel: sms_brain3, job 1 of 5 ✅

**The slot pick bug (now fixed):** `session.offered_slots` is a JSONB column. PostgreSQL's `pg` library auto-deserializes it to a JS array on SELECT. Old code: `JSON.parse(session.offered_slots)` → `jsArray.toString()` → `"[object Object],[object Object]"` → SyntaxError caught silently → `offeredSlots = []` → slot never matched → Brain 3 re-asked indefinitely. Fix in `backend/services/homeownerSmsAI.js` line 416: `const raw = session.offered_slots; offeredSlots = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');`

**Waiting on external:** Twilio compliance approval — all code is built and verified, zero work left. Once approved: buy local number → set two webhooks in Twilio console (voice: /api/twilio/missed-call, SMS: /api/twilio/inbound-sms) → assign in admin dashboard → real homeowners go through Brain 3 automatically.

**Twilio compliance stuck — status as of August 8, 2026 (session 24):** Business Profile repeatedly rejected with Error 18602 ("Business ID could not be verified"). Confirmed this is NOT a data-entry error — Legal Business Name (OMNIANCEGROUP LLC), EIN (42-4017025), and Business Address all match the IRS CP-575B letter exactly. Root cause is the EIN propagation lag: EIN was only issued July 23, 2026, and Twilio's automated verification checks against a business database that hasn't indexed it yet. Two emails to trusthub-verify@twilio.com went unanswered. Opened a real support ticket instead (#28856668, filed Aug 6) through the proper Twilio Support system — on the free Developer support plan, which has an estimated (not guaranteed) 3 business day response, web ticket only. **Escalation plan locked:** if not resolved by August 14, 2026, upgrade to the Twilio Production support plan ($250/month minimum, or 4% of monthly spend if higher — spend is negligible right now so it'll be the $250 flat rate) to unlock live chat access to a real support agent who can manually review the CP-575B against the automated rejection. Production plan is month-to-month with no contract, prorated for partial months — downgrade back to Developer plan immediately once resolved, so actual cost will likely be well under the full $250 (roughly $8.33/day prorated). Do NOT upgrade to Business plan ($1,500/month min) for this — Production's live chat is sufficient, phone support isn't needed for this specific issue. Also flagged: consider posting a public escalation to @TwilioSupport on X/Twitter in parallel if the ticket stays unanswered, since public visibility often gets faster human response than the ticket queue.

**Multi-provider SMS infrastructure — evaluated and deferred (session 24):** Discussed whether Tractify should build redundant SMS infrastructure across multiple providers (not just Twilio) to avoid vendor lock-in, since texting is the entire business. Decision: not now. Every carrier-facing SMS provider (Twilio, Bandwidth, Vonage, Plivo) requires its own separate A2P 10DLC brand/campaign registration with US carriers — building multi-provider infrastructure would multiply the exact compliance pain currently being experienced with Twilio, not reduce it. Phone numbers are also provider-specific — a number Twilio issues doesn't fail over to another provider automatically; true redundancy would require duplicate number provisioning per contractor plus routing logic, which is enterprise-scale infrastructure not justified pre-revenue. Twilio's actual uptime is strong; the real reliability risk in this business is carrier-side message filtering, not Twilio outages, and a second provider doesn't fix that either. **What IS worth doing now, cheaply:** route all Twilio SDK calls through one central internal function (e.g. a `sendSms()` wrapper) instead of calling the Twilio SDK directly from every route. Costs almost nothing to build, and means if a second provider is ever added later (once there's real revenue and volume — 50+ contractors), only one file needs to change instead of rewriting the SMS layer across the app. Revisit full multi-provider redundancy only after meaningful scale, not before.

**Logo swapped across the entire brand — August 11, 2026 (session 25).** New logo (`Newlogo.png`, 512x512, purple/blue rounded-square "T" mark) replaced the old ProBook logo everywhere. Full inventory done across every connected folder before touching anything — nothing left showing the old logo in source. What changed: (1) `frontend/public/probook-icon-128.png` + `probook-icon-64.png` — this is the single source every React page (login, admin, contractor portal, booking pages, terms, privacy, etc.) and every outbound email pull from, since notifications.js references it as a hosted URL (`${APP_URL}/probook-icon-128.png`), not embedded data — one file swap fixed ~25 UI locations and all email templates at once. (2) The embedded base64 "Powered by Tractify" footer badge baked directly into `backend/templates/hvac-template.html` and `hvac-template/index.html` (id="probook-logo") — found and replaced the base64 payload in both, verified byte-for-byte against the new logo file. (3) `hvac-template/intake-form.html` had the logo embedded in three separate spots (page header, Google Business prefill card, success screen) — all three found and replaced, verified. (4) Legacy/unreferenced logo files (`probooklogo.png`, `logo.png`, `tractify-logo.png`, `probook-logo-dark.png`, `probook-logo-light.png`) also swapped for consistency even though most weren't actively linked anywhere.

**Important nuance — two separate deploy pipelines, both needed.** The main app fix (frontend + emails + hvac-template.html) deploys via the normal `git push origin main` → Railway auto-deploy. The intake form (`intake-form.html`) deploys separately via Cloudflare Pages using `npx wrangler pages deploy /tmp/intake-deploy --project-name probook-intake --branch=production` — git push does NOT touch intake.tractifyhq.com. Both were run.

**Known gap, decided not to fix:** pushing the updated `backend/templates/hvac-template.html` only changes the template used for *future* contractor deployments — it does not retroactively update contractor sites already live. The one existing live site (evergreenhomeheatingandenergy.tractifyhq.com) is a test contractor and was intentionally left on the old logo rather than manually redeployed. If a real paying contractor ever needs their site logo refreshed, redeploy via the Wrangler CLI process documented under "Subdomain Auto-Deploy."

**Real inbound email set up for tractifyhq.com + support@/bookings@ split locked — August 11, 2026 (session 25).** While testing the logo deploy, discovered the Terms of Service and Privacy Policy publicly listed `oiltoheatrebate@gmail.com` as the support contact — a dead inbox Jose no longer has access to. Root cause traced back further: tractifyhq.com had zero inbound mail capability at all. Resend (the outbound email API used for all transactional sending) only verifies SPF/DKIM for *sending* — it has no inbound/receiving/forwarding capability whatsoever. Confirmed this empirically by sending a test email to bookings@tractifyhq.com and getting a hard bounce (`554 5.7.1 Relay access denied`) — no MX/receiving route existed on the domain.

**Fix: Cloudflare Email Routing set up on tractifyhq.com** (Cloudflare already owns the DNS zone, so this was the correct tool, not Resend). Steps taken: (1) Started onboarding, hit a blocker — "Existing non-Cloudflare MX records conflict with Email Routing" — an old stale MX record was sitting on the domain from before. Removed it in Cloudflare DNS → Records, then activation succeeded cleanly (3 MX records at priority 47/70/30 pointing to route1-3.mx.cloudflare.net, a DKIM TXT record scoped to `cf2024-1._domainkey.tractifyhq.com`, and an SPF TXT record `v=spf1 include:_spf.mx.cloudflare.net ~all` — no conflict with Resend's existing outbound SPF since Resend's domain verification stayed "Verified" throughout). (2) Added `ayc98223@gmail.com` as a verified Destination Address (had to click a confirmation link Cloudflare emailed to that inbox before it could be used in any routing rule). (3) Created a routing rule: `bookings@tractifyhq.com` → forwards to `ayc98223@gmail.com`. Confirmed working via live test email. (4) **Added a Catch-all rule** (Action: "Send to an email" → ayc98223@gmail.com, toggled Active) so that *any* address @tractifyhq.com — not just the ones with explicit rules — forwards instead of bouncing. This closes off this entire class of bug permanently; a future hardcoded or forgotten address will never silently bounce again. (5) Added a second explicit rule for `support@tractifyhq.com` → ayc98223@gmail.com, created for semantic clarity even though the catch-all already covered it.

**Two working addresses now exist, both forwarding to ayc98223@gmail.com, split by purpose (not arbitrary — a full codebase audit was done to decide which references should use which):**
- **`bookings@tractifyhq.com`** — the transactional/sending identity. This is `FROM_EMAIL` in notifications.js, used as the literal "From:" address on every automated email (booking confirmations, reminders, welcome emails, password resets). Also correctly referenced in `build_cheatsheet.py` and `hvac-template/client-onboarding.md` where those docs describe what FROM address contractors/homeowners will see. Left untouched. Also used as the internal ADMIN_EMAIL fallback default in notifications.js (4 spots) and as both the `from:`/`to:` on the Worker's internal "new intake submission" alert — these are Jose-only ops alerts, never seen by a customer, so the exact address doesn't carry branding weight.
- **`support@tractifyhq.com`** — the customer-facing "contact us for help" identity. Swapped in everywhere a human (contractor or homeowner) is being told to reach out with a question, as opposed to receiving an automated transactional email. Changed: `TermsOfService.jsx` + `PrivacyPolicy.jsx` (`CONTACT_EMAIL` constant), the shared email footer signature in `notifications.js` (the "The Tractify Team / [contact] · tractifyhq.com" line shown at the bottom of every single outbound email), two self-service abuse-limit error messages in `backend/routes/bookings.js` ("Please contact ___ to arrange a new time"), and all 5 "Need help? Email us at ___" mailto links in `frontend/src/pages/CancelPage.jsx`.

**Also fixed as part of the same audit:** the Cloudflare Worker's instant admin alert (`probook-upload-worker/src/index.js` + source-of-truth copy `NewWorkerScript-auto-deploy.js`) was still hardcoded to `oiltoheatrebate@gmail.com` — updated to `bookings@tractifyhq.com` and redeployed via `npx wrangler deploy` (hit an unrelated local npm cache permissions error first — `sudo chown -R $(whoami) ~/.npm` fixed it). CLAUDE.md's own "Business email" line (top of file) and the `sendContractorApplicationAlert` table entry (Email Templates section) were also updated to stop referencing the dead address.

**Twilio Error 18606 resolved by this same fix.** Twilio Trust Hub Compliance Profile was rejecting the Business Profile with "Email domain doesn't match the website domain" because the Notification Email field needs to be @tractifyhq.com to match the Business Website URL — it cannot be a Gmail address. Once bookings@tractifyhq.com existed as a real working inbox, it was set as the Notification email and the profile was resubmitted via the same rejected bundle's edit link (not a new profile). Twilio does not care where the address forwards to behind the scenes (Cloudflare → Gmail) — only that the domain matches and the address can receive mail, which it now can.

**Deliberately NOT touched: the Admin Login Credentials section of this file (tractifyhq.com/admin login email, still listed as oiltoheatrebate@gmail.com).** That's a database-level login username, not an inbox — editing the doc text wouldn't change the actual account. Flagged risk: there is no admin forgot-password flow built (only contractors have one — see "Forgot Password Flow" section), and the register-new-admin-if-locked-out curl command no longer works since it auto-disables once an admin account exists. Not urgent since login only requires the password, not inbox access, but worth fixing properly (either update the admin account's registered email via a DB update, or build an admin forgot-password flow) before this becomes a real lockout risk.

**✅ SMS test endpoint is live:** `POST /api/twilio/test-sms` (admin JWT required). Accepts `{ phone, message, role, contractorId }`. Returns AI reply as JSON. Brain 2 path: handleContractorSms. Brain 3 path: getActiveSession → routeHomeownerSms or startHomeownerSession. CANCEL keyword explained without touching data. Use curl or Postman to simulate full multi-turn conversations without Twilio credentials.

**Example curl — test Brain 2 (contractor):**
```bash
curl -X POST https://tractifyhq.com/api/twilio/test-sms \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+12065551234","message":"what is on my calendar tomorrow","role":"contractor","contractorId":"CONTRACTOR_UUID"}'
```

**Example curl — test Brain 3 (homeowner, multi-turn):**
```bash
# Turn 1 — start session
curl -X POST https://tractifyhq.com/api/twilio/test-sms \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+12065559876","message":"hello","role":"homeowner","contractorId":"CONTRACTOR_UUID"}'
# → returns { reply: "Hey! This is Premier Comfort...", sessionState: "awaiting_address" }

# Turn 2 — give address (reuse same phone to continue the session)
curl -X POST https://tractifyhq.com/api/twilio/test-sms \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+12065559876","message":"1234 Maple Ave Bellevue","role":"homeowner","contractorId":"CONTRACTOR_UUID"}'
# → returns { reply: "Got it. What's going on — heating, cooling...", sessionState: "awaiting_service" }
```

**Next builds in order:** ⚠️ superseded — see "⚡ THE ACTUAL NEXT STEPS" near the bottom of this file for the current, correct build order (intake form → Twilio/SMS hardening → Stripe, per-delivery billing not job-5-only/flat-fee).

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
Decision: do not build this. The AI SMS drip handles channel setup. Self-filtering is intentional — a contractor who won't text back is not a client Tractify wants. GBP API also blocked at 0 QPM until Google approves. Revisit only if manual overhead becomes a real problem at 10+ contractors. **Reconfirmed final, session 27 (August 17, 2026):** Jose explicitly does not want Tractify managing a contractor's GBP or Facebook/Instagram accounts, on their behalf or via granted access — self-serve via AI SMS instructions only. This closes the loop on the "access-first channel strategy" entries earlier in this file, which are now marked superseded.

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
⚠️ Superseded — see "⚡ THE ACTUAL NEXT STEPS" near the bottom of this file. Contractor dashboard live stats, job milestone triggers, and revenue/outcome logging are all still real, still needed, just resequenced behind Twilio/SMS hardening now that Stripe is no longer the immediate next build.

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

### GBP Booking Button Setup — self-serve via AI SMS, not a Jose task (reconfirmed final session 27, August 17, 2026)
**⚠️ Supersedes the earlier version of this section, which had Jose manually logging into a contractor's Google account and setting the booking button himself, with the self-serve path noted only as a secondary "alternative (preferred)."** That's flipped now — self-serve is the only path. Jose never touches a contractor's Google Business Profile. The AI SMS drip (`smsAI.js`) texts the contractor these steps directly and marks the checklist step complete when they reply "done":
1. Go to business.google.com and sign in with your own Google account
2. Click your business listing → Edit profile
3. Scroll to "Booking" or click "Contact" section
4. Find "Add a booking button" or "Links" → "Appointment links"
5. Paste the link the text gave you
6. Save
That's it — the "Book" button then appears on their Google listing and Maps entry, highest-intent free traffic immediately active, and Jose was never in their account.

**Note on the booking URL:** the instructions above (and the AI SMS copy that mirrors them) predate THE PIVOT and still reference a per-contractor `tractifyhq.com/schedule/{slug}` booking page. Post-pivot there's no more per-contractor website — the correct link to text a contractor for this step is the universal landing page described under "The new signup flow" in THE PIVOT section (name/niche inserted as text, "text us to book"), not a schedule page. Flagging this as a real gap to close in `smsAI.js`'s GBP step guide text, not yet fixed.

**Instructions must be idiot-proof — flagged August 17, 2026, session 27, to revisit once real SMS testing starts (STEP 2 in ⚡ PICK UP HERE).** Self-serve only works if a contractor can actually complete every step without Jose. There's no fallback anymore — no Jose quietly finishing it for them if they get stuck, since that would reintroduce the exact account-access/labor problem self-serve was built to avoid. Two things this means in practice, both still to build/verify once Step 2's real end-to-end Twilio test happens: (1) every self-serve step's SMS copy (GBP, Messenger/Instagram, and any future channel) needs to be re-read as if written for someone who has never done this before — numbered, exact button names, no assumed platform familiarity. (2) Brain 2 needs an explicit "stuck? describe what you're seeing and I'll walk you through it" recovery path on every self-serve step, not just a one-shot instruction-and-hope text — if a contractor goes quiet mid-step, that's a stalled channel and a stalled trial with nobody positioned to unstick it except the AI. Test this specifically, not just the happy path, before pointing real ad spend at real contractors.

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

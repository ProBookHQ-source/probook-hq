/**
 * loadDiagnosticKnowledge.js — seeds Brain 3's diagnostic knowledge base
 *
 * Run this ONCE after deploying to Railway (after VOYAGE_API_KEY is set).
 * Safe to re-run — clears existing chunks for each niche before inserting.
 *
 * Usage:
 *   cd backend && node scripts/loadDiagnosticKnowledge.js
 *   or
 *   node scripts/loadDiagnosticKnowledge.js --niche=hvac
 *
 * The knowledge is divided into niches. Each chunk is a focused diagnostic
 * topic that Brain 3 retrieves based on semantic similarity to the homeowner's
 * message. Only 3-5 chunks load per message — never the whole database.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// When running locally via `railway run`, the DATABASE_URL uses Railway's
// private hostname (postgres.railway.internal) which is unreachable from a
// local machine. Switch to the public URL automatically if available.
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const db = require('../database/db');
const { storeKnowledgeBatch, clearNicheKnowledge } = require('../services/diagnosticKnowledge');

// ─── HVAC KNOWLEDGE ─────────────────────────────────────────────────────────
// Comprehensive coverage: AC cooling, furnace heating, heat pumps, mini-splits,
// oil tanks, boilers, air quality, ductwork, thermostats, safety

const HVAC_KNOWLEDGE = [

  // ── AC / COOLING SYMPTOMS ─────────────────────────────────────────────────

  {
    niche: 'hvac', category: 'cooling', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['grinding', 'noise', 'ac', 'motor'],
    content: `AC making a grinding noise: Almost always a motor bearing problem — either the condenser fan motor outside or the blower motor inside. Metal-on-metal grinding means the bearing is wearing out and the motor will fail completely soon, often within days to weeks. Running it longer damages the motor windings and makes replacement more expensive. Action needed this week. In some cases loose debris (a stick, a rock) got into the condenser — check if something is caught in the fan blades before assuming motor failure. If there's nothing visible, a tech needs to inspect. Do not ignore grinding — it doesn't get better on its own.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['squealing', 'screeching', 'ac', 'belt'],
    content: `AC making a high-pitched squealing or screeching sound: In older systems (pre-2000s), this is usually a worn belt — blower belts stretch and fray over time. In newer systems with direct-drive motors, squealing typically points to a bad blower wheel bearing or condenser fan bearing. A brief squeal on startup that goes away is less urgent; continuous squealing while running needs attention soon. A motor bearing squealing continuously will eventually seize, which can trip the breaker or burn out the motor. Schedule service within the week — don't run it continuously if it's squealing loudly.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['clicking', 'ac', 'capacitor', 'startup'],
    content: `AC clicking repeatedly when trying to start: Single click on startup is normal (contactor engaging). Rapid repeated clicking — especially if the unit seems to try to start and fails — points to a failing run capacitor or start capacitor. The capacitor gives the motor a boost to start; when it fails, the motor hums or clicks trying to start but can't. This is one of the most common AC repairs, especially in hot weather. Capacitors are inexpensive ($15-50 part) but the labor and diagnosis bring it to $150-350 typically. AC won't cool while this is happening. Schedule service soon — running the unit with a failing capacitor can burn out the compressor ($1,500+).`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['not cooling', 'ac', 'warm air', 'refrigerant'],
    content: `AC running but not cooling the house: Several causes, ranked by likelihood. (1) Dirty air filter — check and replace first. A completely clogged filter blocks airflow and causes the system to run without moving cool air effectively. Free fix if this is it. (2) Dirty evaporator coil — same effect as a clogged filter but requires cleaning by a tech. (3) Low refrigerant — AC needs a specific refrigerant charge to cool. Low refrigerant means the system can't absorb enough heat. This always means there's a leak — refrigerant doesn't get used up, it escapes. A tech needs to find and fix the leak, then recharge. Not a homeowner DIY. (4) Compressor issue — the compressor pumps the refrigerant; if it's struggling or failing, cooling suffers. More expensive repair. (5) Undersized system for the home — if it's always struggled on hot days, the system may not be right-sized for the space.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['running constantly', 'ac', 'never stops', 'cycles'],
    content: `AC runs constantly and never shuts off: On extremely hot days (95°F+), this can be normal — the system is just working hard to keep up. But on moderate days it usually signals one of: (1) Dirty air filter or evaporator coil restricting airflow — check the filter first, free fix. (2) Low refrigerant charge — system struggles to reach setpoint. (3) The home is poorly insulated or the AC is undersized. (4) The thermostat is set too low for current conditions. (5) Refrigerant leak causing gradual loss of cooling capacity. A system running 24/7 in moderate weather is working too hard, wasting energy, and will wear out faster. Worth having a tech look at if filter replacement doesn't solve it.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['ice', 'frozen', 'ac', 'coil', 'lines'],
    content: `Ice forming on AC lines or coils: Counterintuitive but ice forming on an AC means it's NOT cooling properly. Two main causes: (1) Restricted airflow — dirty filter, closed vents, or blocked return air. Ice forms when refrigerant gets too cold from not absorbing enough heat from airflow. Turn off the AC and let it thaw (run the fan only for a few hours), replace the filter, make sure all vents are open, then turn the AC back on. (2) Low refrigerant — too little refrigerant causes the coil to get excessively cold and freeze. If a new filter doesn't prevent the icing from coming back, you have a refrigerant issue and need a tech. Don't run the AC with ice on the coil — it can damage the compressor.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['water', 'leak', 'dripping', 'ac', 'drain'],
    content: `Water dripping or leaking from AC unit (indoor unit): AC units remove humidity from the air — that water is supposed to drain out through a condensate drain line. When you see water, the drain is clogged or the drain pan is cracked. Clogged drain is the most common — algae, mold, and debris build up in the drain line over time, especially in humid climates. DIY fix: locate the condensate drain line (usually a PVC pipe running to a drain or outside), find the access port, pour a cup of diluted bleach or white vinegar into it to clear the blockage. If that doesn't work, a shop vac on the drain outlet can pull the clog out. If the pan is cracked or the drain line is broken, a tech needs to repair it. Water damage from a leaking AC can be significant — don't ignore it.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['hissing', 'bubbling', 'refrigerant', 'ac', 'leak'],
    content: `Hissing or bubbling sound from AC: Hissing often indicates refrigerant leaking — the pressurized refrigerant escapes through a small crack or hole with a hiss. Bubbling sounds can indicate refrigerant escaping through a leak in the liquid line. Both require a tech — refrigerant handling is EPA-regulated and requires certification. A refrigerant leak won't heal itself; the leak gets found and fixed, then the system is recharged. Running the system with a refrigerant leak stresses the compressor and can lead to compressor failure ($800-2,000+ repair). Note: a brief hiss when the system shuts off is normal (pressure equalization) — that's not a leak.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['short cycling', 'ac', 'turns on off', 'frequent'],
    content: `AC short cycling — turns on and off very frequently: Short cycling (running for only 1-3 minutes before shutting off) has several causes. (1) Oversized AC — a unit too large for the space cools too fast, satisfies the thermostat before properly dehumidifying, then shuts off. This is a sizing problem, not a repair. (2) Low refrigerant — triggers safety shutoffs. (3) Dirty evaporator coil — causes the coil to freeze, triggering a shutoff. (4) Refrigerant overcharge — too much refrigerant also causes pressure issues. (5) Failing compressor — struggling compressor may overheat and shut off on thermal protection. Short cycling stresses every component and causes premature wear — worth diagnosing sooner rather than later.`
  },

  {
    niche: 'hvac', category: 'cooling', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['ac', 'not turning on', 'breaker', 'power'],
    content: `AC not turning on at all: Before calling a tech, check these: (1) Thermostat — is it set to COOL and the setpoint lower than current room temp? Try lowering it 5 degrees. (2) Circuit breaker — AC units have a dedicated breaker, often two (one for the air handler/furnace, one for the outdoor condenser). Check the panel; reset any tripped breakers. (3) Disconnect box — the outdoor condenser has a disconnect box (gray box near the unit). Make sure the disconnect pull is inserted properly. (4) Air handler power switch — there's often a light-switch-style power switch near the air handler (indoor unit) that gets accidentally turned off. If none of these are the issue, a tech needs to diagnose — could be a blown fuse, failed contactor, failed capacitor, or a faulty thermostat.`
  },

  // ── FURNACE / HEATING SYMPTOMS ────────────────────────────────────────────

  {
    niche: 'hvac', category: 'heating', urgency: 'immediate', safety_flag: false,
    symptom_tags: ['banging', 'boom', 'furnace', 'startup', 'ignition'],
    content: `Furnace making a banging or booming sound on startup: This is called delayed ignition — gas accumulates in the burner before it ignites, then ignites all at once creating a small explosion. It's hard on the heat exchanger and should be addressed promptly. Causes: dirty burners that don't ignite cleanly, low gas pressure, or a cracked heat exchanger. Delayed ignition can crack the heat exchanger over time; a cracked heat exchanger is a serious safety issue (carbon monoxide can enter the air supply). Don't ignore banging on startup — have a tech inspect the burners and heat exchanger. This is not normal, not a minor issue.`
  },

  {
    niche: 'hvac', category: 'heating', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['squealing', 'furnace', 'blower', 'belt'],
    content: `Furnace squealing while running: The blower motor circulates heated air through the ducts. Squealing usually means: (1) Worn blower belt (on older belt-drive furnaces) — the belt stretches and slips, creating a squeal. Belts are inexpensive and easy to replace. (2) Failing blower motor bearing — metal squealing from the motor itself means the bearing is going. A motor with a bad bearing will eventually seize. (3) Dirty blower wheel — buildup on the fan blades can create an imbalance and noise. Schedule service — a squealing furnace continues to run but will eventually fail, and it's better to fix it before the coldest night of the year.`
  },

  {
    niche: 'hvac', category: 'heating', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['no heat', 'furnace', 'cold air', 'not heating'],
    content: `Furnace running but blowing cold or lukewarm air: (1) Check the thermostat — make sure it's on HEAT, not COOL or FAN ONLY. (2) Check the air filter — a clogged filter causes the furnace to overheat and triggers the limit switch, which shuts off the burners as a safety measure. The blower keeps running (pushing cold air) but the burners are off. Replace the filter and reset the furnace. (3) Pilot light out (older furnaces) — relighting it is a homeowner task, instructions are usually on the furnace door. (4) Igniter failure — modern furnaces use a hot surface igniter that glows to ignite the gas. These fail and need replacement by a tech ($150-300). (5) Gas supply issue — check other gas appliances; if the stove or water heater also have no gas, contact your gas company. (6) Flame sensor dirty — the sensor detects the flame and keeps the gas valve open; a dirty sensor causes the furnace to light and then shut off within seconds. Cleaning it is a simple tech job.`
  },

  {
    niche: 'hvac', category: 'heating', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['yellow flame', 'furnace', 'carbon monoxide', 'orange flame'],
    content: `Furnace flame is yellow or orange instead of blue: This is a serious warning sign. A healthy furnace flame is blue with possibly small yellow tips. A predominantly yellow or orange flame means incomplete combustion — the furnace isn't burning gas cleanly. This produces carbon monoxide. A yellow flame can indicate a cracked heat exchanger, dirty burners, improper gas/air mixture, or blocked flue. Turn off the furnace and call an HVAC tech immediately. Do not run a furnace with a yellow flame. Make sure your CO detector is working — replace the battery if you're unsure. If your CO alarm has gone off, leave the home and call 911 before calling an HVAC company.`
  },

  {
    niche: 'hvac', category: 'heating', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['burning smell', 'furnace', 'smoke', 'electrical smell'],
    content: `Burning smell from furnace: Depends on the smell. (1) Dusty burning smell at the start of heating season — completely normal. The furnace is burning off dust that settled on the heat exchanger over summer. Goes away in an hour or two. (2) Burning plastic or electrical smell — not normal. Indicates an overheating motor, failing capacitor, or wiring problem. Turn off the furnace and call a tech. (3) Burning rubber smell — could be a slipping blower belt (older furnaces) or a failing motor. Turn off and call a tech. (4) Burning oil smell — if you have an oil furnace, a small amount of oil smell is normal on startup. A strong persistent oil smell means a problem. (5) Gas smell — see gas smell protocol. If the burning smell is unusual or persistent, don't ignore it.`
  },

  {
    niche: 'hvac', category: 'heating', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['furnace', 'short cycling', 'turns on off', 'frequently'],
    content: `Furnace short cycling — turning on and off very frequently: (1) Dirty air filter — most common cause. Restricted airflow causes the heat exchanger to overheat, tripping the high-limit switch, which shuts off the burners. Blower keeps running, heat exchanger cools, then it cycles back on. Replace the filter immediately — running a furnace with a clogged filter damages the heat exchanger. (2) Oversized furnace — heats the space too quickly, satisfies the thermostat before completing a full cycle. Sizing issue, not a repair. (3) Faulty thermostat — bad thermostat location (near a heat source) or failing thermostat. (4) Failing flame sensor — sensor shuts the system down within seconds of ignition if dirty. (5) Overheating — if the heat exchanger is cracked or the system is old, it may be overheating as a sign of a more serious problem.`
  },

  // ── HEAT PUMP SYMPTOMS ───────────────────────────────────────────────────

  {
    niche: 'hvac', category: 'heat_pump', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['heat pump', 'not heating', 'cold', 'winter'],
    content: `Heat pump not heating well in cold weather: Heat pumps work differently than furnaces — they move heat rather than create it. Below about 35-40°F, heat pumps struggle to extract heat from outside air efficiently. Most heat pumps have auxiliary or emergency electric heat strips that kick in when it's very cold. Check your thermostat: if it shows "AUX HEAT" or "EM HEAT" running, that's normal in cold weather. If the heat pump is running but the home isn't warming at all in mild temperatures (above 40°F), that's abnormal. Possible causes: low refrigerant, failing reversing valve (the part that switches between heating and cooling mode), or the outdoor unit is frozen over. A heat pump with ice over the entire outdoor unit (not just a light frost) needs a tech — the defrost cycle may not be working.`
  },

  {
    niche: 'hvac', category: 'heat_pump', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['heat pump', 'ice', 'frozen', 'outdoor unit'],
    content: `Heat pump outdoor unit covered in ice: A light frost or thin layer of ice on a heat pump in winter is completely normal — heat pumps go through a defrost cycle every 30-90 minutes that melts it. But if the entire unit (coils, fan, all surfaces) is encased in ice and has been for hours, the defrost cycle isn't working. Possible causes: failed defrost thermostat or defrost control board, low refrigerant causing abnormal pressure, or a stuck reversing valve. Don't pour hot water on the unit. Don't run the system in heating mode when it's fully iced over — it strains the compressor. Switch to emergency heat to keep the home warm and call a tech. Running the fan-only mode briefly can sometimes help the defrost cycle, but a tech is needed if it keeps icing up.`
  },

  // ── MINI-SPLIT SYMPTOMS ──────────────────────────────────────────────────

  {
    niche: 'hvac', category: 'mini_split', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['mini split', 'error code', 'blinking', 'light'],
    content: `Mini-split showing error code or blinking lights: Mini-splits (ductless systems) have built-in diagnostics. A blinking light pattern or error code on the indoor unit indicates a fault. Common codes: E1/E3/E6 usually relate to communication errors between indoor and outdoor units (often a wiring issue), E4/E5 relate to protection modes (overheating, excessive current), P-series codes often indicate refrigerant pressure issues. Write down the exact error code, then look it up in the manual or Google "[your brand] mini-split [error code]." Some codes clear with a system reset (turn power off at the breaker for 30 seconds, restore). Recurring codes mean a real fault that needs a tech. Brands: Mitsubishi (Mr. Slim), Fujitsu, Daikin, LG, Pioneer, Gree, Cooper & Hunter all have different code systems.`
  },

  {
    niche: 'hvac', category: 'mini_split', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['mini split', 'not cooling', 'weak airflow', 'dirty filter'],
    content: `Mini-split not cooling well or airflow seems weak: First thing to check — the air filter inside the indoor unit. Mini-splits have easy-access washable filters that need cleaning every 2-4 weeks in regular use (monthly at minimum). Lift the front panel of the indoor unit, slide out the filters, rinse them with water, let them dry completely, reinstall. This is a homeowner task and is often the entire fix. If the filter is clean and airflow is still weak, the evaporator coil (deeper inside the unit) may be dirty — that requires a professional cleaning. Also check that the outdoor unit isn't blocked by debris, vegetation, or snow/ice. If the unit cools but struggles to hit the setpoint, consider whether it's sized correctly for the space.`
  },

  // ── OIL TANK / OIL FURNACE / BOILER ──────────────────────────────────────

  {
    niche: 'hvac', category: 'oil_system', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['oil', 'smell', 'leak', 'tank', 'fuel'],
    content: `Oil smell from furnace, oil tank, or anywhere in mechanical room: A slight smell of oil on startup is normal for oil burners — a small amount of oil may not fully combust and the smell dissipates quickly. A persistent strong oil smell, especially near the tank or fuel lines, indicates a leak. Oil leaks are serious: environmental contamination, fire risk, and cleanup costs (potentially $10,000-100,000+ if the oil reaches soil). Do not ignore an oil smell. Check the tank, the fuel filter/strainer, and the fuel lines for any drips or wet spots. Check the boiler or furnace for oil residue at the burner nozzle assembly. Even a small leak should be fixed immediately. Call an oil burner technician. If you see a significant spill, call your heating oil company and your insurance.`
  },

  {
    niche: 'hvac', category: 'oil_system', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['oil burner', 'lockout', 'reset', 'not starting', 'puffback'],
    content: `Oil burner going into lockout (requires pushing reset button): Oil burners have a safety lockout that trips if the burner fails to ignite on startup. One reset is typically acceptable — the tech is that there was air in the line or a brief ignition issue. Pressing reset once is fine. Pressing reset multiple times on the same day is not — repeated lockouts mean the burner isn't igniting reliably. Causes: dirty nozzle (fuel nozzle needs annual replacement), failing ignition transformer, low fuel (check the tank), water in the fuel (condensation in old tanks), or air in the fuel line after running the tank dry. A "puffback" — a small explosion or soot cloud from the burner — is a serious ignition failure that needs immediate professional attention and often results in soot throughout the home.`
  },

  {
    niche: 'hvac', category: 'oil_system', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['boiler', 'radiator', 'not heating', 'hot water heat'],
    content: `Boiler not heating — radiators or baseboard heaters are cold: (1) Check the thermostat — set to heat, above current room temp. (2) Check the boiler itself — is it showing any error codes or lights? (3) Check the pressure gauge on the boiler — operating pressure for a hot water system should be 12-25 PSI (most run around 15-18). Very low pressure (under 10) means the system lost water and needs to be refilled — there's a manual fill valve (looks like a hose bib) to add water slowly while watching the pressure gauge. (4) Check the expansion tank — if it's waterlogged (too heavy, makes a sloshing sound), system pressure will spike and the safety relief valve will open, losing water. (5) Circulator pump failure — the pump that moves hot water through the system can seize. Touch the pump body; it should be warm. If it's cold and the boiler is firing, the pump may have failed.`
  },

  {
    niche: 'hvac', category: 'oil_system', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['underground oil tank', 'buried tank', 'decommission', 'abandon'],
    content: `Underground oil tank questions: Many older homes (pre-1970s) have buried underground oil tanks that were abandoned when homes converted to gas or newer heating systems. These tanks rust and leak over time, creating serious environmental liability. Signs of a buried tank: fill pipe (thin pipe sticking out of ground or through foundation), vent pipe (usually a 2-inch pipe), or former oil line entry into the foundation. If you're buying a home, always do a sweep for buried tanks. If you have a known abandoned tank, options are: (1) removal and disposal (preferred — $1,500-5,000 if no contamination, much more if soil is contaminated), (2) decommissioning in place (fill with inert material — cheaper but the tank remains, and soil testing is still needed). Many states require disclosure and remediation at home sale.`
  },

  // ── AIR QUALITY / DUCTWORK ────────────────────────────────────────────────

  {
    niche: 'hvac', category: 'air_quality', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['dusty', 'air quality', 'allergy', 'filter', 'dust'],
    content: `Dusty home, worsening allergies, or air feels dirty: The HVAC system is the primary air filtration system in the home. First check: air filter. A cheap fiberglass filter (MERV 1-4) does almost nothing for allergies — upgrade to a MERV 8-11 pleated filter ($15-30) which captures pollen, mold spores, pet dander, and fine dust. Change it every 1-3 months depending on pets, allergies, and construction. Second check: duct leakage. If supply ducts run through an unconditioned attic or crawl space, leaky ducts pull in attic dust and insulation fibers. A tech can do a duct leakage test. Third: whole-home air purification — UV lights, HEPA bypass filters, or electronic air cleaners installed in the air handler can dramatically improve air quality. Fourth: duct cleaning — if the system hasn't been cleaned in 5-10+ years and ducts show visible debris, professional duct cleaning can help (but it's not a substitute for good filtration).`
  },

  {
    niche: 'hvac', category: 'air_quality', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['mold', 'musty smell', 'hvac', 'ducts', 'moisture'],
    content: `Musty or moldy smell coming from vents: The evaporator coil (inside the air handler) is a cold, damp surface — perfect for mold and mildew growth. This is the most common source of musty HVAC smells. A tech can clean the evaporator coil and drain pan, which typically resolves it. Persistent moisture issues (high humidity, visible dripping inside the air handler) suggest the drain pan isn't draining properly or the system is oversized for the space (oversized AC doesn't run long enough to properly dehumidify). A UV light installed near the evaporator coil kills mold and bacteria continuously — good long-term solution for humid climates. Musty smell only at startup (first 5-10 minutes of the season) is often just surface dust burning off — less concerning than a persistent smell.`
  },

  {
    niche: 'hvac', category: 'ductwork', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['some rooms', 'hot', 'cold', 'uneven heating', 'zoning'],
    content: `Some rooms are hot, some are cold — uneven heating or cooling: Several causes. (1) Closed supply vents — check that vents aren't accidentally closed or blocked by furniture. (2) Duct leakage — if ductwork runs through unconditioned spaces, leaky ducts lose conditioned air before it reaches distant rooms. A duct leakage test can quantify this. (3) Insufficient duct sizing — some older homes have undersized duct runs to additions or distant rooms. (4) Airflow imbalance — too many returns or not enough returns creates pressure imbalances. (5) Zoning issue — if the home had a zone system added, dampers or controls may be malfunctioning. (6) Insulation issues in certain areas. A Manual J load calculation can determine if the system is properly matched to the home. An HVAC tech can use airflow measuring equipment to find exactly where the imbalance is.`
  },

  // ── THERMOSTAT ────────────────────────────────────────────────────────────

  {
    niche: 'hvac', category: 'thermostat', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['thermostat', 'blank screen', 'not working', 'display'],
    content: `Thermostat has a blank screen or is unresponsive: (1) Dead batteries — most thermostats have AA or AAA batteries. Replace them. This is the most common fix. (2) Tripped breaker — the air handler/furnace breaker may have tripped, which also cuts power to the thermostat on most systems. Check your panel. (3) Power switch off — there's often a power switch on or near the air handler. (4) Blown fuse on the control board — inside the air handler/furnace there's a small blade fuse (usually 3A) on the control board. Check and replace if blown. (5) Loose thermostat wiring — the small gauge wires behind the thermostat can loosen over time. Turn off the system power, remove the thermostat from the wall, check that all wires are firmly connected to their labeled terminals. A blank thermostat with dead batteries is a free fix; anything else is a quick tech visit.`
  },

  // ── GENERAL SAFETY OVERRIDES (always surface first via safety_flag) ────────

  {
    niche: 'hvac', category: 'safety', urgency: 'emergency_911', safety_flag: true,
    symptom_tags: ['gas', 'smell', 'rotten egg', 'natural gas'],
    content: `GAS SMELL — ROTTEN EGG OR SULFUR SMELL: Natural gas is odorized with mercaptan, which smells like rotten eggs. If you smell gas: do not turn any lights or switches on or off, do not use your phone inside the home, do not light a match or candle. Leave the home immediately, leaving the door open behind you. Once outside, call your gas company's emergency line or 911. Do not re-enter until the gas company has cleared the home. This is a life safety emergency — gas leaks can cause explosion and fire. After the home is cleared, call an HVAC technician to inspect all gas connections and appliances.`
  },

  {
    niche: 'hvac', category: 'safety', urgency: 'emergency_911', safety_flag: true,
    symptom_tags: ['carbon monoxide', 'co detector', 'alarm', 'headache'],
    content: `CARBON MONOXIDE DETECTOR GOING OFF: CO is odorless and colorless — you cannot detect it without a detector. If your CO alarm is going off: get everyone (including pets) out of the home immediately. Call 911 from outside. Do not re-enter the home until the fire department clears it. Symptoms of CO poisoning include headache, dizziness, nausea, and confusion — if any household members feel these symptoms, seek medical attention. After the incident, have a heating technician inspect all combustion appliances (furnace, water heater, fireplace, gas stove, attached garage) before using them again. CO detectors should be tested monthly and replaced every 5-7 years.`
  },

  {
    niche: 'hvac', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['smoke', 'fire', 'burning', 'sparks', 'hvac'],
    content: `Smoke, sparks, or visible fire from HVAC equipment: Turn off the system immediately at the thermostat, then at the breaker. If there is active fire, call 911 and leave the home. Do not use a garden hose on electrical equipment. If it's just smoke with no visible flame, ventilate the area and call an HVAC emergency tech. Don't run the system again until a tech has inspected it. Electrical fires inside an air handler or furnace are serious — they can spread into the ductwork and wall cavities before becoming visible.`
  },

  {
    niche: 'hvac', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['no heat', 'winter', 'frozen pipes', 'cold', 'emergency'],
    content: `No heat in freezing temperatures — elderly or young children in home: This is a priority emergency, not a "schedule service" situation. Pipes can freeze at 20°F and below within hours if heat is out. Call an HVAC company immediately and ask specifically about emergency service — many companies have after-hours emergency lines for exactly this situation. While waiting: set faucets to drip slightly (moving water is harder to freeze), open cabinet doors under sinks on exterior walls, use space heaters in critical rooms if you have them (keep away from curtains and furniture). If the home cannot be heated and you have vulnerable occupants (elderly, infants, people with health conditions), a warming shelter or hotel is the safer option.`
  },

];

// ─── ROOFING KNOWLEDGE ───────────────────────────────────────────────────────

const ROOFING_KNOWLEDGE = [

  {
    niche: 'roofing', category: 'leaks', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['leak', 'water stain', 'ceiling', 'dripping', 'rain'],
    content: `Water stain on ceiling or water dripping inside during or after rain: Active leaks need attention before the next rain event — water damage compounds fast (mold, structural damage, drywall). Most common leak locations: (1) Flashing — the metal strips around chimneys, skylights, valleys, and roof penetrations. Flashing is the #1 source of leaks. It separates, corrodes, or gets improperly sealed. (2) Missing or cracked shingles — look for dark spots (missing granules), curled edges, or obviously absent shingles. (3) Valleys — where two roof planes meet, water concentrates. (4) Pipe boots — the rubber collar around plumbing vents; they crack and shrink over time. (5) Gutters — clogged gutters cause water to back up under shingles at the eaves (ice dam territory in cold climates). A roofer can identify the exact entry point with an inspection.`
  },

  {
    niche: 'roofing', category: 'damage', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['dark spots', 'granules', 'shingles', 'gutter', 'age'],
    content: `Dark spots on shingles or granules in gutters: Dark spots or bald patches on shingles mean the protective granule coating has worn away, exposing the underlying asphalt. Granules in your gutters after a storm is normal for an aging roof — a little granule loss is expected. Significant granule loss means the shingles are near end of life; exposed asphalt degrades quickly in UV light. A roof with major granule loss might have 2-5 years of useful life remaining. Have a roofer assess whether it needs spot replacement, a full re-roof, or just extended maintenance. Age context: asphalt shingles last 20-30 years (architectural/dimensional shingles) or 15-20 years (3-tab shingles). If the roof is in that range, full replacement may be the most economical path.`
  },

  {
    niche: 'roofing', category: 'damage', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['storm damage', 'hail', 'wind', 'shingles blown off'],
    content: `Storm damage — hail or wind: After a major storm, do a visual inspection from ground level — don't go on the roof without proper safety equipment. Look for: missing shingles (visible gaps or dark patches), damaged gutters and downspouts (dents from hail), shingles curling up at edges (wind lifting), granule loss visible from ground as color patches. Hail damage on shingles can look like dark circular bruises or pockmarks — it's often easier to see on soft metal components (gutters, vents, AC fins) that dent visibly. Document everything with photos before any repairs. If you have homeowner's insurance, call your insurer — storm damage is typically covered (minus deductible). Request a roofer inspect before filing a claim to understand scope; many roofers offer free storm damage inspections.`
  },

  {
    niche: 'roofing', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['sagging', 'structural', 'roof', 'ceiling', 'collapse'],
    content: `Sagging roof or ceiling: Any visible sagging — in the roofline when viewed from outside, or in the ceiling inside — is a structural warning sign. Causes: water damage to rafters or sheathing (wet wood rots and loses structural integrity), excessive snow/ice load, inadequate original construction, or long-term termite damage. A sagging roof that progresses can collapse. If you see active sagging, especially in a roof valley or over a room, call a roofing contractor immediately. Don't store heavy items in the attic above a sagging area. If the sagging is severe or you can see the ceiling bowing, consider whether occupying that space is safe while waiting for an inspection.`
  },

  {
    niche: 'roofing', category: 'insulation', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['ice dam', 'icicles', 'winter', 'attic', 'insulation'],
    content: `Ice dams forming at roof edges in winter: Ice dams form when heat escapes through the roof, melts snow at the top, and that water refreezes at the cold eaves — eventually backing up under shingles and leaking inside. The root cause is almost always insufficient attic insulation and/or ventilation. The fix isn't about the roof itself — it's about keeping the attic cold (like the outside) so snow doesn't melt unevenly. Short-term: ice dam removal (carefully, with a roof rake) and proper attic ventilation can help. Long-term fix: add attic insulation (typical target is R-49 to R-60 in cold climates), ensure soffit vents are unblocked, and consider a ridge vent. A roofing contractor can assess whether the immediate damage (water staining, wet insulation) needs remediation.`
  },

];

// ─── ELECTRICAL KNOWLEDGE ────────────────────────────────────────────────────

const ELECTRICAL_KNOWLEDGE = [

  {
    niche: 'electrical', category: 'breakers', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['breaker', 'tripping', 'keeps tripping', 'circuit'],
    content: `Circuit breaker keeps tripping: A breaker that trips once after a storm or power surge is normal. A breaker that trips repeatedly has a real problem. Three main causes: (1) Circuit overload — too many devices drawing power on one circuit. Add up the wattage and compare to the circuit rating (15A circuit = 1,800W, 20A = 2,400W). Unplug some devices and see if it holds. Solution is either reducing load or adding a circuit. (2) Short circuit — a hot wire touching a neutral wire somewhere in the circuit. This is dangerous — causes the breaker to trip immediately when you try to reset it, often with a flash or pop. Needs an electrician. (3) Ground fault — hot wire contacting a grounded surface. Similar to a short circuit. (4) Failing breaker — breakers can wear out over 20-30 years and trip at less than their rated load. An electrician can test and replace. Don't repeatedly reset a tripping breaker without knowing why.`
  },

  {
    niche: 'electrical', category: 'outlets', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['outlet', 'not working', 'dead', 'gfci', 'reset'],
    content: `Outlet not working: Before calling an electrician, check: (1) GFCI outlet — if the dead outlet is in a bathroom, kitchen, garage, outdoor area, or near water, look for a GFCI outlet with a TEST and RESET button on the same circuit. Press RESET firmly until it clicks. GFCI outlets protect a whole chain of downstream outlets — resetting one GFCI may restore multiple dead outlets. (2) Tripped breaker — go to your panel and look for any breaker that isn't fully in the ON position. Even a partially tripped breaker may not look obviously off. Switch it fully to OFF, then back to ON. (3) Half-switched outlet — some outlets have one plug controlled by a wall switch. Check if there's a switch nearby that controls the outlet. If none of these work, the outlet may need replacement or there's a wiring issue in the wall.`
  },

  {
    niche: 'electrical', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['burning smell', 'electrical', 'outlet', 'melting', 'sparks'],
    content: `Burning smell from outlet, panel, or anywhere electrical: This is a fire warning. Electrical fires start in walls and spread before you see flames. A burning plastic or acrid smell near an outlet, switch, or the electrical panel means something is overheating. Actions: turn off the breaker for that area (or the main breaker if you can't identify which circuit), do not use the outlet or switch, unplug anything from nearby outlets. Call an electrician immediately — same day if possible. If you see scorch marks, melted plastic, or sparks, call 911. Electrical fires can smolder in walls for hours before becoming visible. A burning smell is not "probably fine" — take it seriously.`
  },

  {
    niche: 'electrical', category: 'panel', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['panel', 'fuse box', 'upgrade', 'capacity', 'old'],
    content: `Electrical panel questions — capacity, age, upgrades: Most modern homes need 200-amp service. If you have a 100-amp panel (common in homes built before the 1980s), you may need an upgrade if you're adding EV charging, a hot tub, an HVAC system, or a major kitchen remodel. Signs your panel may need attention: frequently tripping breakers, the need to unplug appliances to use others, a panel that's more than 40 years old, fuse boxes (fuses instead of breakers — these are obsolete and generally upgraded). Specific brands to be aware of: Federal Pacific Electric (FPE) Stab-Lok panels and Zinsco/Sylvania panels are known for breaker failure issues and are often flagged in home inspections. An electrician can assess whether your panel is adequate or needs replacement.`
  },

];

// ─── PLUMBING KNOWLEDGE ──────────────────────────────────────────────────────

const PLUMBING_KNOWLEDGE = [

  {
    niche: 'plumbing', category: 'leaks', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['dripping', 'leak', 'pipe', 'water', 'under sink'],
    content: `Dripping or leaking pipe: Small drips under a sink at the supply valves or drain connections are usually easy fixes — compression fittings can be hand-tightened, P-trap connections can be snugged down. A slow drip that's been ignored creates water damage and mold. Check under all sinks and at the toilet base for any evidence of moisture (staining, soft cabinet floors, mineral deposits). Active dripping from supply lines (the braided stainless hoses) should be addressed promptly — these lines can burst catastrophically. If a supply line burst, turn off the shut-off valve under the sink immediately. Know where your main water shut-off valve is (usually near the water meter or where the main enters the house) in case of a larger emergency.`
  },

  {
    niche: 'plumbing', category: 'water_heater', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['water heater', 'popping', 'rumbling', 'sediment', 'noise'],
    content: `Water heater making popping or rumbling sounds: Sediment (calcium carbonate and minerals from hard water) builds up in the bottom of tank water heaters over time. As the burner heats the water, steam bubbles form under the sediment layer and pop through it — creating the rumbling, popping, or knocking sounds. Heavy sediment reduces efficiency (the burner has to heat through the sediment layer), reduces hot water capacity, and can shorten heater life. Fix: flush the water heater. Connect a garden hose to the drain valve at the bottom, run it to a drain or outside, turn off the cold water supply, open the drain valve and let water flow until it runs clear. Do this annually as maintenance. If the water heater is over 10-12 years old and making significant noise, factor in that replacement may be coming soon anyway.`
  },

  {
    niche: 'plumbing', category: 'water_heater', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['water heater', 'no hot water', 'pilot', 'gas', 'leaking'],
    content: `No hot water — water heater troubleshooting: Gas water heater: check if the pilot light is out (there are relight instructions on the unit), check that the gas valve is on, check the thermocouple (if pilot goes out repeatedly, the thermocouple may be bad — $20-50 part, tech job). Electric water heater: check the breaker first (electric water heaters are usually 240V with a double-pole breaker). If breaker is fine, the upper or lower heating element may have burned out — an electrician or plumber can test and replace them. Both types: if there's water pooling under the water heater, the tank may be failing. A leaking tank cannot be repaired — it needs replacement. Water heater lifespan is typically 8-12 years for tank models.`
  },

  {
    niche: 'plumbing', category: 'drains', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['clog', 'slow drain', 'toilet', 'blocked', 'backed up'],
    content: `Slow or clogged drain: For a single slow drain (one sink or shower), it's usually a simple blockage at the drain itself. Remove and clean the drain stopper, use a drain snake or hair clog remover tool (the plastic hooks that pull hair out), or pour boiling water down to melt soap buildup. Avoid chemical drain cleaners in chrome/brass drains and PVC pipes — they're corrosive and often don't work on physical clogs. If multiple drains are slow, or toilets gurgle when you run the sink, the blockage is further down in the main sewer line — this requires a plumber with a sewer snake or hydro-jet. A complete drain backup (sewage coming up into tubs when you flush) is a sewer line emergency — call immediately and don't use any water until it's cleared.`
  },

];

// ─── LANDSCAPING KNOWLEDGE ───────────────────────────────────────────────────

const LANDSCAPING_KNOWLEDGE = [

  {
    niche: 'landscaping', category: 'lawn', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['brown spots', 'dead grass', 'dry', 'lawn', 'patches'],
    content: `Brown or dead patches in the lawn: Several causes, each with a different fix. (1) Irrigation problem — the most common cause of irregular brown patches. A sprinkler head is clogged, broken, or has the wrong nozzle, leaving areas under-watered. Run each zone manually and watch coverage. Gaps in spray pattern = irrigation fix. (2) Grub damage — lawn grubs (beetle larvae) eat grass roots just below the surface. Brown areas that pull up like a loose carpet with no root system = grubs. Treat with grub killer in late summer. (3) Fungal disease — brown patch, dollar spot, or other lawn fungus creates circular or irregular brown patterns. Often spreads in humid conditions or when the lawn is overwatered at night. Treatment is fungicide application. (4) Dog urine — concentrated nitrogen burns the grass in a circular pattern with a green ring around it (extra nitrogen in the outer zone). Rinse the area with water right after if you see it happen. (5) Compacted soil — grass struggles to grow in compacted areas. Core aeration in fall helps.`
  },

  {
    niche: 'landscaping', category: 'lawn', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['weed', 'dandelion', 'clover', 'lawn weeds', 'overrun'],
    content: `Lawn taken over by weeds: Weeds are a symptom of a weak lawn, not the primary problem. A thick, healthy lawn naturally crowds out weeds. Long-term fix: address the root cause (thin grass, wrong mowing height, poor soil, low pH). Short-term controls: (1) Broadleaf weeds (dandelions, clover, plantain) — broadleaf herbicide (2,4-D or products like Weed B Gon) kills them without harming grass. Apply when weeds are actively growing, temps 60-85°F. (2) Grassy weeds (crabgrass, annual bluegrass) — pre-emergent herbicide applied in early spring before soil reaches 55°F prevents germination. Post-emergent is harder for grassy weeds. (3) Mowing height matters — mowing at 3-4 inches shades out most weed seeds. Low mowing is one of the biggest drivers of weed invasion. A landscaper can do a lawn assessment and targeted treatment program.`
  },

  {
    niche: 'landscaping', category: 'irrigation', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['sprinkler', 'irrigation', 'leak', 'broken head', 'water'],
    content: `Sprinkler system problems — leaks, broken heads, or not working: (1) Broken or tilted sprinkler heads — heads get hit by mowers, sink over time, or crack. A head not popping up or spraying sideways is usually a simple replacement ($5-15 part). (2) Zone not turning on — check the controller first (is the zone programmed?), then the valve for that zone (a solenoid valve controls each zone — they fail and need replacement). (3) Controller not running — check the power, time, and program settings. Battery backup may need replacement if the clock resets after power outages. (4) Water pooling in one area — usually a broken line or a head that's stuck open. The valve for that zone may not be closing fully. (5) Low pressure — a main line leak underground, or too many heads on one zone. (6) After winter: always run through every zone manually at the start of the season — winter can shift heads and crack fittings.`
  },

  {
    niche: 'landscaping', category: 'trees', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['tree', 'leaning', 'fallen', 'dead branches', 'storm damage'],
    content: `Tree leaning, large dead branches, or storm-damaged tree: Large trees near homes, power lines, or fences are significant safety hazards when damaged or structurally compromised. A tree leaning toward a structure after a storm, a tree with large dead branches (widow makers), or a tree with visible rot at the base needs professional assessment immediately. Do not attempt to cut large branches or a leaning tree yourself — incorrect cutting direction can cause the tree to fall the wrong way. A certified arborist can assess whether a tree can be saved with pruning/cabling or needs full removal. Tree removal near structures or power lines requires specialized equipment and liability insurance. For branches actually on power lines: call your utility company first — they handle those at no cost and have required clearances.`
  },

  {
    niche: 'landscaping', category: 'trees', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['tree', 'dying', 'leaves', 'yellow', 'bark', 'pest'],
    content: `Tree appears to be dying — yellow leaves, bark damage, or no leaves in season: Several common causes. (1) Overwatering or underwatering — trees in lawns can be overwatered by irrigation. Deep watering less frequently is better than shallow daily watering. (2) Root compaction — construction, heavy foot traffic, or paving over root zones stresses trees. An arborist can do air spading to decompress roots. (3) Pest infestation — emerald ash borer (ash trees), pine bark beetles (conifers), scale insects, and borers all cause leaf dieback and bark damage. Look for D-shaped exit holes, pitch tubes, or sawdust at the base. (4) Fungal disease — various canker diseases and root rots attack stressed trees. (5) Lightning strike — a vertical crack in the bark or scorched strip from top to base. Trees often recover but need assessment. (6) Girdling roots — roots that circle the base and gradually choke the trunk. A certified arborist can diagnose and recommend treatment.`
  },

  {
    niche: 'landscaping', category: 'drainage', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['water pooling', 'drainage', 'soggy yard', 'flooding', 'standing water'],
    content: `Standing water or poor drainage in the yard: Water that sits for more than 24-48 hours after rain indicates a drainage problem that will damage grass, plants, and potentially the foundation. Solutions depend on cause: (1) Compacted soil — core aeration plus topdressing with compost improves infiltration. Good first step. (2) Low spots — grading the yard to direct water away from structures. All grading should slope away from the foundation (minimum 6 inches drop in the first 10 feet). (3) Clay soil — dramatically reduces drainage. Amending with organic matter over years helps; for severe cases, a French drain or dry well is needed. (4) French drain — a gravel-filled trench with a perforated pipe that intercepts and redirects water underground. Can handle significant water but requires correct slope (1% minimum). (5) Downspout extensions or buried drains — make sure gutters are directing water away from the house, not dumping at the foundation.`
  },

  {
    niche: 'landscaping', category: 'hardscape', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['pavers', 'cracking', 'sinking', 'patio', 'walkway', 'driveway'],
    content: `Pavers sinking, cracking, or shifting: Paver and concrete problems are almost always a base problem, not a surface problem. Pavers shift and sink when the gravel/sand base settles, erodes, or was insufficient to begin with. Concrete cracks when the base settles unevenly, the slab was too thin, or tree roots heave it from below. Options: (1) Paver re-leveling — individual sunken pavers can be lifted, the base releveled with additional sand, and the paver reset. Can be done without replacing pavers. (2) Full base repair — if widespread settling, the area needs to be excavated, a proper compacted base installed, and pavers reset. (3) Tree root damage — if a root is heaving the surface, cutting the root and releveling is a short-term fix; the root will regrow. Sometimes tree removal is the only permanent solution. (4) Concrete lifting — foam injection (polyjacking) or mudjacking can lift and stabilize sunken concrete slabs without replacement.`
  },

];

// ─── PAINTING KNOWLEDGE ──────────────────────────────────────────────────────

const PAINTING_KNOWLEDGE = [

  {
    niche: 'painting', category: 'interior', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['peeling', 'bubbling', 'paint', 'wall', 'bathroom'],
    content: `Paint peeling or bubbling on walls: Peeling and bubbling paint means moisture is getting behind the paint film. (1) Bathroom/kitchen — poor ventilation causes humidity to saturate the wall. The paint separates from the surface. Fix the ventilation first (make sure the exhaust fan actually vents outside, not into the attic), then repaint with a moisture-resistant paint. (2) Exterior moisture intrusion — if an exterior wall is peeling, water may be getting in through cracks in the siding, missing caulk, or roof leaks. Painting over it without fixing the moisture source is temporary — it will peel again. (3) Painted over dirty or oily surface — paint doesn't adhere to surfaces that weren't properly cleaned. (4) Incompatible primers/paints — oil-based paint over latex without proper adhesion primer will separate. Proper prep is the entire job — a painter who skips prep saves time but creates callbacks.`
  },

  {
    niche: 'painting', category: 'interior', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['stain', 'water stain', 'ceiling', 'yellow', 'bleeding'],
    content: `Water stains or stains bleeding through paint: Painting over a water stain with regular paint doesn't hide it — the stain bleeds through in days to weeks. The stain must be sealed first with a stain-blocking primer (Zinsser BIN shellac-based or Zinsser Bulls Eye 1-2-3 for less severe stains). Apply one coat of stain blocker, let it dry fully, then paint over with your finish color. Same rule applies for: nicotine stains (yellow ceiling, entire room smells), marker and crayon on walls, grease stains in kitchens, rust stains, and tannin bleed from bare wood. Important: fix the source of any water stain before painting — if the leak is still active, the stain will return. A stain on the ceiling that's growing is an active leak.`
  },

  {
    niche: 'painting', category: 'exterior', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['exterior', 'peeling', 'fading', 'siding', 'paint', 'wood'],
    content: `Exterior paint peeling or failing: Exterior paint protects the wood underneath — peeling paint is exposing bare wood to weather, which leads to rot and more expensive repairs. The correct fix involves full prep: scraping all loose paint, sanding rough edges, caulking all gaps and joints (around windows, trim, siding transitions), priming bare wood, and then topcoating. Skipping steps is why exterior paint jobs fail in 3-5 years instead of lasting 10+. Key factors: (1) Timing — don't paint in direct sun, in temperatures below 50°F or above 90°F, when rain is forecast within 24 hours, or on wood that's visibly wet. (2) Primer — bare wood must be primed. Painting without primer over bare wood causes the paint to fail rapidly. (3) Caulk quality — use paintable exterior caulk; interior caulk on exterior joints fails quickly. A good exterior paint job on prepared surfaces should last 7-12+ years.`
  },

  {
    niche: 'painting', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['lead paint', 'old house', 'chips', 'children', 'pre-1978'],
    content: `Lead paint — homes built before 1978: Homes built before 1978 may have lead-based paint. Lead paint that's in good condition and not disturbed is not an immediate hazard — it's lead dust and chips that are dangerous, especially to children and pregnant women. Do not sand, scrape, or disturb painted surfaces in pre-1978 homes without lead testing first. A lead test kit ($10-30 at hardware stores) can confirm whether paint contains lead. If positive: RRP (Renovation, Repair, and Painting) regulations require contractors to be EPA lead-safe certified, use containment, and follow specific cleanup procedures. Do not hire a painter who dismisses lead safety in an older home. If you have peeling or chipping paint in a pre-1978 home with children present, treat it as a priority.`
  },

  {
    niche: 'painting', category: 'prep', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['mold', 'mildew', 'black spots', 'bathroom', 'paint', 'wall'],
    content: `Mold or mildew on painted surfaces: Black or green spots on bathroom walls, ceilings, or exterior surfaces under eaves are usually mold or mildew. Painting over mold without killing it first doesn't work — it grows right through new paint. Correct process: (1) Clean affected area with a mold-killing solution (diluted bleach 1:3 water, or a commercial mold cleaner). Wear gloves and eye protection. Ventilate the area. (2) Allow to dry completely — at least 24 hours. (3) If the area is large (10+ square feet), or if mold has penetrated drywall (soft, stained, or crumbling), that section of drywall needs to be cut out and replaced, not just painted over. (4) Prime with mold-resistant primer before applying finish paint. (5) Address the moisture source — mold returns if the underlying humidity/leak isn't fixed. A painter who doesn't discuss the moisture source before starting is giving you a temporary fix.`
  },

  {
    niche: 'painting', category: 'color', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['color', 'coverage', 'bleed through', 'dark color', 'painting over'],
    content: `Painting over dark colors or getting proper coverage: Dark colors are hard to cover with light colors in a single coat — the old color bleeds through. The solution is tinted primer: ask the paint store to tint the primer to a color close to your finish color. This dramatically reduces the number of topcoats needed. Going light to dark (painting a dark color over a light one) is usually fine in 2 coats. Going dark to light (white over navy) often takes 3-4 coats without tinted primer. For a dramatic color change, expect 2 coats of tinted primer and 2 coats of finish color. One-coat coverage claims on paint cans assume you're painting a similar color over a properly primed surface — not a dark-to-light change. Factor this into your project timeline and material estimate.`
  },

];

// ─── GENERAL CONTRACTING KNOWLEDGE ──────────────────────────────────────────

const GENERAL_KNOWLEDGE = [

  {
    niche: 'general', category: 'drywall', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['drywall', 'crack', 'hole', 'wall', 'patch'],
    content: `Cracks or holes in drywall: Small nail holes and hairline cracks are homeowner-level fixes (spackle, sand, paint). Larger repairs need a proper drywall patch. For holes up to 6 inches: cut to a square, cut a backer board to span the hole, attach the patch to the backer, tape and mud the seams, sand and paint. Cracks along drywall seams (the horizontal or vertical lines that appear over doors and in corners) indicate the house is settling — normal in any home. If settling cracks are wide (more than 1/8 inch), diagonal from door or window corners, or growing, they may indicate foundation movement and should be evaluated by a structural engineer, not just patched. Recurring cracks in the same spot after patching = movement still happening — the root cause needs attention.`
  },

  {
    niche: 'general', category: 'foundation', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['foundation', 'crack', 'basement', 'settling', 'structural'],
    content: `Foundation cracks — when to worry: Not all foundation cracks are serious. (1) Hairline cracks in poured concrete — very common, often appear within the first year as concrete cures and dries. Usually not structural. (2) Horizontal cracks in block or poured walls — these indicate lateral pressure (soil pressure against the wall) and ARE structurally significant. Get a structural engineer or foundation specialist to evaluate immediately. (3) Stair-step cracks in block foundations — movement along the mortar joints. Can indicate settlement or soil pressure. Have evaluated. (4) Vertical cracks in poured concrete — common from shrinkage. If they are wider at the top than bottom or show signs of movement (staining, displacement), get evaluated. (5) Cracks wider than 1/4 inch anywhere — have evaluated. Signs that accompany serious foundation issues: doors and windows that suddenly won't open or close, floors that slope visibly, walls bowing inward.`
  },

  {
    niche: 'general', category: 'windows_doors', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['door', 'sticking', 'window', 'wont close', 'frame', 'gap'],
    content: `Doors or windows sticking, won't close properly, or have visible gaps: Sudden changes in door or window behavior are often caused by seasonal wood expansion (humidity causes wood to swell in summer, shrink in winter). A door that sticks only in summer is usually this — plane the binding edge slightly during the sticky season. If multiple doors and windows are affected at the same time, or if the problem appears year-round and is getting worse, it may indicate foundation settlement or structural movement — have it evaluated. Drafty windows with visible gaps: weatherstripping replacement is a DIY fix. Foggy double-pane windows (condensation between the panes) means the gas seal has failed — the insulating performance is reduced. The glass unit can be replaced without replacing the entire window frame, which is much cheaper. Check for rot around window and door frames in older homes — soft or discolored wood around the frame indicates water intrusion.`
  },

  {
    niche: 'general', category: 'floors', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['floor', 'squeaking', 'creaking', 'soft spot', 'bouncy'],
    content: `Squeaking, creaking, or soft/bouncy floors: (1) Squeaking hardwood — boards rubbing against each other or against the subfloor. From above: powdered graphite or talc powder worked into the seams often quiets squeaks temporarily. From below (basement/crawl space): locate the squeak while someone walks above, then add a wood screw through the subfloor into the joist to pull the subfloor tight. (2) Soft or springy spots — this is more serious. Soft spots in hardwood floors usually mean the subfloor underneath is damaged (water damage is the most common cause). Press on it — if it flexes noticeably, the subfloor has been weakened. Requires cutting in and replacing the damaged subfloor before refinishing. (3) Bouncy floor across a wider area — undersized floor joists, a failed joist, or a missing support beam. A contractor or structural engineer should assess if a floor feels spring across a significant area.`
  },

  {
    niche: 'general', category: 'water_damage', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['water damage', 'wet wall', 'ceiling stain', 'flood', 'leak'],
    content: `Water damage — wet walls, ceilings, or subfloors: Water damage must be addressed quickly. Mold begins growing within 24-48 hours in wet building materials. Steps: (1) Stop the water source first — nothing else matters until the source is found and stopped. (2) Remove standing water — wet/dry vac or pump. (3) Dry out the structure — fans, dehumidifiers, open windows. A professional remediation company has moisture meters and industrial drying equipment. (4) Assess what's salvageable — drywall that got wet, dried, and shows no mold or structural damage can sometimes stay. Drywall that was saturated or has visible mold should be cut out and replaced. Insulation (especially fiberglass batts) almost always needs replacement once wet. (5) Subfloor — a wet subfloor that isn't dried within 48-72 hours will warp and delaminate if it's OSB. Solid wood subfloor is more forgiving. Check moisture levels before enclosing any repaired area.`
  },

  {
    niche: 'general', category: 'insulation', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['insulation', 'cold', 'drafty', 'high energy bill', 'attic'],
    content: `Poor insulation — cold rooms, high energy bills, drafts: In most existing homes, the attic is the highest-leverage place to add insulation. Heat rises — an under-insulated attic is like wearing a coat with no hat. Target R-49 to R-60 in cold climates (about 16-20 inches of blown cellulose or fiberglass). Before adding insulation, air sealing is critical: every penetration into the attic (light fixtures, top plates, plumbing vents) should be foam-sealed before adding insulation on top. Air sealing without insulation = incomplete. Insulation without air sealing = 50% of the benefit. Walls are harder and more expensive to insulate retroactively (blow-in insulation through holes in exterior or interior). Crawl space insulation: in most climates, insulating and encapsulating the crawl space (conditioned crawl space approach) outperforms insulating between the floor joists above it. A contractor can do a blower door test to measure actual air leakage before recommending where to focus.`
  },

  {
    niche: 'general', category: 'permits', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['permit', 'unpermitted work', 'renovation', 'addition', 'code'],
    content: `Questions about permits and unpermitted work: Most structural, electrical, plumbing, and HVAC work requires permits. What typically requires a permit: new electrical circuits or panel upgrades, plumbing work beyond fixture replacement, HVAC installation or replacement, structural work (removing walls, adding rooms, decks), and window/door replacements that change the opening size. What typically doesn't: painting, flooring, cabinet replacement, fixture swaps (same location), minor repairs. Unpermitted work: discovered during home sale inspections, it can kill a deal or require expensive remediation. An existing homeowner with unpermitted work can often retroactively permit it by having the work inspected — sometimes requiring opening walls to verify. A contractor doing work without required permits is putting you at legal and financial risk. If a contractor says "we don't need a permit for this" on work that clearly requires one, that's a red flag.`
  },

];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const targetNiche = process.argv.find(a => a.startsWith('--niche='))?.split('=')[1];

  // Wait for DB to be ready
  await db._ready;
  console.log('✅ DB connected');

  const allNiches = [
    { name: 'hvac',        chunks: HVAC_KNOWLEDGE },
    { name: 'roofing',     chunks: ROOFING_KNOWLEDGE },
    { name: 'electrical',  chunks: ELECTRICAL_KNOWLEDGE },
    { name: 'plumbing',    chunks: PLUMBING_KNOWLEDGE },
    { name: 'landscaping', chunks: LANDSCAPING_KNOWLEDGE },
    { name: 'painting',    chunks: PAINTING_KNOWLEDGE },
    { name: 'general',     chunks: GENERAL_KNOWLEDGE },
  ];

  const toLoad = targetNiche
    ? allNiches.filter(n => n.name === targetNiche)
    : allNiches;

  if (!toLoad.length) {
    console.error(`Unknown niche: ${targetNiche}`);
    process.exit(1);
  }

  for (const { name, chunks } of toLoad) {
    console.log(`\n── Loading ${name.toUpperCase()} knowledge (${chunks.length} chunks) ──`);
    await clearNicheKnowledge(name);
    await storeKnowledgeBatch(chunks);
    console.log(`✅ ${name.toUpperCase()} complete`);
  }

  console.log('\n🎉 All knowledge loaded. Brain 3 is now an expert.\n');
}

// Allow require()'ing this script as a module (e.g. from the admin endpoint)
// without auto-running. Only auto-run when called directly.
module.exports = { main };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Load failed:', err.message);
    process.exit(1);
  }).then(() => process.exit(0));
}

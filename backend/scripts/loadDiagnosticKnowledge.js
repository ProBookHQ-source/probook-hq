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

  {
    niche: 'roofing', category: 'gutters', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['gutters', 'clogged', 'overflowing', 'water', 'fascia'],
    content: `Gutters overflowing or clogged: Gutters that overflow during rain are blocked — usually by leaves, pine needles, or debris buildup. Clogged gutters cause water to pour over the front edge and saturate the soil against the foundation, contributing to basement water intrusion. They also trap moisture against the fascia board and soffit, which rots over time. Clean gutters at minimum once a year (twice if you have overhanging trees). Signs of gutter damage beyond clogs: gutters pulling away from the fascia (the spike-and-ferrule hangers fail after 15-20 years; hidden hanger replacement is more durable), gutters sloping wrong and pooling water instead of draining, seams leaking at joints (seal with gutter caulk from inside the gutter). Downspouts should discharge at least 4-6 feet from the foundation — use extensions or buried drainage to get water away from the house.`
  },

  {
    niche: 'roofing', category: 'moss_algae', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['moss', 'algae', 'black streaks', 'green', 'roof', 'shingles'],
    content: `Moss, algae, or black streaks on the roof: Black streaks on shingles are gloeocapsa magma — a type of algae that feeds on the limestone filler in asphalt shingles. It looks alarming but doesn't damage shingles directly; it's mainly cosmetic. Moss is more problematic — moss holds moisture against shingles and can lift edges, allowing water under them. Treatment: a diluted bleach solution (1 part bleach, 3 parts water) kills both algae and moss. Apply, let sit 20 minutes, rinse gently. Never pressure wash a roof — it strips granules and damages shingles. Zinc or copper strips installed at the ridge work as a long-term preventive — rain water picks up metal ions and flows down, inhibiting growth. Algae-resistant shingles (contain copper granules) are available for replacement. Heavy moss on an older roof may require professional treatment; a roofer can assess whether shingle damage has occurred underneath.`
  },

  {
    niche: 'roofing', category: 'skylights', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['skylight', 'leak', 'condensation', 'dripping', 'ceiling'],
    content: `Skylight leaking or dripping: Skylight leaks come from two very different sources — and distinguishing them matters. (1) Actual water leak (flashing or seal failure): Water appears during or after rain, typically at the sides or corners of the skylight frame. Skylight flashing (metal around the perimeter) can separate, corrode, or lose its seal. Fixed-skylights vs. venting skylights (that open) have different failure points — the gaskets on venting skylights wear out. (2) Condensation: Dripping that appears in cold weather, not related to rain, usually at the glass or the frame is condensation forming on the cold glass surface and dripping inside. This is a thermal bridging and humidity issue, not a leak. Fix: improve attic ventilation and interior humidity control. If you're not sure which you have, note whether it happens during rain (leak) or cold mornings/nights regardless of rain (condensation). Both need attention; actual flashing leaks are more urgent.`
  },

  {
    niche: 'roofing', category: 'replacement', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['roof', 'replace', 'how long', 'age', 'lifespan', 'cost'],
    content: `When to replace vs. repair a roof: Repair when: the roof is less than 15 years old, damage is isolated to one area (a single field of shingles, around one penetration), the underlying decking is in good condition. Replace when: the roof is over 20 years old (architectural) or 15+ years old (3-tab), damage is widespread, granule loss is significant across the whole surface, you're seeing multiple leak points, or the decking has rot or damage. A good roofer will tell you honestly — a repair on a roof that needs replacement is money wasted. When getting quotes: get at least 3, ask whether they're tearing off the old roof or overlaying (tear-off is better — overlay adds weight, hides problems, and most manufacturers require tear-off for warranty). Ask about decking inspection — you shouldn't know the full price until the old shingles are off and the decking is checked. Ask what warranty they provide on labor vs. the manufacturer's shingle warranty.`
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

  {
    niche: 'electrical', category: 'lighting', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['flickering', 'dimming', 'lights', 'blinking', 'bulbs'],
    content: `Flickering or dimming lights — causes and what they mean: (1) Single light flickering: check the bulb first — loose bulb in the socket, or a bulb going bad. LED bulbs can flicker on dimmer switches not designed for LEDs. Replace with a dimmer-compatible LED or replace the dimmer. (2) Multiple lights on the same circuit flickering: a loose connection somewhere in that circuit — at the fixture, in the junction box, or at the breaker. Loose connections cause arcing, which is a fire risk. Don't ignore persistent flickering on multiple lights. (3) Lights dimming when a large appliance starts (HVAC, refrigerator, washer): normal momentary voltage dip from the motor starting. Brief and immediate recovery is normal. If lights stay dim or dim frequently, could be an undersized service or loose main connections. (4) Lights flickering throughout the entire house: loose connections at the meter or main panel, or a utility issue. Have an electrician check the main connections and call your utility if it continues.`
  },

  {
    niche: 'electrical', category: 'outlets', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['two-prong', 'grounded', 'ungrounded', 'outlet', 'safety'],
    content: `Two-prong outlets and ungrounded circuits: Two-prong outlets (no round ground hole) are ungrounded. Most homes built before the 1960s have them. Options for upgrading: (1) Replace with GFCI outlet — NEC allows replacing ungrounded outlets with GFCI outlets. This protects against shock but does NOT provide a true ground. Label the outlet "No Equipment Ground" as required. This is the most affordable option. (2) Run a new grounded circuit — a new cable from the panel to the outlets. Most expensive, but the "right" solution, especially for electronics and computers that need a true ground. (3) Install GFCI breaker — protects the whole circuit. Same protection as GFCI outlet, no true ground. Do NOT use a cheater plug (3-prong-to-2-prong adapter) and rely on it as a safety measure — that ground tab needs to actually be connected to a ground screw to do anything.`
  },

  {
    niche: 'electrical', category: 'wiring', urgency: 'schedule', safety_flag: true,
    symptom_tags: ['aluminum wiring', 'old house', 'fire hazard', '1960s', '1970s'],
    content: `Aluminum wiring in homes built 1965-1973: Some homes built during this period were wired with aluminum branch circuit wiring (not aluminum service entrance, which is fine — just aluminum in the walls to outlets and switches). Aluminum expands and contracts more than copper, causing connections to loosen over time. Loose connections cause arcing. Arcing causes fires. Red flags: single-strand aluminum wire connected to outlets and switches (usually 15A and 20A circuits). Smoke detector brand "CO/ALR" written on outlets. Solutions: (1) Pigtailing — an electrician connects a short copper pigtail to each aluminum wire end using a specific "CO/ALR" connector and anti-oxidant compound. CPSC-approved method. (2) Replace the wiring — full rewire. Expensive, but permanent. Do NOT have an electrician simply retighten the connections — that's a temporary fix. Have your home inspected if you're unsure of the wiring type.`
  },

  {
    niche: 'electrical', category: 'ev_charging', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['ev charger', 'electric car', '240v', 'level 2', 'outlet', 'garage'],
    content: `EV charger or 240V outlet installation: Level 1 charging (a standard 120V outlet) gives an EV about 3-5 miles of range per hour — fine for occasional light driving. Level 2 charging (240V, 30-50A circuit) gives 20-30+ miles per hour — practical for daily drivers. A Level 2 EVSE (the charging equipment) requires a dedicated 240V circuit from your panel to the garage. Process: (1) Assess your panel — do you have capacity? A 200A panel with multiple open breaker slots is fine. A full 100A panel may need a sub-panel or panel upgrade. (2) An electrician installs a 40-50A 240V circuit from the panel to the garage (a 40A circuit with a 32A EVSE is the sweet spot for most EVs). (3) The EVSE (the actual charging unit) is a separate purchase — Chargepoint, JuiceBox, and Tesla Wall Connector are popular options, ranging $300-700. Most car manufacturers include a Level 1 cord with the vehicle; you buy the Level 2 unit separately. Install permits are typically required.`
  },

  {
    niche: 'electrical', category: 'outlets', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['sparks', 'outlet', 'plug', 'shock', 'warm outlet', 'hot'],
    content: `Outlet sparking or feeling warm: A brief spark when you plug something in is usually normal — electricity jumps briefly as the prongs make contact. What's NOT normal: (1) Large, sustained sparks or sparks when nothing is being plugged in. (2) A plastic burning smell from the outlet or switch. (3) An outlet or switch plate that feels warm or hot to the touch. (4) Discoloration or black marks around the outlet. Any of these indicate a loose connection, overloaded circuit, or failing outlet that is generating heat — an electrical fire risk. Turn off the circuit at the breaker and don't use the outlet until an electrician can inspect it. Don't dismiss a warm outlet as "probably fine" — connection failures create resistance, resistance creates heat, heat starts fires in walls.`
  },

  {
    niche: 'electrical', category: 'smoke_co', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['smoke detector', 'carbon monoxide', 'alarm', 'chirping', 'beeping'],
    content: `Smoke and carbon monoxide detectors — what different sounds mean: Continuous alarm: treat as real. Get out, call 911. A CO alarm going off with no smell is still real — CO is odorless. Chirping every 30-60 seconds: low battery. Replace the battery (usually 9V or AA depending on the model). Chirping continues after battery replacement: the unit is at end of life (detectors should be replaced every 10 years for smoke, 5-7 years for CO). Interconnected alarm system: one alarm sets them all off. Find the "trigger" unit — it usually has a flashing red light. Detectors should be: on every level of the home, inside and outside every sleeping area, and the CO detector within 10 feet of sleeping areas. Hard-wired detectors with battery backup are better than battery-only (they don't fail during power outages). Don't disable a chronically chirping detector — replace it.`
  },

  {
    niche: 'electrical', category: 'generator', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['generator', 'whole home', 'standby', 'transfer switch', 'backup power'],
    content: `Whole-home generator or standby generator questions: Portable generators (gas, wheeled): provide temporary power for essentials during outages. NEVER run them inside the garage or near windows — CO poisoning kills people every year this way. Must be manually started and connected. Standby generators (natural gas or propane, permanently installed): turn on automatically within seconds of a power outage, run indefinitely on utility gas. Require installation of a transfer switch or smart panel to safely connect to your home's wiring — this prevents back-feeding electricity onto utility lines (which kills linemen). Installation: a licensed electrician must install the transfer switch. Propane or gas plumber runs the fuel line. Permit required. Cost: a 20kW standby generator installed typically runs $8,000-15,000+ depending on location and panel complexity. Annual maintenance: change the oil every 100-200 hours or yearly — same as a car engine.`
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

  {
    niche: 'plumbing', category: 'pressure', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['low water pressure', 'weak flow', 'shower', 'faucet'],
    content: `Low water pressure throughout the home or at specific fixtures: (1) Single fixture — low pressure at just one faucet or showerhead is usually a clogged aerator or showerhead. Unscrew the aerator (the screen at the faucet tip) and rinse it under water; mineral deposits clog it over time. For showerheads: soak in white vinegar overnight. This is a free DIY fix. (2) All hot water only — if cold pressure is fine but hot is weak, the water heater shutoff may be partially closed, or there's scale buildup inside a tankless heater. (3) Whole house — check the main shutoff valve (it may have been partially closed during a repair and not fully reopened). Also check the pressure regulator (PRV) — a small bell-shaped device where the main water line enters the house. A failing PRV can cause either low or unusually high pressure. Normal home water pressure is 40-60 PSI; you can test with a cheap gauge at any outdoor hose bib. Persistent low pressure throughout the home with a normal PRV reading can indicate a partially corroded galvanized pipe system — older homes with galvanized steel pipes develop internal corrosion that restricts flow over decades.`
  },

  {
    niche: 'plumbing', category: 'toilet', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['toilet', 'running', 'constantly', 'wont stop', 'water', 'tank'],
    content: `Toilet running constantly or water running into the bowl: You can hear it — a hissing or trickling sound from the toilet even when it hasn't been flushed. Two most common causes: (1) Flapper failure — the rubber flapper at the bottom of the tank isn't sealing properly. Water slowly leaks from the tank into the bowl. Test: put a few drops of food coloring in the tank. If the bowl water turns colored without flushing, the flapper is leaking. Flapper replacement is a $5-10 part and a 15-minute DIY fix for most people. (2) Fill valve not shutting off — if the water level in the tank rises above the overflow tube, water goes directly into the bowl. The float or fill valve needs adjustment or replacement. Both are DIY-fixable with a $10-20 repair kit from any hardware store. A constantly running toilet wastes 200+ gallons of water per day — it's worth fixing promptly.`
  },

  {
    niche: 'plumbing', category: 'smells', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['sewer smell', 'sulfur', 'rotten egg', 'drain', 'bathroom', 'sink'],
    content: `Sewer smell or sulfur/rotten egg smell from drains: (1) Rarely used drain — the P-trap (the curved pipe under every drain) holds water that blocks sewer gas from entering the home. If a drain isn't used for weeks, the water in the trap evaporates. Fix: run the water for 30 seconds. If the smell goes away and stays away after using the drain regularly, you found it. Floor drains in basements are notorious for this. (2) Sulfur smell from hot water only — sulfur-reducing bacteria in the water heater reacting with the anode rod. Common in homes with a softener on well water. Bacteria thrive in water heaters set below 140°F. Temporarily turn up the heater to 140°F for a few hours (kills bacteria), then return to 120°F. Repeat magnesium anode rod with aluminum rod may help long-term. (3) Persistent sewer smell throughout the house — may indicate a dry trap somewhere else, a cracked sewer vent pipe in the walls, or a damaged wax ring at the toilet base. A plumber can do a smoke test to find the exact entry point.`
  },

  {
    niche: 'plumbing', category: 'garbage_disposal', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['garbage disposal', 'not working', 'humming', 'jammed', 'reset'],
    content: `Garbage disposal not working, humming, or jammed: (1) Not working at all: check that it's plugged in (most disposals plug under the sink into an outlet), then press the red reset button on the bottom of the disposal unit. If the button popped out from an overload, pressing it resets the thermal breaker. (2) Humming but not spinning: the disposal is powered but the plate is jammed. Turn it off immediately — a humming motor that can't spin will overheat and burn out. Use the hex/Allen key (usually 1/4 inch) that came with the disposal in the hole at the bottom center of the unit to manually crank the plate free. Most hardware stores carry this key. Once it moves freely, try the disposal again (hit reset first). (3) Running but not grinding well: blades may be dull or a small hard object (a bottle cap, silverware, stone) got in. Turn off and shine a flashlight — never put your hand in. Use tongs to retrieve any foreign object. (4) Leaking from the bottom: the internal seals have failed. Time for a replacement — units typically last 10-15 years.`
  },

  {
    niche: 'plumbing', category: 'frozen_pipes', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['frozen', 'no water', 'winter', 'pipes', 'burst'],
    content: `Frozen pipes — prevention and what to do: Pipes freeze in uninsulated areas: crawl spaces, exterior walls, garages, under kitchen cabinets on exterior walls. At risk once temperatures drop below 20°F for sustained periods. Prevention: open cabinet doors under sinks on exterior walls, let faucets drip slightly (both hot and cold), insulate exposed pipes with foam pipe insulation. If you suspect a pipe is frozen (no water from a specific faucet, visible frost on a pipe): keep the faucet open so water can flow when thawing begins. Apply heat gently — hair dryer, space heater, warm towels. NEVER use an open flame. Start from the faucet end and work toward the blockage. If you can't locate the frozen section or it's inside a wall, call a plumber. If a pipe bursts: turn off the main water supply immediately (know where your shutoff is before winter). Even a small crack in a pipe can release 250 gallons per hour. Water damage from burst pipes is extensive — act fast.`
  },

  {
    niche: 'plumbing', category: 'water_quality', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['hard water', 'water softener', 'limescale', 'spots', 'mineral'],
    content: `Hard water, limescale buildup, and water softeners: Hard water contains dissolved calcium and magnesium. Signs: white mineral deposits on faucets and showerheads, spots on dishes after washing, soap that doesn't lather well, shortened lifespan of water heaters and appliances. Hardness is measured in grains per gallon (GPG) — water above 7 GPG is considered hard, above 10 GPG is very hard. A water test (strips or a lab test for well water) tells you exactly what you have. Softeners: a salt-based ion exchange softener removes calcium and magnesium by swapping them for sodium. Softened water is slippery (normal), slightly salty in taste, and extends appliance life significantly. Maintenance: add water softener salt to the brine tank (every 1-2 months depending on use), clean the brine tank annually. Scale deposits in existing fixtures: soak in white vinegar to dissolve calcium buildup. For the water heater, annual flushing removes sediment buildup.`
  },

  {
    niche: 'plumbing', category: 'pipes', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['banging', 'water hammer', 'pipes', 'loud noise', 'knocking'],
    content: `Banging or knocking pipes (water hammer): A loud thump or bang when you shut off a faucet quickly is water hammer — the momentum of moving water is suddenly stopped, sending a pressure wave through the pipes. Over time, water hammer can loosen fittings and damage pipe joints. Fixes: (1) Water hammer arrestors — small devices installed at the problem fixture that contain a spring and air chamber to absorb the shock. Available at hardware stores, easy DIY install at the supply shutoff. (2) Secure loose pipes — pipes that aren't properly strapped to joists vibrate and bang against structure. Add foam pipe straps where pipes run through floor joists. (3) Reduce water pressure — if home pressure is above 80 PSI (test at outdoor hose bib), install or adjust a pressure reducing valve at the main. High pressure causes water hammer and shortens fixture lifespan. A distinct banging sound from pipes in the walls during cold snaps is different — that's thermal expansion of pipes, not water hammer. Both are fixable.`
  },

  {
    niche: 'plumbing', category: 'sewer', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['sewer line', 'main drain', 'gurgling', 'slow', 'multiple drains'],
    content: `Main sewer line problems — gurgling drains, multiple slow drains, sewage backup: When only one drain is slow, the problem is local. When multiple drains are slow, or when flushing the toilet makes the bathtub gurgle, the problem is in the main sewer line. Main sewer line blockages are caused by: grease buildup over years, tree roots infiltrating the pipe, a crushed or damaged pipe section, or a belly (a sag in the pipe where solids settle). Don't continue using the plumbing if you have sewage backing up into tubs or floor drains — you can make it worse. A plumber will run a sewer snake or hydro-jet to clear the blockage, and can run a camera to see the inside of the pipe. Sewer camera inspection costs $150-300 and is worth it for older homes or recurring clogs — it tells you if the pipe itself is damaged versus just blocked. Tree root intrusion is very common in clay tile or orangeburg pipes common in homes pre-1980s.`
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

  {
    niche: 'landscaping', category: 'lawn', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['lawn', 'overseeding', 'thin', 'bare spots', 'renovation', 'grass seed'],
    content: `Overseeding and lawn renovation — how to get grass growing where it isn't: Overseeding is seeding into an existing lawn to thicken it or fill bare areas. For best results: (1) Timing — fall is the best time in most of the country (cool-season grasses like fescue, bluegrass, ryegrass). Soil is warm (good for germination), air is cooling (less heat stress on seedlings). Spring is second best. (2) Prep — mow the existing lawn short, dethatch if thatch layer is over 1/2 inch, core aerate (the holes from aeration are perfect seed-to-soil contact). (3) Seed — choose the right seed for your climate zone and sun conditions. Don't mix warm-season (Bermuda, zoysia) with cool-season grasses. Spread at the labeled overseeding rate. (4) After — keep the seed bed moist for 2-3 weeks until germination and establishment. Light watering twice a day is better than one heavy watering. Don't mow until the new grass is 3 inches tall. Don't apply pre-emergent herbicide when overseeding — it prevents grass seed germination too.`
  },

  {
    niche: 'landscaping', category: 'lawn', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['grubs', 'lawn grubs', 'birds', 'skunks', 'digging', 'dead grass'],
    content: `Lawn grubs — signs, diagnosis, and treatment: Grubs are the larval stage of Japanese beetles, June bugs, and other beetles. They live just under the soil surface eating grass roots in late summer. Signs: brown patches that appear in August-September, sections of lawn that peel back like a carpet with no roots attached, increased bird and skunk activity in the lawn (they're digging for grubs). Confirm: cut a 1-square-foot section of sod 2-3 inches deep and count grubs. Fewer than 5 — tolerable. 10 or more — treatment is warranted. Treatment timing matters: (1) Preventive grub control (imidacloprid, chlorantraniliprole) — applied May-July, before eggs hatch. Most effective approach. (2) Curative grub control (carbaryl, trichlorfon) — applied August-September when grubs are feeding near the surface. Works less reliably but can reduce existing populations. Water well after application. A landscaper can apply grub control as part of a seasonal lawn care program.`
  },

  {
    niche: 'landscaping', category: 'plants', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['mulch', 'beds', 'weeds', 'landscaping', 'flower beds'],
    content: `Mulch, planting beds, and weed control: Mulch is one of the highest-ROI landscaping investments. A 2-3 inch layer of organic mulch (shredded bark, wood chips, shredded leaves) suppresses weeds, retains soil moisture, moderates soil temperature, and improves soil as it decomposes. Common mistakes: (1) Volcano mulching — piling mulch against tree trunks causes rot, disease, and pest damage. Keep mulch 2-4 inches away from the trunk. (2) Too thick — more than 4 inches of mulch can prevent oxygen and water from reaching roots. (3) Using landscape fabric under mulch — fabric works for a year or two, then degrades and becomes a permanent weed trap as soil accumulates on top. Better approach: no fabric, just replenish mulch annually. For planting beds: edge the beds annually to keep grass from encroaching. A steel or aluminum bed edge is more permanent than plastic. Weed annually before applying fresh mulch in spring — pulling while soil is moist and before weeds set seed.`
  },

  {
    niche: 'landscaping', category: 'lawn', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['fertilizer', 'yellow grass', 'lawn fertilization', 'nutrients'],
    content: `Lawn fertilization — when, what, and how: Fertilization is the accelerator — it does little if the basics (mowing height, watering, pH) aren't right. Cool-season lawns (fescue, bluegrass, ryegrass): fertilize in fall (September-November) and lightly in spring. Do not fertilize cool-season grasses in summer — it causes stress. Warm-season lawns (Bermuda, zoysia, St. Augustine): fertilize during the growing season (May-August). Soil pH matters: grass can't uptake nutrients if pH is wrong. Target 6.0-7.0 for most turf grasses. Get a soil test ($10-20 from your local extension office) — it tells you pH and what nutrients are deficient. Without a test, you're guessing. Nitrogen is the primary driver of green color and growth; it's the first number on a fertilizer bag (e.g., 32-0-10 means 32% nitrogen). Slow-release nitrogen (poly-coated or IBDU) feeds over months and is less likely to burn. Don't fertilize drought-stressed grass — it will burn.`
  },

  {
    niche: 'landscaping', category: 'seasonal', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['seasonal cleanup', 'fall cleanup', 'leaves', 'spring cleanup', 'debris'],
    content: `Seasonal landscaping cleanup — what actually needs to happen: Fall cleanup: remove fallen leaves before they mat down and suffocate grass (matted wet leaves block sunlight and airflow, creating fungal conditions). Leaves left through winter on lawns cause significant bare patches in spring. Cut back perennial plants to 6 inches in late fall or early spring — either timing works. Leave ornamental grasses and seed heads through winter for wildlife interest, then cut back in late February before new growth. Spring cleanup: remove any remaining leaves, cut back ornamental grasses, edge beds, apply fresh mulch. Check irrigation system before activating it in spring — run each zone and look for broken heads. Don't rush to remove 'dead' plants — wait until you see new growth to know what's truly dead versus dormant. Tender perennials and some ornamental grasses look dead all winter but come back. Give them until mid-May before declaring them lost.`
  },

  {
    niche: 'landscaping', category: 'hardscape', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['retaining wall', 'leaning', 'bulging', 'fence', 'post', 'rot'],
    content: `Retaining walls leaning or bulging, fence posts rotting: Retaining walls that lean forward (toward the downhill side) are failing — soil pressure is overcoming the wall's resistance. This happens over time due to inadequate drainage (hydrostatic pressure builds behind the wall when water can't escape), insufficient footer depth, or inadequate tie-backs on taller walls. A wall that's leaning more than 2-3 inches out of plumb needs professional evaluation — it can fail suddenly. The fix often requires rebuilding with proper drainage aggregate, drainage pipe (French drain), and appropriate batter (backward lean). Fence posts: wood posts that contact the ground rot at the soil line. Concrete-set posts rot from the inside where the concrete holds moisture. At replacement, consider steel or concrete posts for ground contact. Existing wood posts can be supported with metal post bases or sistered with a metal spike if the rot is limited to the bottom few inches. A landscaper or fence contractor can assess whether the rail and picket system above the post is salvageable.`
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

  {
    niche: 'painting', category: 'exterior', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['deck', 'stain', 'wood', 'fading', 'gray', 'weathered'],
    content: `Deck staining, sealing, and restoration: An unprotected wood deck turns gray, checks (develops small cracks along the grain), and eventually rots. Treatment frequency: transparent or semi-transparent stains on weathered wood should be reapplied every 2-3 years. Solid stains (more opaque, like paint) last 4-5 years but hide the wood grain. Sealer alone (clear) provides minimal UV protection — better than nothing but needs annual reapplication. Before staining: (1) Clean thoroughly with a deck cleaner/brightener (removes gray weathering and opens the wood grain). Power washing alone isn't enough — you need a chemical cleaner to prep the wood. (2) Let it dry completely — at least 48 hours, ideally 72 hours. Test: sprinkle water on the surface; if it beads, it needs more drying time. (3) Apply stain in the direction of the grain. Oil-based stains penetrate better on rough or aged wood. Water-based stains are easier to clean and more eco-friendly. New deck lumber (pressure-treated): let it dry for 6 months before staining — fresh PT lumber won't accept stain properly.`
  },

  {
    niche: 'painting', category: 'prep', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['wallpaper', 'removal', 'strips', 'old', 'wall', 'underneath'],
    content: `Removing wallpaper before painting: Painting over wallpaper is strongly discouraged — moisture from paint can cause wallpaper to bubble, seams to lift, and if you ever want to remove it later, you'll pull drywall paper off with it. Removal process: (1) Score the wallpaper with a scoring tool (don't press too hard on drywall — you can damage the paper facing). (2) Apply wallpaper removal solution (or a 50/50 fabric softener/water mix) and let it soak for 10-15 minutes. (3) Use a broad plastic or flexible metal scraper to remove strips, working from seams. (4) After removal, wash walls with TSP substitute to remove adhesive residue. Let dry fully. (5) Check for damaged drywall paper (fuzzy texture, crumbling). Prime with PVA drywall primer, skim coat damaged areas, re-prime. (6) Prime finished walls before painting — removes any remaining adhesive from bonding to your finish coat. Budget more time than you think — wallpaper removal typically takes 4x longer than expected, especially over drywall (vs. plaster, which tolerates moisture better).`
  },

  {
    niche: 'painting', category: 'prep', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['sheen', 'finish', 'flat', 'eggshell', 'satin', 'semi-gloss', 'paint'],
    content: `Choosing paint sheen (finish) — what each does and where to use it: Flat/matte: no shine, hides surface imperfections well. Use on ceilings and low-traffic walls. Hard to clean — scuffs and marks show easily. Not for kids rooms, kitchens, or bathrooms. Eggshell: slight sheen, still hides imperfections reasonably, somewhat washable. The most common interior wall finish for living rooms and bedrooms. Satin: more sheen, very washable. Best for kids rooms, hallways, trim. Shows surface imperfections more than eggshell. Semi-gloss: significant sheen, very durable and washable. Classic for trim, doors, cabinets, and bathrooms. Highlights surface imperfections — requires better surface prep. High-gloss: maximum sheen, extremely durable. Doors and cabinets, furniture painting. Shows every imperfection — prep is everything. General rule: the higher the sheen, the more durable and washable, but the more prep required. Ceilings: flat. Living areas: eggshell. Kitchen/bath walls: satin or semi-gloss. Trim everywhere: semi-gloss.`
  },

  {
    niche: 'painting', category: 'interior', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['cabinet', 'painting', 'kitchen', 'refinishing', 'doors'],
    content: `Painting kitchen cabinets — what it actually takes to do it right: Painted kitchen cabinets look excellent when done properly, terrible when rushed. The surface prep is 90% of the job: (1) Remove all doors and drawers. Paint the boxes in place, the doors and drawers flat off the cabinet. (2) Degrease thoroughly — kitchen cabinets accumulate cooking grease that will cause paint to peel regardless of primer used. TSP substitute is the standard. (3) Scuff-sand all surfaces with 150-grit — painted or stained surfaces need mechanical tooth for the primer to bond. (4) Use a bonding primer (shellac-based like Zinsser BIN or an oil-based primer) — this is non-negotiable for cabinets. Latex primer alone will often peel on cabinet-grade finishes. (5) Apply topcoat in thin coats — a high-quality acrylic alkyd hybrid (like Advance by Benjamin Moore or Emerald Urethane by Sherwin-Williams) levels better and is more durable than standard latex. (6) Reassemble only after full cure — usually 7-10 days before normal use. Door hinges should be adjusted after installation. A professional cabinet painter sprays for best results.`
  },

  {
    niche: 'painting', category: 'exterior', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['trim', 'fascia', 'soffits', 'paint', 'wood rot'],
    content: `Painting exterior trim, fascia, and soffits — and dealing with rot: Trim and fascia are among the first places wood rot appears — they're exposed to weather and often the last surfaces where paint failure is noticed. Before painting any exterior trim: probe the wood with a screwdriver. Sound wood is hard; rotted wood feels soft or spongy and the screwdriver sinks in. Options for rotted wood: (1) Consolidant + filler — for localized rot, LiquidWood consolidant soaks into the soft wood and hardens it. WoodEpox or Bondo wood filler fills the void, sands to shape, primes, paints. Works well for rot that's not fully through the board. (2) Replace the board — the right call when rot is through more than 30% of a board's cross-section. Costs more but the fix is permanent. Always prime and back-prime (prime the back and cut ends) of replacement wood before installation. Unprimed end grain is how moisture gets in and starts the rot cycle over again. High-quality 100% acrylic primer and topcoat are the right materials for exterior trim.`
  },

  {
    niche: 'painting', category: 'interior', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['how much paint', 'coverage', 'calculate', 'gallons', 'room'],
    content: `How much paint do you need — calculating coverage: One gallon of paint covers approximately 350-400 square feet with one coat. To calculate: (1) Add up the square footage of the walls you're painting. Wall square footage = perimeter of the room × wall height, then subtract windows and doors (approximately 20 square feet each). (2) Divide by 350-400 to get gallons for one coat. Add 10% for waste, touch-ups, and cutting in. For two coats (standard for a full color change), multiply by 2. (3) Ceilings: measure the floor area of the room — that's the ceiling square footage. Ceilings usually take one coat unless you're going from a very different color. (4) Trim: a quart covers most rooms' worth of trim. A gallon for a large home. Buying extra for touch-ups: buy at least one quart more than you calculate — having the exact paint for touch-ups for years is worth the few dollars. Store paint properly (lid sealed, upside down briefly to create a seal, in a temperature-controlled space) and it lasts 5-10 years.`
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

  {
    niche: 'general', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['asbestos', 'old home', 'popcorn ceiling', 'insulation', 'tiles', 'pre-1980'],
    content: `Asbestos — where it's found and what to do: Asbestos was widely used in building materials until the late 1970s. Homes built before 1980 may contain: popcorn (acoustic) ceilings, vinyl floor tiles and the adhesive beneath them, duct insulation (gray or white wrap on older forced-air systems), pipe insulation (the gray or white wrap or the putty around fittings), some textured drywall compounds, roof shingles, and siding. Asbestos is only dangerous when it's friable (crumbling) and airborne — intact, well-adhered asbestos in good condition is generally not an immediate hazard. What NOT to do: don't sand, scrape, drill, or disturb suspected asbestos-containing materials without testing first. The correct process: have a sample professionally collected and sent to a certified lab for testing ($25-50 per sample). If positive and the material needs to be removed or disturbed, hire a licensed asbestos abatement contractor — this is not a DIY project and is regulated by the EPA and state agencies.`
  },

  {
    niche: 'general', category: 'garage', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['garage door', 'not opening', 'spring', 'broken', 'noisy', 'stuck'],
    content: `Garage door not opening, broken spring, or making noise: (1) Door won't open, motor runs but nothing moves: the torsion or extension springs may have broken. Springs are under extreme tension and MUST be replaced by a professional — DIY spring replacement has caused serious injuries and deaths. A broken spring is identifiable by a visible gap in the coil or the door suddenly feeling extremely heavy. (2) Door won't open, nothing happens: check the power to the opener, then the outlet it's plugged into. Check if the manual release cord has been pulled (red cord hanging from the trolley). The opener logic board may have failed. (3) Door opens with wall switch but not the remote: reprogram or replace the remote, or replace the logic board. (4) Noisy grinding or squeaking: lubricate the springs, rollers, and hinges with a garage door lubricant spray (not WD-40 — it dries out). Nylon rollers are quieter than steel if you're replacing. (5) Door reverses before closing all the way: the close-limit switch needs adjustment. Door reverses immediately after hitting the floor: the close-force or close-limit setting.`
  },

  {
    niche: 'general', category: 'pests', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['termites', 'wood damage', 'sawdust', 'tubes', 'carpenter ants'],
    content: `Termites, carpenter ants, and wood-destroying pest damage: Termites are the most damaging wood pest. Signs: mud tubes (pencil-width tunnels of dried mud) on foundation walls or framing, damaged wood that sounds hollow when tapped, swarms of winged insects in spring near light sources (can look like flying ants), frass (sawdust-like pellets) from drywood termites. Carpenter ants don't eat wood — they hollow it out to nest, usually in already-damaged or moist wood. They indicate a moisture problem. Signs: large black ants inside, sawdust piles, faint rustling sounds in walls. Powder post beetles leave tiny round exit holes (1/16-1/8 inch) and sawdust in hardwood — most active in wood under 20% moisture content. What to do: don't disturb or spray wood you think is termite-infested — you may scatter the colony, making professional treatment harder. Have a licensed pest control company inspect and identify the pest. Treatment varies: subterranean termites require soil treatment or bait systems; drywood termites may require fumigation or localized treatment.`
  },

  {
    niche: 'general', category: 'locks_doors', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['door', 'lock', 'key', 'wont turn', 'deadbolt', 'knob', 'sticky'],
    content: `Door locks not working properly — sticky, hard to turn, or key won't work: (1) Key difficult to turn in deadbolt: deadbolt locks are large and sturdy but the cylinder can bind if the door has shifted (foundation settlement or seasonal wood swelling). Try lifting or pushing the door slightly while turning the key — if this helps, the bolt alignment is the problem, not the lock. Adjust the strike plate (the metal plate the bolt slides into) by filing the hole slightly in the direction the bolt isn't reaching. (2) Knob lock that's loose: tighten the set screws on the interior knob (small hole on the side of the rose plate — insert a thin pin to find the screw). (3) Deadbolt that won't extend fully: lubricate the bolt with graphite powder or a dry silicone lubricant. WD-40 attracts dust and makes it worse over time. (4) Lock that's seized or hard to operate in winter: cold temperatures thicken lubricants and cause metal to contract. Warm the key before inserting, apply a lock de-icer from outside. (5) Front door that doesn't latch without forcing: adjust the strike plate depth or the latch mechanism engagement.`
  },

  {
    niche: 'general', category: 'moisture', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['basement', 'wet', 'damp', 'humidity', 'waterproofing', 'moisture'],
    content: `Basement or crawl space moisture — source diagnosis and solutions: Most basement moisture comes from one of three sources: (1) Water intrusion through walls or floor: water table pressure or surface water draining toward the foundation. Signs: water stains on walls rising from the floor, efflorescence (white mineral deposits where water has evaporated), damp floor after rain. Solutions: exterior grading correction (slope ground away from house), extend downspouts, exterior waterproofing membrane, interior French drain and sump pump. (2) Condensation: humid outside air meets the cool basement surface. Most common in summer. Signs: moisture on cold walls and pipes on humid days, no visible stains below ground. Dehumidifier is the solution. (3) Plumbing leak: check for active dripping or wet insulation around pipes. Before spending money on waterproofing, confirm which source you have — a dehumidifier won't fix intrusion water, and waterproofing won't fix condensation. Interior vs. exterior waterproofing: interior (sump pump + French drain inside the perimeter) manages water that gets in; exterior (excavation + membrane) keeps water out. Interior is more common because it's less expensive; exterior is better for severe cases.`
  },

  {
    niche: 'general', category: 'attic', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['attic', 'ventilation', 'hot', 'mold', 'dark spots', 'roof deck'],
    content: `Attic problems — ventilation, heat buildup, and mold: A properly ventilated attic should be close to outdoor temperature. An attic that's much hotter than outdoors in summer or shows condensation and mold in winter is under-ventilated. Consequences of poor attic ventilation: ice dams in winter (warm roof melts snow, refreezes at eaves), excessive heat gain in summer (makes upper floors uncomfortably hot, stresses AC), moisture condensing on the underside of the roof deck (causes mold and roof deck rot). Correct ventilation: the standard is 1 square foot of net free vent area per 150 square feet of attic floor (or 1:300 with a vapor barrier). Balance between intake (soffit vents, low on the roofline) and exhaust (ridge vents, gable vents, turbines at the peak). Never block soffit vents with insulation — use ventilation baffles to maintain airflow from the soffit to the ridge. Mold on the underside of the roof deck: visible black mold in the attic usually indicates a chronic moisture problem. Identify whether a bath fan or dryer vent is improperly discharging into the attic (common code violation). Fix the source before treating the mold.`
  },

  {
    niche: 'general', category: 'renovation', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['renovation', 'remodel', 'estimate', 'contractor', 'scope', 'budget'],
    content: `Working with contractors on renovations — getting accurate estimates and avoiding problems: (1) Get 3 estimates minimum, but don't automatically take the lowest. A dramatically low bid usually means the contractor is missing scope, planning to use inferior materials, or desperate for work. (2) Specify everything in writing before signing — materials (brand, model, dimensions), quantities, exclusions, payment schedule, timeline. A vague scope is the #1 source of renovation disputes. (3) Payment schedule: never pay more than 10-30% upfront (enough for material deposits). Tie remaining payments to completion milestones. Never pay in full before work is done. (4) Check credentials: licensed contractor (verify license number with your state board), insured (ask for a certificate of insurance — don't just take their word), check reviews across multiple platforms. (5) Change orders: any work outside the original scope should be in writing with a price before it's done. Verbal agreements during construction are difficult to enforce. (6) Gut-check: a contractor who refuses to pull permits is protecting themselves, not you. All permitted work is your risk.`
  },

];

// ─── SOLAR KNOWLEDGE ─────────────────────────────────────────────────────────

const SOLAR_KNOWLEDGE = [
  {
    niche: 'solar', category: 'production', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['production', 'low output', 'not generating', 'less electricity', 'kilowatts', 'underperforming'],
    content: `Solar system producing less power than expected: Production drops have several causes ranked by likelihood. (1) Shading — the most common cause of underperformance. Even partial shading on one panel (a new tree limb, chimney shadow, neighbor addition) can collapse output on the entire string in a standard string-inverter system — not just the shaded panel. With microinverters or power optimizers (Enphase, SolarEdge), only the shaded panel is affected. Check your monitoring app for which panels are consistently underperforming — if it's one or two, shading or a failed microinverter is the cause. (2) Seasonal variation — solar production in December is typically 30–50% of June production depending on latitude. Always compare the same month year-over-year, never summer output to winter. (3) Dirty panels — significant in dusty, dry climates (desert Southwest, Central Valley). Rain naturally keeps panels clean in wet climates. (4) Inverter issues — check the status lights or display on your inverter. (5) Grid/utility issues — inverters disconnect when grid voltage is outside range. Sudden unexplained drops of more than 15% month-over-month warrant a service call. A solar monitoring app like Enphase Enlighten or SolarEdge MySolarEdge is the fastest diagnostic tool available to a homeowner.`
  },
  {
    niche: 'solar', category: 'inverter', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['inverter', 'red light', 'orange light', 'error', 'beeping', 'not working', 'display', 'alarm'],
    content: `Solar inverter showing error light, error code, or alarm: Green light = operating normally. Red or orange light = fault condition. Check the display or app for the specific code. Common codes by meaning: "Grid voltage out of range" — utility voltage fluctuation, usually self-resolves within hours; if persistent, call utility. "Ground fault" — wiring fault in the DC circuit, requires service call. "Arc fault" — potential fire risk in DC wiring, turn off AC breaker labeled Solar and call installer immediately. "No grid" — inverter disconnected from utility, check the main breaker. Inverter completely off and showing nothing: check the DC disconnect switch (should be ON), the AC circuit breaker labeled Solar or PV in your panel, and any GFCI outlets in the garage near the inverter. Inverter turns on in morning but shows 0W — confirm it is actually daylight and check the system clock (incorrect time will prevent the inverter from enabling). Inverter starts and stops repeatedly — grid instability or an undersized inverter for the array. Persistent errors lasting more than 24 hours with no resolution from a power cycle (turn off AC breaker, wait 5 minutes, turn back on) require a service call. Most string inverters have a 10–12 year warranty; microinverter warranties are typically 25 years.`
  },
  {
    niche: 'solar', category: 'panels', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['one panel', 'microinverter', 'offline', 'not reporting', 'monitoring', 'enphase', 'solaredge'],
    content: `One or several panels offline or not reporting in monitoring: In a microinverter system (Enphase), each panel has its own inverter and reports independently. A single panel offline is almost always one of three things: (1) Shading — check the monitoring app's production graph against the panel's location; if it goes offline only during certain hours, shading is the cause. (2) Failed microinverter — if a panel shows zero production in full sun with no shade, the microinverter likely failed. Enphase microinverters carry a 25-year warranty, so a service call is usually a covered warranty claim. (3) Trunk cable or connector issue — less common, requires an installer. In a power optimizer system (SolarEdge), each panel has a power optimizer but routes through a single central inverter. A panel showing reduced output (not zero) is usually shade or optimizer degradation. A panel at zero is usually optimizer failure (10-year warranty). Monitoring data from at least 2 weeks of history is needed to distinguish shading from failure — a single day's data can be misleading due to weather. If you don't have monitoring access set up, this is the first thing to do regardless of any problem; real-time production data is invaluable for diagnosing almost any solar issue.`
  },
  {
    niche: 'solar', category: 'maintenance', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['dirty', 'cleaning', 'bird droppings', 'dust', 'pollen', 'soiling', 'wash'],
    content: `Solar panel cleaning — when it matters and how to do it safely: Soiling matters most in dry, dusty, or high-pollen areas (desert regions, agricultural areas, or urban areas with heavy traffic). In rainy climates, natural rainfall typically keeps panels at 95%+ efficiency. Bird droppings are the exception — they cause hot spots on a single cell and create localized performance loss disproportionate to their size. The practical test: if your panels haven't been rained on in 4+ weeks and live in a dry area, cleaning can improve production 2–8%. How to clean safely: Clean in early morning or evening only — cleaning hot panels in direct sun risks thermal shock cracking the glass. Use a soft brush with an extendable pole and plain water (no abrasive cleaners, no soaps that leave residue). Never use a pressure washer — high pressure can force water under the frame, damage coatings, and void the warranty. Never walk on panels. Professional panel cleaning services typically charge $100–300 for a residential system and use deionized water systems for spot-free results. If bird droppings are the consistent problem, a professional critter guard or bird deterrent installation ($300–600) is a better long-term solution than repeated cleaning.`
  },
  {
    niche: 'solar', category: 'monitoring', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['monitoring', 'offline', 'app', 'not connecting', 'gateway', 'wifi', 'no data'],
    content: `Solar monitoring system offline or not reporting data: Monitoring going offline does not mean your solar system stopped producing — it means the communication between your system and the cloud is interrupted. Production is almost certainly still happening. The monitoring gateway (Enphase Envoy, SolarEdge inverter's built-in WiFi) needs an active internet connection to report data. Troubleshooting steps in order: (1) Check your home internet — if it's down, restore internet first. (2) Restart the monitoring gateway — for Enphase, unplug the Envoy from the ethernet port or power for 30 seconds, plug back in, wait 5 minutes. (3) Check if the gateway lost its WiFi credentials — this happens after a router replacement or WiFi password change. Log into the Enphase app or access the Envoy's local IP address to reconfigure WiFi. (4) For SolarEdge inverters with built-in communication, the inverter display itself shows production data locally even if cloud reporting fails. (5) If the gateway is blinking in an error pattern you don't recognize, document the pattern and call your installer. Historical data is usually stored locally in the gateway and syncs to the cloud once the connection is restored — you typically don't lose production history during an outage.`
  },
  {
    niche: 'solar', category: 'damage', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['hail', 'damage', 'cracked', 'broken', 'storm', 'dent', 'impact', 'insurance'],
    content: `Solar panel hail or storm damage — assessment and next steps: Modern solar panels are rated to withstand 1-inch hail at 60 mph (UL 61730 / IEC 61215 impact test), but extreme hail events (2"+ diameter, baseball-sized) can crack panel glass. Signs of hail damage: visible cracks or shattered glass on panels, micro-cracking that may only show as reduced production. What to do: (1) Do a visual inspection from the ground with binoculars — never get on the roof while the system is producing. (2) Check your monitoring app — cracked cells reduce output on affected panels while the rest of the system continues normally. Production drop on specific panels combined with visible damage confirms hail impact. (3) Document everything with photos for insurance — hail damage to solar is typically a homeowner's insurance claim (under dwelling coverage or an equipment floater), NOT a manufacturer's warranty claim. Warranties cover manufacturing defects, not weather damage. (4) If you can see cracked or shattered glass on a panel, turn the system off at the AC disconnect switch (located near your main panel). A cracked panel can still generate high DC voltage — do not touch the panel surface or any wiring. (5) Contact your installer for assessment and insurance documentation. Do not attempt to remove or disconnect individual panels yourself — DC voltage from solar panels cannot be turned off while the sun is shining.`
  },
  {
    niche: 'solar', category: 'pests', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['birds', 'squirrels', 'pigeons', 'nesting', 'critters', 'under panels', 'animals', 'wire damage'],
    content: `Birds and squirrels nesting under solar panels: The gap between the panel and the roof creates an ideal nesting space for pigeons, sparrows, and squirrels. Problems caused: (1) Wire chewing — squirrels gnaw on DC wiring, which creates arc faults, fire risk, and expensive repairs ($500–2,000+ to replace wiring that runs underneath panels). (2) Nesting debris blocking airflow — panels run hotter, reducing efficiency and lifespan. (3) Droppings on panels — persistent hot spots. (4) Noise and infestation in the attic if animals move from under panels into the roof structure. The correct solution is stainless steel critter guard (wire mesh that clips to the panel frame and closes the gap). Cost: $300–600 professionally installed for a typical residential system, depending on array size. DIY critter guard kits exist but the installation requires being on the roof and knowing how to clip properly without drilling into panels or voiding warranties. Important: do not install any guard or attempt to remove active nests yourself. Active bird nests are federally protected under the Migratory Bird Treaty Act — disturbing an active nest with eggs or chicks is illegal. Wait until the nest is abandoned (typically 4–6 weeks) before having guards installed. Plastic mesh is not effective long-term — it degrades in UV and animals push through it. Stainless steel hardware cloth only.`
  },
  {
    niche: 'solar', category: 'billing', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['bill', 'electric bill', 'net metering', 'credit', 'utility', 'not saving', 'still paying', 'charges'],
    content: `Solar system working but electric bill still high: This is one of the most common homeowner surprises after solar installation. Several factors: (1) Fixed charges — most utilities have a fixed monthly service charge ($5–20) that appears on your bill regardless of how much solar you produce. These cannot be offset by net metering credits. (2) Time-of-use (TOU) billing — many utilities charge different rates by time of day. Solar produces most during midday, but home consumption peaks in the evening when rates are highest. If you're on TOU rates, you may be buying expensive evening power and selling cheap midday power back, reducing your net savings. A battery storage system addresses this. (3) Your system is underperforming — compare your monitoring app's actual production against the production estimate in your original proposal. If significantly below, there's a system issue. (4) Consumption increased — new appliances, EV charging, or additional occupants increase usage beyond what the system was sized for. (5) Net metering policy changes — some utilities have changed net metering rates after installation. Check with your utility for current export credit rates. If your utility offers an annual "true-up" (PG&E NEM, for example), your bill should be evaluated over 12 months rather than month by month — summer overproduction credits offset winter underproduction.`
  },
  {
    niche: 'solar', category: 'safety', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['fire', 'smoke', 'burning', 'hot spot', 'arc fault', 'emergency', 'firefighters', 'sparks'],
    content: `SOLAR SAFETY EMERGENCY — fire, sparks, burning smell from solar components: Solar DC circuits are always live whenever the sun is shining. Unlike your home's AC system, which can be completely de-energized by turning off the main breaker, the DC wiring from solar panels to the inverter carries live voltage any time there is light — even turning off the AC disconnect or the inverter does NOT de-energize the panels or DC wiring. If you see smoke, fire, or sparks from the inverter, roof, or near any solar components: (1) Call 911 immediately. (2) Turn off the AC disconnect switch (the red or yellow box near your main panel labeled "Solar AC Disconnect") — this stops the flow from inverter to your home circuits. (3) Tell firefighters that you have a solar system before they get on the roof — this is critical safety information. DC solar wiring cannot be de-energized with water; it creates electrocution risk. Fire departments have specific protocols for solar fires. (4) Do not attempt to fight any solar-related electrical fire yourself. Never spray water on panels, inverters, or DC wiring. (5) The most common cause of solar fires is arc fault in DC wiring — usually from improper installation, wire damage, or connector failure. Thermal hot spots from cracked or defective cells are a secondary cause. Both are catastrophic failures requiring full system inspection before restart.`
  },
  {
    niche: 'solar', category: 'weather', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['snow', 'ice', 'winter', 'covered', 'not producing', 'cold', 'frost', 'frozen'],
    content: `Snow and ice on solar panels — what to do and what not to do: Solar panels produce zero power when covered with snow. The good news: panels are dark, warm up from any sunlight, and shed snow faster than most roof surfaces. For light dustings, production typically resumes within hours of a break in snowfall. For heavy accumulations, panels will begin clearing from the bottom edge as the panel warms — production returns partially from the bottom before full clearing. What NOT to do: Never use a metal snow rake, shovel, or ice pick on panels — one scratch voids the tempered glass warranty and permanently reduces output. Never use hot water — the thermal shock from hot water on very cold glass can crack the tempered surface. Never use rock salt or chemical ice melts — corrosive to the frame and coatings. What you CAN safely do: A soft foam squeegee on an extendable pole can help push snow off the bottom edge of panels you can reach from the ground without climbing. Otherwise, let the panels clear themselves. Winter underproduction is already factored into your system's production estimate. If your proposal showed 800 kWh for December, it accounted for your climate's average snow days. Compare your December production to that estimate — if close, the system is working correctly.`
  },
];

// ─── WATER DAMAGE KNOWLEDGE ───────────────────────────────────────────────────

const WATER_DAMAGE_KNOWLEDGE = [
  {
    niche: 'water_damage', category: 'emergency', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['flooding', 'standing water', 'burst pipe', 'electrical', 'shutoff', 'emergency', 'water everywhere'],
    content: `WATER DAMAGE EMERGENCY — active flooding in the home: First priority is life safety, not property. (1) ELECTRICAL HAZARD — do not enter any room with standing water until you confirm the electricity is off. Water conducts electricity; outlets, power strips, or appliances in contact with standing water create lethal shock risk. Turn off the main electrical breaker at your panel before entering flooded areas. (2) Water shutoff — know where your main water shutoff valve is before you need it. It is typically located where the main water line enters the house (basement, utility room, or exterior near the foundation). Turn clockwise to close. For a burst pipe, shutoff is the first action after confirming electrical safety. (3) Call your homeowner's or renter's insurance company on their 24/7 emergency line immediately — most policies cover sudden and accidental water damage, and many insurers have emergency contractors on call. Document by photographing and videoing everything before touching or moving any contents. (4) Begin removing contents from the affected area once it is safe — separate waterlogged items from dry items. Do not discard any contents until an insurance adjuster or restorer assesses them. Replacement cost coverage requires documentation. (5) Water damage worsens exponentially with time — mold can begin within 24–48 hours in standing water with organic materials. Every hour of delay increases total damage and restoration cost.`
  },
  {
    niche: 'water_damage', category: 'assessment', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['sewage', 'black water', 'gray water', 'category', 'contaminated', 'toilet overflow', 'sewer'],
    content: `Water damage categories — this determines everything about how the restoration is handled: Category 1 (Clean water): Water from a supply line, clean toilet tank, or drinking water pipe. Sanitary, presents no health risk. Drying and cleaning are straightforward. Category 2 (Gray water): Water from appliances that use water — dishwasher overflow, washing machine discharge, fish tank, or aquarium. Contains biological or chemical contamination. Porous materials (carpet, pad, drywall) in contact with gray water must be evaluated carefully; secondary contamination is possible. Category 3 (Black water): Sewage, toilet overflow with feces, groundwater intrusion after flooding, or any water that has sat for 72+ hours regardless of source (even Category 1 water degrades to Category 3 over time). Biohazard. Requires proper PPE — gloves, respirator, eye protection — for anyone entering the space. All porous materials (drywall, carpet, pad, wood, insulation) that absorbed Category 3 water must be removed and disposed of as contaminated material. Standard household cleaners are insufficient. Antimicrobial treatment by a certified restorer is required. IICRC (Institute of Inspection Cleaning and Restoration Certification) certified water damage professionals are trained to handle all three categories and assess category accurately on arrival. Never attempt to remediate Category 3 water damage without proper training and protective equipment.`
  },
  {
    niche: 'water_damage', category: 'drying', urgency: 'immediate', safety_flag: false,
    symptom_tags: ['drying', 'dehumidifier', 'wet walls', 'mold', '24 hours', 'air mover', 'moisture', 'equipment'],
    content: `The 24–48 hour mold clock — why professional drying equipment is critical: Mold spores are present in all indoor environments. They become active and begin colonizing wet organic materials (drywall paper, wood framing, carpet backing) within 24–48 hours of exposure to moisture. After 72 hours of standing water, mold growth is essentially guaranteed in hidden cavities. A household dehumidifier removes 30–70 pints per day. A commercial-grade restoration dehumidifier removes 300+ pints per day. Using a household unit on a flooded basement is like using a garden hose to fill a swimming pool — it cannot keep pace with the moisture load. Professional water damage restorers bring: (1) Industrial LGR (Low-Grain Refrigerant) dehumidifiers placed strategically to create a drying system. (2) High-velocity air movers directed at low angles across wet surfaces to accelerate evaporation from structural materials into the air. (3) Moisture meters — pin and non-invasive types — to measure moisture content in walls, subfloor, and framing. Drying is complete when readings return to pre-loss baselines (typically 9–14% for wood). (4) Thermal imaging to locate hidden moisture pockets behind walls and under flooring that are invisible to the eye. Cutting "flood cuts" (removing the bottom 12–24" of drywall) to access and dry wall cavities is often necessary, especially in Category 2 or 3 losses. Attempting to dry in place without accessing cavities consistently leads to hidden mold.`
  },
  {
    niche: 'water_damage', category: 'insurance', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['insurance', 'claim', 'adjuster', 'coverage', 'documentation', 'photos', 'flood insurance', 'denied'],
    content: `Insurance documentation and claims — what you must do in the first 48 hours: (1) Photograph and video everything before moving or removing a single item. Walk every affected room, capture water marks on walls (mark them with tape if they will dry before the adjuster arrives), saturated flooring, damaged contents. This is the single most important documentation step — claims are denied or reduced for items that cannot be proven to have existed and been damaged. (2) Do NOT discard any contents before an adjuster or inventory company documents them. Even destroyed items have depreciated value in your claim. (3) Call your insurance company on the emergency line (usually 24/7), not the regular customer service number — emergency line connects to a claims adjuster who can authorize immediate emergency services. (4) Key coverage distinction: Sudden and accidental water damage (burst pipe, appliance failure, roof leak from a storm) is typically covered under standard homeowner's policies. Gradual damage (a slow leak that went unaddressed for months) is typically excluded as a maintenance issue. Sewer or drain backup is excluded from most standard policies unless you purchased a sewer backup endorsement. Groundwater flooding from outside (storm, rising river) is excluded from homeowner's policies — requires separate flood insurance through the NFIP or a private carrier. (5) Document every call to your insurance company: date, time, representative name, what was said. Insurance disputes hinge on documentation of communications.`
  },
  {
    niche: 'water_damage', category: 'structural', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['subfloor', 'hardwood', 'drywall', 'walls', 'salvageable', 'remove', 'replace', 'flooring', 'structure'],
    content: `What materials can be saved vs what must go: Non-porous surfaces (tile, concrete, glass, metal) — clean, disinfect, and dry in place if no structural damage. (1) Hardwood flooring — can sometimes be saved if Category 1 water, drying begins within 24 hours, and the subfloor is not OSB (which swells irreversibly). Signs it's drying correctly: no cupping, no buckling, planks lying flat. If cupping has begun (edges raised), a dehumidifier system and time can reverse mild cases; severe cupping requires replacement. Engineered hardwood is less forgiving. Laminate flooring: almost never salvageable — the core swells and the seams open. (2) Drywall — Category 1 water, dried within 24 hours, no visible contamination: can sometimes be dried in place. Category 2 water: evaluate carefully, typically remove. Category 3 water or wet more than 48 hours: remove. Drywall paper is food for mold; if it was saturated, the risk of hidden mold behind it is high. (3) Insulation — fiberglass batt insulation is almost never salvageable once wet; it loses R-value, mats, and becomes a mold habitat. Spray foam is the exception — it is non-porous and can be dried. (4) OSB subfloor — swells when wet, rarely returns to original dimension after saturation. Plywood subfloor is more forgiving and can sometimes be dried successfully. The correct decision requires moisture meter readings, not visual inspection alone.`
  },
  {
    niche: 'water_damage', category: 'burst_pipe', urgency: 'immediate', safety_flag: false,
    symptom_tags: ['burst pipe', 'frozen pipe', 'shutoff', 'water line', 'supply line', 'pinhole', 'leak', 'pipe broke'],
    content: `Burst or failed pipe — immediate steps and what to know: (1) Main water shutoff is the first action after confirming electrical safety. Know its location before you need it — basement or crawlspace where the main line enters, utility room, or an exterior box near the foundation. Clockwise to close. If you cannot find or operate it, call your water utility for emergency shutoff at the street. (2) After shutoff, open the lowest faucet in the house (usually a hose bib outside or a basement utility sink) to drain remaining pressure from the pipes. This stops water from continuing to flow from the break. (3) Frozen pipe: do NOT attempt to thaw without first locating the shutoff and confirming it works. When ice melts in a pipe that has already cracked, water flows freely. Thaw slowly with a hairdryer or heating pad — never an open flame. Do not thaw any section without knowing where the water will go if the pipe has cracked. (4) Supply line failures — braided stainless supply lines under sinks and toilets (the short flex hoses) are a leading cause of home flooding and should be replaced every 7–10 years regardless of condition. They fail without warning. (5) Water heater shutoff: the cold water inlet valve on top of the tank closes the water supply to the heater without needing to shut off the whole house. Also has a separate gas or circuit shutoff. Know these locations before you need them.`
  },
  {
    niche: 'water_damage', category: 'mold', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['mold', 'mildew', 'smell', 'musty', 'black mold', 'remediation', 'testing', 'hygienist'],
    content: `Mold after water damage — testing, remediation, and clearance: Mold testing before remediation is usually unnecessary and a waste of money — if you have had significant water intrusion and materials have been wet for 48+ hours, assume mold is present and proceed with professional remediation. Mold testing is valuable AFTER remediation (clearance testing) to confirm the work is complete. The remediation industry has a significant conflict of interest: companies that test and remediate the same job have financial incentive to find mold. Best practice: hire an independent industrial hygienist (IH) to conduct post-remediation testing — they have no financial stake in the outcome. IICRC S520 is the industry standard for mold remediation. Proper mold remediation involves: physical removal of contaminated materials (drywall, insulation, carpet) within a contained area with negative air pressure to prevent cross-contamination; HEPA vacuuming all surfaces; antimicrobial treatment; and clearance testing by an independent party before reconstruction. Bleach is NOT an effective mold remediator for porous materials — it kills surface mold but does not penetrate to kill mold rooted in drywall paper or wood grain. The only proper treatment for mold in porous materials is physical removal. Timeline: for significant water damage events, mold clearance testing typically occurs 3–5 days after remediation is complete, before reconstruction begins.`
  },
  {
    niche: 'water_damage', category: 'sump_pump', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['sump pump', 'basement flooding', 'backup', 'failed', 'battery', 'float', 'crawlspace'],
    content: `Sump pump failure — causes, emergency steps, and prevention: The most common cause of sump pump failure is power outage — sump pumps require electricity to run, and power outages often accompany the heavy rain events that cause basement flooding. Battery backup systems (using a deep-cycle marine battery) are essential in areas with wet basements. Other failure causes: float switch stuck in the "off" position (can sometimes be manually freed), pump overwhelmed by inflow volume exceeding its rated capacity (common in extreme rain events), pump impeller clogged with debris, or pump age (typical life 7–10 years). Frozen discharge line in winter — the pipe that carries water from the pump to the exterior can freeze shut, causing water to back up into the pit and eventually the basement. Keep the discharge outlet clear of snow and ice, and keep the termination point away from grade. Emergency when pump fails: rent a submersible utility pump from Home Depot or Lowe's (available 24/7 at most locations) — these drop into standing water and pump directly to the exterior or a drain. A wet/dry shop vac can handle smaller volumes. Test your sump pump annually: pour a 5-gallon bucket of water into the pit rapidly — the float should rise and trigger the pump within seconds. Battery backup systems should be tested the same way with the main AC power disconnected.`
  },
  {
    niche: 'water_damage', category: 'restoration_timeline', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['timeline', 'how long', 'restoration', 'rebuild', 'reconstruction', 'weeks', 'months', 'living situation'],
    content: `Water damage restoration timeline — what to realistically expect: Water damage restoration happens in phases. Phase 1 — Emergency Mitigation (Days 1–7): Water extraction, structural drying with commercial equipment, removal of unsalvageable materials, antimicrobial treatment. This phase is complete when moisture readings in all structural materials have returned to dry baselines. Cannot be rushed — drying physics are fixed. Duration depends on extent of damage and materials involved. Phase 2 — Mold Clearance (Days 7–14 if mold is present): Post-remediation testing by an independent industrial hygienist. If clearance fails, additional remediation is needed before reconstruction can begin. Phase 3 — Reconstruction (Weeks 2–8+): New drywall, insulation, flooring, paint, trim, cabinets. Timeline depends on material availability, contractor scheduling, and complexity of repairs. A flooded bathroom might be 2–3 weeks of reconstruction; a flooded first floor requiring complete drywall replacement and new hardwood throughout may take 8–12 weeks. Total timeline for a significant water loss: 6–12 weeks from event to move-back is realistic. During reconstruction, homeowners may be displaced — additional living expense (ALE) coverage in your homeowner's policy covers hotel and meal costs above your normal expenses while your home is uninhabitable. Track all displacement-related expenses with receipts.`
  },
];

// ─── TREE SERVICE KNOWLEDGE ───────────────────────────────────────────────────

const TREE_SERVICE_KNOWLEDGE = [
  {
    niche: 'tree_service', category: 'hazard', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['hazard', 'leaning', 'about to fall', 'widow maker', 'cracks', 'power lines', 'storm', 'emergency'],
    content: `TREE HAZARD EMERGENCY — imminent risk of failure: Trees can fail suddenly. Call a certified arborist immediately for any of the following: (1) Sudden lean — any tree that has visibly changed its angle, especially accompanied by heaving soil, surface root lifting, or soil cracking in an arc around the base. A tree that has shifted its lean can fail within hours. Do not enter the fall zone. (2) Large dead branches overhead (widow makers) — dead branches in the upper crown of a tree can fall with no warning, in calm weather, sometimes months after death. A large dead branch directly over a structure or frequently occupied area is an emergency. (3) Split or included bark at major forks — a V-shaped fork where bark has grown inward (included bark) is a structurally weak union. Under wind or ice load, these co-dominant stems can split explosively. (4) Significant trunk cracks or vertical seams — indicate internal failure under load. (5) Trees within fall distance of power lines — always call the utility company first; do not contact a tree service until the utility has assessed the situation. Utility companies have specific clearance procedures. (6) Tree on a structure — do not attempt to remove branches or shift the tree. A rigging and dismantling specialist is required; improper movement can cause the tree to roll and increase structural damage. Photograph everything for insurance purposes before any work begins.`
  },
  {
    niche: 'tree_service', category: 'health', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['dead', 'dying', 'brown leaves', 'no leaves', 'bark falling off', 'fungus', 'mushrooms', 'decline'],
    content: `Is my tree dead or dying — how to assess accurately: (1) The scratch test — scratch through the outer bark with a fingernail or knife on a small twig. Green or cream-colored tissue underneath = living. Brown, dry, or absent tissue = dead at that point. Test multiple locations on multiple branches from different parts of the crown to distinguish partial from full dieback. (2) Branch flexibility — living branches bend without snapping. Dead branches are brittle and snap cleanly. (3) Timing — some species leaf out 4–6 weeks later than others (ash, catalpa, black walnut). Always wait until 6 weeks after the majority of trees in your area have leafed out before declaring a tree dead. A tree that leafed out in early May may look dead in April. (4) Fungal shelf growth (conks, bracket fungi) — the presence of fungal fruiting bodies on or near the trunk or roots indicates significant internal decay. By the time conks are visible, the internal wood is already substantially compromised. A conk at the base of a large tree is a serious hazard indicator warranting immediate assessment. (5) Loose or sloughing bark over large areas — dead bark has separated from living tissue. (6) Tree assessment is most accurate after full spring leaf-out; scheduling a certified arborist inspection in late May or early June gives the clearest picture of a tree's actual condition.`
  },
  {
    niche: 'tree_service', category: 'storm', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['storm damage', 'fallen', 'down tree', 'power lines', 'on house', 'uprooted', 'hanging branches'],
    content: `Storm-damaged trees — safety first, then recovery: (1) DOWNED POWER LINES — stay at least 35 feet from any downed wire. Do not touch a downed line, and do not approach a tree that is in contact with a downed line. Water conducts electricity; standing water near downed lines is equally dangerous. Call 911 and your utility company. Do not re-enter the area until the utility confirms the lines are de-energized. (2) Hung-up branches (hangers) — storm damage frequently leaves large broken branches hung in the canopy, suspended over a drop zone. These can fall at any time, in calm weather, days later. Do not walk under hung-up branches. All hangers must be cleared before ground crews can safely work under the tree. This is the most dangerous condition in post-storm tree work. (3) Tree on a structure — do not attempt to remove it yourself. The tree may be providing structural support to a damaged roof. A rigging and dismantling specialist can disassemble the tree in sections without adding additional load. Place a tarp over the damage from inside if rain is imminent, but do not go on the roof. (4) Document all storm damage with photos and video before any removal for insurance purposes. (5) Large-scale post-storm tree removal can overwhelm local tree services — expect 2–4 week waits after significant events. Prioritize emergency callouts for imminent hazard and schedule non-emergency cleanup separately.`
  },
  {
    niche: 'tree_service', category: 'roots', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['roots', 'foundation', 'sewer', 'sidewalk', 'driveway', 'cracking', 'lifting', 'pipes'],
    content: `Tree roots and infrastructure — foundation, sewer, sidewalk conflicts: (1) Foundations — trees rarely crack intact foundations through direct root pressure. The more common mechanism is that large trees draw soil moisture in summer, causing clay soils to shrink and foundations to settle; then in wet seasons the soil expands. This cyclic movement causes foundation cracking over time. Trees with large root systems near older foundations should be assessed by an arborist and a structural engineer together. (2) Sewer line infiltration — tree roots find and exploit any joint or crack in older clay or cast iron sewer pipes. Signs: slow drains, sewage odor, gurgling toilets. A sewer camera scope ($150–300) confirms root intrusion. Root foaming (copper sulfate or foaming herbicide flushed into the line) provides temporary relief (1–2 years) by killing roots inside the pipe but does not repair the crack. Permanent solution: pipe lining (CIPP) or replacement with PVC, which has no joints for roots to enter. (3) Sidewalk and driveway lifting — shallow, surface roots cause pavement heaving. Options: pavement grinding (removes the trip hazard by grinding the raised edge), root pruning (cut roots near the pavement, highly effective if done correctly), root barriers (plastic underground barriers to redirect roots downward), or tree removal. Before cutting any large structural root, have an arborist assess the impact on the tree's stability — removing more than 1/3 of the root mass can compromise or topple the tree.`
  },
  {
    niche: 'tree_service', category: 'disease', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['disease', 'emerald ash borer', 'EAB', 'oak wilt', 'dutch elm', 'spots', 'canker', 'dieback', 'infested'],
    content: `Common tree diseases and pests — identification and intervention windows: (1) Emerald Ash Borer (EAB) — affects all North American ash species. Signs: D-shaped exit holes (1/8"), S-shaped galleries under the bark (peel a section of thin bark to check), epicormic sprouting from the trunk, crown dieback from the top down. EAB kills untreated ash trees in 2–4 years. Treatment with emamectin benzoate trunk injection (Arborjet TREE-äge) is highly effective if started before 50% canopy loss; after that, success rates drop significantly. Trunk injections last 2–3 years. (2) Oak wilt — a fungal disease spread by sap beetles and root grafts between adjacent oaks. Do NOT prune oaks between April and July in affected regions — fresh wounds attract the sap beetles that transmit the disease. Propiconazole fungicide injection can stop progression in early infection. Once 50%+ of the crown is affected, removal is typically the only option. Red and pin oaks die within weeks; white oaks progress more slowly. (3) Dutch elm disease — similar beetle transmission vector. (4) Anthracnose, apple scab, fire blight — common leaf diseases that look alarming but rarely kill established, otherwise healthy trees. Fallen leaves should be raked to reduce inoculum; fungicide sprays help primarily in high-value specimen trees. (5) If you see rapid unexplained decline, unusual bark staining, or pattern dieback, an ISA-certified arborist can diagnose from symptoms and take samples for lab confirmation if needed.`
  },
  {
    niche: 'tree_service', category: 'pruning', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['pruning', 'trimming', 'overgrown', 'branches', 'crown', 'clearance', 'shaping', 'topping'],
    content: `Tree pruning — proper technique and the damage caused by improper pruning: Pruning is the most common tree service and also the most commonly done wrong. Key principles: (1) The one-third rule — never remove more than 25–33% of the living crown in a single season. Removing more causes severe stress, prolific regrowth of weak epicormic sprouts, and long-term decline. (2) Dormant season pruning — most trees are best pruned in late winter while dormant (after the coldest weeks have passed, before bud break). The cut surfaces are exposed for the shortest time before rapid compartmentalization. Summer pruning is sometimes used for specific purposes (corrective, clearance). Never prune oak species in spring (April–July in the Midwest and Southeast) due to oak wilt risk. (3) Cuts are made at the branch collar — the slight swelling where a branch meets a larger limb or trunk. Never cut flush with the trunk (removes the compartmentalization zone) and never leave a stub (stubs die back and become decay entry points). (4) NEVER top a tree — topping (cutting the main trunk or large scaffold branches back to stubs) is the single most damaging thing you can do to a tree. It creates massive open wounds that cannot close, stimulates explosive regrowth of dozens of weak sprouts, permanently disfigures the tree's structure, and dramatically shortens its life. A topped tree typically costs more to maintain forever after and must eventually be removed anyway. If a tree is "too tall," the correct solution is crown reduction by a certified arborist using directional pruning cuts to lateral branches.`
  },
  {
    niche: 'tree_service', category: 'cavity', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['hollow', 'cavity', 'hole', 'decay', 'rot', 'fungus', 'conks', 'structural integrity'],
    content: `Hollow trees and internal decay — when it's dangerous and when it's not: A tree can be hollow and completely safe to retain, or it can be hollow and structurally compromised. The key factor is the thickness of the remaining shell. A general heuristic: if the remaining sound wood shell is at least 1/3 of the tree's radius all the way around, the tree has significant structural integrity remaining. The mallet test: tap the trunk at multiple heights with a rubber mallet. A solid thud = sound wood. A hollow resonance = cavity or decay. This is a screening tool, not a diagnosis. For important trees, an arborist may use a resistograph (a fine drill that measures wood density as it penetrates) for accurate assessment of the extent of decay. Fungal conks (shelf fungi, bracket fungi, chicken of the woods) on or near the trunk or root flare are the most important warning sign. Their presence indicates significant internal decay is already advanced — fungal fruiting bodies appear only after the internal mycelial network has been growing for months or years. When conks appear at the base of a large tree, within two weeks assessment by a certified arborist is warranted. Vertical trunk cracks on a tree with a known cavity indicate the tree is failing in the cracking mode — this is an acute hazard. Wildlife considerations: trees with cavities are critical habitat for many bird and bat species, some of which are protected. Removal may require timing around nesting seasons.`
  },
  {
    niche: 'tree_service', category: 'removal', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['removal', 'cost', 'price', 'how much', 'cut down', 'stump', 'permit', 'estimate'],
    content: `Tree removal costs, permits, and what to expect: Tree removal cost is driven by: size, structural complexity, proximity to structures and utilities, access for equipment, and whether stump grinding is included. Typical ranges: small trees (under 25 feet) $300–600; medium trees (25–60 feet) $600–1,500; large trees (60–80 feet) $1,500–3,000; very large or structurally complex trees $3,000–8,000+. Get 3 estimates from ISA-certified arborists — price variation is significant and not always correlated with quality. Always verify that the contractor carries liability insurance (ask for a certificate of insurance naming you as additional insured) and worker's compensation. Tree removal without proper insurance exposes you to liability for injuries on your property. Permits: many municipalities require permits for removal of trees above a certain diameter (commonly 6–12 inches DBH). Some cities have significant fines for unpermitted removal. Check with your city's urban forestry department before any removal. Your tree service should know local permit requirements. Stump grinding: almost always separate pricing ($100–350 for most residential stumps). Grinding removes the stump to 6–12" below grade — the root system decays over 5–15 years in place. Complete root removal is significantly more expensive and rarely necessary. Wood disposal: a full removal generates significant debris. Confirm whether the quote includes hauling vs. leaving wood on-site for firewood. Firewood left on-site reduces the quote.`
  },
  {
    niche: 'tree_service', category: 'new_trees', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['new tree', 'just planted', 'transplant shock', 'leaves dropping', 'wilting', 'not growing', 'dying after planting'],
    content: `Newly planted trees — transplant shock and establishment care: It is completely normal for a newly planted tree to look stressed during its first growing season. When a tree is dug from a nursery, 80–90% of its root system is lost. The tree spends most of its energy in the first 1–3 years regrowing roots, often at the expense of new shoot and leaf growth. Signs that are normal during establishment: smaller than expected leaf size, fewer leaves than a mature tree, early fall color or leaf drop in stress, wilting in afternoon heat. Signs that indicate a real problem: mushy crown that doesn't firm up overnight, complete lack of any new bud or shoot growth in spring, oozing wounds on the trunk. (1) Watering is the most critical factor — deep and infrequent beats shallow and frequent. For a recently planted tree, water deeply once or twice a week for the first growing season in the absence of significant rain. Check soil moisture 4–6 inches deep by inserting a finger; if dry at that depth, water. (2) Mulch — apply 3–4 inches of wood chip mulch in a ring extending as far as the drip line. Keep mulch 4–6 inches away from the trunk (volcano mulching kills trees). Mulch conserves moisture, moderates soil temperature, and suppresses competing grass. (3) No fertilizer the first year — fertilizer stimulates top growth when the tree needs to grow roots. (4) Temporary staking — if staked, use straps (not wire through a hose — wire girdles bark). Remove stakes and straps after one year; trees need trunk flex to develop taper.`
  },
  {
    niche: 'tree_service', category: 'cabling', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['cabling', 'bracing', 'support', 'co-dominant', 'split', 'weak crotch', 'propping', 'structure'],
    content: `Structural cabling and bracing — when it helps and what it cannot do: Cabling installs a high-strength steel cable between two co-dominant stems or between a heavy horizontal limb and an anchor point in the crown, limiting the distance the connected parts can move independently. This does NOT restore structural integrity — it limits the extent of failure if a crack or split occurs. Appropriate candidates: trees with co-dominant stems and included bark that otherwise have good overall health, long heavy horizontal scaffold limbs with high aesthetic or historic value, and trees in high-use areas where failure risk is being managed rather than eliminated. Cabling is NOT appropriate for trees with significant internal decay, for severely weakened or dying trees, or as a substitute for removal of a hazardous tree. Cost: $300–800 for a typical single cable installation, plus annual inspection. Cables should be inspected by an arborist every year — growth can cause hardware to become embedded in bark, and cables should be replaced every 10 years. The homeowner should understand that a cabled tree is a managed-risk tree, not a safe tree, and that the management commitment is ongoing. Bracing rods (threaded steel rods installed through the wood) are used for cracks and splits at or below the cabling point to prevent the wood from pulling apart. Installing rods requires drilling through the tree — this is done under general anesthesia (no, seriously, it's done with a drill press during tree work) and is highly effective for the specific failure mode it addresses.`
  },
];

// ─── LAWN CARE KNOWLEDGE ─────────────────────────────────────────────────────

const LAWN_CARE_KNOWLEDGE = [
  {
    niche: 'lawn_care', category: 'diagnosis', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['brown', 'yellow', 'dying', 'patches', 'dead spots', 'discolored', 'grass not growing'],
    content: `Diagnosing brown or yellow lawn patches — the most common causes: (1) Drought stress — grass wilts before it turns brown. The footprint test: walk across the lawn. If your footprints remain visible (pressed-down blades don't spring back) for 30+ minutes, the grass is drought-stressed. In drought, brown is uniform and follows sun exposure patterns. Water deeply: 1 inch per week in two applications, and measure it with a tuna can. (2) Irrigation coverage gaps — dead areas that match the arc or edge of a sprinkler head pattern. Run your irrigation system and walk the zones to confirm head coverage and rotation. (3) Fungal disease — look for irregular circles, rings, or patches with a defined edge or distinctive appearance. Brown patch (large irregular circles, sometimes a smoke ring border), dollar spot (silver-dollar-sized spots), pythium blight (overnight spread with greasy appearance at edges). (4) Grub damage — grass pulls up like loose carpet because the roots have been severed. Pull back the sod at the edge of the dead area; white C-shaped larvae 1/2-3/4" long in the top 2" of soil confirm grubs. (5) Dog urine — round, clearly defined dead center with a ring of dark green fertilized grass at the perimeter (the diluted nitrogen boundary). (6) Compaction — thinning in high-traffic areas (walkways, play areas) where soil is packed and grass cannot develop adequate root depth.`
  },
  {
    niche: 'lawn_care', category: 'pests', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['grubs', 'white grubs', 'lawn grubs', 'japanese beetle', 'chafer', 'spongy', 'dead in patches', 'animals digging'],
    content: `Lawn grubs — accurate identification, threshold, and treatment timing: Grubs are C-shaped white larvae of various beetles (Japanese beetle, June bug, European chafer, etc.) that feed on grass roots from mid-summer through fall and again briefly in spring. How to confirm: cut a 1-square-foot section of sod 2–3 inches deep at the edge of damaged areas. Count the larvae. Treatment threshold: 5–10 grubs per square foot (species-dependent) is the economic threshold where damage is likely. Below threshold, the lawn will recover without treatment. Treating preventively without confirmation wastes money and kills beneficial insects. Treatment timing is critical: (1) Preventive insecticides (imidacloprid, clothianidin — grub preventers) are applied in June–July before egg hatch and must be watered in immediately. They prevent small larvae from establishing. Highly effective if timed correctly. (2) Curative insecticides (trichlorfon) work on existing larvae in late summer through fall, with lower efficacy (70–80%) than preventive treatment. (3) Biological control — Heterorhabditis bacteriophora (a beneficial nematode species — the species matters; Steinernema carpocapsae does not work on grubs) can be effective if: applied in early fall when soil is warm (above 60°F), watered in immediately and kept moist for 2 weeks. Requires ordering from a specialty supplier, not garden centers. (4) Animals digging (skunks, raccoons, crows) in a healthy-looking lawn are a reliable sign of high grub populations — they smell and hear the larvae.`
  },
  {
    niche: 'lawn_care', category: 'disease', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['fungus', 'fungal', 'brown patch', 'dollar spot', 'red thread', 'pythium', 'circles', 'rings', 'blight'],
    content: `Lawn fungal diseases — identification and targeted treatment: (1) Brown patch (Rhizoctonia solani) — affects tall fescue and ryegrass in hot humid weather (nighttime temps above 70°F + humidity). Large irregular circles or patches, sometimes with a "smoke ring" border of dark grass at the edge in morning. Treatment: azoxystrobin or propiconazole fungicide. Prevention: no evening irrigation (water before 10am), avoid heavy nitrogen application in summer. (2) Dollar spot (Sclerotinia homoeocarpa) — silver-dollar to baseball-sized bleached spots, individually or coalescing. Often indicates low nitrogen. Raise nitrogen level slightly; treat with fungicide if severe. (3) Pythium blight — appears overnight in very hot, humid, wet conditions. Grass looks greasy or water-soaked at first, then collapses and turns tan. Spreads rapidly along drainage patterns or mower tracks. Requires immediate fungicide treatment (mefenoxam or azoxystrobin) within 24–48 hours or it can ruin large sections overnight. Emergency treatment. (4) Necrotic ring spot — circular dead patches with a green center (frog-eye pattern). Caused by Ophiosphaerella korrae attacking cool-season roots. (5) Red thread — pinkish-red threads binding dead blades — primarily a cosmetic issue indicating low nitrogen. Raise fertility. (6) General prevention: mow at correct height for your species, avoid evening irrigation, dethatch when thatch exceeds 1/2 inch, maintain proper fertility levels. A healthy well-maintained lawn resists most fungal issues without intervention.`
  },
  {
    niche: 'lawn_care', category: 'weeds', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['weeds', 'crabgrass', 'dandelion', 'clover', 'nutsedge', 'ground ivy', 'broadleaf', 'grassy weeds'],
    content: `Lawn weed control — the right product at the right time: (1) Crabgrass (Digitaria) — an annual grassy weed that germinates when soil temperature reaches 55°F for several consecutive days (typically when forsythia blooms). Prevention: apply a crabgrass pre-emergent herbicide (pendimethalin, prodiamine, dithiopyr) before soil reaches 55°F. This is the most effective and economical control. Post-emergent (quinclorac) works only on young (1–3 leaf) plants; established crabgrass is difficult to kill without damaging turf. Do NOT apply pre-emergent if you are overseeding — it prevents all seed germination, including your new grass. (2) Dandelion — a perennial with a deep taproot. Fall treatment (September–October) is 2–3x more effective than spring treatment because the plant is actively translocating nutrients down into the root. Products: 2,4-D + triclopyr blends. A single spring treatment may kill top growth but not the root, which regrows. (3) White clover — indicates low soil nitrogen. Raise nitrogen slightly. Control with MCPP + 2,4-D + dicamba (broadleaf weed blend). (4) Yellow nutsedge (Cyperus esculentus) — lighter green, triangular stem, faster-growing than grass. Stands out after mowing. Control requires sulfentrazone or halosulfuron products; standard broadleaf herbicides do not work. (5) Ground ivy (Creeping Charlie) — has a distinct mint-like smell when crushed. Best controlled with triclopyr, applied twice in fall.`
  },
  {
    niche: 'lawn_care', category: 'overseeding', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['overseeding', 'thin grass', 'bare spots', 'reseeding', 'thicken', 'seed', 'germination'],
    content: `Overseeding thin or bare lawns — timing, technique, and what actually makes seed germinate: Timing matters enormously. Cool-season grasses (tall fescue, Kentucky bluegrass, ryegrass): best window is late August through mid-September in most of the US — warm soil temperatures promote rapid germination, cool air temperatures favor seedling establishment, and adequate moisture before winter frost. Spring seeding works but competes with crabgrass germination and summer heat. Warm-season grasses (bermuda, zoysia): seed only in late spring (late May–June) when soil temps are consistently above 65°F. Technique for successful germination: (1) Scalp existing lawn to 1–1.5 inches and bag clippings to improve seed-to-soil contact. (2) Core aerate before seeding — seed falling into aeration holes has dramatically higher germination rates than seed lying on an undisturbed surface. (3) Seed at the correct rate (5–7 lb/1000 sq ft for tall fescue; check package for species). Spread in two perpendicular passes for even coverage. (4) Cover lightly with 1/4 inch of topsoil or compost — the single step most homeowners skip and the most important for germination. Seed that dries out within 24 hours fails. A thin layer of soil maintains moisture contact. (5) Water lightly 2–3 times per day to keep the seed bed moist until germination (7–21 days depending on species and temperature). Once germinated, transition to deeper, less frequent watering. (6) Do not mow until new grass is 3 inches tall. (7) Do not apply any pre-emergent herbicide for 8 weeks before or after seeding.`
  },
  {
    niche: 'lawn_care', category: 'fertilizer', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['fertilizer burn', 'burned', 'over fertilized', 'yellow stripes', 'salt burn', 'scorched', 'applied too much'],
    content: `Fertilizer burn — how it happens, recovery, and timing for maximum results: Fertilizer burn occurs when soluble salts in concentrated fertilizer desiccate grass tissue, drawing moisture out of the cells. It appears within 24–48 hours of application as yellowing or browning that follows the application pattern — streaks, spots, or overall yellowing. Recovery: water immediately and deeply (at least 1 inch) to flush salts from the root zone. Continue deep watering for 5–7 days. Green grass with yellow streaks can recover fully; brown/straw-colored grass from burn is dead and needs reseeding. Prevention: (1) Never apply granular fertilizer to wet grass (fertilizer sticks to blades and concentrates on individual leaf surface). (2) Never apply in the heat of the day or when temperatures exceed 85°F. (3) Slow-release nitrogen sources (PCSCU, methylene urea, polymer-coated urea) are dramatically more burn-resistant than fast-release (urea, ammonium nitrate) and are preferred for summer applications or when consistency of application may be imperfect. Correct cool-season fertilizer timing: fall application (mid-September through October) is the most important feeding of the year for cool-season grasses — this is when roots are actively growing and the plant is storing energy reserves for spring. A late fall application (November, just before ground freeze) provides a jump-start for early spring green-up. Spring application (May) should be moderate nitrogen to encourage root growth over top growth. Avoid heavy nitrogen in June–August on cool-season turf — it stimulates disease and weakens the plant during heat stress.`
  },
  {
    niche: 'lawn_care', category: 'compaction', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['compaction', 'aeration', 'thatch', 'plugs', 'hard soil', 'water runoff', 'puddles', 'not absorbing'],
    content: `Soil compaction and thatch — diagnosis and correction: Compaction test: push a standard screwdriver into the soil. If you cannot push it 6 inches with moderate hand pressure, the soil is compacted. Compacted soil lacks pore space for oxygen and water, restricts root growth, and causes water to run off rather than soak in — which creates puddles and drought stress simultaneously. Core aeration is the primary solution. Hollow-tine core aeration (a machine that removes 2–3 inch plugs of soil) is dramatically superior to spike aeration. Spike aerators (solid tines that push soil aside) actually increase compaction around the holes. Hollow-tine aeration creates immediate pathways for water, air, and fertilizer to reach roots and provides soil mixing as plugs break down. Best timing for cool-season lawns: late August through October — the grass is actively growing and can fill aeration holes before winter. For warm-season lawns: late spring (May–June). Do not aerate cool-season lawns in spring if crabgrass is a problem — aeration disrupts pre-emergent herbicide barriers. Thatch: a layer of undecomposed stems, roots, and organic debris above the soil surface. Less than 1/2 inch is beneficial (insulates soil). More than 3/4 inch impedes water and fertilizer penetration and harbors fungal disease. Assess by cutting a small plug — visible spongy brown layer above the soil line is thatch. Power dethatching (a vertical mower or power rake) removes thatch mechanically. This stresses the lawn significantly; follow immediately with fertilization and watering. Best done in fall for cool-season grasses when recovery potential is high.`
  },
  {
    niche: 'lawn_care', category: 'irrigation', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['irrigation', 'sprinkler', 'watering', 'dry spots', 'zone not working', 'head', 'controller', 'system'],
    content: `Lawn irrigation — proper technique and common system problems: The right watering approach: 1 inch per week (rain + irrigation combined), applied in 2 deep sessions rather than daily shallow watering. Deep infrequent watering trains roots to grow deeper, making the lawn more drought-resilient. Early morning (5–8am) is the ideal window — foliage dries quickly through the day, reducing fungal disease; lower wind means better distribution. Evening irrigation leaves foliage wet overnight, creating ideal fungal conditions. Overwatering symptoms are almost identical to underwatering: yellowing, wilting, thinning. The distinction: push a screwdriver 6" into wet-looking soil. If it resists (compacted but wet near surface), you are overwatering and stunting deep root growth. Common irrigation system problems: (1) Brown stripes after irrigation — typically a head with a clogged nozzle or misaligned rotation. Manually run the zone and observe each head. (2) Zone not activating — check the controller program first. If programming is correct, the solenoid valve on that zone may be faulty (replace, $10–25 part), or the wire from the controller to the valve has a break or corroded connection. (3) Low flow on a zone — check filter screens on heads (unscrew the head, pull out the internals, clean the screen under running water). (4) Controller losing programs — most battery-backed controllers need the internal battery replaced every 2–3 years; programs are lost when the battery dies during a power outage.`
  },
  {
    niche: 'lawn_care', category: 'dog_damage', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['dog urine', 'dog spots', 'pet', 'dead circles', 'yellow rings', 'brown circles', 'dog burn'],
    content: `Dog urine damage — why it happens and what actually helps: Dog urine burns grass because it contains concentrated nitrogen and salts. The characteristic pattern: a dead brown center with a ring of dark green, fast-growing grass at the perimeter (the outer ring gets a diluted dose of fertilizer). Female dogs cause more damage than males due to squatting behavior that concentrates urine in one spot rather than lifting-leg dispersion. What actually helps: (1) Immediate flushing — the only truly effective intervention is diluting urine immediately after the dog urinates. Keeping a watering can or hose near the area and soaking the spot within minutes of urination prevents almost all burning. This is more effective than any product. (2) Fall reseeding — damaged spots can be reseeded in late August–September. Scratch the area, add a thin layer of topsoil, seed, keep moist. (3) Training — the most effective long-term solution is training the dog to use a designated area of mulch or gravel. (4) Gypsum application — the evidence is weak, but gypsum can help buffer soil pH in areas of persistent damage. It does not neutralize urine. (5) Dietary supplements (Dog Rocks, pH-adjusting products) — mixed evidence; consult your veterinarian before changing your dog's diet or water quality. Fescue varieties are somewhat more tolerant of urine damage than bluegrass, but no grass variety is immune to concentrated urine.`
  },
  {
    niche: 'lawn_care', category: 'mowing', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['mowing', 'scalping', 'blade height', 'tips turning brown', 'cut too short', 'lawn looks bad after mowing', 'dull blades'],
    content: `Mowing — the one-third rule, correct heights, and blade maintenance: The one-third rule is the most important mowing principle: never remove more than 1/3 of the blade height in a single mowing. Removing more stresses the plant, depletes carbohydrate reserves, and shocks the root system. If your lawn is overgrown, reduce height gradually over 2–3 mowings. Correct mowing heights by species: tall fescue 3.5–4 inches, Kentucky bluegrass 2.5–3.5 inches, perennial ryegrass 2–3 inches, bermudagrass 0.5–1.5 inches, zoysia 1–2 inches. Raising mowing height by half an inch in summer is one of the single most impactful things you can do for a cool-season lawn: taller grass shades the soil (reducing moisture loss and weed germination), and deeper blades support deeper root systems that access moisture and nutrients unavailable to shallow roots. Scalping — cutting below the minimum height — removes the growing point from many grass plants, leaving bare soil exposed to weed seed germination and sun scald. Blade sharpness: dull mower blades tear grass rather than cut it. Torn tips turn brown within 24–48 hours of mowing (visible as a browning of the entire lawn from a distance), create ragged entry points for fungal pathogens, and increase water loss. Sharpen or replace blades 2–3 times per season or after every 8–10 hours of mowing. A properly sharp blade requires moderate pressure to cut a paper cleanly. Clippings: leave them on the lawn. Clippings decompose rapidly and return nitrogen — removing them requires roughly one additional fertilizer application per season to compensate.`
  },
];

// ─── POOL SERVICE KNOWLEDGE ───────────────────────────────────────────────────

const POOL_SERVICE_KNOWLEDGE = [
  {
    niche: 'pool_service', category: 'algae', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['green water', 'algae', 'cloudy green', 'green pool', 'slippery walls', 'green walls', 'bloom'],
    content: `Green pool / algae bloom — treatment sequence that actually works: (1) Test and balance water chemistry BEFORE adding any shock. Chlorine efficacy is pH-dependent — at pH 7.0, chlorine is 73% effective; at pH 7.8, only 10% effective. Adding shock to an unbalanced pool wastes the product. Target: pH 7.2–7.4, alkalinity 80–120 ppm, CYA (stabilizer) below 80 ppm. (2) Brush all pool surfaces aggressively before adding chemicals — brushing removes the protective biofilm layer from algae and exposes it to chemicals. Brush twice daily during treatment. (3) Shock the pool at dusk with calcium hypochlorite — apply at a rate of 2–4 lbs per 10,000 gallons for a moderate algae bloom, 4–6 lbs for a severe bloom. Add shock with the pump running, and run the pump continuously for 24–48 hours. Do not add shock during the day — UV from sunlight destroys unstabilized chlorine rapidly. (4) After 24 hours, add algaecide (non-foaming, poly-quat or copper-based) to eliminate any surviving algae. (5) Vacuum green/dead algae to waste — do not run dead algae back through the filter, which will clog it. Connect the vacuum directly to waste port. (6) Backwash or clean the filter after treatment. Black algae requires extra steps: use a stainless steel brush (not regular nylon brush) to scrape the protective capsule from each algae cluster before applying granular shock directly to the spot.`
  },
  {
    niche: 'pool_service', category: 'water_clarity', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['cloudy', 'hazy', 'murky', 'not clear', 'milky', 'can\'t see bottom', 'white cloudy'],
    content: `Cloudy pool water — systematic diagnosis by color and pattern: White/milky cloudiness with correct chlorine: calcium scaling precipitating out of solution. High pH causes dissolved calcium carbonate to drop out. Lower pH with muriatic acid (add to deep end with pump running, never add acid and chlorine at the same time). High calcium hardness (above 400 ppm) is a secondary cause — requires partial drain and refill with softer water. White cloudiness with low chlorine: shock the pool and run filtration 24 hours continuously. After shocking, add a water clarifier (polymer flocculant) to help fine particles coagulate into filterable size. Greenish cloudiness: early algae bloom — see algae treatment. After shocking, cloudy can persist for 12–24 hours as dead algae clears. Brown/yellow cloudiness: typically metals (iron or copper oxidizing from well water or copper pipes). Treat with a metal sequestrant before adding any chlorine — adding shock to water with dissolved metals turns the water instantly brown. Test for metals if you fill from a well. Filter issue: if water tests correctly balanced with adequate chlorine but remains hazy more than 48 hours after treatment, the filter is not removing fine particles. Backwash the filter, run the pump continuously, and use a water clarifier to create filterable-size particles. Run filter continuously until clear.`
  },
  {
    niche: 'pool_service', category: 'pump', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['pump', 'motor', 'not running', 'humming', 'losing prime', 'weak flow', 'no water', 'seized', 'overheating'],
    content: `Pool pump problems — systematic diagnosis: (1) Pump hums but doesn't turn/start: the motor is receiving power but the impeller or shaft is seized. Turn off power at the breaker immediately — running a seized motor burns out the windings quickly. Allow to cool 30 minutes. Many pump motors have a shaft access point at the back — insert a flathead screwdriver and try to manually rotate the shaft. If it turns freely after cooling, the impeller may be clogged (unscrew the pump basket housing and clear any debris clogging the impeller). If shaft doesn't turn freely, the motor bearings have failed — motor replacement ($200–500) or full pump replacement ($400–900). (2) Pump loses prime: the most common cause is a worn or cracked lid O-ring on the pump basket. Inspect, lubricate with Teflon-based lubricant (not petroleum-based), or replace. Also check: suction side unions for air leaks (can spray soapy water — bubbles indicate the leak location), water level in the pool (must be at mid-skimmer opening), and pump basket for blockage. (3) Weak flow but pump is running: check the pump basket (often clogged with debris), check skimmer baskets, then check if the impeller is partially clogged. Impeller access: turn off power, remove pump basket, use a screwdriver or bent wire through the suction port to clear debris from the impeller vanes. (4) Variable speed pump (VSP) error codes: power cycle the pump (off at the breaker for 30 seconds) resolves many transient errors. Persistent error codes require consulting the pump manufacturer's code list.`
  },
  {
    niche: 'pool_service', category: 'chemistry', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['chemistry', 'testing', 'pH', 'alkalinity', 'calcium', 'CYA', 'stabilizer', 'chlorine lock', 'balance'],
    content: `Pool water chemistry — what each parameter does and how to adjust: pH (target 7.2–7.4): the master parameter of pool chemistry. High pH (above 7.6) causes chlorine to become largely ineffective, promotes calcium scaling, and causes cloudy water. Low pH (below 7.0) is corrosive to equipment, surfaces, and irritating to eyes and skin. Raise pH: sodium carbonate (soda ash). Lower pH: muriatic acid or sodium bisulfate (dry acid). Never add acid and chlorine at the same time. Total Alkalinity (target 80–120 ppm): the buffer that stabilizes pH. Low alkalinity causes pH to bounce (rise and fall rapidly). Raise with sodium bicarbonate (baking soda). Lower with muriatic acid (add to a specific area with the pump running). Calcium Hardness (target 200–400 ppm): low hardness causes water to leach calcium from surfaces (plaster, grout). Raise with calcium chloride (adds to heat — add slowly in divided doses). Cannot be lowered except by partial drain and refill. CYA/Cyanuric Acid/Stabilizer (target 30–80 ppm): prevents UV from destroying chlorine, extending its effective life. Above 80–100 ppm, the stabilizer "locks" chlorine, making it ineffective at any measurable level. The only way to lower CYA is to drain a portion of the pool and refill with fresh water. Free Chlorine (target 1–3 ppm): test and maintain. For saltwater pools, confirm the salt cell is producing chlorine, not just running. Salt (saltwater pools, target 2,700–3,400 ppm): test with a dedicated salt meter (not test strips, which are inaccurate for salt). Add pool-grade sodium chloride to raise.`
  },
  {
    niche: 'pool_service', category: 'heater', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['heater', 'not heating', 'heat pump', 'gas heater', 'ignition', 'temperature', 'not turning on', 'cold pool'],
    content: `Pool heater not working — gas vs heat pump diagnosis: Gas heater not igniting: (1) Confirm gas supply — check if other gas appliances in the home are working. For propane, check tank level. (2) Clean filter/flow issue — gas heaters have a pressure switch that requires adequate water flow before the burner will ignite. A dirty filter, partially closed valve, or obstructed return can prevent ignition. Backwash the filter and confirm all valves are fully open. (3) Igniter failure — if you hear clicking but no ignition, the igniter or pilot light system is failing. Service call needed. (4) High-limit switch tripped — overheating protection trips if flow is restricted or water temperature is already at the set point. Locate the high-limit switch (typically on the heater manifold) and reset it after correcting the flow restriction. (5) Bypass valve position — some installations have a bypass valve that can inadvertently divert water around the heater rather than through it. Heat pump not heating efficiently: heat pumps extract heat from the air and transfer it to the water — they are highly efficient but require ambient air temperature above 50°F (ideally above 60°F) to operate efficiently. Below 50°F, most heat pump pool heaters are largely ineffective. At 45°F ambient, performance drops to near zero. If your heat pump runs but doesn't heat the pool in cold weather, this is normal. If it fails to heat in warm weather (above 70°F), check refrigerant charge (service call), compressor operation (service call), and that the fan is running.`
  },
  {
    niche: 'pool_service', category: 'filter', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['filter', 'pressure', 'high pressure', 'backwash', 'DE', 'cartridge', 'sand', 'dirty filter', 'pressure gauge'],
    content: `Pool filter maintenance — pressure management by filter type: Record your filter pressure when the filter is clean (this is your baseline). Clean the filter when pressure rises 8–10 psi above that baseline — not on a fixed schedule. Sand filters: backwash when pressure rises. Open backwash valve, run pump for 2–3 minutes until the sight glass runs clear. For persistent cloudiness, add a sand filter cleaner product and circulate before the next backwash. Replace sand every 5–7 years (sand wears smooth and loses filtration ability without obvious visual change). DE (Diatomaceous Earth) filters: backwash when pressure rises, then immediately add fresh DE (1 lb per 10 sq feet of filter area) to re-coat the grids. Backwash removes the spent DE and the dirt it captured. A DE filter never truly cleans with backwash alone — do a complete disassembly and grid inspection annually. Replace grids when they develop tears or permanent folds. Cartridge filters: never backwash — remove cartridge(s) and rinse with a garden hose (not a pressure washer, which damages the pleats). Spray at a 45-degree angle between pleats from top to bottom. For deeper cleaning, soak in a commercial filter cleaner overnight. Replace cartridges when they no longer clean up or when the end caps crack. Every 2–5 years depending on usage. A filter pressure that returns to maximum within hours of backwashing indicates the filter element has degraded and needs replacement — not more backwashing.`
  },
  {
    niche: 'pool_service', category: 'leaks', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['leak', 'losing water', 'water level dropping', 'wet area', 'equipment pad wet', 'crack', 'liner'],
    content: `Pool water loss — distinguishing evaporation from a leak: The bucket test: fill a 5-gallon bucket with pool water to the same level as the pool's waterline (mark both inside the bucket and on the pool wall). Place the bucket on a step to keep water temperature consistent. After 24–48 hours (with autofill disabled): if pool and bucket dropped the same amount — evaporation, no leak. If the pool dropped more than the bucket — you have a leak. Evaporation rate: 1/4 to 1/2 inch per day is normal in hot, dry, or windy weather; more than 1 inch per day in mild weather suggests a leak. Isolating the leak location: Pump running vs off test — mark water level, run pump 24 hours, mark again. Run pump off for 24 hours, mark. If you lose more water with the pump running, the leak is on the pressure side (equipment, return lines, fittings). Equal loss running and off suggests a structural leak (shell, liner, light housing). Common leak locations: light housing O-ring (most common structural leak location), skimmer-to-shell joint (often where fiberglass body separates from concrete in older pools), main drain fitting or gasket, return fittings at the pool wall. For vinyl liner pools: use a dye kit (small amount of food coloring near suspected areas) — the dye will be drawn toward any opening. Structural leaks in concrete/gunite pools require professional leak detection using pressure testing and sometimes ground-penetrating equipment. Do not delay pool leak repair — active leaks erode the soil beneath the pool shell, accelerating structural damage.`
  },
  {
    niche: 'pool_service', category: 'salt_system', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['salt cell', 'chlorinator', 'not generating', 'low chlorine', 'salt system', 'error', 'flow', 'scaling'],
    content: `Salt chlorine generator problems — systematic diagnosis: Low chlorine despite salt system running: (1) CYA (stabilizer) above 80 ppm — the most overlooked cause. High CYA binds chlorine molecules, making it ineffective at standard test kit readings. The only fix is a partial drain and refill. (2) Low salt level — test with a reliable digital salt meter or titration test (not strips, which are significantly inaccurate). Salt systems require 2,700–3,400 ppm to generate chlorine efficiently. Add pool-grade salt (not rock salt, water softener salt, or Morton table salt) slowly with the pump running. (3) Scale buildup on the cell — remove the cell and inspect visually. Light white calcium deposits on the titanium plates are normal and expected; heavy buildup insulates the plates and reduces chlorine output. Cleaning: soak in a 1:10 muriatic acid/water solution for 15 minutes. NEVER exceed 15 minutes — longer exposure damages the titanium-ruthenium oxide coating permanently. NEVER use a metal brush or scraping tool. NEVER use full-strength acid. A clean cell is light gray titanium with no buildup. (4) Aged cell — salt cells have a 3–8 year lifespan (varies by brand). Output naturally declines with age. If the cell passes visual inspection, is clean, salt level is correct, and CYA is low, but chlorine production is still inadequate, the cell is at end of life. (5) No flow alarm — the flow switch sensor on the cell housing must detect flow to enable operation. Inspect and clean the flow switch sensor if present; check that all valves are open and flow is adequate.`
  },
  {
    niche: 'pool_service', category: 'winterization', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['closing', 'winterizing', 'freeze', 'winter', 'close for season', 'pipes', 'equipment damage', 'ice'],
    content: `Pool winterization — how to do it correctly to prevent freeze damage: Freeze damage to pool plumbing and equipment is expensive ($2,000–10,000+ in repairs) and entirely preventable. The critical principle: any water remaining in plumbing, equipment, or fittings below the freeze line will expand and crack the surrounding material. (1) Balance water chemistry one week before closing — pH 7.2–7.4, alkalinity 80–120, shock to 10+ ppm chlorine. Adding a winterizing algaecide and floater extends chlorine into spring. (2) Lower water level 6–12 inches below the lowest return fitting or skimmer opening (varies by cover type). (3) Blow out ALL plumbing lines with a large compressor or wet/dry shop vac in blow mode. Every return line, skimmer line, and drain line must be blown clear — a single drop of water in a 1/2 inch pipe will crack the pipe or fitting in a hard freeze. A pool professional uses a large compressor (5+ CFM) and plugs the lines after blowing each one. (4) Add non-toxic propylene glycol (specifically pool-grade antifreeze, NOT RV antifreeze grade, NOT automotive antifreeze which is toxic) to any fitting or piece of equipment where residual water may remain after blowing. (5) Remove and store salt chlorine cell, pressure gauge, and pressure switch indoors — these contain water and crack reliably if left outside in freeze conditions. (6) Freeze damage: do not attempt to force thaw cracked fittings. Wait for natural thaw; forced thawing causes cracked sections to shift and causes worse cracking. Assess damage fully after thaw.`
  },
];

// ─── PEST CONTROL KNOWLEDGE ───────────────────────────────────────────────────

const PEST_CONTROL_KNOWLEDGE = [
  {
    niche: 'pest_control', category: 'cockroaches', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['cockroach', 'roach', 'german cockroach', 'american cockroach', 'water bug', 'roaches in kitchen', 'droppings'],
    content: `Cockroach identification and treatment — species determines everything: German cockroach (Blattella germanica): 1/2 to 5/8 inch, tan/light brown, two dark parallel stripes behind the head. This is the indoor cockroach — it lives, breeds, and dies inside your home. Produces up to 30,000 offspring per year in ideal conditions. Treatment: GEL BAIT only. Apply small pea-sized beads of gel bait (Advion, Maxforce, Vendetta) deep inside cracks, crevices, under appliances, and inside cabinet hinges — wherever roaches hide during the day. Never spray where you apply bait — contact insecticides repel roaches away from bait, destroying the treatment. Add an insect growth regulator (IGR like hydroprene or pyriproxyfen) to break the reproductive cycle. German cockroach infestations require 6–8 weeks of treatment to fully eliminate due to egg capsule (ootheca) hatch cycles. American cockroach (Periplaneta americana): 1.5–2 inches, reddish-brown with a yellowish figure-8 pattern behind the head. This is the sewer roach — it lives primarily outdoors and in sewers, entering structures to forage for food and water. Less reproductive than German roaches. Treatment: perimeter exterior treatment around foundation + door sweeps + drain covers in basement and utility areas. Does NOT require gel bait — spray treatment addresses entry points. If you have one at night in the kitchen it likely came up through a floor drain or gap; if you have 20 in the kitchen during the day you have German cockroaches. Treatment strategy is completely opposite for each species.`
  },
  {
    niche: 'pest_control', category: 'bedbugs', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['bed bugs', 'bedbugs', 'bites', 'itching', 'mattress', 'small bugs', 'blood stains', 'rust spots'],
    content: `Bed bug identification and treatment reality — what works and what wastes money: Confirming bed bugs before treating: Bites alone cannot confirm bed bugs — many insects bite at night, and individual reactions vary dramatically (some people show no reaction at all). Physical evidence required for confirmation: (1) Live bugs: 1–5mm, flat, apple-seed shaped, red-brown (darker after feeding). (2) Shed skins (cast exuviae): pale tan hollow insect skins. (3) Rust-colored stains on mattress seams, box springs, or headboard: digested blood from crushed bugs or their excrement. (4) Black fecal spots: dotted pattern where bugs harbor, typically at mattress seam edges and furniture joints. Where to look: mattress seams, box spring staple line, headboard cracks, baseboards behind the bed, electrical outlet covers. Canine bed bug detection (professionally trained dogs) confirms presence with high accuracy when visual evidence is ambiguous. Effective treatment: (1) Heat treatment (whole-room or whole-structure): raising all materials to 130°F for 2+ hours kills all life stages including eggs. Most effective single treatment; high upfront cost but often complete in one treatment. (2) Pesticide treatment: requires 2–4 professional visits (eggs are not killed by contact pesticides and hatch within 7–14 days). DIY spray cans from hardware stores: completely ineffective against resistant populations and drive bugs to deeper harborage. Avoid. Encasements for mattress and box spring: trap bugs inside and prevent reinfestation of the sleeping surface. Use in conjunction with treatment, not as a standalone solution.`
  },
  {
    niche: 'pest_control', category: 'rodents', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['mice', 'mouse', 'rats', 'droppings', 'gnawing', 'scratching in walls', 'squeaking', 'rodent'],
    content: `Mice vs rats — identification, exclusion, and control: Mice (Mus musculus): 3–4 inch body, rice-grain sized droppings (1/8 inch, pointed ends), can fit through a hole the size of a dime (3/8 inch). Produce up to 150 offspring per year per female. Roof rat (Rattus rattus): 6–8 inch body, banana-shaped droppings (1/2 inch), excellent climbers — enter at roofline, eaves, and trees touching the structure. Norway rat / brown rat (Rattus norvegicus): 7–10 inch body, capsule-shaped blunt-ended droppings (3/4 inch), burrowers — typically enter at ground level through foundation gaps, utility entries, and floor drains. Exclusion is essential: trapping and baiting without exclusion is a continuous maintenance activity, not a solution. Seal all entry points with appropriate materials: steel wool + caulk for gaps up to 1/4 inch (mice cannot chew through steel wool alone — it must be anchored), copper mesh (easier to work with than steel wool), metal flashing for larger gaps, 1/4 inch hardware cloth for ventilation openings. No caulk, wood, or standard foam is effective alone — rodents chew through all of these readily. Interior control: snap traps are the most effective, safest, and most humane method for interior mouse control. Place perpendicular to walls with trigger end toward the wall. Use peanut butter or nesting material (cotton, yarn) as bait. Rodenticide (bait blocks): use only in tamper-resistant bait stations in areas inaccessible to children and pets. Anticoagulant rodenticides create secondary poisoning risk for raptors, owls, and predators that eat poisoned rodents — a genuine ecological concern in residential areas.`
  },
  {
    niche: 'pest_control', category: 'termites', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['termites', 'swarmers', 'mud tubes', 'wings', 'wood damage', 'sawdust', 'hollow wood', 'clicking sound'],
    content: `Termite identification and treatment — subterranean vs drywood: Subterranean termites (Reticulitermes spp. — most common in the US): live in soil, must maintain soil contact or moisture, build mud tubes (pencil-width earthen tunnels) up foundation walls, piers, and any wood contact to protect the colony from exposure. Mud tubes are the most reliable sign. Damaged wood has a honeycomb interior with mud packed inside the galleries, following the wood grain. Swarmers: winged reproductives that emerge in spring, often confused with flying ants. Termites: equal-length wings (all four the same length), straight antennae, thick waist. Flying ants: unequal wing lengths (front pair longer), elbowed antennae, pinched waist. Treatment: soil treatment (Termidor — fipronil based, 10-year efficacy, non-repellent, spread through colony contact) or Sentricon baiting system (above-ground and in-ground stations, slower acting, colony elimination). Drywood termites (Incisitermes spp. — Southern states, Southwest, coastal areas): live entirely in wood with no soil contact. Evidence: frass (fecal pellets) — hexagonal, 6-sided, with blunt ends, sand-grain sized, often in small piles beneath infested wood. No mud tubes. Treatment: local injection (drill and treat individual galleries in localized infestations) or structural fumigation (tent fumigation — the only comprehensive treatment for whole-structure drywood infestations). Do not disturb mud tubes or active galleries before professional inspection — this can drive the colony to new areas before treatment is applied.`
  },
  {
    niche: 'pest_control', category: 'stinging', urgency: 'immediate', safety_flag: true,
    symptom_tags: ['bees', 'wasps', 'hornets', 'yellow jackets', 'nest', 'stinging', 'swarm', 'allergy', 'anaphylaxis'],
    content: `STINGING INSECT EMERGENCY — anaphylaxis and severe allergic reaction: If anyone stung shows any of the following, call 911 immediately and administer epinephrine (EpiPen) if available: hives or swelling beyond the sting site, difficulty breathing, throat tightening, dizziness, rapid pulse, or nausea after a sting. This is anaphylaxis — a life-threatening emergency. Identification and treatment by species: Paper wasps (Polistes) — 3/4 to 1 inch, slender waist, open umbrella-shaped combs under eaves and overhangs. Colonies 50–100. DIY treatable: spray directly into nest opening at night with wasp freeze spray, treat again next morning. Paper wasp stings are painful but colonies are not aggressive unless directly disturbed. Yellow jackets (Vespula spp.) — 1/2 inch, stocky, bold yellow-black banding. Colonies 1,000–4,000. Nest in wall voids, attics, or underground. MOST AGGRESSIVE species — will chase and sting repeatedly. Underground nests: apply carbaryl dust directly into the nest opening at night, repeat after 3 days. Wall void nests: professional treatment recommended due to risk of colony breaking into interior of structure. Bald-faced hornets — large (3/4 inch), black and white, teardrop-shaped aerial nests in trees or on structures. Extremely aggressive when disturbed. Professional treatment strongly recommended. Honey bees — fuzzy, golden-brown, beneficial and protected. Contact a beekeeper for swarm or hive removal before calling pest control — bees can often be rescued and relocated. Relocating a large established colony from inside a wall is a complex operation requiring a beekeeper and often a contractor.`
  },
  {
    niche: 'pest_control', category: 'ants', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['ants', 'ant trail', 'carpenter ants', 'fire ants', 'tiny ants', 'ants in kitchen', 'ant colony', 'sugar ants'],
    content: `Ant identification and targeted treatment — species determines the correct approach: Odorous house ants (Tapinoma sessile — "sugar ants"): tiny (1/8 inch), dark brown to black, produce a coconut/rotten smell when crushed. Trail in long lines. Most common ant complaint. Treatment: GEL BAIT. Never spray active ant trails — spraying kills scouts but leaves the colony intact and causes "budding" (colony splits into multiple satellite colonies, worsening the problem). Apply bait near (not directly in) the trails and let ants carry it back. Clearance takes 3–7 days. Carpenter ants (Camponotus spp.): large (1/4 to 1/2 inch), black or black-and-red. Do NOT eat wood — they excavate galleries in moist or decayed wood to nest. Presence indoors typically indicates a satellite colony nesting in a wall void, usually associated with moisture. Coarse sawdust (frass) near structural wood or in wall voids confirms active galleries. Treatment: residual dust injected into wall voids and suspected galleries (delta dust or drione dust). Do NOT use gel bait for carpenter ants — they don't consume it. Fix the moisture source first or the colony returns. Fire ants (Solenopsis invicta — Southeastern US and beyond): mounded nests in sunny areas. Treatment: spinosad-based bait broadcast across infested areas + mound drench with bifenthrin or acephate liquid for immediate colony kill. Two-step method works better than mound-only treatment. Argentine ants (coastal areas) and pavement ants: bait-based control most effective.`
  },
  {
    niche: 'pest_control', category: 'wildlife', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['squirrels', 'raccoons', 'bats', 'birds', 'attic', 'scratching', 'noises', 'wildlife in roof', 'animal in house'],
    content: `Wildlife in attic or structure — identification, eviction, and exclusion: Identifying the animal: Squirrels — daytime activity (dawn and dusk peaks), light quick sounds, entry at soffit-fascia gaps, eave returns, or gnawed openings with fresh light-colored chewing marks around the entry. Raccoons — heavy thumping at night, can physically rip off soffit panels with their hands, chattering or crying from young (spring). Very strong for their size. Roof rats — light scratching and running along the perimeter at night (ceiling level), entry at eaves, roof vents, and gaps around utility penetrations. Birds — daytime activity, fluttering and chirping in vents, dryer vents, bathroom exhaust vents. Bats — exit at dusk in a stream, not detectable during day without inspection, high-pitched chittering. Correct sequence: (1) Identify species first — treatment approach differs entirely. (2) Find ALL entry points (usually more than one). (3) Evict — one-way exclusion devices let animals exit but not re-enter; trapping is an option for some species. (4) Seal all entry points after eviction. If you seal before eviction, animals trapped inside die in the walls, creating odor and secondary pest issues. Bats are federally protected under the Endangered Species Act — no trapping or lethal control is permitted. Exclusion only. Never perform bat exclusion between May and August (maternity season when flightless pups are in the roost). Wildlife removal often requires separate specialists from pest control — many pest control companies do not handle wildlife.`
  },
  {
    niche: 'pest_control', category: 'mosquitoes', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['mosquitoes', 'mosquito', 'biting', 'yard treatment', 'backyard', 'breeding', 'standing water', 'control'],
    content: `Mosquito control — what works and what doesn't at a residential scale: Mosquitoes breed exclusively in standing water — they need as little as a bottlecap of water to breed. Source reduction is the highest-leverage action: (1) Eliminate standing water — change bird baths every 3 days, clean clogged gutters, fix low spots in yard where water pools, remove old tires, cover or flip containers. (2) For ornamental ponds, water features, or containers that can't be drained: Bti dunks (Bacillus thuringiensis israelensis) — a biological larvicide that kills mosquito larvae specifically and is safe for fish, wildlife, and humans. Place one dunk per 100 sq ft of water surface. Replace every 30 days. Yard/barrier sprays: bifenthrin or permethrin applied to the underside of leaves, dense vegetation, and shaded resting areas (mosquitoes don't rest in open sun — they shelter in vegetation during daylight). Typical residual: 21–30 days. Seasonal mosquito service (4–8 applications per season) maintains residual coverage throughout the season. The products used by professionals are the same active ingredients as retail products — the difference is application rate, coverage thoroughness, and timing. Bug zappers: do not attract or kill meaningful numbers of mosquitoes — they primarily kill moths and beneficial insects. Citronella candles: effective at providing an approximately 1-2 foot odor barrier. Not effective at the backyard scale. Mosquito misting systems: automated sprayers using pyrethrin (natural) that break down rapidly — effective but require professional installation and calibration.`
  },
  {
    niche: 'pest_control', category: 'fleas', urgency: 'this_week', safety_flag: false,
    symptom_tags: ['fleas', 'flea infestation', 'jumping bugs', 'itching', 'pet scratching', 'flea dirt', 'bites on ankles'],
    content: `Flea infestation — why a single treatment always fails and how to actually eliminate them: The flea life cycle is why most DIY treatments fail: eggs (50% of population), larvae (35%), pupae (10%), adults (5%). Only adult fleas are killed by contact insecticides. Eggs and larvae are knocked back by treatments but hatch over 2–4 weeks. The pupal cocoon is physically impervious to all pesticides — a pupa inside its cocoon cannot be killed chemically. It requires vibration, warmth, and CO2 to trigger emergence. A comprehensive 4-week protocol: (1) Veterinary-prescribed flea treatment on ALL pets in the household — non-negotiable. A single untreated pet will restart the infestation. Over-the-counter flea products are largely ineffective against resistant flea populations; veterinarian-prescribed oral products (Bravecto, NexGard, Simparica) kill fleas rapidly and completely. (2) Vacuum all carpets, rugs, upholstered furniture, and along baseboards. Immediately empty the vacuum canister outside. Vacuuming stimulates pupae to emerge prematurely, where they are vulnerable to treatment. (3) Apply a professional-grade insecticide with an IGR (Insect Growth Regulator — methoprene or pyriproxyfen). The IGR prevents larvae from developing into breeding adults. Without an IGR, you are treating adult fleas only and the infestation cycles indefinitely. (4) Repeat treatment at 14 days and again at 28 days. Three properly timed treatments break the cycle completely. If you skip any of these components or timing windows, expect continued infestation.`
  },
  {
    niche: 'pest_control', category: 'pantry_pests', urgency: 'diy_first', safety_flag: false,
    symptom_tags: ['pantry moths', 'grain beetles', 'weevils', 'moths in kitchen', 'bugs in food', 'flour beetles', 'Indian meal moth'],
    content: `Pantry pests — Indian meal moths and grain/flour beetles — no insecticide needed: Indian meal moth (Plodia interpunctella): 1/2 inch moth with distinctive copper-tipped wings (outer 2/3 copper, inner 1/3 pale gray). The larvae (cream-colored caterpillars with a darker head) are what infest the food. Look for webbing inside packages, in the corners of shelves, or in grain products. Adult moths flying around the kitchen are the visible sign. Merchant/confused flour beetle (Tribolium species): 1/8 inch, reddish-brown, flat. Does not fly. Found directly in grain products — flour, pasta, cereal, cornmeal. Both pests arrive in infested products from stores — the infestation starts in a single package and spreads to all susceptible food nearby. No insecticide is appropriate in food storage areas. The correct approach: (1) Empty all food from all cabinets and shelving. Inspect every package — look for webbing, frass, or live insects. Include pet food, birdseed, spices, dried herbs, and even decorative dried floral arrangements. (2) Discard any infested products in sealed plastic bags directly to an outdoor trash container. (3) Vacuum all shelving, corners, and cabinet interiors. Wipe down with white vinegar (disrupts chemical trails). (4) Store ALL grain products (and pet food, birdseed) in hard-sided airtight containers — glass, metal, or polypropylene with a proper sealing lid. No cardboard boxes or paper bags. (5) Install pheromone traps (species-specific) to monitor for re-infestation — they do not control populations but tell you when and if you've succeeded.`
  },
  {
    niche: 'pest_control', category: 'prevention', urgency: 'schedule', safety_flag: false,
    symptom_tags: ['prevention', 'exclusion', 'seal', 'perimeter treatment', 'proactive', 'quarterly', 'general pest', 'barrier'],
    content: `Pest prevention — structural exclusion and perimeter treatment: The most effective pest management is prevention, not reaction. Structural exclusion — the first line of defense: (1) Caulk all gaps around utility penetrations (pipes, conduit, cable) where they enter the structure. (2) Install or replace door sweeps on all exterior doors — light visible at the bottom of a closed door is a pest highway. A standard door gap of 1/4 inch is sufficient entry for mice. (3) Seal all gaps around windows and doors where caulk has cracked or separated. (4) Screen all vents — attic vents, crawlspace vents, dryer vents — with 1/4 inch hardware cloth. Replace torn or loose screens. (5) Keep vegetation 12–18 inches away from the foundation — dense plantings touching the structure provide both harborage and a bridge for insects and rodents. Perimeter insecticide treatment: bifenthrin or cypermethrin applied as a spray to the foundation band (2 feet up the foundation wall + 2–3 feet out on the ground) + window frames + door frames creates a residual barrier. Residual: 60–90 days outdoors depending on rainfall. Quarterly professional treatments (4 per year) maintain continuous coverage. Eliminating entry points before treatment dramatically increases effectiveness — no perimeter barrier compensates for an open gap at a pipe penetration. Sanitation: no accessible food, water, or pet food left overnight; clean under appliances regularly. The conditions that invite pests (moisture, food, shelter) are as important as the chemical barrier.`
  },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const targetNiche = process.argv.find(a => a.startsWith('--niche='))?.split('=')[1];

  // Wait for DB to be ready
  await db._ready;
  console.log('✅ DB connected');

  const allNiches = [
    { name: 'hvac',         chunks: HVAC_KNOWLEDGE },
    { name: 'roofing',      chunks: ROOFING_KNOWLEDGE },
    { name: 'electrical',   chunks: ELECTRICAL_KNOWLEDGE },
    { name: 'plumbing',     chunks: PLUMBING_KNOWLEDGE },
    { name: 'landscaping',  chunks: LANDSCAPING_KNOWLEDGE },
    { name: 'painting',     chunks: PAINTING_KNOWLEDGE },
    { name: 'general',      chunks: GENERAL_KNOWLEDGE },
    { name: 'solar',        chunks: SOLAR_KNOWLEDGE },
    { name: 'water_damage', chunks: WATER_DAMAGE_KNOWLEDGE },
    { name: 'tree_service', chunks: TREE_SERVICE_KNOWLEDGE },
    { name: 'lawn_care',    chunks: LAWN_CARE_KNOWLEDGE },
    { name: 'pool_service', chunks: POOL_SERVICE_KNOWLEDGE },
    { name: 'pest_control', chunks: PEST_CONTROL_KNOWLEDGE },
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
    // Wait 15s between niches to avoid Voyage AI rate limits
    await new Promise(r => setTimeout(r, 15000));
  }

  console.log('\n🎉 All knowledge loaded. Brain 3 is now an expert.\n');
}

/**
 * loadNiches(nicheNames) — load specific niches only. Used by admin endpoint.
 * @param {string[]} nicheNames — e.g. ['roofing', 'electrical']
 */
async function loadNiches(nicheNames) {
  await db._ready;
  const allNiches = [
    { name: 'hvac',         chunks: HVAC_KNOWLEDGE },
    { name: 'roofing',      chunks: ROOFING_KNOWLEDGE },
    { name: 'electrical',   chunks: ELECTRICAL_KNOWLEDGE },
    { name: 'plumbing',     chunks: PLUMBING_KNOWLEDGE },
    { name: 'landscaping',  chunks: LANDSCAPING_KNOWLEDGE },
    { name: 'painting',     chunks: PAINTING_KNOWLEDGE },
    { name: 'general',      chunks: GENERAL_KNOWLEDGE },
    { name: 'solar',        chunks: SOLAR_KNOWLEDGE },
    { name: 'water_damage', chunks: WATER_DAMAGE_KNOWLEDGE },
    { name: 'tree_service', chunks: TREE_SERVICE_KNOWLEDGE },
    { name: 'lawn_care',    chunks: LAWN_CARE_KNOWLEDGE },
    { name: 'pool_service', chunks: POOL_SERVICE_KNOWLEDGE },
    { name: 'pest_control', chunks: PEST_CONTROL_KNOWLEDGE },
  ];
  const toLoad = nicheNames
    ? allNiches.filter(n => nicheNames.includes(n.name))
    : allNiches;
  for (const { name, chunks } of toLoad) {
    console.log(`\n── Loading ${name.toUpperCase()} knowledge (${chunks.length} chunks) ──`);
    await clearNicheKnowledge(name);
    await storeKnowledgeBatch(chunks);
    console.log(`✅ ${name.toUpperCase()} complete`);
    await new Promise(r => setTimeout(r, 15000));
  }
  console.log('\n🎉 Knowledge load complete.\n');
}

// Allow require()'ing this script as a module (e.g. from the admin endpoint)
// without auto-running. Only auto-run when called directly.
module.exports = { main, loadNiches };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Load failed:', err.message);
    process.exit(1);
  }).then(() => process.exit(0));
}

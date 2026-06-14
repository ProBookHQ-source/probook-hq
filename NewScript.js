var LEADS_SHEET = 'Leads';
var OWNER_EMAIL = 'oiltoheatrebate@gmail.com';
var SENDER_NAME = 'OilToHeatRebate.com';
var SPREADSHEET_ID = '1sR0-uvLiFRE2K11Hc-VvurHbkImBCivPa9OmxCeOHa4';
var DUPLICATE_WINDOW_HOURS = 24;

// ─── PROBOOK BRIDGE CONFIG ────────────────────────────────────────────────────
// Set these in Apps Script → Project Settings → Script Properties:
//   PROBOOK_API_URL  = https://probook-hq-production.up.railway.app
//   PROBOOK_API_KEY  = (the INBOUND_API_KEY value from Railway env vars)
var PROBOOK_API_URL  = PropertiesService.getScriptProperties().getProperty('PROBOOK_API_URL')  || '';
var PROBOOK_API_KEY  = PropertiesService.getScriptProperties().getProperty('PROBOOK_API_KEY')  || '';
var PROBOOK_NICHE    = 'hvac';       // niche slug — change per site
var PROBOOK_SOURCE   = 'oiltoheatrebate.com'; // identifies which site this lead came from

// ─── ENTRY POINTS ────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
      data = JSON.parse(e.parameter.data);
    } else if (e.parameter) {
      data = e.parameter;
    }
    return processLead(data);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var data = {};
    if (e.parameter && e.parameter.data) {
      data = JSON.parse(e.parameter.data);
    }
    if (Object.keys(data).length > 0) {
      return processLead(data);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'live' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── MAIN PIPELINE ───────────────────────────────────────────────────────────

function processLead(data) {
  // 1. Required fields check
  var required = validateRequired(data);
  if (!required.ok) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: required.error }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Email format check
  if (!isValidEmail(data.email)) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Invalid email format.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. Phone number check — must be 10 digits
  if (!isValidPhone(data.phone)) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Phone number must be 10 digits.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 4. Duplicate email check — 24 hour window
  if (isDuplicate(data.email)) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Duplicate submission within 24 hours.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 5. Recalculate score server-side — ignore whatever the browser sent
  var scored = recalculateScore(data);
  data.lead_score = scored.score;
  data.lead_tier  = scored.tier;

  // 6. Sanity check — if answers don't match any real score range, flag it
  if (scored.score < 0 || scored.score > 20) {
    data.lead_tier = 'FLAGGED';
  }

  // All checks passed — save to sheet, notify owner, reply to lead, bridge to ProBook
  saveToSheet(data);
  notifyOwner(data);
  replyToLead(data);
  sendToProBook(data); // 🌉 Bridge — non-blocking, errors logged but don't break the pipeline

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── PROBOOK BRIDGE ──────────────────────────────────────────────────────────
// Posts the lead to ProBook's inbound API endpoint.
// Future-proof: works for any niche site — just update PROBOOK_NICHE and
// PROBOOK_SOURCE above when deploying a new script for a different site.

function sendToProBook(data) {
  if (!PROBOOK_API_URL || !PROBOOK_API_KEY) {
    Logger.log('ProBook bridge skipped — PROBOOK_API_URL or PROBOOK_API_KEY not set in Script Properties.');
    return;
  }

  var payload = {
    // ── Required ──────────────────────────────────────────────────────────────
    name:        data.name        || '',
    email:       data.email       || '',
    phone:       data.phone       || '',
    zip_code:    data.zip_code    || '',
    niche_slug:  PROBOOK_NICHE,
    source_site: PROBOOK_SOURCE,

    // ── External scoring (from this site's server-side scoring) ───────────────
    lead_tier:   data.lead_tier   || '',
    lead_score:  data.lead_score  || 0,

    // ── Qualifying fields (stored as metadata in ProBook) ─────────────────────
    address:          data.address          || '',
    heating:          data.heating          || '',
    oil_tank:         data.oil_tank         || '',
    ductwork:         data.ductwork         || '',
    year_built:       data.year_built       || '',
    square_footage:   data.square_footage   || '',
    monthly_oil_bill: data.monthly_oil_bill || '',
    reason:           data.reason           || '',
    timeline:         data.timeline         || '',
    homeowner:        data.homeowner        || '',
    household_size:   data.household_size   || '',
    income:           data.income           || '',
  };

  try {
    var response = UrlFetchApp.fetch(PROBOOK_API_URL + '/api/leads/inbound', {
      method:             'post',
      contentType:        'application/json',
      payload:            JSON.stringify(payload),
      headers:            { 'Authorization': 'Bearer ' + PROBOOK_API_KEY },
      muteHttpExceptions: true, // don't throw on 4xx/5xx — we log instead
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200 || code === 201) {
      Logger.log('✅ ProBook bridge success: ' + body);
    } else {
      Logger.log('⚠️ ProBook bridge HTTP ' + code + ': ' + body);
    }
  } catch(err) {
    // Never let bridge errors break the main pipeline
    Logger.log('❌ ProBook bridge error: ' + err.message);
  }
}

// ─── VALIDATION FUNCTIONS ────────────────────────────────────────────────────

function validateRequired(data) {
  if (!data.name || data.name.trim() === '') {
    return { ok: false, error: 'Name is required.' };
  }
  if (!data.email || data.email.trim() === '') {
    return { ok: false, error: 'Email is required.' };
  }
  if (!data.phone || data.phone.trim() === '') {
    return { ok: false, error: 'Phone is required.' };
  }
  if (!data.address || data.address.trim() === '') {
    return { ok: false, error: 'Address is required.' };
  }
  return { ok: true };
}

function isValidEmail(email) {
  if (!email) return false;
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function isValidPhone(phone) {
  if (!phone) return false;
  var digits = phone.replace(/\D/g, '');
  return digits.length === 10;
}

function isDuplicate(email) {
  if (!email) return false;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var now = new Date();
  var cutoff = new Date(now.getTime() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);

  // Email is column 6, Date is column 1, Time is column 2
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowEmail = (data[i][5] || '').toString().trim().toLowerCase();
    var rowDate  = data[i][0];
    var rowTime  = data[i][1];
    if (rowEmail !== email.trim().toLowerCase()) continue;
    try {
      var combined = new Date(rowDate.toString().split('T')[0] + ' ' + rowTime);
      if (combined >= cutoff) return true;
    } catch(e) {
      // Can't parse date — skip this row
    }
  }
  return false;
}

// ─── SERVER-SIDE SCORE CALCULATION ──────────────────────────────────────────
// Mirrors the scoring logic from the HTML quiz so the browser score is ignored.

function recalculateScore(data) {
  var score = 0;

  // Heating system
  var heating = data.heating || '';
  if (heating === 'oil-furnace' || heating === 'oil-boiler' || heating === 'oil-electric') score += 2;
  else if (heating === 'not-sure') score += 1;

  // Ductwork
  var ductwork = data.ductwork || '';
  if (ductwork === 'full' || ductwork === 'partial') score += 1;

  // Reason for switching
  var reason = data.reason || '';
  if (reason === 'My oil bill is too expensive') score += 2;
  else if (reason === 'I want AC too' || reason === 'Environmental reasons') score += 1;
  else if (reason === 'My system is old / needs replacement') score += 2;

  // Timeline
  var timeline = data.timeline || '';
  if (timeline === 'ASAP - Ready to move forward') score += 3;
  else if (timeline === '1-3 months') score += 2;
  else if (timeline === '3-6 months') score += 1;

  // Homeowner status
  var homeowner = data.homeowner || '';
  if (homeowner === 'Yes - I own the home' || homeowner === 'I am a landlord') score += 3;
  else if (homeowner === 'I rent - landlord may be open') score += 1;

  // Income
  var income = data.income || '';
  if (income === 'mid') score += 2;
  else if (income === 'high') score += 1;

  // Determine tier
  var tier;
  if (score >= 12) tier = 'Tier 1';
  else if (score >= 7) tier = 'Tier 2';
  else tier = 'Tier 3';

  return { score: score, tier: tier };
}

// ─── SHEET ───────────────────────────────────────────────────────────────────

function saveToSheet(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LEADS_SHEET);
    sheet.appendRow([
      'Date','Time','Tier','Score','Name','Email','Phone','Address','Zip Code',
      'Heating','Oil Tank','Ductwork','Year Built','Square Footage',
      'Monthly Oil Bill','Reason','Timeline','Homeowner','Household Size',
      'Income','Consent Given','Consent Timestamp','Consent Version',
      'Landing Page','User Agent','Turnstile Verified'
    ]);
    sheet.getRange(1,1,1,26).setBackground('#1a5c38').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var now = new Date();
  sheet.appendRow([
    Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
    Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm:ss a'),
    data.lead_tier || '',
    data.lead_score || '',
    data.name || '',
    data.email || '',
    data.phone || '',
    data.address || '',
    data.zip_code || '',
    data.heating || '',
    data.oil_tank || '',
    data.ductwork || '',
    data.year_built || '',
    data.square_footage || '',
    data.monthly_oil_bill || '',
    data.reason || '',
    data.timeline || '',
    data.homeowner || '',
    data.household_size || '',
    data.income || '',
    data.consent_given || '',
    data.consent_timestamp || '',
    data.consent_version || '',
    data.landing_page || '',
    data.user_agent || '',
    data.turnstile_token ? 'Yes' : 'No'
  ]);
  var lastRow = sheet.getLastRow();
  var tier = data.lead_tier || '';
  var color = '#ffffff';
  if (tier === 'Tier 1') color = '#dcfce7';
  else if (tier === 'Tier 2') color = '#fef9c3';
  else if (tier === 'Tier 3') color = '#eff6ff';
  else if (tier === 'FLAGGED') color = '#fee2e2';
  sheet.getRange(lastRow, 1, 1, 26).setBackground(color);
}

// ─── EMAILS ──────────────────────────────────────────────────────────────────

function notifyOwner(data) {
  var tier = data.lead_tier || 'Unknown';
  var subject = 'New Lead — ' + tier + ' — OilToHeatRebate.com';
  var body = 'NEW LEAD\n'
    + 'Tier: ' + tier + '\n'
    + 'Score: ' + (data.lead_score || '') + '\n'
    + 'Name: ' + (data.name || '') + '\n'
    + 'Email: ' + (data.email || '') + '\n'
    + 'Phone: ' + (data.phone || '') + '\n'
    + 'Address: ' + (data.address || '') + '\n'
    + 'Heating: ' + (data.heating || '') + '\n'
    + 'Oil Tank: ' + (data.oil_tank || '') + '\n'
    + 'Ductwork: ' + (data.ductwork || '') + '\n'
    + 'Year Built: ' + (data.year_built || '') + '\n'
    + 'Square Footage: ' + (data.square_footage || '') + '\n'
    + 'Monthly Oil Bill: ' + (data.monthly_oil_bill || '') + '\n'
    + 'Homeowner: ' + (data.homeowner || '') + '\n'
    + 'Reason: ' + (data.reason || '') + '\n'
    + 'Timeline: ' + (data.timeline || '') + '\n'
    + 'Household Size: ' + (data.household_size || '') + '\n'
    + 'Income: ' + (data.income || '') + '\n'
    + 'Submitted: ' + new Date().toLocaleString();
  GmailApp.sendEmail(OWNER_EMAIL, subject, body);
}

function replyToLead(data) {
  var leadEmail = data.email;
  if (!leadEmail) return;
  var firstName = (data.name || 'Seattle Homeowner').split(' ')[0];
  var income = data.income || '';
  var rebateAmount = income === 'low'  ? 'Free Conversion (~$24,000 value)' :
                     income === 'mid'  ? 'Up to $6,000' :
                     income === 'high' ? '$2,000' : 'Up to $6,000';
  var subject = "Your Clean Heat Rebate Request — We'll Be in Touch Soon";
  GmailApp.sendEmail(leadEmail, subject, '', {
    htmlBody: buildHTML(firstName, rebateAmount),
    name: SENDER_NAME,
    replyTo: 'hello@oiltoheatrebate.com'
  });
}

// ─── EMAIL TEMPLATE ──────────────────────────────────────────────────────────

function buildHTML(firstName, rebateAmount) {
  firstName = firstName || 'Seattle Homeowner';
  rebateAmount = rebateAmount || 'Up to $6,000';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
  + '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;background:#f4f4f4;"><tr><td align="center">'
  + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;">'
  + '<tr><td style="background:#1a5c38;padding:32px 40px;text-align:center;">'
  + '<img src="https://oiltoheatrebate.com/logo.png" width="70" style="display:block;margin:0 auto 14px;">'
  + '<div style="color:#fff;font-size:22px;font-weight:800;"><span style="color:#fff;">OilToHeat</span><span style="color:#4ade80;">Rebate</span>.com</div>'
  + '<div style="color:#a7f3d0;font-size:13px;margin-top:5px;">Seattle Clean Heat Program</div>'
  + '</td></tr>'
  + '<tr><td style="background:#f0fdf4;padding:24px 40px;text-align:center;border-bottom:1px solid #bbf7d0;">'
  + '<div style="font-size:12px;font-weight:700;color:#1a5c38;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:2px;">Your Rebate Eligibility</div>'
  + '<div style="font-size:26px;font-weight:900;color:#1a5c38;line-height:1.2;margin-bottom:8px;">Seattle Clean Heat Program</div>'
  + '<div style="font-size:15px;color:#166534;line-height:1.6;">Based on your answers, you may qualify for Seattle\'s Clean Heat Program rebate. A specialist will confirm your exact amount within 5-7 business days.</div>'
  + '</td></tr>'
  + '<tr><td style="padding:36px 40px;">'
  + '<p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 20px;">Hello ' + firstName + ',</p>'
  + '<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">Thank you for taking a few minutes to check your eligibility for Seattle\'s Clean Heat Program. We received your request and you\'re now in our system.</p>'
  + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 22px;margin-bottom:24px;text-align:center;">'
  + '<div style="font-size:12px;font-weight:700;color:#1a5c38;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your Estimated Rebate</div>'
  + '<div style="font-size:28px;font-weight:900;color:#1a5c38;letter-spacing:-1px;">' + rebateAmount + '</div>'
  + '</div>'
  + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:24px 28px;margin-bottom:24px;">'
  + '<div style="font-size:13px;font-weight:700;color:#1a5c38;text-transform:uppercase;letter-spacing:1px;margin-bottom:18px;">Here\'s What Happens Next</div>'
  + '<table cellpadding="0" cellspacing="0" width="100%">'
  + '<tr><td style="padding-bottom:16px;vertical-align:top;width:40px;"><div style="width:28px;height:28px;background:#1a5c38;border-radius:6px;text-align:center;line-height:28px;color:#fff;font-weight:800;font-size:13px;">1</div></td><td style="padding-bottom:16px;vertical-align:top;"><strong style="font-size:14px;color:#111827;">Specialist Reaches Out</strong><br><span style="font-size:13px;color:#6b7280;">A rebate specialist will reach out within 5-7 business days</span></td></tr>'
  + '<tr><td style="padding-bottom:16px;vertical-align:top;width:40px;"><div style="width:28px;height:28px;background:#1a5c38;border-radius:6px;text-align:center;line-height:28px;color:#fff;font-weight:800;font-size:13px;">2</div></td><td style="padding-bottom:16px;vertical-align:top;"><strong style="font-size:14px;color:#111827;">Confirm Your Eligibility</strong><br><span style="font-size:13px;color:#6b7280;">We\'ll confirm your exact rebate amount and answer any questions</span></td></tr>'
  + '<tr><td style="padding-bottom:16px;vertical-align:top;width:40px;"><div style="width:28px;height:28px;background:#1a5c38;border-radius:6px;text-align:center;line-height:28px;color:#fff;font-weight:800;font-size:13px;">3</div></td><td style="padding-bottom:16px;vertical-align:top;"><strong style="font-size:14px;color:#111827;">Free Home Assessment</strong><br><span style="font-size:13px;color:#6b7280;">We\'ll schedule your no-obligation home visit at a time that works for you</span></td></tr>'
  + '<tr><td style="vertical-align:top;width:40px;"><div style="width:28px;height:28px;background:#1a5c38;border-radius:6px;text-align:center;line-height:28px;color:#fff;font-weight:800;font-size:13px;">4</div></td><td style="vertical-align:top;"><strong style="font-size:14px;color:#111827;">Rebate Applied at Invoice</strong><br><span style="font-size:13px;color:#6b7280;">Your rebate gets applied directly to your contractor invoice — no waiting for a check</span></td></tr>'
  + '</table>'
  + '</div>'
  + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:18px 22px;margin-bottom:28px;">'
  + '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:6px;">Important — Bonus Rebate Funding Is Limited</div>'
  + '<div style="font-size:13px;color:#92400e;line-height:1.65;">The $4,000 bonus rebate is awarded on a first-come, first-served basis and has run out before year-end in previous funding cycles. We will prioritize your request to ensure you don\'t miss out.</div>'
  + '</div>'
  + '<p style="font-size:14px;color:#374151;margin:0 0 8px;">Questions in the meantime? Just reply to this email and we\'ll get back to you promptly.</p>'
  + '<p style="font-size:14px;color:#374151;margin:0 0 28px;">We\'ll be in touch soon.</p>'
  + '<table cellpadding="0" cellspacing="0"><tr>'
  + '<td style="vertical-align:middle;padding-right:14px;"><img src="https://oiltoheatrebate.com/logo.png" width="44" style="display:block;border-radius:50%;"></td>'
  + '<td style="vertical-align:middle;"><div style="font-size:14px;font-weight:700;color:#111827;">The OilToHeatRebate.com Team</div>'
  + '<div style="font-size:13px;color:#1a5c38;margin-top:2px;"><a href="mailto:oiltoheatrebate@gmail.com" style="color:#1a5c38;text-decoration:none;">oiltoheatrebate@gmail.com</a></div>'
  + '<div style="font-size:12px;color:#6b7280;margin-top:1px;">Seattle Clean Heat Program Specialists</div></td>'
  + '</tr></table>'
  + '</td></tr>'
  + '<tr><td style="background:#111827;padding:24px 40px;text-align:center;">'
  + '<div style="color:#fff;font-size:13px;font-weight:700;"><span style="color:#fff;">OilToHeat</span><span style="color:#4ade80;">Rebate</span>.com</div>'
  + '<div style="color:#9ca3af;font-size:11px;line-height:1.7;margin-top:8px;">You received this because you submitted a rebate eligibility request at OilToHeatRebate.com.<br>Not affiliated with the City of Seattle or Seattle City Light. To opt out reply UNSUBSCRIBE.</div>'
  + '</td></tr>'
  + '</table></td></tr></table></body></html>';
}

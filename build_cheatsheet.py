from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT = "/sessions/jolly-beautiful-goodall/mnt/lead-booking-app/tractify-call-cheatsheet.pdf"

doc = SimpleDocTemplate(OUT, pagesize=letter,
    leftMargin=0.55*inch, rightMargin=0.55*inch,
    topMargin=0.45*inch, bottomMargin=0.45*inch)

NAVY  = colors.HexColor("#1a2e4a")
BLUE  = colors.HexColor("#1E5AA8")
LGRAY = colors.HexColor("#f0f4f9")
DGRAY = colors.HexColor("#444444")
GOLD  = colors.HexColor("#7a5c00")
LGOLD = colors.HexColor("#fff8e1")

def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9, leading=13, textColor=DGRAY, spaceAfter=2)
    base.update(kw)
    return ParagraphStyle(name, **base)

TITLE = style("title", fontName="Helvetica-Bold", fontSize=15, textColor=NAVY, leading=18, spaceAfter=4, alignment=TA_CENTER)
SEC   = style("sec",   fontName="Helvetica-Bold", fontSize=10, textColor=colors.white, leading=14)
BODY  = style("body",  fontSize=8.5, leading=12, spaceAfter=2, textColor=DGRAY)
SCRPT = style("scrpt", fontName="Helvetica-Oblique", fontSize=8.5, leading=12, textColor=colors.HexColor("#222222"), leftIndent=8)
GOLDS = style("golds", fontName="Helvetica-BoldOblique", fontSize=8.5, leading=12, textColor=GOLD)

W = 7.4 * inch

def section_header(title):
    tbl = Table([[Paragraph(title, SEC)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), BLUE),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    return tbl

def row(label, response, highlight=False):
    bg = LGOLD if highlight else LGRAY
    lbl_style = style("ls", fontName="Helvetica-Bold", fontSize=8.5, leading=12,
                      textColor=GOLD if highlight else BLUE)
    tbl = Table([[Paragraph(label, lbl_style), Paragraph(response, SCRPT)]],
                colWidths=[2.3*inch, 5.1*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.white),
    ]))
    return tbl

def gold_line(text):
    tbl = Table([[Paragraph(f'★  {text}', GOLDS)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LGOLD),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.white),
    ]))
    return tbl

story = []
story.append(Paragraph("TRACTIFY — COLD CALL CHEAT SHEET", TITLE))
story.append(HRFlowable(width=W, thickness=2, color=NAVY, spaceAfter=10))

# 1. OPENERS
story.append(section_header("1  OPENERS — First 5 Seconds"))
story.append(Spacer(1, 3))
for o, r in [
    ("Specific intel opener\n(BEST — use this first)", '"I looked up [Business] before calling — your website is serving gambling content now. Someone bought your old domain. Did you know that?"'),
    ("No website opener", '"You\'ve got [X] five-star reviews but no website. Every customer who Googles you finds nothing."'),
    ("Voicemail/called before\nopener ⭐", '"I\'ve actually tried reaching you a couple times — and honestly that\'s kind of why I\'m calling. If I\'m struggling to get through, how many customers gave up and called someone else?"'),
    ("Permission opener", '"I\'ll be straight — this is a cold call. I\'ll keep it under a minute. Fair?"'),
]:
    story.append(row(o, r))
story.append(Spacer(1, 8))

# 2. INSTANT SHUTDOWNS
story.append(section_header("2  INSTANT SHUTDOWNS — Recover Before They Hang Up"))
story.append(Spacer(1, 3))
for o, r in [
    ("\"Are you with marketing?\"\n⭐ NEW — memorize this", '"No — I actually called because I found something specific about your business. Takes 30 seconds — can I tell you what I found?"'),
    ("\"I\'m not interested\"\n(before you\'ve said anything)", '"Totally fair — I\'d just take 20 seconds. I found something about [Business] specifically that I think you\'d want to know."'),
    ("Hangs up immediately", "Don\'t call back same day. Text instead: \"Sorry to miss you — found something about [Business] worth a look. Can I send it over?\""),
]:
    story.append(row(o, r, highlight=True))
story.append(Spacer(1, 8))

# 3. OBJECTIONS
story.append(section_header("3  OBJECTIONS — Mid-Call Comebacks"))
story.append(Spacer(1, 3))
for o, r in [
    ("\"Don\'t need a website /\nbeen fine without one\"", '"Word of mouth is great. But you\'re the one answering every call, right? Every job you\'re on a roof — that call goes to voicemail. That customer doesn\'t wait. They Google the next guy."'),
    ("\"I already have a website\"", '"I know — I looked at it. That\'s actually why I\'m calling." [name the specific flaw]'),
    ("\"We get all our work\nfrom referrals\"", '"Referrals are gold. But when they Google you to verify you\'re legit before calling — what do they find?"'),
    ("\"I\'m too busy right now\"", '"That\'s the best problem to have. This is for when things slow down — and they always do."'),
    ("\"How much does it cost?\"", '"Nothing right now — I\'m doing two free buildouts for case studies. That\'s why I\'m calling you specifically."'),
    ("\"Send me some info\"", '"I could, but an email won\'t show you anything. Can I send you a link to the live demo instead — takes 30 seconds to see it?"'),
    ("\"Not looking for an app\"", '"It\'s not an app they download — it\'s a booking link. They pick a time, it goes on your calendar. No phone tag."'),
    ("\"I have to take every call\nmyself — I don\'t know\nhow long jobs will take\" ⭐", '"That\'s exactly the problem I\'m solving. Right now if you\'re on a job that runs long, customers can\'t reach you and they move on. With this, you set your available time slots — Tuesday 2pm, Thursday 10am, whatever works for you. Customers pick from what you have open. You\'re still controlling your schedule, you\'re just not stuck by the phone."'),
    ("They have a voice agent\n(auto-attendant) ⭐", '"I noticed you have a voice agent — so you already know missed calls cost you jobs. The difference with what I\'m building is customers don\'t just leave a message, they actually book a time slot right there. No callback needed."'),
]:
    story.append(row(o, r))
story.append(Spacer(1, 8))

# 4. CLOSES
story.append(section_header("4  CLOSES — Moving Them Forward"))
story.append(Spacer(1, 3))
for o, r in [
    ("Case study close", '"I\'m not gonna charge you, ever. The only catch is I can use the results as proof for other contractors. You in?"'),
    ("Demo text close", '"Do you have two minutes? I\'ll text you a link right now — fill it out yourself and see what your customers would see. Can I send that now?"'),
    ("Scarcity close", '"I only have two free spots open. Are you someone who wants to move on this or should I keep going down my list?"'),
    ("Mock-up offer\n(lukewarm prospects)", '"Let me build a one-page mock of what your site could look like. No commitment. If you hate it, you never hear from me again."'),
]:
    story.append(row(o, r))
story.append(Spacer(1, 8))

# 5. GOLD LINES
story.append(section_header("5  GOLD LINES — Drop These Anywhere"))
story.append(Spacer(1, 3))
for g in [
    "I called 6 HVAC companies this morning. One picked up. Are you the one that picked up, or are you the five that didn't?",
    "Your customers are doing the same thing I just did — and when they can't reach you, they don't call back. They Google the next guy.",
    "You've got [X] five-star reviews. That's years of earned trust. Your website should close the deal. Right now it's doing nothing.",
    "Every call you miss while you're on a roof — that job went to someone else.",
    "Word of mouth built your business. A booking link keeps it from leaking.",
    "A voice agent is a fancy voicemail. Customers still can\'t book — they still have to wait for you to call back. That\'s the gap.",
    "I'm not selling you software. I'm handing you booked appointments.",
]:
    story.append(gold_line(g))
story.append(Spacer(1, 8))

# 6. CALL FLOW
story.append(section_header("6  CALL FLOW — 3-Minute Map"))
story.append(Spacer(1, 3))
flow_tbl = Table([
    ["0:00–0:15", "Opener with specific intel. Get a laugh or a reaction."],
    ["0:15–0:45", "One question: are you the one taking every call yourself? Let them answer."],
    ["0:45–1:30", "Drop the bottleneck pain point. Sit on it. Then pivot to the product in one sentence."],
    ["1:30–2:00", "Case study offer. Be honest — you need the proof, they get it free."],
    ["2:00–2:30", "Ask to send the demo link right now. Get a yes while they're on the phone."],
    ["2:30–3:00", "Confirm number for text. Thank them. Get off the phone."],
], colWidths=[1.1*inch, 6.3*inch])
flow_tbl.setStyle(TableStyle([
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("TEXTCOLOR", (0,0), (0,-1), BLUE),
    ("TEXTCOLOR", (1,0), (1,-1), DGRAY),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [LGRAY, colors.white]),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.white),
]))
story.append(flow_tbl)
story.append(Spacer(1, 8))

# 7. AFTER THE CALL
story.append(section_header("7  AFTER THE CALL"))
story.append(Spacer(1, 3))
for o, r in [
    ("Verbal yes — send demo", "Text within 5 minutes: demo site link + spam warning text"),
    ("No answer / voicemail", "Log it. Call again Day 5. Use voicemail-as-pain-point opener when they pick up."),
    ("Voicemail word to avoid ⭐", "Never say \"system\" — it sounds like software and triggers resistance. Say: \"something that lets customers book with you directly when they can\'t get through on the phone.\""),
    ("Texted back / not now", "Reply: \"No worries — I'll try you again tomorrow.\" Then do it."),
    ("\"Are you with marketing?\" callback", "Immediate redirect: \"No — found something specific about your business. 30 seconds?\" Don't pause."),
    ("Spam warning text", "\"You'll get a confirmation email from bookings@tractifyhq.com — if you don't see it, check spam and mark not spam.\""),
]:
    story.append(row(o, r))

doc.build(story)
print("Done.")

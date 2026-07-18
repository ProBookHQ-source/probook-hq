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
INDIGO = colors.HexColor("#4F46E5")
LGRAY = colors.HexColor("#f0f4f9")
DGRAY = colors.HexColor("#444444")
GOLD  = colors.HexColor("#7a5c00")
LGOLD = colors.HexColor("#fff8e1")
GREEN = colors.HexColor("#065F46")
LGREEN = colors.HexColor("#D1FAE5")
RED   = colors.HexColor("#7F1D1D")
LRED  = colors.HexColor("#FEE2E2")

def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9, leading=13, textColor=DGRAY, spaceAfter=2)
    base.update(kw)
    return ParagraphStyle(name, **base)

TITLE = style("title", fontName="Helvetica-Bold", fontSize=15, textColor=NAVY, leading=18, spaceAfter=2, alignment=TA_CENTER)
SUB   = style("sub", fontSize=8.5, textColor=BLUE, leading=12, spaceAfter=6, alignment=TA_CENTER)
SEC   = style("sec",   fontName="Helvetica-Bold", fontSize=10, textColor=colors.white, leading=14)
BODY  = style("body",  fontSize=8.5, leading=12, spaceAfter=2, textColor=DGRAY)
SCRPT = style("scrpt", fontName="Helvetica-Oblique", fontSize=8.5, leading=12, textColor=colors.HexColor("#222222"), leftIndent=8)
GOLDS = style("golds", fontName="Helvetica-BoldOblique", fontSize=8.5, leading=12, textColor=GOLD)
GREENS = style("greens", fontName="Helvetica-BoldOblique", fontSize=8.5, leading=12, textColor=GREEN)
REDS  = style("reds", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=RED)

W = 7.4 * inch

def section_header(title, color=BLUE):
    tbl = Table([[Paragraph(title, SEC)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), color),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    return tbl

def row(label, response, highlight=False, green=False):
    if green:
        bg = LGREEN
        lbl_style = style("ls", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=GREEN)
    elif highlight:
        bg = LGOLD
        lbl_style = style("ls", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=GOLD)
    else:
        bg = LGRAY
        lbl_style = style("ls", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=BLUE)
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

def green_line(text):
    tbl = Table([[Paragraph(f'✓  {text}', GREENS)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LGREEN),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.white),
    ]))
    return tbl

def red_line(text):
    tbl = Table([[Paragraph(f'✗  {text}', REDS)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LRED),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.white),
    ]))
    return tbl

story = []
story.append(Paragraph("TRACTIFY — COLD CALL CHEAT SHEET", TITLE))
story.append(Paragraph("tractifyhq.com/schedule/jose  ·  July 2026", SUB))
story.append(HRFlowable(width=W, thickness=2, color=NAVY, spaceAfter=8))

# ── SECTION 1: THE OPENER ─────────────────────────────────────────────────────
story.append(section_header("1  THE OPENER — Say This. Then Stop."))
story.append(Spacer(1, 3))
story.append(row("THE LINE ⭐", '"Hey [name], my name\'s Jose — quick question, are you currently buying booked jobs?"'))
story.append(row("After you say it", "STOP. Let them respond. The silence is intentional. Do not fill it."))
story.append(Spacer(1, 8))

# ── SECTION 2: THE TWO PATHS ──────────────────────────────────────────────────
story.append(section_header("2  THE TWO PATHS"))
story.append(Spacer(1, 3))

story.append(row('IF NO or "not interested"', '"No worries at all. I\'ll tell you what — save my number. When you\'re ready to have jobs booking straight onto your calendar automatically, call me back and I\'ll hand you the first 5 for free. No strings."', green=True))
story.append(row("→ Then", "Hang up. Do not pitch. Do not chase. You planted a seed.", green=True))
story.append(Spacer(1, 4))

story.append(row('IF YES or any curiosity', '"Perfect. Customers find you, pick a time that works for you, and it books straight onto your calendar. No missed calls, no phone tag, no chasing. Just jobs showing up while you\'re on the job site."', highlight=True))
story.append(row("→ Pause 2 seconds. Then:", '"We\'re plugging in 2 contractors in Seattle right now, completely free — first 5 booked jobs on us, zero risk on your end. You got 15 minutes this week to see how it works?"', highlight=True))
story.append(Spacer(1, 4))

story.append(row('IF MURKY — "what do you mean?" / "how does that work?"',
    '"Basically — customers find you, pick a time from your calendar, and it books automatically. You just show up to the job. No back and forth. We\'re proving it free with 2 contractors in Seattle right now. You\'d be the second. 15 minutes this week?"'))
story.append(Spacer(1, 8))

# ── SECTION 3: VOICEMAIL ──────────────────────────────────────────────────────
story.append(section_header("3  VOICEMAIL — Under 20 Seconds"))
story.append(Spacer(1, 3))
story.append(row("LEAVE THIS", '"Hey [name], Jose here. Save my number — when you\'re ready to have jobs booking onto your calendar automatically, call me back and I\'ll give you the first 5 for free."'))
story.append(row("Rule", "Short. No explaining. No pitching. Just the outcome and the offer."))
story.append(Spacer(1, 8))

# ── SECTION 4: THE SALES CALL CLOSE ──────────────────────────────────────────
story.append(section_header("4  THE SALES CALL OPENER — Say This Before Anything Else", INDIGO))
story.append(Spacer(1, 3))
story.append(row("OPEN WITH ⭐⭐", '"Before I say anything — you just booked this call the exact same way your customers are going to book jobs with you. That\'s the whole product right there."'))
story.append(row("Why it works", "They already experienced the product. Everything after this is just answering questions."))
story.append(Spacer(1, 8))

# ── SECTION 5: OBJECTIONS ─────────────────────────────────────────────────────
story.append(section_header("5  OBJECTIONS"))
story.append(Spacer(1, 3))
for o, r in [
    ('"How much does it cost?"',
     '"Nothing right now — we\'re doing 2 free buildouts for case studies. First 5 booked jobs on us. If you love it, we keep going. If not, no hard feelings."'),
    ('"Send me some info"',
     '"Totally — the fastest way to actually see it is a 15-minute call. I can walk you through it live. You got time this week?"'),
    ('"I take every call myself —\nI don\'t know how long jobs run"',
     '"That\'s exactly the problem. When you\'re on a job that runs long, customers can\'t reach you and they move on. With this, you set your open time slots — Tuesday 2pm, Thursday 10am, whatever. Customers pick from what you have open. You control the schedule, you\'re just not stuck by the phone."'),
    ("They have a voice agent\n/ auto-attendant ⭐",
     '"A voice agent is a fancy voicemail. Customers still can\'t book — they still have to wait for you to call back. This gets booked jobs onto your calendar automatically."'),
    ('"We get all our work\nfrom referrals"',
     '"Referrals are gold. This doesn\'t replace them — it captures the ones that can\'t reach you while you\'re on a job."'),
    ('"I\'m too busy right now"',
     '"That\'s the best problem to have. This is for when it slows down — and it always does eventually."'),
    ('"I already have online booking"',
     '"Is it live availability or preset windows? The difference is if you\'re booked Tuesday morning, customers can\'t pick Tuesday morning. It syncs automatically with your actual schedule."'),
]:
    story.append(row(o, r))
story.append(Spacer(1, 8))

# ── SECTION 6: THE OFFER ──────────────────────────────────────────────────────
story.append(section_header("6  THE OFFER — Never Change This"))
story.append(Spacer(1, 3))
story.append(green_line("First 5 booked jobs FREE — zero cost to them, zero cost to you"))
story.append(green_line("Live on a Tractify subdomain — no domain purchase needed until they convert"))
story.append(green_line("After they convert: $2,000 setup + $500/month retainer"))
story.append(green_line("Send them to: tractifyhq.com/schedule/jose — every time, no exceptions"))
story.append(Spacer(1, 8))

# ── SECTION 7: THE RULES ──────────────────────────────────────────────────────
story.append(section_header("7  THE RULES — NEVER BREAK THESE"))
story.append(Spacer(1, 3))
story.append(red_line('NEVER say "website", "system", or "software" — only say "booked jobs" and "your calendar"'))
story.append(red_line("NEVER chase a NO — plant the seed and hang up. Confidence is everything."))
story.append(red_line("NEVER explain how it works on the cold call — sell the outcome only"))
story.append(Spacer(1, 4))
story.append(green_line("ALWAYS get them to book at tractifyhq.com/schedule/jose — the demo is the close"))
story.append(green_line("ALWAYS offer the same thing: first 5 free, no strings, just want the case study"))
story.append(Spacer(1, 8))

# ── SECTION 8: GOLD LINES ─────────────────────────────────────────────────────
story.append(section_header("8  GOLD LINES — Drop These Anywhere"))
story.append(Spacer(1, 3))
for g in [
    "Every call you miss while you're on a job — that customer didn't wait. They called the next guy.",
    "A voice agent is a fancy voicemail. Customers still can't book — they still have to wait for you to call back.",
    "You set your available hours. We do the rest. Jobs show up on your calendar automatically.",
    "No missed calls. No phone tag. No back and forth. Just jobs.",
    "Word of mouth built your business. This keeps it from leaking.",
    "You just booked this call the exact same way your customers will book jobs with you.",
    "I'm not selling you a website. I'm handing you booked appointments.",
]:
    story.append(gold_line(g))
story.append(Spacer(1, 8))

# ── SECTION 9: AFTER THE CALL ─────────────────────────────────────────────────
story.append(section_header("9  AFTER THE CALL"))
story.append(Spacer(1, 3))
for o, r in [
    ("They agreed to a call", "Send tractifyhq.com/schedule/jose immediately — get them to book while you're still on the phone if possible."),
    ("No answer / voicemail", "Log it. Call again in 2-3 days. New opener: \"I left you a voicemail a few days ago about booked jobs — did you get a chance to hear it?\""),
    ("\"Call me back later\"", "Text within the hour: \"Hey [name], Jose here — following up on booked jobs for HVAC contractors. tractifyhq.com/schedule/jose when you're ready.\""),
    ("Spam warning", "\"You'll get a confirmation from bookings@tractifyhq.com — if you don't see it, check spam.\""),
    ("HOT PROSPECTS — follow up July 20", "Zach (McFarland HVAC) — verbal yes July 14. Justin — callback scheduled, score 8/10. Rusty (Cool Heat 365) — direct cell, call after 12pm."),
]:
    story.append(row(o, r))

doc.build(story)
print("Done.")

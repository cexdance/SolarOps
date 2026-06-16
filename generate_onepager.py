"""
SolarOps One-Pager PDF — v4
Graphic-proposal-reviewer applied:
  - Gold CTA (amber bg, dark text) — unique action zone, not another blue band
  - Quote on dark navy — dramatic break, eliminates consecutive-light-section blur
  - Security on blue-50 tint — distinct from white capabilities section
  - Letter-spaced section labels for clear typographic hierarchy
  - Increased card internal padding
  - Number badge repositioned top-left with color
  - Integrations: identical card treatment, both on white with colored left accent
  - Tight 3-color system: navy / gold / blue — no green, no inconsistency
  - Dark/light rhythm: NAVY | WARM | WHITE | NAVY | BLUE-TINT | WHITE | NAVY | GOLD | NAVY
"""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white as WHITE

# ── Palette: 3 intentional colors + neutrals ──────────────────
NAVY  = HexColor('#0F172A')   # header, tiers, quote, footer
N800  = HexColor('#1E293B')   # tier cards
N700  = HexColor('#334155')
N600  = HexColor('#475569')
N400  = HexColor('#94A3B8')
N300  = HexColor('#CBD5E1')
N200  = HexColor('#E2E8F0')
N100  = HexColor('#F1F5F9')
BLUE  = HexColor('#2563EB')   # feature titles, pills, security
B700  = HexColor('#1D4ED8')
B100  = HexColor('#DBEAFE')
B50   = HexColor('#EFF6FF')   # security section bg
GOLD  = HexColor('#F59E0B')   # all accents + CTA background
G800  = HexColor('#92400E')   # CTA text dark on gold
G200  = HexColor('#FDE68A')
G100  = HexColor('#FEF3C7')
WARM  = HexColor('#FFFDF7')   # hero section — subtle warmth
WH    = WHITE

W, H = letter
OUT  = '/Users/cex/SolarOps÷/SolarOps_OnePager.pdf'

c = canvas.Canvas(OUT, pagesize=letter)
c.setTitle("SolarOps — Consolidated Operations Management Suite")
c.setAuthor("Conexsol Energy")
c.setSubject("Product One-Pager 2026")

# ── Primitives ─────────────────────────────────────────────────
def rect(x, y, w, h, fill=None, stroke=None, lw=0.5):
    if fill:   c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(lw)
    c.rect(x, y, w, h, fill=1 if fill else 0, stroke=1 if stroke else 0)

def rr(x, y, w, h, r=5, fill=None, stroke=None, lw=0.5):
    if fill:   c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(lw)
    else:      c.setLineWidth(0)
    p = c.beginPath(); p.roundRect(x, y, w, h, r)
    c.drawPath(p, fill=1 if fill else 0, stroke=1 if stroke else 0)

def txt(s, x, y, font="Helvetica", size=9, color=N700, align="left",
        charspace=0):
    c.setFillColor(color)
    c.setFont(font, size)
    if charspace:
        c._charSpace = charspace
    {"right":   c.drawRightString,
     "center":  c.drawCentredString}.get(align, c.drawString)(x, y, s)
    if charspace:
        c._charSpace = 0

def sec_label(text, x, y, light=False):
    """Unified section label: gold square + letter-spaced bold caps."""
    rect(x, y + 1, 3, 9, fill=GOLD)
    txt(text, x + 8, y, "Helvetica-Bold", 7.5,
        WH if light else N700, charspace=1.2)

# ── Section heights (bottom-up, total = 792) ──────────────────
# NAVY/DARK rhythm creates clear dark–light–dark–light–dark–gold–dark
# FOT  y=0    h=28   navy
# CTA  y=28   h=72   GOLD  ← action zone, unmistakable
# QUO  y=100  h=42   navy  ← drama break
# INT  y=142  h=56   white
# SEC  y=198  h=96   blue-50 tint
# ACC  y=294  h=110  navy
# CAP  y=404  h=208  white
# HRO  y=612  h=56   warm
# HDR  y=668  h=124  navy
# SUM: 28+72+42+56+96+110+208+56+124 = 792 ✓

M  = 24
G  = 10
CW = (W - M*2 - G) / 2      # ~277pt per column
TW = (W - M*2 - G*2) / 3    # ~184pt per tier

# ══════════════════════════════════════════════════════════
# HEADER  y=668  h=124  navy
# ══════════════════════════════════════════════════════════
rect(0, 668, W, 124, fill=NAVY)
rect(0, 788, W, 4,   fill=GOLD)   # gold top stripe

# Diagonal texture
c.saveState()
c.setStrokeColor(HexColor('#1E293B')); c.setLineWidth(0.4)
for i in range(-40, int(W)+80, 22):
    c.line(i, 668, i+124, 792)
c.restoreState()

# Wordmark
txt("SOLAR", M, 750, "Helvetica-Bold", 36, WH)
sw = c.stringWidth("SOLAR", "Helvetica-Bold", 36)
txt("OPS", M+sw, 750, "Helvetica-Bold", 36, GOLD)

# Descriptor — plain, letter-spaced
txt("CONSOLIDATED OPERATIONS MANAGEMENT SUITE",
    M, 730, "Helvetica", 6.5, N400, charspace=0.8)

# Solar-specific tagline — right
txt("From first lead to final invoice —",
    W-M, 756, "Helvetica-Bold", 12, WH, "right")
txt("every job, alert, and margin in one place.",
    W-M, 740, "Helvetica", 10.5, N400, "right")

# Gold underline under tagline
tl_w = c.stringWidth("every job, alert, and margin in one place.",
                      "Helvetica", 10.5)
c.setStrokeColor(GOLD); c.setLineWidth(1.5)
c.line(W-M-tl_w, 736, W-M, 736)

# Meta — no divider line
txt("Conexsol Energy  |  Miami, FL",
    M, 678, "Helvetica", 7, N400)
txt("conexsol.us", W-M, 678, "Helvetica", 7, GOLD, "right")

# ══════════════════════════════════════════════════════════
# HERO  y=612  h=56  warm white
# ══════════════════════════════════════════════════════════
rect(0, 612, W, 56, fill=WARM)

# Intro — gold left rule
intro_lines = [
    "The consolidated management suite for solar companies that need full",
    "visibility across every team, every job, and every dollar, in real time.",
]
rect(M, 622, 3, len(intro_lines)*14, fill=GOLD)
c.setFillColor(N600); c.setFont("Helvetica", 8.5)
for i, ln in enumerate(intro_lines):
    c.drawString(M+8, 646 - i*14, ln)

# Stat pills
pills = [("8", "Workflows"), ("3", "Access Tiers"), ("2", "Integrations")]
for i, (num, label) in enumerate(pills):
    px = W-M-202 + i*68
    rr(px, 622, 60, 30, 5, fill=B50, stroke=BLUE, lw=0.75)
    txt(num,   px+30, 642, "Helvetica-Bold", 13, BLUE, "center")
    txt(label, px+30, 627, "Helvetica",       7,  N600, "center")

# ══════════════════════════════════════════════════════════
# CAPABILITIES  y=404  h=208  white
# ══════════════════════════════════════════════════════════
rect(0, 404, W, 208, fill=WH)

sec_label("WHAT SOLAROPS MANAGES", M, 598)

caps = [
    ("Sales and CRM",
     "Gamified pipeline with XP, levels, and leaderboard.",
     "Every prospect tracks to a full 360-degree customer record."),
    ("New Installations",
     "From signed contract to commissioned system.",
     "Camera-first field updates sync in real time from any phone."),
    ("Operations and Maintenance",
     "Eight-stage work-order pipeline with per-job margin.",
     "Labor, parts, and revenue calculated before the job closes."),
    ("Service Dispatch",
     "SolarEdge alerts arrive ranked by severity.",
     "One tap to acknowledge and dispatch before the customer calls."),
    ("Contractor Management",
     "Dedicated portal for onboarding, reporting, and invoicing.",
     "Clean separation from internal operations by design."),
    ("Inventory",
     "Equipment, tools, and providers in one view.",
     "Stock confirmed before the truck leaves the yard."),
    ("Client Profitability",
     "Revenue, cost, and margin tracked per customer.",
     "Growth accounts and margin drains visible at a glance."),
    ("Billing and Quotes",
     "Branded invoices with one-click customer quote approval.",
     "Payments sync automatically to Xero."),
]

CARD_H = 46
top    = 585

for idx, (title, l1, l2) in enumerate(caps):
    row = idx // 2
    col = idx % 2
    cx  = M + col*(CW+G)
    cy  = top - row*(CARD_H+4)

    rr(cx, cy-CARD_H+8, CW, CARD_H, 5, fill=WH, stroke=N200, lw=0.5)

    # Gold index badge top-left
    rr(cx+10, cy-3, 16, 12, 2, fill=GOLD)
    txt(f"0{idx+1}" if idx < 9 else str(idx+1),
        cx+18, cy-0.5, "Helvetica-Bold", 6.5, NAVY, "center")

    # Blue title
    txt(title, cx+32, cy-3, "Helvetica-Bold", 8.5, BLUE)

    # Body — complete, normal weight
    txt(l1, cx+12, cy-17, "Helvetica", 7.5, N600)
    txt(l2, cx+12, cy-28, "Helvetica", 7.5, N400)

# ══════════════════════════════════════════════════════════
# ACCESS TIERS  y=294  h=110  navy
# ══════════════════════════════════════════════════════════
rect(0, 294, W, 110, fill=NAVY)

# Dot grid
c.saveState()
c.setFillColor(HexColor('#334155'))
for gx in range(int(M), int(W-M), 14):
    for gy in range(300, 398, 14):
        c.circle(gx, gy, 0.65, fill=1, stroke=0)
c.restoreState()

sec_label("THREE ACCESS LAYERS. ONE SYSTEM.", M, 390, light=True)
txt("Everyone sees exactly what they need to. Nothing more.",
    M+11, 378, "Helvetica", 7.5, N400)

# Admin=blue, Staff=gold, Contractors=slate — clean palette
tiers = [
    (BLUE, B50,  "ADMIN",
     "Full visibility across every module, team member,",
     "and financial record. Configure access and maintain",
     "full control over the entire operation."),
    (GOLD, G100, "STAFF",
     "Access only modules relevant to your role.",
     "Permissions set by admins, enforced automatically.",
     "No gatekeeping, no accidental exposure."),
    (N400, N100, "CONTRACTORS",
     "A separate portal for onboarding, field reporting,",
     "and invoicing. Isolated from internal operations",
     "and staff data by design."),
]

for i, (accent, card_bg, title, l1, l2, l3) in enumerate(tiers):
    tx = M + i*(TW+G)
    rr(tx, 300, TW, 72, 5, fill=N800)
    rect(tx, 368, TW, 4, fill=accent)          # color top bar
    # Role label
    txt(title, tx+10, 357, "Helvetica-Bold", 8.5, accent, charspace=0.8)
    for j, ln in enumerate([l1, l2, l3]):
        txt(ln, tx+10, 343-j*12, "Helvetica", 7, N400)

# ══════════════════════════════════════════════════════════
# SECURITY  y=198  h=96  blue-50 tint (distinct from white caps)
# ══════════════════════════════════════════════════════════
rect(0, 198, W, 96, fill=B50)
rect(M, 204, 3, 84, fill=BLUE)   # single left accent

sec_label("ENTERPRISE-GRADE SECURITY", M+7, 280)
txt("Built to pass a compliance review without preparation.",
    M+15, 268, "Helvetica-Oblique", 7.5, N600)

sec_pts = [
    ("End-to-end encryption",                " in transit and at rest"),
    ("Row-level database access control",    " per user and role"),
    ("JWT authentication",                   " with cryptographic session tokens"),
    ("API keys and secrets server-side only,", " never in browser code"),
    ("Contractor portal architecturally isolated", " from internal data"),
    ("Rate limiting and input validation",   " enforced on all endpoints"),
]

for i, (bold_part, rest) in enumerate(sec_pts[:3]):
    bx  = M+15; row = 252 - i*18
    c.setFillColor(BLUE); c.circle(bx, row+3, 2.5, fill=1, stroke=0)
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 7.5)
    bw = c.stringWidth(bold_part, "Helvetica-Bold", 7.5)
    c.drawString(bx+8, row, bold_part)
    c.setFillColor(N600); c.setFont("Helvetica", 7.5)
    c.drawString(bx+8+bw, row, rest)

for i, (bold_part, rest) in enumerate(sec_pts[3:]):
    bx  = W/2+4; row = 252 - i*18
    c.setFillColor(BLUE); c.circle(bx, row+3, 2.5, fill=1, stroke=0)
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 7.5)
    bw = c.stringWidth(bold_part, "Helvetica-Bold", 7.5)
    c.drawString(bx+8, row, bold_part)
    c.setFillColor(N600); c.setFont("Helvetica", 7.5)
    c.drawString(bx+8+bw, row, rest)

# ══════════════════════════════════════════════════════════
# INTEGRATIONS  y=142  h=56  white
# ══════════════════════════════════════════════════════════
rect(0, 142, W, 56, fill=WH)

sec_label("NATIVE INTEGRATIONS", M, 186)

# Identical visual treatment — only accent color differs
ints = [
    (BLUE, "SolarEdge Monitoring Platform",
     "Live alerts ranked by severity flow directly into dispatch and O&M.",
     "No tab-switching, no missed triggers, no manual export."),
    (GOLD, "Xero Accounting",
     "Invoices, payments, and reconciliation sync automatically.",
     "No manual entry, no duplicate data, no end-of-month scramble."),
]

for i, (accent, name, l1, l2) in enumerate(ints):
    ix = M + i*(CW+G)
    rr(ix, 146, CW, 38, 5, fill=WH, stroke=N200, lw=0.5)
    rect(ix, 146, 4, 38, fill=accent)
    txt(name, ix+13, 174, "Helvetica-Bold", 8.5, NAVY)
    txt(l1,   ix+13, 162, "Helvetica",       7.5, N600)
    txt(l2,   ix+13, 151, "Helvetica",       7.5, N400)

# ══════════════════════════════════════════════════════════
# QUOTE  y=100  h=42  navy — dramatic dark break
# ══════════════════════════════════════════════════════════
rect(0, 100, W, 42, fill=NAVY)

txt('"Stop reacting to what already happened.',
    W/2, 130, "Helvetica-Oblique", 8.5, N300, "center")
txt('Start operating on what is happening right now."',
    W/2, 118, "Helvetica-Oblique", 8.5, N300, "center")

# Gold center dot
c.setFillColor(GOLD); c.circle(W/2, 108, 2, fill=1, stroke=0)

# ══════════════════════════════════════════════════════════
# CTA  y=28  h=72  GOLD — unmistakable action zone
# ══════════════════════════════════════════════════════════
rect(0, 28, W, 72, fill=GOLD)

# Subtle diagonal texture on gold
c.saveState()
c.setStrokeColor(HexColor('#D97706')); c.setLineWidth(0.4)
for x0 in range(-60, int(W)+80, 16):
    c.line(x0, 28, x0+72, 100)
c.restoreState()

txt("See it on your own operation.",
    M, 82, "Helvetica-Bold", 14, NAVY)
txt("One session. Watch a live job move from dispatch to paid invoice, with margin calculated in front of you.",
    M, 68, "Helvetica", 7.5, N800)

# CTA button: navy on gold — high contrast, premium
rr(W-M-148, 36, 148, 28, 5, fill=NAVY)
txt("Book a walkthrough today",
    W-M-74, 47, "Helvetica-Bold", 8.5, GOLD, "center")

# ══════════════════════════════════════════════════════════
# FOOTER  y=0  h=28  navy
# ══════════════════════════════════════════════════════════
rect(0, 0, W, 28, fill=NAVY)
rect(0, 25, W, 3, fill=GOLD)

txt("Conexsol Energy  |  Miami, FL  |  conexsol.us",
    M, 8, "Helvetica", 7, N400)
txt("SolarOps  |  Consolidated Operations Management Suite",
    W-M, 8, "Helvetica", 7, N400, "right")

c.save()
print(f"Saved: {OUT}")

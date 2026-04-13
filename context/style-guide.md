# SolarOps — Style Guide
**ConexSol SolarOps Platform** · Internal Design System

---

## 1. Brand Identity

**Product Name:** SolarOps (ConexSol SolarOps Platform)  
**Tagline:** *Field-to-Office. One Platform.*  
**Voice:** Direct, technical, dependable. No fluff. Built for operators who move fast.

---

## 2. Color Palette

### Primary Colors

| Role | Name | Hex | Usage |
|---|---|---|---|
| Brand Primary | **Solar Gold** | `#F5A623` | CTAs, highlights, active states, badges |
| Brand Secondary | **Teal Cyan** | `#00B4CC` | Links, icons, secondary actions, tags |
| Surface Dark | **Deep Navy** | `#0D1B2A` | Page backgrounds, sidebars |
| Surface Mid | **Slate Blue** | `#1C2E42` | Cards, panels, modals |
| Surface Light | **Muted Steel** | `#2A3F56` | Table rows, hover states |

### Neutral Colors

| Role | Name | Hex |
|---|---|---|
| Text Primary | White | `#FFFFFF` |
| Text Secondary | Cool Gray | `#A8BDD0` |
| Text Muted | Dim Slate | `#5A7490` |
| Border | Panel Border | `#1E3148` |
| Divider | Subtle Line | `#162737` |

### Status / Semantic Colors

| Status | Color | Hex |
|---|---|---|
| Success | Leaf Green | `#22C55E` |
| Warning | Amber | `#F59E0B` |
| Error | Ember Red | `#EF4444` |
| Info | Sky Blue | `#38BDF8` |
| Inactive | Graphite | `#4B6280` |

### Gradients

```css
/* Hero / Header Background */
--gradient-hero: linear-gradient(135deg, #0D1B2A 0%, #1C2E42 100%);

/* Solar Gold Accent */
--gradient-gold: linear-gradient(90deg, #F5A623 0%, #FBBF24 100%);

/* Teal Accent */
--gradient-teal: linear-gradient(90deg, #00B4CC 0%, #06B6D4 100%);

/* Card Glow (hover) */
--gradient-card-glow: linear-gradient(145deg, #1C2E42 0%, #243347 100%);
```

---

## 3. Typography

### Typefaces

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / Headings | **DM Sans** | 700, 600 | Clean, geometric, bold authority |
| Body / UI | **IBM Plex Sans** | 400, 500 | Technical clarity, excellent at small sizes |
| Data / Monospace | **IBM Plex Mono** | 400, 500 | Serial numbers, IDs, inverter data, codes |

```css
/* Import */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

--font-display: 'DM Sans', sans-serif;
--font-body: 'IBM Plex Sans', sans-serif;
--font-mono: 'IBM Plex Mono', monospace;
```

### Type Scale

| Token | Size | Line Height | Weight | Usage |
|---|---|---|---|---|
| `--text-xs` | 11px | 1.4 | 500 | Labels, timestamps, badges |
| `--text-sm` | 13px | 1.5 | 400 | Table cells, secondary info |
| `--text-base` | 15px | 1.6 | 400 | Body text, descriptions |
| `--text-md` | 17px | 1.5 | 500 | Section labels, list items |
| `--text-lg` | 20px | 1.4 | 600 | Card titles, panel headers |
| `--text-xl` | 24px | 1.3 | 700 | Page titles |
| `--text-2xl` | 32px | 1.2 | 700 | Dashboard hero headings |
| `--text-3xl` | 40px | 1.1 | 700 | Landing / auth screens |

---

## 4. Spacing & Layout

### Spacing Scale (4px base grid)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

### Layout Tokens

```css
--sidebar-width: 240px;
--sidebar-collapsed: 64px;
--header-height: 60px;
--content-max-width: 1280px;
--panel-padding: 24px;
--card-padding: 20px;
--section-gap: 32px;
```

### Border Radius

```css
--radius-sm: 4px;    /* Inputs, small chips */
--radius-md: 8px;    /* Cards, dropdowns */
--radius-lg: 12px;   /* Modals, large panels */
--radius-xl: 16px;   /* Hero cards */
--radius-full: 9999px; /* Pills, avatars, badges */
```

---

## 5. Component Patterns

### Buttons

```css
/* Primary — Solar Gold */
.btn-primary {
  background: #F5A623;
  color: #0D1B2A;
  font-weight: 700;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
}

/* Secondary — Outlined Teal */
.btn-secondary {
  background: transparent;
  border: 1.5px solid #00B4CC;
  color: #00B4CC;
  border-radius: 8px;
  padding: 10px 20px;
}

/* Ghost — Dark Background */
.btn-ghost {
  background: #1C2E42;
  color: #A8BDD0;
  border-radius: 8px;
  padding: 10px 20px;
}

/* Danger */
.btn-danger {
  background: #EF4444;
  color: #FFFFFF;
}
```

### Cards — Trello-Style Board Cards

SolarOps work object cards (Work Orders, Customers, Leads, RMAs) follow a **Trello-style kanban card** pattern: compact, scannable, draggable within column lanes. Cards live inside column lists on a board view, but also appear as row-cards in list view.

#### Anatomy of a Card

```
┌──────────────────────────────────┐
│ ▓▓▓ COLOR LABEL BAR (optional)   │  ← 8px tall color strip, full width
├──────────────────────────────────┤
│  [COVER IMAGE]  (optional)        │  ← 120px tall, object-fit cover
├──────────────────────────────────┤
│  🏷 Tag  🏷 Tag                   │  ← label chips (category, priority)
│                                   │
│  Card Title (bold, 14px)          │  ← primary identifier
│  Subtitle / ID  (muted, 12px)     │  ← WO-2024-087 · John Morales
│                                   │
│  ─────────────────────────────── │  ← divider
│  📎 2   💬 3   ✓ 1/4   📅 Mar 12 │  ← metadata row (icons + counts)
│                              [👤] │  ← assigned avatar(s), right-aligned
└──────────────────────────────────┘
```

#### Base Card CSS

```css
/* ── Board Card (Trello style) ── */
.board-card {
  background: #1C2E42;
  border: 1px solid #1E3148;
  border-radius: 10px;
  padding: 10px 12px 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: grab;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 272px;      /* Trello standard column card width */
  box-sizing: border-box;
}

.board-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  transform: translateY(-1px);
  border-color: #2A3F56;
}

.board-card:active {
  cursor: grabbing;
  transform: rotate(1.5deg) scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  z-index: 999;
}

/* Dragging ghost */
.board-card--dragging {
  opacity: 0.5;
  border: 2px dashed #00B4CC;
}

/* Drop target highlight */
.board-card--drop-target {
  border: 2px solid #F5A623;
  background: rgba(245, 166, 35, 0.06);
}
```

#### Color Label Bar (top strip)

Mirrors Trello's colored label bars. Applied above the card content.

```css
.card-label-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 8px;
  border-radius: 10px 10px 0 0;
}

/* Label bar colors — map to work type or priority */
.card-label-bar--gold     { background: #F5A623; } /* High priority / Install */
.card-label-bar--teal     { background: #00B4CC; } /* Service call */
.card-label-bar--green    { background: #22C55E; } /* Completed / Active customer */
.card-label-bar--red      { background: #EF4444; } /* Urgent / RMA / Fault */
.card-label-bar--amber    { background: #F59E0B; } /* Pending / Follow-up */
.card-label-bar--sky      { background: #38BDF8; } /* Info / Lead */
.card-label-bar--graphite { background: #4B6280; } /* Inactive / On Hold */

/* If label bar present, offset card padding-top */
.board-card--has-label-bar {
  padding-top: 18px;
}
```

#### Cover Image (optional)

```css
.card-cover {
  margin: -10px -12px 10px;   /* bleed to card edges */
  height: 120px;
  overflow: hidden;
  border-radius: 10px 10px 0 0;
}

.card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

#### Label Chips (inline tags)

```css
.card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.card-chip {
  height: 8px;
  min-width: 40px;
  border-radius: 4px;
  display: inline-block;
  cursor: default;
}

/* Expanded chip (on hover shows text) */
.card-chip--expanded {
  height: auto;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #0D1B2A;
  border-radius: 4px;
  line-height: 1.6;
}

.card-chip--gold     { background: #F5A623; }
.card-chip--teal     { background: #00B4CC; }
.card-chip--green    { background: #22C55E; }
.card-chip--red      { background: #EF4444; }
.card-chip--amber    { background: #F59E0B; }
.card-chip--sky      { background: #38BDF8; }
.card-chip--graphite { background: #4B6280; color: #FFFFFF; }
```

#### Card Content

```css
.card-title {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.4;
  margin: 0 0 2px;
}

.card-subtitle {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #5A7490;
  margin: 0 0 8px;
}
```

#### Metadata Footer Row

```css
.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #162737;
}

.card-meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #5A7490;
}

.card-meta-item svg {
  width: 12px;
  height: 12px;
  stroke: #5A7490;
}

/* Due date — overdue state */
.card-meta-item--overdue {
  color: #EF4444;
}
.card-meta-item--overdue svg {
  stroke: #EF4444;
}

/* Due date — due soon */
.card-meta-item--due-soon {
  color: #F59E0B;
}

/* Checklist complete */
.card-meta-item--complete {
  color: #22C55E;
}

/* Avatars — right-aligned */
.card-avatars {
  margin-left: auto;
  display: flex;
  gap: -4px;
}

.card-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #1C2E42;
  background: #2A3F56;
  font-size: 10px;
  font-weight: 700;
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
}
```

#### Column List (Kanban Lane)

```css
.board-column {
  background: #162737;
  border-radius: 12px;
  padding: 12px;
  min-width: 272px;
  max-width: 272px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.board-column::-webkit-scrollbar { width: 4px; }
.board-column::-webkit-scrollbar-thumb { background: #2A3F56; border-radius: 4px; }

.board-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.board-column-title {
  font-size: 13px;
  font-weight: 700;
  color: #A8BDD0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.board-column-count {
  font-size: 11px;
  color: #5A7490;
  background: #1C2E42;
  padding: 1px 7px;
  border-radius: 9999px;
}

/* Add card button */
.board-column-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  color: #5A7490;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  margin-top: 4px;
}

.board-column-add:hover {
  background: #1C2E42;
  color: #A8BDD0;
}
```

#### Board Layout

```css
.board-view {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  overflow-x: auto;
  align-items: flex-start;
  min-height: calc(100vh - 120px);
}

.board-view::-webkit-scrollbar { height: 6px; }
.board-view::-webkit-scrollbar-thumb { background: #2A3F56; border-radius: 4px; }
```

#### Predefined Column Layouts by Module

**Work Orders Board**
```
[ New Request ] [ Scheduled ] [ In Progress ] [ Pending Parts ] [ Completed ] [ Closed ]
  gold bar         teal bar      amber bar         sky bar          green bar    graphite
```

**Leads / Sales Board**
```
[ New Lead ] [ Contacted ] [ Site Survey ] [ Proposal Sent ] [ Won ] [ Lost ]
  sky bar      teal bar      amber bar         gold bar        green   graphite
```

**Customer Accounts Board**
```
[ Prospect ] [ Active Install ] [ Monitoring ] [ Service Due ] [ Inactive ]
  sky            teal              green           amber          graphite
```

#### Stat / Metric Cards (non-board context)

Used in dashboards — not draggable, wider, fixed layout.

```css
.stat-card {
  background: #1C2E42;
  border: 1px solid #1E3148;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  border-left: 3px solid var(--accent-color, #F5A623);
}

.stat-card__label {
  font-size: 11px;
  font-weight: 600;
  color: #5A7490;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.stat-card__value {
  font-size: 28px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-card__delta {
  font-size: 12px;
  color: #22C55E;  /* green = positive delta */
}

.stat-card__delta--negative {
  color: #EF4444;
}
```

### Status Badges

```css
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge--active    { background: rgba(34,197,94,0.15);  color: #22C55E; }
.badge--pending   { background: rgba(245,158,11,0.15); color: #F59E0B; }
.badge--error     { background: rgba(239,68,68,0.15);  color: #EF4444; }
.badge--inactive  { background: rgba(75,98,128,0.2);   color: #A8BDD0; }
.badge--info      { background: rgba(56,189,248,0.15); color: #38BDF8; }
```

### Tables

```css
.table th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5A7490;
  border-bottom: 1px solid #1E3148;
  padding: 10px 16px;
}

.table td {
  font-size: 13px;
  color: #A8BDD0;
  padding: 12px 16px;
  border-bottom: 1px solid #162737;
}

.table tr:hover td {
  background: #1E3148;
}
```

### Form Inputs

```css
.input {
  background: #0D1B2A;
  border: 1.5px solid #1E3148;
  border-radius: 8px;
  color: #FFFFFF;
  font-size: 14px;
  padding: 10px 14px;
  font-family: var(--font-body);
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #00B4CC;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,180,204,0.15);
}

.input::placeholder {
  color: #5A7490;
}
```

---

## 6. Iconography

- **Icon Library:** [Lucide Icons](https://lucide.dev/) — consistent, sharp, minimal
- **Default Size:** 16px (UI), 20px (nav), 24px (feature icons)
- **Stroke Width:** 1.5px
- **Color:** Inherit from parent or use `--text-secondary` (`#A8BDD0`)
- **Active/Highlighted Icons:** Use `#F5A623` (Solar Gold) or `#00B4CC` (Teal)

### Key Icons by Module

| Module | Icon |
|---|---|
| Dashboard | `LayoutDashboard` |
| Customers / Accounts | `Users` |
| Work Orders | `ClipboardList` |
| Invoices | `FileText` |
| Leads | `Zap` |
| Field Technicians | `HardHat` |
| Inventory / Parts | `Package` |
| Inverters / Devices | `Cpu` |
| Settings | `Settings2` |
| Alerts / Warnings | `AlertTriangle` |
| Notifications | `Bell` |
| Solar / Energy | `Sun` |

---

## 7. Navigation

### Sidebar

- Background: `#0D1B2A`
- Width: `240px` (expanded), `64px` (collapsed)
- Logo area: `60px` height, Solar Gold wordmark
- Nav items: `14px`, `500` weight, `#A8BDD0` default, `#FFFFFF` hover
- Active item: Gold left border `3px solid #F5A623`, background `#1C2E42`
- Section labels: `11px`, `#5A7490`, uppercase, spaced

### Top Header

- Background: `#0D1B2A` with bottom border `1px solid #1E3148`
- Height: `60px`
- Contains: breadcrumb trail, global search, notification bell, user avatar

---

## 8. Data Visualization

Used for energy output, inverter status, ticket metrics, and revenue charts.

- **Library:** Recharts (React)
- **Background:** Transparent (renders on card surface `#1C2E42`)
- **Grid Lines:** `#1E3148` (subtle, 1px dashed)
- **Axis Labels:** `#5A7490`, `11px`, IBM Plex Sans
- **Tooltip:** `#0D1B2A` background, `#F5A623` label, border `#1E3148`

### Chart Color Order
1. `#F5A623` — Solar Gold (primary series)
2. `#00B4CC` — Teal (secondary series)
3. `#22C55E` — Green (positive / production)
4. `#EF4444` — Red (faults / negative)
5. `#38BDF8` — Sky (tertiary series)
6. `#A8BDD0` — Muted (background series)

---

## 9. Motion & Interaction

```css
/* Standard transition */
--transition-fast: 120ms ease;
--transition-base: 200ms ease;
--transition-slow: 350ms ease;

/* Hover lift (cards) */
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  transition: all var(--transition-base);
}

/* Button press */
.btn:active {
  transform: scale(0.97);
}

/* Fade-in (page load) */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-up {
  animation: fadeUp 0.3s ease forwards;
}
```

---

## 10. Responsive Breakpoints

```css
--bp-sm:  640px;   /* Mobile landscape */
--bp-md:  768px;   /* Tablet */
--bp-lg:  1024px;  /* Laptop / collapsed sidebar */
--bp-xl:  1280px;  /* Desktop */
--bp-2xl: 1536px;  /* Wide monitor */
```

Mobile behavior: sidebar collapses to bottom nav bar with 5 key icons (Dashboard, Accounts, Work Orders, Invoices, Menu).

---

## 11. Accessibility

- **Minimum contrast:** 4.5:1 for body text, 3:1 for large text / UI components
- **Focus rings:** `0 0 0 3px rgba(0,180,204,0.4)` on all interactive elements
- **Touch targets:** Minimum `44×44px` on mobile
- **ARIA labels:** Required on all icon-only buttons
- **Keyboard nav:** Full tab order on all modals, dropdowns, and forms

---

## 12. Writing & Content Style

| Context | Guideline |
|---|---|
| Button labels | Verb-first: *Save*, *Submit Work Order*, *Generate Invoice* |
| Empty states | Helpful, action-oriented: *No work orders yet — create one to get started.* |
| Error messages | Plain language: *Couldn't save. Check your connection and try again.* |
| Timestamps | Relative first: *3 hours ago* · Full on hover: *Mar 9, 2026 at 2:14 PM* |
| IDs / Serials | Monospace font, uppercase: `SE-INV-0042` |
| Status labels | Sentence case in badges: *Active*, *Pending*, *Closed* |
| Section headers | Title case: *Work Orders*, *Customer Accounts* |

---

## 13. File & Asset Naming

```
/assets
  /icons         → SVG icons, named kebab-case (solar-panel.svg)
  /logos         → conexsol-logo.svg, solarops-wordmark.svg
  /images        → background-mesh.png, hero-bg.jpg
  /fonts         → self-hosted fallbacks only

/components
  /ui            → Button, Card, Badge, Input, Modal, Table
  /layout        → Sidebar, TopBar, PageWrapper
  /modules       → WorkOrders, Invoices, Customers, Leads

/styles
  globals.css    → CSS variables, resets, base styles
  typography.css → Font imports, type utilities
```

---

*Style Guide v1.0 · ConexSol SolarOps Platform · March 2026*

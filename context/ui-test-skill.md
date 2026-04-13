# SolarOps UI/UX Test Skill
**Skill name:** `ui-test`
**Trigger:** Any request to test, audit, verify, or review the UI/UX of the SolarOps dashboard.

---

## 1. App Context

| Property | Value |
|---|---|
| App | SolarOps — Solar Field Operations Dashboard |
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (CSS variables theme) |
| Icons | Lucide React |
| Components | shadcn/ui (`/src/components/ui/`) |
| Dev server | `http://localhost:5173` |
| Prod URL | `https://solarflow-dashboard-sooty.vercel.app` |
| Test tool | Playwright via `mcp__playwright__browser_*` tools |

---

## 2. Authentication

| Role | Email | Password | Portal |
|---|---|---|---|
| Admin (staff) | `cesar.jurado@conexsol.us` | `1357` | Staff login |
| Admin (staff) | `mia.lopez@conexsol.us` | `123456789` | Staff login |
| Contractor | Use contractor portal | Set via Supabase | Contractor login |

**Staff login URL:** `http://localhost:5173` → default landing
**Contractor portal:** `http://localhost:5173?mode=contractor`

---

## 3. Viewport Breakpoints

| Label | Width | Height | Tailwind prefix |
|---|---|---|---|
| Mobile (iPhone 14) | 390px | 844px | `sm:` (640px+) |
| Tablet | 768px | 1024px | `md:` (768px+) |
| Laptop | 1280px | 800px | `lg:` (1024px+) |
| Desktop | 1440px | 900px | `xl:` (1280px+) |

**Test all four viewports for every major view change.**

---

## 4. Navigation Structure

### Staff Portal (role-based)

| Nav ID | Label | Roles |
|---|---|---|
| `dispatch` | Ops Center | admin, coo, tech, support |
| `dashboard` | Dashboard | admin, coo, tech, support |
| `jobs` | Work Orders | admin, coo, tech, support |
| `customers` | Customers | admin, coo, tech, support |
| `lobby` | Lead Lobby (sub) | admin, coo, support, sales |
| `solaredge` | SolarEdge Sites (sub) | admin, coo, support |
| `billing` | Billing | admin, coo |
| `contractor-billing` | Contractor Pay (sub) | admin, coo |
| `rates` | Service Rates (sub) | admin, coo |
| `technician` | Manage Work Orders | admin, coo, tech |
| `contractors` | Contractors | admin, coo |
| `projects` | New Install | admin, coo, support |
| `inventory` | Inventory | admin, coo, support |
| `settings` | Settings | admin, coo |
| `crm` | Sales CRM | sales |
| `customers2` | Clients | sales |

### Contractor Portal Screens
- Login page (`?mode=contractor`)
- Registration / Apply to join
- Contractor Dashboard (Kanban / List view)
- Job Detail
- Invoice submission
- Billing history

---

## 5. Test Checklist — Per View

Run this checklist for every view at every viewport:

### Layout
- [ ] No horizontal scrollbar at 390px (unless inside a scroll container)
- [ ] No content clipped by `overflow-hidden` without `overflow-x-auto`
- [ ] Sidebar collapses to hamburger on mobile
- [ ] Notification dropdown fits within viewport (`w-[calc(100vw-2rem)] sm:w-96`)

### Grid & Cards
- [ ] Stat cards: 1 col @ 390px → 2 col @ 640px → 4 col @ 1024px
- [ ] Form grids: 1 col @ 390px → 2 col @ 640px
- [ ] Kanban boards: 1 col @ 390px → 2 col @ 640px → 4 col @ 1280px
- [ ] Dashboard 2-col layout: stacked @ 390px → side-by-side @ 768px

### Tables
- [ ] All `<table>` elements wrapped in `overflow-x-auto` container
- [ ] `min-w-[Npx]` set on tables to prevent column collapse
- [ ] SolarEdge sites table scrolls horizontally on mobile
- [ ] Work Order parts table scrolls horizontally on mobile

### Touch Targets
- [ ] All buttons/links ≥ 44px tall (`min-h-[44px]`)
- [ ] Tab bar items ≥ 44px tall
- [ ] Forgot password link ≥ 44px tall
- [ ] Sidebar nav items ≥ 44px (check `py-2.5` min)

### Typography
- [ ] Text readable (min 14px body, 12px labels)
- [ ] No text truncated/overlapping unintentionally
- [ ] Long email/name strings use `truncate` or `break-all`

### Forms
- [ ] All inputs full-width on mobile
- [ ] Labels visible above inputs (not clipped)
- [ ] Error messages visible, not cut off
- [ ] Submit button full-width on mobile

### Modals & Panels
- [ ] Modals scroll internally if content exceeds viewport
- [ ] Side panels (`w-full md:w-[520px]`) go full-width on mobile
- [ ] Modal `max-h-[90vh] overflow-y-auto` set

---

## 6. Known Responsive Patterns (SolarOps)

```
Stat cards:      grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
Form 2-col:      grid grid-cols-1 sm:grid-cols-2 gap-4
Form 3-col:      grid grid-cols-1 sm:grid-cols-3 gap-4
Kanban 4-col:    grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4
Dashboard split: grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3
Side panel:      w-full md:w-[520px]
Lead detail:     w-full md:w-[460px]
Notification:    w-[calc(100vw-2rem)] max-w-sm sm:w-96
Photo grid:      grid grid-cols-2 sm:grid-cols-3 gap-2
```

---

## 7. Design System Reference

| Token | Value |
|---|---|
| Brand primary | Orange `#f97316` (`orange-500`) |
| Brand dark | Slate `#0f172a` (`slate-900`) |
| Background | `slate-50` (staff), `#0a0f1a` (contractor) |
| Card bg | `white` (staff), `slate-900/80` (contractor) |
| Border | `slate-200` (staff), `slate-700/60` (contractor) |
| Font | System default (Tailwind default stack) |
| Border radius | `rounded-xl` (cards), `rounded-lg` (inputs), `rounded-2xl` (contractor cards) |
| Shadow | `shadow-sm` (cards), `shadow-lg` (dropdowns), `shadow-2xl` (modals) |

---

## 8. How to Run a Test

### Quick smoke test (3 min)
```
1. Navigate to http://localhost:5173
2. Resize to 390x844
3. Login with cesar.jurado@conexsol.us / 1357
4. Click through: Dashboard → Work Orders → Customers → Inventory
5. Check console for errors
6. Take screenshots at each view
```

### Full audit (15 min)
```
1. Run quick smoke test at 390x844
2. Resize to 768x1024 — repeat navigation
3. Resize to 1440x900 — repeat navigation
4. Test contractor portal at ?mode=contractor at 390x844
5. Test modals: open Work Order panel → Parts tab → check table scroll
6. Test notification dropdown at 390px
7. Run mcp__playwright__browser_console_messages — check for JS errors
```

### Automated agent prompt template
```
Test the SolarOps app at http://localhost:5173

Login: cesar.jurado@conexsol.us / 1357

VIEWPORTS TO TEST: 390x844 (mobile), 768x1024 (tablet), 1440x900 (desktop)

For each viewport, navigate to: Dashboard, Work Orders, Customers, Inventory, Settings

CHECK:
- Horizontal overflow at 390px
- Stat card grid columns at each breakpoint
- No overlapping text or elements
- Touch targets ≥ 44px on mobile
- Sidebar hamburger visible at 390px
- Tables scroll horizontally on mobile

Take screenshots at each view+viewport combo.
Report PASS/FAIL per check with screenshot evidence.
```

---

## 9. UI/UX Best Practices (SolarOps Standard)

Based on industry standards from Webstacks (2025) and UI design research.

### P1 — Visual Hierarchy
- Use size, weight, and color to lead the eye: page title > section title > label > body > hint
- Primary CTA buttons use `orange-500` + `font-bold`; secondary actions use `slate-100 text-slate-700`
- Whitespace is intentional — do not collapse `space-y-6` or `gap-4` to save space

### P2 — Consistency
- Use the same button style for the same action type everywhere
- Orange = primary action, Slate = neutral, Red = destructive, Green = success
- Icons: always use Lucide React; never mix icon libraries
- All form labels: `text-xs font-semibold text-slate-500 uppercase tracking-wider`
- All card wrappers: `bg-white rounded-xl shadow-sm border border-slate-100`

### P3 — Mobile First
- Start every layout with `grid-cols-1`, add breakpoints up: `sm:` → `md:` → `lg:` → `xl:`
- Minimum tap target: **44×44px** — use `min-h-[44px]` on all interactive elements
- Thumb zone: place primary actions at **bottom or lower 60%** of screen on mobile
- No fixed widths without a mobile fallback — always pair `w-[Npx]` with `md:w-[Npx]`

### P4 — Feedback & States
- Every action >500ms must show a loading spinner (`animate-spin`)
- Success states: green banner or checkmark with message, auto-dismiss after 3s
- Error states: red `bg-red-50 border-red-200` inline message with `AlertCircle` icon
- Empty states: centered icon + descriptive text + action button (never a blank page)
- Disabled buttons: `disabled:opacity-60 disabled:cursor-not-allowed`

### P5 — Accessibility
- Color contrast: minimum 4.5:1 for body text, 3:1 for large text
- Never rely on color alone to convey state — always pair with icon or text
- All form inputs must have associated `<label>` elements
- Keyboard navigation: `focus:outline-none focus:ring-2 focus:ring-orange-400` on all inputs
- Use `aria-label` on icon-only buttons (Bell, X, Menu)

### P6 — Performance Perception
- Skeleton loaders preferred over spinners for page-level content
- Tables with >50 rows: add pagination or virtual scroll
- Images: always include `object-cover` and explicit dimensions
- Avoid layout shift — reserve space for dynamic content with `min-h-[Npx]`

### P7 — Information Density
- Mobile: show 1 primary metric per card; hide secondary info behind a tap
- Desktop: can show 3–4 data points per card
- Tables: hide non-critical columns on mobile with `hidden md:table-cell`
- Don't show more than 8 nav items at once — group with expandable sections (current pattern ✓)

### P8 — Typography Scale
```
Page title:    text-2xl font-bold text-slate-900
Section title: text-lg font-semibold text-slate-900
Card title:    text-sm font-semibold text-slate-700
Label:         text-xs font-semibold text-slate-500 uppercase tracking-wider
Body:          text-sm text-slate-700
Caption:       text-xs text-slate-400
Badge:         text-[10px] font-bold uppercase tracking-wide
```

### P9 — Form Design
- Group related fields visually with `space-y-4` between groups and a subtle divider
- Show inline validation — don't wait for submit
- Required fields: mark with `*` in label text, not just border color
- Long forms on mobile: use accordion/step sections, not one long scroll

### P10 — Dark Mode (Contractor Portal)
- Background: `#0a0f1a` (near-black blue)
- Cards: `bg-slate-900/80 backdrop-blur-sm border border-slate-700/60`
- Inputs: `bg-slate-800 border-slate-700 text-white placeholder-slate-500`
- Focus: `focus:border-orange-500 focus:ring-orange-500`
- Orange stays as the primary accent color across both portals
- Text hierarchy: `text-white` → `text-slate-300` → `text-slate-400` → `text-slate-500`

---

## 10. Files to Check During UI Work

| Component | Path | Notes |
|---|---|---|
| Main layout | `src/components/Layout.tsx` | Sidebar, header, notification panel |
| Dashboard | `src/components/Dashboard.tsx` | Stat cards, schedule grid |
| Work Orders | `src/components/WorkOrderPanel.tsx` | Side panel, tables, forms |
| Customers | `src/components/Customers.tsx` | List + detail panel |
| Customer detail | `src/components/CustomerManagement.tsx` | `w-full md:w-[520px]` panel |
| Lead Lobby | `src/components/LeadLobby.tsx` | `w-full md:w-[460px]` detail |
| Inventory | `src/components/InventoryModule.tsx` | Stats cards, form modals |
| SolarEdge | `src/components/SolarEdgeMonitoring.tsx` | Data table with `overflow-x-auto` |
| CRM | `src/components/CRMDashboard.tsx` | Pipeline kanban, stats |
| Dispatch | `src/components/DispatchDashboard.tsx` | Timeline, kanban |
| Contractor login | `src/components/contractor/ContractorLoginScreen.tsx` | Dark theme |
| Contractor dashboard | `src/components/contractor/ContractorDashboard.tsx` | Mobile-first view |
| Staff login | `src/App.tsx` | `LoginScreen` component inline |
| Global styles | `src/index.css` | Tailwind v4 theme tokens |

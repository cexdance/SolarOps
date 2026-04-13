# SolarFlow SaaS Dashboard — Module Design Guide
*(ConexSol SolarOps Platform — UI/UX Design Reference)*

---

## I. Core Design Philosophy & Strategy

* [ ] **Users First:** Prioritize user needs, workflows, and ease of use in every design decision.
* [ ] **Meticulous Craft:** Aim for precision, polish, and high quality in every UI element and interaction.
* [ ] **Speed & Performance:** Design for fast load times and snappy, responsive interactions.
* [ ] **Simplicity & Clarity:** Strive for a clean, uncluttered interface. Ensure labels, instructions, and feedback are clear. Make sure all connections to bottons and actions are working.
* [ ] **Focus & Efficiency:** Help users achieve their goals quickly and with minimal friction. Minimize unnecessary steps.
* [ ] **Consistency:** Maintain a uniform design language (colors, typography, components, patterns).
* [ ] **Accessibility (WCAG AA+):** Design for inclusivity. Ensure sufficient color contrast, keyboard navigation, and screen-reader support.
* [ ] **Opinionated Design (Thoughtful Defaults):** Establish clear, efficient default workflows and settings.

---

## II. Design System Foundation

* [ ] **Color Palette:** Define primary brand colors from our corporate website www.comexsol.com, neutrals (5–7 gray steps), and semantic colors (success, error, warning, info). Verify WCAG AA contrast ratios.
* [ ] **Typography System:** Define type scale (H1–H6, Body, Caption, Labels), font weights (Regular, Medium, Semibold, Bold), and line height/spacing.
* [ ] **Spacing System:** Use a 4px base unit with a consistent scale (4, 8, 12, 16, 24, 32, 48, 64px).
* [ ] **Border Radii:** Small (4–6px), Medium (8px), Large (12–16px), Full (pills/badges).
* [ ] **Shadow & Elevation:** Define shadow levels for Cards, Dropdowns, Modals, and Tooltips.
* [ ] **Dark Mode Palette:** Create a fully accessible dark mode using deep navy/charcoal base.

---

## III. Layout & Structure

* [ ] **Responsive Grid System:** 12-column layout with consistent gutters.
* [ ] **Dashboard Layout Pattern:**
    * [ ] Persistent Left Sidebar: For primary navigation between modules.
    * [ ] Content Area: Main space for module-specific interfaces.
    * [ ] (Optional) Top Bar: For global search, user profile, notifications.
* [ ] **Mobile-First Considerations:** Ensure the design adapts gracefully to smaller screens.

---

## IV. Interaction Design & Animations

* [ ] **Purposeful Micro-interactions:** Use subtle animations and visual feedback for user actions (hovers, clicks, form submissions, status changes).
    * [ ] Feedback should be immediate and clear.
    * [ ] Animations should be quick (150–300ms) and use appropriate easing (e.g., ease-in-out).
* [ ] **Loading States:** Implement clear loading indicators (skeleton screens for page loads, spinners for in-component actions).
* [ ] **Transitions:** Use smooth transitions for state changes, modal appearances, and section expansions.
* [ ] **Avoid Distraction:** Animations should enhance usability, not overwhelm or slow down the user.
* [ ] **Keyboard Navigation:** Ensure all interactive elements are keyboard accessible and focus states are clearly visible.

---

## V. Specific Module Design Tactics

### A. Multimedia Moderation Module

* [ ] **Clear Media Display:** Prominent image/video previews (grid or list view).
* [ ] **Obvious Moderation Actions:** Clearly labeled buttons (Approve, Reject, Flag, etc.) with distinct styling (color-coding). Use icons for quick recognition.
    * [ ] **Visible Status Indicators:** Use color-coded Badges for content status (Pending, Approved, Rejected, Flagged) alongside media.
    * [ ] **Contextual Information:** Display relevant metadata (uploader, timestamp, flags) alongside media.
    * [ ] **Workflow Efficiency:**
        * [ ] Keyboard shortcuts for rapid moderation (e.g., `A` = Approve, `R` = Reject, `F` = Flag).
        * [ ] Bulk moderation actions with confirmation dialogs.
        * [ ] Filter/sort by status, date, content type, reporter.
    * [ ] **Detail View:** Click-through to expanded media detail with full moderation history and action log.
    * [ ] **Queue Management:** Clear indication of items remaining in moderation queue. Priority flagging for escalated content.

---

### B. Service Dispatch & Work Orders Module

* [ ] **Map-Based Dispatch View:** Technician locations + job pins on an interactive map.
* [ ] **Work Order Card Layout:**
    * [ ] Customer name, address, service type, scheduled time.
    * [ ] Priority badge (Urgent / Normal / Low).
    * [ ] Assigned technician avatar + name.
    * [ ] Status indicator (Scheduled, En Route, In Progress, Completed, Cancelled).
* [ ] **Drag-and-Drop Assignment:** Assign or reassign jobs by dragging to technician rows.
* [ ] **Quick Status Updates:** One-click status progression from dispatch view.
* [ ] **Technician Availability Panel:** At-a-glance view of technician workload and location.
* [ ] **Filter Controls:** By date range, technician, status, service type, region/zone.
* [ ] **Route Optimization Indicator:** Visual grouping of jobs by geographic cluster.
* [ ] **Mobile View for Technicians:** Simplified field-facing view (job details, directions, checklist, photo upload).

---

### C. Customer Accounts Module (200+ Accounts)

* [ ] **Account List View:** Table with sortable columns (name, system size, install date, status, last service).
* [ ] **Account Detail Page:**
    * [ ] System overview (inverter model, panel count, kW capacity, monitoring status).
    * [ ] Service history timeline.
    * [ ] Open work orders.
    * [ ] Billing/invoice history.
    * [ ] Contact information and notes.
* [ ] **Status Badges:** Active, Inactive, Pending Activation, RMA In Progress.
* [ ] **Quick Actions:** Schedule service, create invoice, send message — directly from account row.
* [ ] **Search & Filter:** By name, address, system type, service status, technician.
* [ ] **Bulk Actions:** Export selected accounts, bulk status update.

---

### D. Leads Pipeline Module (100+ Leads)

* [ ] **Dual View:** Kanban (by stage) + Table view toggle.
* [ ] **Lead Card Shows:** Name, address, system size estimate, lead source, assigned rep, last activity date.
* [ ] **Pipeline Stages:** New → Contacted → Site Survey → Proposal Sent → Negotiation → Closed Won / Closed Lost.
* [ ] **Drag-and-Drop** between Kanban stages.
* [ ] **Lead Detail Drawer:** Opens from table row or card without leaving the page.
* [ ] **Activity Log:** All calls, emails, notes, status changes in chronological order.
* [ ] **Lead Source Tracking:** Badge indicating source (Referral, Web, Trello import, Cold Outreach).
* [ ] **Filters:** By stage, assigned rep, source, date range, estimated value.
* [ ] **CSV Import:** Drag-and-drop import with field mapping preview.
* [ ] **Quick Add:** Inline lead creation from top-right button.

---

### E. Invoicing & Billing Module

* [ ] **Invoice List:** Table with columns (invoice #, customer, amount, status, due date, issued date).
* [ ] **Status Badges:** Draft, Sent, Paid, Overdue, Voided.
* [ ] **Invoice Detail View:**
    * [ ] Line items with quantity, unit price, subtotals.
    * [ ] Tax and discount rows.
    * [ ] Payment history section.
    * [ ] PDF preview and download.
    * [ ] Send / Resend button with email log.
* [ ] **Reconciliation View:** Side-by-side comparison of billed vs. received (ValnoirCapital-style).
* [ ] **Filters:** By status, date range, customer, amount range.
* [ ] **Export:** CSV and XLSX export with selected columns.
* [ ] **Quick Create:** New invoice from customer account or work order.

---

### F. RMA / Equipment Module

* [ ] **RMA Table:** Serial number, model, customer, failure reason, status, submission date, replacement ETA.
* [ ] **Status Workflow:** Submitted → Approved → Shipped → Received → Closed.
* [ ] **RMA Detail Page:** Full equipment history, photos, technician notes, SolarEdge case reference.
* [ ] **Data Transposer Integration:** Import tab-separated RMA data from field reports with auto-formatting.
* [ ] **Filters:** By status, manufacturer (SolarEdge, Enphase, etc.), date range, technician.
* [ ] **Bulk Export:** Formatted XLSX for RMA reporting.

---

### G. Contractor Portal Module

* [ ] **Contractor Onboarding Flow:** Multi-step form (personal info → credentials → service areas → document upload → agreement).
* [ ] **Work Order Reporting:** Contractor-facing view to log completed work, hours, materials.
* [ ] **Invoice Submission:** Upload invoice PDF + enter line items for admin review.
* [ ] **Admin Dashboard:** Review submitted invoices, approve/reject with notes, view contractor activity.
* [ ] **Status Visibility:** Contractors see real-time status of their submitted invoices and assignments.
* [ ] **ConexSol Branding:** Solar Gold + Teal Cyan throughout the portal.

---

## VI. Forms & User Input

* [ ] **Clear field labels** (above input, never placeholder-only).
* [ ] **Inline validation** (on blur + on submit).
* [ ] **Helpful error messages** (specific, actionable — not just "Invalid input").
* [ ] **Logical field grouping** with visual section dividers.
* [ ] **Progress indicators** for multi-step forms (e.g., New Installation wizard, Contractor onboarding).
* [ ] **Auto-save** for long forms (draft state with timestamp).
* [ ] **Keyboard accessibility** with logical tab order.
* [ ] **Smart defaults** (pre-fill from account data where possible).
* [ ] **Conditional fields** (show/hide based on prior selections).
* [ ] **File uploads** with drag-and-drop zone + progress bar + file type validation.

---

## VII. Data Tables (Global Standards)

* [ ] Alternating row backgrounds or clear row dividers for scannability.
* [ ] Sticky column headers on scroll.
* [ ] Column sorting (click header — asc/desc/default cycle).
* [ ] Column visibility toggle (show/hide columns).
* [ ] Global search + per-column filters.
* [ ] Bulk checkbox selection + floating action bar.
* [ ] Pagination with page-size selector (25 / 50 / 100).
* [ ] Inline row actions (Edit, View, Delete) on hover — right-aligned.
* [ ] Row click → detail view (drawer or page navigation).
* [ ] Export selected / all rows (CSV, XLSX).
* [ ] Empty state with icon + helpful message + CTA.

---

## VIII. Performance & Engineering

* [ ] Lazy loading for routes and heavy modules.
* [ ] Skeleton screens instead of blank loading states.
* [ ] Virtualized table rows for 200+ record datasets.
* [ ] Debounced search inputs (300ms).
* [ ] Optimistic UI updates where safe.
* [ ] Efficient API calls — paginated, cached where possible.
* [ ] Smooth 60fps animations (use `transform` and `opacity` only).
* [ ] Minimal bundle size — code-split by module.

---

## IX. SaaS Polish Layer

* [ ] Perfect spacing rhythm throughout every screen.
* [ ] Pixel-perfect alignment of all elements.
* [ ] Subtle shadows and depth for layered UI.
* [ ] Consistent interaction patterns across all modules.
* [ ] Clean empty states with helpful guidance and CTAs.
* [ ] Thoughtful onboarding flow for new team members.
* [ ] Smart defaults to reduce manual data entry.
* [ ] Delightful micro-details (cursor states, subtle hover motion, success animations).
* [ ] Dark mode parity with light mode.
* [ ] Everything feels fast and intentional.

---

*Last updated: March 2026 — ConexSol SolarOps / SolarFlow Platform*

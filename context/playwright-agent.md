# SolarOps — Playwright UI Test Agent
*(Run after any front-end change to verify buttons, navigation, and connections)*

---

## Setup

- **Dev server:** `http://localhost:5173`
- **Login:** `cesar.jurado@conexsol.us` / `1357`
- **Viewport:** 1440 × 900 (desktop)
- **Tools:** `mcp__playwright__browser_*`

---

## Agent Instructions

When invoked, this agent must:

1. **Start the browser** and navigate to `http://localhost:5173`.
2. **Log in** using the credentials above.
3. **Run the full test suite** below, module by module.
4. **Capture a screenshot** after each module section.
5. **Check console errors** after each module using `mcp__playwright__browser_console_messages`.
6. **Report results** — list every button/link tested with PASS / FAIL status and any error messages found.

---

## Test Suite

### 0. Login
| # | Action | Expected Result |
|---|--------|----------------|
| 0.1 | Navigate to `http://localhost:5173` | Login screen visible |
| 0.2 | Enter email `cesar.jurado@conexsol.us` and password `1357` | Fields accept input |
| 0.3 | Click Login button | Dashboard loads, sidebar visible |

---

### 1. Global Navigation (Sidebar)
Test every sidebar link navigates to the correct module without errors.

| # | Nav Item | Expected Route/View |
|---|----------|-------------------|
| 1.1 | Sales CRM | CRM dashboard with lead pipeline |
| 1.2 | Customers | Customer management list |
| 1.3 | Operations | Work orders + alerts view |
| 1.4 | Dashboard | Main dashboard with metrics |
| 1.5 | Work Orders (Jobs) | Jobs list view |
| 1.6 | Manage Work Orders | Technician view |
| 1.7 | Contractors | Contractor approvals list |
| 1.8 | Inventory | Inventory module |
| 1.9 | Billing | Billing/invoicing view |
| 1.10 | Settings | Settings panel |

**After each click:** Verify page renders without blank screen or JS errors.

---

### 2. Sales CRM Module
| # | Action | Expected Result |
|---|--------|----------------|
| 2.1 | View lead pipeline/kanban | Cards render with lead data |
| 2.2 | Click a lead card | Lead detail opens (drawer or modal) |
| 2.3 | Click "Add Lead" / "Quick Add" button | New lead form appears |
| 2.4 | Close the form/modal | Returns to pipeline view |
| 2.5 | Switch between Kanban and Table view (if toggle exists) | View changes correctly |
| 2.6 | Click leaderboard tab (if present) | Leaderboard data renders |

---

### 3. Customer Management Module
| # | Action | Expected Result |
|---|--------|----------------|
| 3.1 | View customer list | Table renders with customer rows |
| 3.2 | Click a customer row | Customer detail view opens |
| 3.3 | Verify tabs inside detail view (Interactions, Work Orders, etc.) | All tabs clickable and render content |
| 3.4 | Click "Log Interaction" or "Add Note" button | Form/modal appears |
| 3.5 | Close form/modal | Returns to customer detail |
| 3.6 | Use search/filter bar | List filters correctly |

---

### 4. Operations Module
| # | Action | Expected Result |
|---|--------|----------------|
| 4.1 | View work orders list | Work orders render with status badges |
| 4.2 | Click a work order | Detail view or drawer opens |
| 4.3 | Click "Create Work Order" button | New WO form appears |
| 4.4 | Close form | Returns to operations view |
| 4.5 | Navigate to Alerts tab | Alert list renders with severity badges |
| 4.6 | Click "Acknowledge" on an alert | Status updates to acknowledged |
| 4.7 | Navigate to Client Profitability tab | Profitability table renders |

---

### 5. Work Orders / Jobs Module
| # | Action | Expected Result |
|---|--------|----------------|
| 5.1 | View jobs list | Table with WO rows renders |
| 5.2 | Click a job row | Job detail opens |
| 5.3 | Filter by status | List filters correctly |
| 5.4 | Click status badge/dropdown to change status | Status updates |

---

### 6. Technician View (Manage Work Orders)
| # | Action | Expected Result |
|---|--------|----------------|
| 6.1 | View technician work order list | WOs render |
| 6.2 | Click a work order | Detail/checklist view opens |
| 6.3 | Click status update button | Status progresses correctly |

---

### 7. Contractors Module
| # | Action | Expected Result |
|---|--------|----------------|
| 7.1 | View contractor list/approvals | Table renders |
| 7.2 | Click a contractor row | Detail view opens |
| 7.3 | Click Approve / Reject button (if available) | Action registers, status updates |

---

### 8. Inventory Module
| # | Action | Expected Result |
|---|--------|----------------|
| 8.1 | View inventory list | Items render in table or grid |
| 8.2 | Click "Add Item" button | Form appears |
| 8.3 | Close form | Returns to inventory |
| 8.4 | Click edit on an existing item | Edit form pre-filled with item data |

---

### 9. Billing Module
| # | Action | Expected Result |
|---|--------|----------------|
| 9.1 | View invoice list | Table with invoice rows renders |
| 9.2 | Click an invoice row | Invoice detail opens |
| 9.3 | Click "Create Invoice" button | New invoice form appears |
| 9.4 | Close form | Returns to billing list |

---

### 10. Settings Module
| # | Action | Expected Result |
|---|--------|----------------|
| 10.1 | View settings page | Settings sections render |
| 10.2 | Click each settings tab/section | Content loads without errors |

---

## Console Error Check

After completing all modules, run:

```
mcp__playwright__browser_console_messages
```

Flag any:
- `ERROR` level messages
- Uncaught exceptions
- Failed network requests (404, 500)
- React warnings about missing keys or invalid props

---

## Report Format

At the end of the test run, output a summary in this format:

```
## SolarOps UI Test Report
Date: [timestamp]
Viewport: 1440x900

### Results
| Module | Tests | Passed | Failed |
|--------|-------|--------|--------|
| Login | 3 | 3 | 0 |
| Navigation | 10 | 10 | 0 |
| Sales CRM | 6 | 5 | 1 |
...

### Failures
- [2.3] Add Lead button — modal did not open. Console error: "Cannot read properties of undefined"

### Console Errors
- [module] Error message here

### Screenshots
- [path or description of each screenshot taken]
```

---

*Last updated: March 2026 — ConexSol SolarOps Platform*

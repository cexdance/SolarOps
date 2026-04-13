# Xero API Research — Solar Operations Integration

**Research Date:** 2026-03-18
**Purpose:** Evaluate Xero API capabilities for SolarOps integration (contacts, quotes, invoices, payments, webhooks, attachments)

---

## 1. SDKs & Libraries

**Official Xero SDKs** are available for the most commonly used languages in the developer community. Xero maintains these on GitHub with TypeScript/Node.js being a primary supported SDK.

- **Node.js / TypeScript:** `xero-node` — official, actively maintained
- **Python, Ruby, Java, .NET:** Also officially supported
- **Auth:** All SDKs use OAuth 2.0
- **Source:** https://developer.xero.com/documentation/sdks-and-tools/libraries/overview/

**Note on Scopes:** Apps created before 2 March 2026 have until September 2027 to migrate from broad scopes to granular scopes. Granular scopes available from April 2026. Plan for this migration.

---

## 2. Accounting API Overview

- **Base URL:** `https://api.xero.com/api.xro/2.0/`
- **Auth:** OAuth 2.0 with tenant-based access (`Xero-tenant-id` header required on every request)
- **Pagination supported on:** Invoices, Contacts, Bank Transactions, Manual Journals
- **Rate Limits:**
  - **5,000 API calls per connection per 24-hour period**
  - **5 concurrent calls** in progress at one time
  - Per-minute limit also applies across all tenants
  - Response headers: `X-DayLimit-Remaining`, `X-MinLimit-Remaining`, `X-AppMinLimit-Remaining`
  - HTTP 429 returned when exceeded
- **High Volume Threshold:** From September 1, 2024, GET requests retrieving >100k documents are subject to additional limits
- **Source:** https://developer.xero.com/documentation/api/accounting/overview

---

## 3. Contacts API (Customers)

**Operations:** GET, POST, PUT
**Endpoint:** `GET|POST|PUT /Contacts`
**Single record:** `GET|POST|PUT /Contacts/{ContactID}`

### Key Fields
| Field | Notes |
|---|---|
| ContactID | UUID, auto-generated |
| Name | Required |
| EmailAddress | For sending documents |
| Phones / Addresses | Arrays |
| TaxNumber | Regional tax number (type field added 2024) |
| AccountNumber | Custom reference |
| ContactStatus | ACTIVE, ARCHIVED, GDPRREQUEST |
| IsSupplier / IsCustomer | Boolean flags |
| DefaultCurrency | |
| Balances | Outstanding invoice totals (read-only) |
| PaymentTerms | Days, type (DAYSAFTERBILLDATE, etc.) |
| ContactGroups | Group membership |
| HasAttachments | Boolean |
| UpdatedDateUTC | For delta syncing |

### Payment Status Tracking
- `Balances.AccountsReceivable.Outstanding` — total unpaid
- `Balances.AccountsReceivable.Overdue` — overdue amount
- Overdue/outstanding balances are **read-only**, computed by Xero

### Operations Detail
- **GET /Contacts** — list all contacts, supports `where` filtering, `order`, `page`, `includeArchived`
- **POST /Contacts** — create one or many contacts (batch)
- **PUT /Contacts/{ID}** — update a specific contact
- Also supports: **GET /Contacts/{ID}/Attachments**, **GET /Contacts/{ID}/History**, **PUT /Contacts/{ID}/History** (add notes)

### Limitations
- Cannot delete contacts — only archive (ARCHIVED status)
- GDPRREQUEST status anonymises the contact

- **Source:** https://developer.xero.com/documentation/api/accounting/contacts

---

## 4. Quotes API

**Operations:** GET, POST, PUT
**Endpoint:** `GET|POST|PUT /Quotes`
**Single record:** `GET|POST|PUT /Quotes/{QuoteID}`

### Quote Statuses
| Status | Description |
|---|---|
| DRAFT | Quote created, not sent |
| SENT | Emailed to customer |
| DECLINED | Customer rejected |
| ACCEPTED | Customer accepted |
| INVOICED | Quote converted to invoice |
| DELETED | Soft-deleted |

### Key Fields
| Field | Notes |
|---|---|
| QuoteID | UUID |
| QuoteNumber | Auto or custom |
| Contact | Required — linked Contact object |
| LineItems | Array of line items |
| Date / ExpiryDate | ISO 8601 |
| Status | See statuses above |
| CurrencyCode | |
| SubTotal / TotalTax / Total | Computed |
| Title / Summary | Display text on quote |
| BrandingThemeID | PDF branding |
| Terms | Payment terms text |

### Operations Detail
- **GET /Quotes** — list quotes, filter by `Status`, `DateFrom`, `DateTo`, `ContactID`, `QuoteNumber`
- **POST /Quotes** — create new quote (starts in DRAFT)
- **PUT /Quotes/{ID}** — update quote fields or change status
- **Status Transitions via PUT:** DRAFT → SENT, DRAFT → ACCEPTED, DRAFT → DECLINED, SENT → ACCEPTED, SENT → DECLINED, ACCEPTED → INVOICED
- **GET /Quotes/{ID}/History** — audit history
- **PUT /Quotes/{ID}/History** — add notes

### Status-Based Editable Fields
- DRAFT: all fields editable
- SENT: limited edits (title, summary, expiry date)
- ACCEPTED/DECLINED: mostly read-only

### Sending to Client
- Xero UI can email quotes directly; **the API does not expose a dedicated "send email" endpoint for quotes**
- Workaround: set status to SENT via PUT, then generate PDF via the Attachments endpoint or direct Xero online URL
- **Convert to Invoice:** PUT status to INVOICED — Xero auto-creates the invoice

### Limitations
- No dedicated API endpoint to trigger email sending for quotes (unlike invoices)
- Quote number must be unique per organisation

- **Source:** https://developer.xero.com/documentation/api/accounting/quotes

---

## 5. Invoices API

**Operations:** GET, POST, PUT
**Endpoint:** `GET|POST|PUT /Invoices`

### Invoice Types
- **ACCREC** — Accounts Receivable (sales invoice, money owed TO you) ← relevant for solar ops
- **ACCPAY** — Accounts Payable (bills, money owed BY you)

### Invoice Statuses
| Status | Description |
|---|---|
| DRAFT | Not yet approved |
| SUBMITTED | Awaiting approval |
| AUTHORISED | Approved, sent or ready to send |
| PAID | Fully paid |
| VOIDED | Cancelled |
| DELETED | Soft deleted (DRAFT only) |

### Key Fields
| Field | Notes |
|---|---|
| InvoiceID | UUID |
| Type | ACCREC or ACCPAY |
| Contact | Required |
| LineItems | Array |
| Date / DueDate | ISO 8601 |
| InvoiceNumber | Auto or custom |
| Status | See above |
| AmountDue / AmountPaid / AmountCredited | Computed |
| CurrencyCode | |
| BrandingThemeID | PDF template |
| SentToContact | Boolean — whether emailed |
| Url | Custom URL field |
| HasAttachments | Boolean |

### Operations Detail
- **GET /Invoices** — list, filter by Status, ContactID, InvoiceNumbers, IDs, Date ranges; supports pagination
- **POST /Invoices** — create one or batch; can create directly as AUTHORISED
- **PUT /Invoices/{ID}** — update; can change status (DRAFT→AUTHORISED, AUTHORISED→VOIDED)
- **POST /Invoices/{ID}/Email** — **trigger email send** to the contact on the invoice ✓
- **GET /Invoices/{ID}/OnlineInvoice** — get the online invoice URL for sharing
- **GET /Invoices/{ID}/Attachments** — list attachments
- **POST /Invoices/{ID}/Attachments** — upload PDF or file

### Limitations
- Cannot change PAID or VOIDED invoices
- Deleting only available on DRAFT invoices (status → DELETED)
- Cannot directly set status to PAID via update — must create a Payment record

- **Source:** https://developer.xero.com/documentation/api/accounting/invoices

---

## 6. Payments API

**Operations:** GET, POST, DELETE (void)
**Endpoint:** `GET|POST /Payments`, `GET|POST /Payments/{PaymentID}`

### What Payments Do
A Payment record in Xero links a bank account (Account) to an invoice or credit note, reconciling the outstanding amount.

### Key Fields
| Field | Notes |
|---|---|
| PaymentID | UUID |
| Invoice | Required — the invoice being paid |
| Account | Required — bank/clearing account (by AccountID or Code) |
| Amount | Payment amount |
| Date | Payment date |
| Reference | Optional reference string |
| CurrencyRate | For foreign currency |
| IsReconciled | Boolean |
| Status | AUTHORISED, DELETED |
| PaymentType | ACCRECPAYMENT, ACCPAYPAYMENT, etc. |

### Operations Detail
- **GET /Payments** — list payments; filter by Status, ModifiedAfter
- **POST /Payments** — record a payment against an invoice (marks invoice as PAID if full amount)
- **POST /Payments/{ID}** with `{ "Status": "DELETED" }` — void/delete a payment
- **Batch Payments:** Separate endpoint `/BatchPayments` for paying multiple invoices at once

### Tracking Payment Status
- After posting a payment, the parent invoice's `Status` changes to PAID and `AmountDue` becomes 0
- Partial payments: invoice stays AUTHORISED with reduced `AmountDue`
- No native "payment pending" state — Xero records payments after they occur

### Payment Services (Online Payments)
- `/PaymentServices` endpoint configures payment buttons (Stripe, PayPal, custom)
- When customer pays online, Xero auto-creates the payment record
- Use webhooks (see below) to detect when this happens

### Limitations
- Payments cannot be updated — only created or deleted
- Must have a valid bank account set up in the Xero org to receive payments

- **Source:** https://developer.xero.com/documentation/api/accounting/payments

---

## 7. Webhooks

**Documentation:** https://developer.xero.com/documentation/guides/webhooks/overview/

### How Xero Webhooks Work
- Xero sends a POST to your registered endpoint when events occur
- Payload is signed with **HMAC-SHA256** using a webhook key — verify via `x-xero-signature` header
- **Intent to Receive (ITR):** During setup, Xero sends a handshake POST — your server must respond 200 within 5 seconds with the correct HMAC response
- Delivery failures are retried with exponential backoff

### Supported Event Types (as of 2024–2026)
| Event | Trigger |
|---|---|
| `Invoice` | Invoice created or updated (status changes, payment applied) |
| `Contact` | Contact created or updated |
| `CreditNote` | Credit note created or updated (new schema model launched) |
| `Subscription` | Xero subscription changes (for Xero app store apps) |

**Note:** As of research date, there is **no dedicated Quote webhook event** — quotes must be polled or tracked via invoice conversion events.

### Setup Process
1. Register app in Xero Developer portal
2. Add webhook subscription (select events + enter your endpoint URL)
3. Handle ITR handshake
4. Verify HMAC signature on every incoming request
5. Respond HTTP 200 within 5 seconds (process async)

### Webhook Payload Structure
```json
{
  "events": [
    {
      "resourceUrl": "https://api.xero.com/api.xro/2.0/Invoices/{InvoiceID}",
      "resourceId": "{InvoiceID}",
      "errorCode": null,
      "eventDateUtc": "2024-01-15T10:30:00",
      "eventType": "UPDATE",
      "eventCategory": "INVOICE",
      "tenantId": "{TenantID}",
      "tenantType": "ORGANISATION"
    }
  ],
  "lastEventSequence": 1234,
  "firstEventSequence": 1234,
  "entropy": "randomstring"
}
```

### Key Pages
- Overview: https://developer.xero.com/documentation/guides/webhooks/overview/
- Creating webhooks: https://developer.xero.com/documentation/guides/webhooks/creating-webhooks/
- Configuring server: https://developer.xero.com/documentation/guides/webhooks/configuring-your-server/
- Invoice events: https://developer.xero.com/documentation/guides/webhooks/invoices

---

## 8. Attachments API

**Operations:** GET, POST, PUT
**Endpoint:** `GET|POST /[Entity]/{ID}/Attachments`

### Supported Parent Entities
Attachments can be added to: **Invoices, Quotes, Contacts, Credit Notes, Bank Transactions, Accounts, Manual Journals, Purchase Orders, Receipts**

### Operations Detail
- **GET /{Entity}/{ID}/Attachments** — list all attachments on a record
- **GET /{Entity}/{ID}/Attachments/{AttachmentID}** — retrieve attachment metadata
- **GET /{Entity}/{ID}/Attachments/{FileName}** — download attachment binary content (PDF, image, etc.)
- **POST /{Entity}/{ID}/Attachments/{FileName}** — upload a new attachment (binary body, Content-Type header required)
- **PUT /{Entity}/{ID}/Attachments/{FileName}** — update/replace an existing attachment

### Key Fields
| Field | Notes |
|---|---|
| AttachmentID | UUID |
| FileName | e.g. `quote-solar-proposal.pdf` |
| Url | Download URL |
| MimeType | e.g. `application/pdf` |
| ContentLength | File size in bytes |
| IncludeOnline | Boolean — show attachment on online invoice/quote |

### PDF Generation & Preview
- Xero does **not** expose a dedicated "generate PDF" API endpoint
- To get a PDF of a quote or invoice: use the **Online URL** approach
  - `GET /Invoices/{ID}/OnlineInvoice` returns a shareable URL where the client can view/pay
  - For quotes: the Xero UI generates PDFs; you can attach a custom PDF via POST Attachments
- **IncludeOnline: true** — attach a file and make it visible when the client views the online invoice

### Sending Quotes/Invoices to Clients
| Method | Mechanism |
|---|---|
| Email Invoice | `POST /Invoices/{ID}/Email` — triggers Xero to email the contact |
| Email Quote | No direct API — change status to SENT; use Xero online quote URL |
| Online Link | `GET /Invoices/{ID}/OnlineInvoice` — shareable payment link |
| Attach PDF | Upload custom PDF and set IncludeOnline: true |

### Limitations
- Max attachment size: **3MB per file**
- Attachments are stored in Xero, not accessible as public URLs without auth (except Online Invoice URL)
- Separate **Files API** (`/files/1.0/`) exists for a more robust file management system with folders

- **Source:** https://developer.xero.com/documentation/api/accounting/attachments

---

## Summary: SolarOps Integration Feasibility

| Capability | Xero Support | Notes |
|---|---|---|
| Create/manage customers | ✅ Full | POST/PUT Contacts; track outstanding/overdue balances |
| Customer payment status | ✅ Via Contacts Balances | Read-only computed fields; also visible on Invoices |
| Create quotes | ✅ Full | POST Quotes in DRAFT |
| Pull quotes | ✅ Full | GET Quotes with filters |
| Push quote updates | ✅ Full | PUT Quotes; status transitions |
| Approve quotes | ✅ Via status | PUT status → ACCEPTED or INVOICED |
| Send quote to client | ⚠️ Partial | No email API; set SENT status + share online URL |
| Payment notifications | ✅ Via webhooks | Invoice UPDATE events detect payment; no quote webhook |
| Preview quotes (PDF) | ⚠️ Partial | No PDF gen API; use online URL or upload custom PDF |
| Create invoices from quotes | ✅ Full | PUT Quote status → INVOICED auto-creates invoice |
| Record payments | ✅ Full | POST Payments against invoice |
| Email invoices | ✅ Full | `POST /Invoices/{ID}/Email` |
| Attach documents | ✅ Full | POST Attachments on quotes, invoices, contacts |

### Recommended Integration Stack for SolarOps
1. **SDK:** `xero-node` (TypeScript) — official, matches SolarOps tech stack
2. **Auth:** OAuth 2.0 Authorization Code flow — store refresh tokens per org
3. **Contacts:** Sync SolarOps customers bidirectionally with Xero Contacts
4. **Quotes:** Create in Xero from SolarOps work orders; poll for status or use invoice webhook on conversion
5. **Invoices:** Auto-create when quote is accepted; use `/Email` endpoint to notify customers
6. **Payments:** Webhook on Invoice UPDATE events to detect payment → update SolarOps work order financial status
7. **Attachments:** Upload solar system proposals, contracts as PDFs to quotes/invoices

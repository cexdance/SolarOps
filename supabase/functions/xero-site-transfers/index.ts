// Site-transfer client onboarding: SolarOps -> Xero.
//
// For every site-transfer service order that has not been invoiced yet, make sure
// the client exists in Xero as a contact, then leave a DRAFT invoice for Daniel.
// Draft commits nothing to the ledger: he approves or deletes it. Same rule as the
// contractor bills, so there is one habit to learn, not two.
//
// Idempotency uses XERO as the source of truth, not new SolarOps state:
//   contact -> looked up by ContactNumber == clientId (US-1XXXX)
//   invoice -> looked up by Reference == woNumber
// Nothing is written back onto the Customer record, which syncs whole-record LWW
// and would let a stale client clobber it.
//
// GET ?dry=1 to see what it WOULD do without touching Xero.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const XERO_API = "https://api.xero.com/api.xro/2.0";
const PRICE = Number(Deno.env.get("XERO_SITE_TRANSFER_PRICE") ?? "120");
const ACCOUNT_CODE = Deno.env.get("XERO_SITE_TRANSFER_ACCOUNT_CODE") ?? "";
const TAX_TYPE = Deno.env.get("XERO_SITE_TRANSFER_TAX_TYPE") ?? "";

type Json = Record<string, unknown>;

// Echo whatever the browser asks for. supabase-js always sends x-client-info, and
// a header missing from this list makes the browser refuse to send the POST at all,
// which surfaces as the useless "failed to send a request to the edge function".
const cors = (req: Request) => ({
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    req.headers.get("access-control-request-headers") ??
    "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "POST, GET, OPTIONS",
});

// ── Auth ─────────────────────────────────────────────────────────────────────
// Xero rotates the refresh token on EVERY use and kills the old one immediately.
// Persist the new one before doing anything else: a crash between use and
// write-back leaves the connection dead and needs a manual re-authorisation.
async function getAccess(db: SupabaseClient) {
  const { data: row, error } = await db.from("xero_auth").select("*").maybeSingle();
  if (error) throw new Error(`xero_auth read failed: ${error.message}`);
  if (!row) throw new Error("Not connected to Xero yet. Open the callback URL once.");

  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${Deno.env.get("XERO_CLIENT_ID")}:${Deno.env.get("XERO_CLIENT_SECRET")}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  const t = await res.json();

  const { error: saveErr } = await db
    .from("xero_auth")
    .update({ refresh_token: t.refresh_token, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (saveErr) throw new Error(`Could not persist rotated refresh token: ${saveErr.message}`);

  return { token: t.access_token as string, tenantId: row.tenant_id as string };
}

async function xero(
  auth: { token: string; tenantId: string },
  path: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${auth.token}`,
      "xero-tenant-id": auth.tenantId,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Xero ${init.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : {};
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Some customer names already carry the client id ("US-15017 Parque Solar Doral").
// The id lives in ContactNumber, so strip it or the contact reads it twice.
const cleanName = (name: string, clientId?: string) => {
  let n = (name ?? "").trim();
  if (clientId && n.toUpperCase().startsWith(clientId.toUpperCase())) {
    n = n.slice(clientId.length).trim();
  }
  return n.replace(/^US-\d{4,6}\s+/i, "").trim();
};

// -- Who is allowed to run this ----------------------------------------------
// verify_jwt has already checked the signature, so the payload can be trusted
// to be OURS. What it has NOT done is check WHO it is: the anon key is a valid
// JWT and it ships inside the public frontend bundle, so "has a token" is not
// authorisation. Decide on the role claim.
//   service_role -> the schedule
//   authenticated -> a signed-in user, whose role must come from user_roles
//   anything else (anon) -> denied
type Caller = { kind: "cron" } | { kind: "user"; uid: string } | { kind: "denied"; why: string };

async function whoIs(req: Request, db: SupabaseClient): Promise<Caller> {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!raw) return { kind: "denied", why: "no token" };
  let claims: Json;
  try {
    claims = JSON.parse(atob(raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return { kind: "denied", why: "unreadable token" };
  }
  const role = String(claims.role ?? "");
  if (role === "service_role") return { kind: "cron" };
  if (role !== "authenticated") return { kind: "denied", why: `role ${role || "unknown"} cannot run this` };

  const uid = String(claims.sub ?? "");
  if (!uid) return { kind: "denied", why: "token has no subject" };
  // Role comes from user_roles, never from the token's own metadata.
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
  if (error) return { kind: "denied", why: `role lookup failed: ${error.message}` };
  if (!data || !["admin", "coo"].includes(String(data.role))) {
    return { kind: "denied", why: "admin only" };
  }
  return { kind: "user", uid };
}

const isSiteTransfer = (j: Json) =>
  j.serviceCode === "SITE-TRX" || j.serviceType === "Site Transfer";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const caller = await whoIs(req, db);
  if (caller.kind === "denied") {
    return Response.json({ ok: false, error: caller.why }, { status: 403, headers: cors(req) });
  }

  let body: Json = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* empty body is fine */ }
  }
  const dry = url.searchParams.get("dry") === "1" || body.dry === true;

  // ?accounts=1 lists the revenue accounts so the right code for the site-transfer
  // line can be picked from the real chart of accounts instead of guessed.
  if (url.searchParams.get("accounts") === "1" || body.accounts === true) {
    try {
      const auth = await getAccess(db);
      const res = await xero(auth, "/Accounts");
      const revenue = (res?.Accounts ?? [])
        .filter((a: Json) => ["REVENUE", "SALES", "OTHERINCOME"].includes(String(a.Type)))
        .map((a: Json) => ({ code: a.Code, name: a.Name, type: a.Type, tax: a.TaxType }));
      return Response.json({ ok: true, revenue }, { headers: cors(req) });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500, headers: cors(req) });
    }
  }
  // One job (the admin button) or every eligible one (the schedule).
  const jobId = String(body.jobId ?? url.searchParams.get("job") ?? "");
  const out: Json[] = [];

  try {
    // A dry run stays useful before anyone has authorised Xero: fall back to
    // reporting WHICH records were selected, which is the half worth checking early.
    let auth: { token: string; tenantId: string } | null = null;
    let authNote: string | undefined;
    try {
      auth = await getAccess(db);
    } catch (e) {
      if (!dry) throw e;
      authNote = String(e);
    }

    const { data: jobRows, error: jErr } = await db
      .from("app_data").select("key,value").like("key", "job:%");
    if (jErr) throw new Error(`job read failed: ${jErr.message}`);
    const { data: custRows, error: cErr } = await db
      .from("app_data").select("key,value").like("key", "customer:%");
    if (cErr) throw new Error(`customer read failed: ${cErr.message}`);

    const customers = new Map<string, Json>();
    for (const r of custRows ?? []) {
      const c = r.value as Json;
      if (c?.id) customers.set(String(c.id), c);
    }

    const eligible = (j: Json) =>
      j && isSiteTransfer(j) &&
      !["invoiced", "paid"].includes(String(j.status ?? "")) &&
      // isServiceOrder(job) = !!woNumber. Without one it is not an order and
      // must never be invoiced.
      !!j.woNumber;

    const allJobs = (jobRows ?? []).map((r) => r.value as Json);
    const scoped = jobId ? allJobs.filter((j) => String(j?.id ?? "") === jobId) : allJobs;
    const due = scoped.filter(eligible);

    // A button press that quietly does nothing is worse than an error. Say why.
    if (jobId && due.length === 0) {
      const j = scoped[0];
      const why = !j ? "job not found"
        : !isSiteTransfer(j) ? "not a site transfer"
        : !j.woNumber ? "no order number, so this is not a service order"
        : `already ${String(j.status)}`;
      return Response.json({ ok: false, error: why }, { status: 400, headers: cors(req) });
    }

    for (const job of due) {
      const wo = String(job.woNumber);
      const cust = customers.get(String(job.customerId ?? ""));
      if (!cust) { out.push({ wo, skipped: "customer not found" }); continue; }

      const clientId = (cust.clientId as string) ?? "";
      const name = cleanName(String(cust.name ?? ""), clientId);
      if (!clientId) { out.push({ wo, skipped: "customer has no clientId" }); continue; }
      if (!name)     { out.push({ wo, skipped: "customer has no name" });     continue; }

      // ── Contact ────────────────────────────────────────────────────────────
      let contactId: string | undefined;
      let contactAction = "existed";
      if (auth) {
        const found = await xero(auth, `/Contacts?where=${encodeURIComponent(`ContactNumber=="${clientId}"`)}`);
        const hit = found?.Contacts?.[0];
        contactId = hit?.ContactID;
        // Name the match. A malformed Xero where-clause can return EVERY contact
        // rather than erroring, and the first one would then look like a hit
        // forever, silently skipping every client we meant to create.
        if (hit) contactAction = `existed: ${hit.Name} / ${hit.ContactNumber ?? "NO CONTACT NUMBER"}`;
      } else {
        contactAction = "would create or reuse (Xero not checked)";
      }

      if (auth && !contactId) {
        const payload: Json = {
          Name: name,
          ContactNumber: clientId,
          ...(cust.email ? { EmailAddress: cust.email } : {}),
          ...(cust.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: String(cust.phone) }] } : {}),
          ...(cust.address
            ? {
              Addresses: [{
                AddressType: "STREET",
                AddressLine1: String(cust.address),
                City: String(cust.city ?? ""),
                Region: String(cust.state ?? ""),
                PostalCode: String(cust.zip ?? ""),
                Country: "USA",
              }],
            }
            : {}),
        };
        if (dry) {
          contactAction = "would create";
        } else {
          try {
            const made = await xero(auth!, "/Contacts", { method: "POST", body: JSON.stringify({ Contacts: [payload] }) });
            contactId = made?.Contacts?.[0]?.ContactID;
            contactAction = "created";
          } catch (e) {
            // Xero requires contact Name to be unique. Two customers can share a
            // name, so fall back to a disambiguated one rather than failing.
            if (String(e).includes("already exists") || String(e).includes("duplicate")) {
              const retry = { ...payload, Name: `${name} (${clientId})` };
              const made = await xero(auth!, "/Contacts", { method: "POST", body: JSON.stringify({ Contacts: [retry] }) });
              contactId = made?.Contacts?.[0]?.ContactID;
              contactAction = "created (name disambiguated)";
            } else throw e;
          }
        }
      }

      const row: Json = {
        wo, clientId, name, contact: contactAction,
        warn: cust.email ? undefined : "no email on file, Daniel cannot send from Xero",
      };

      // ── Draft invoice ──────────────────────────────────────────────────────
      // Stays off until Daniel supplies the revenue account and tax treatment.
      // Guessing either would misstate his books, which is worse than not automating.
      if (!ACCOUNT_CODE || !TAX_TYPE) {
        row.invoice = "skipped: XERO_SITE_TRANSFER_ACCOUNT_CODE / _TAX_TYPE not set";
        out.push(row);
        continue;
      }

      const existing = auth
        ? await xero(auth, `/Invoices?where=${encodeURIComponent(`Type=="ACCREC" AND Reference=="${wo}"`)}`)
        : {};
      if (existing?.Invoices?.length) {
        row.invoice = `exists (${existing.Invoices[0].InvoiceNumber})`;
      } else if (dry) {
        row.invoice = `would draft $${PRICE}`;
      } else if (!contactId) {
        row.invoice = "skipped: no contact id";
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const made = await xero(auth!, "/Invoices", {
          method: "POST",
          body: JSON.stringify({
            Invoices: [{
              Type: "ACCREC",
              Status: "DRAFT",
              Contact: { ContactID: contactId },
              Date: today,
              Reference: wo,
              LineItems: [{
                Description: `Site transfer - ${clientId}`,
                Quantity: 1,
                UnitAmount: PRICE,
                AccountCode: ACCOUNT_CODE,
                TaxType: TAX_TYPE,
              }],
            }],
          }),
        });
        row.invoice = `drafted ${made?.Invoices?.[0]?.InvoiceNumber ?? ""}`;
      }
      out.push(row);
    }

    return Response.json({ ok: true, dry, xeroConnected: !!auth, authNote, considered: due.length, results: out }, { headers: cors(req) });
  } catch (e) {
    return Response.json({ ok: false, dry, error: String(e), results: out }, { status: 500, headers: cors(req) });
  }
});

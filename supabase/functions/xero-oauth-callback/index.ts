// Xero OAuth for the contractor-payments agent.
//
// ONE url does both halves of the handshake:
//   GET (no ?code)  -> 302 to Xero's consent screen
//   GET (with ?code) -> exchange for tokens, store, done
// That way the link Daniel clicks IS the registered redirect URI, so the two
// can never drift apart. Deploy with --no-verify-jwt: Xero's redirect carries
// no Authorization header and would otherwise 401 with nothing obviously wrong.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access", // ponytail: without this Xero issues NO refresh token and the agent dies in 30 minutes
  "accounting.transactions",
  "accounting.attachments.read",
  "accounting.contacts.read",
].join(" ");

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
     <style>body{font:16px/1.5 system-ui;margin:3rem auto;max-width:34rem;padding:0 1rem}
     h1{font-size:1.3rem}</style><h1>${title}</h1><p>${body}</p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/xero-oauth-callback`;
  const clientId = Deno.env.get("XERO_CLIENT_ID");
  const clientSecret = Deno.env.get("XERO_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    // Name-only diagnostic. Never print values.
    const seen = Object.keys(Deno.env.toObject()).filter((k) => k.toUpperCase().includes("XERO"));
    return page(
      "Not configured",
      `id=${clientId ? "set" : "MISSING"} secret=${clientSecret ? "set" : "MISSING"}<br>` +
        `XERO-ish names visible: <code>${seen.join(", ") || "(none)"}</code>`,
      500,
    );
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const denied = url.searchParams.get("error");
  if (denied) return page("Xero declined", `Xero returned: <code>${denied}</code>`, 400);

  const code = url.searchParams.get("code");

  // --- Start of flow: send them to Xero -------------------------------------
  if (!code) {
    // Single-use. Once connected, re-authorizing requires deleting the row on
    // purpose, so a stray click can never swap the connection to another org.
    const { data: existing } = await db.from("xero_auth").select("tenant_name").maybeSingle();
    if (existing) {
      return page(
        "Already connected",
        `This is already linked to <b>${existing.tenant_name ?? "a Xero organisation"}</b>. Nothing to do.`,
      );
    }
    const auth = new URL("https://login.xero.com/identity/connect/authorize");
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("scope", SCOPES);
    auth.searchParams.set("state", crypto.randomUUID());
    return Response.redirect(auth.toString(), 302);
  }

  // --- Return leg: swap the code for tokens ---------------------------------
  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return page("Token exchange failed", `Xero said: <code>${await tokenRes.text()}</code>`, 502);
  }
  const tokens = await tokenRes.json();

  // Which organisation did they pick?
  const connRes = await fetch("https://api.xero.com/connections", {
    headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
  });
  if (!connRes.ok) {
    return page("Could not read connections", `Xero said: <code>${await connRes.text()}</code>`, 502);
  }
  const conns = await connRes.json();
  if (!Array.isArray(conns) || conns.length === 0) {
    return page("No organisation", "Xero authorised the app but returned no organisation.", 502);
  }
  const tenant = conns[0];

  const { error } = await db.from("xero_auth").upsert({
    id: 1,
    refresh_token: tokens.refresh_token,
    tenant_id: tenant.tenantId,
    tenant_name: tenant.tenantName ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return page("Could not save", `Database error: <code>${error.message}</code>`, 500);

  return page(
    "Connected",
    `Linked to <b>${tenant.tenantName ?? tenant.tenantId}</b>. You can close this tab. Nothing else to do.`,
  );
});

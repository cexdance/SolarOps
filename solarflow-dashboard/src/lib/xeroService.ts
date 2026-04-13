// Xero OAuth 2.0 + PKCE integration
// Setup:
//  1. Create an app at developer.xero.com (Web App type)
//  2. Add redirect URI: <your-origin>/xero-callback
//     e.g. http://localhost:5173/xero-callback  (dev)
//  3. Copy the Client ID into Settings → Integrations → Xero

import { Job, Customer } from '../types';

// ── Storage keys ─────────────────────────────────────────────────────────────

export const XERO_CLIENT_ID_KEY     = 'solarops_xero_client_id';
export const XERO_CLIENT_SECRET_KEY = 'solarops_xero_client_secret';
const XERO_ACCESS_TOKEN_KEY         = 'solarops_xero_access_token';
const XERO_REFRESH_TOKEN_KEY        = 'solarops_xero_refresh_token';
const XERO_EXPIRES_AT_KEY           = 'solarops_xero_expires_at';
const XERO_TENANT_ID_KEY            = 'solarops_xero_tenant_id';
const XERO_ORG_NAME_KEY             = 'solarops_xero_org_name';
const XERO_CODE_VERIFIER_KEY        = 'solarops_xero_code_verifier'; // sessionStorage

// ── Constants ─────────────────────────────────────────────────────────────────

const XERO_SCOPES    = 'openid profile email accounting.contacts accounting.invoices accounting.quotes offline_access';
const XERO_AUTH_URL  = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = '/api/xero-token';        // Netlify Function proxy (avoids CORS)
const XERO_CONN_URL  = '/api/xero-connections';  // Netlify Function proxy (avoids CORS)
const XERO_API_BASE  = '/api/xero-api';          // Netlify redirect proxy (avoids CORS)

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Config helpers ────────────────────────────────────────────────────────────

export function getXeroClientId(): string {
  return sessionStorage.getItem(XERO_CLIENT_ID_KEY)
    || (import.meta.env.VITE_XERO_CLIENT_ID as string)
    || '';
}

export function setXeroClientId(clientId: string): void {
  sessionStorage.setItem(XERO_CLIENT_ID_KEY, clientId.trim());
}

export function getXeroClientSecret(): string {
  return sessionStorage.getItem(XERO_CLIENT_SECRET_KEY) || '';
}

export function setXeroClientSecret(secret: string): void {
  sessionStorage.setItem(XERO_CLIENT_SECRET_KEY, secret.trim());
}

export function getXeroTokens() {
  return {
    accessToken:  sessionStorage.getItem(XERO_ACCESS_TOKEN_KEY) || '',
    refreshToken: sessionStorage.getItem(XERO_REFRESH_TOKEN_KEY) || '',
    expiresAt:    sessionStorage.getItem(XERO_EXPIRES_AT_KEY) || '',
    tenantId:     sessionStorage.getItem(XERO_TENANT_ID_KEY) || '',
    orgName:      sessionStorage.getItem(XERO_ORG_NAME_KEY) || '',
  };
}

export function isXeroConnected(): boolean {
  const { accessToken, refreshToken } = getXeroTokens();
  return !!(accessToken || refreshToken);
}

export function clearXeroTokens(): void {
  [
    XERO_ACCESS_TOKEN_KEY,
    XERO_REFRESH_TOKEN_KEY,
    XERO_EXPIRES_AT_KEY,
    XERO_TENANT_ID_KEY,
    XERO_ORG_NAME_KEY,
  ].forEach(k => sessionStorage.removeItem(k));
}

function storeTokens(data: { access_token: string; refresh_token: string; expires_in: number }) {
  sessionStorage.setItem(XERO_ACCESS_TOKEN_KEY, data.access_token);
  sessionStorage.setItem(XERO_REFRESH_TOKEN_KEY, data.refresh_token);
  sessionStorage.setItem(
    XERO_EXPIRES_AT_KEY,
    new Date(Date.now() + data.expires_in * 1000).toISOString()
  );
}

function isTokenExpired(): boolean {
  const expiresAt = sessionStorage.getItem(XERO_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now() + 60_000; // 1-min buffer
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

/** Kick off OAuth — redirects the browser to Xero login */
export async function startXeroOAuth(clientId: string): Promise<void> {
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(XERO_CODE_VERIFIER_KEY, verifier);

  const redirectUri = `${window.location.origin}/xero-callback`;
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 XERO_SCOPES,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 crypto.randomUUID(),
  });
  window.location.href = `${XERO_AUTH_URL}?${params}`;
}

/** Called after Xero redirects back with ?code=... */
export async function handleXeroCallback(code: string): Promise<{ orgName: string; tenantId: string }> {
  const clientId     = getXeroClientId();
  const clientSecret = getXeroClientSecret();
  const verifier     = sessionStorage.getItem(XERO_CODE_VERIFIER_KEY);
  if (!clientId || !verifier) throw new Error('Missing Xero client ID or code verifier');

  const redirectUri = `${window.location.origin}/xero-callback`;

  const params: Record<string, string> = {
    grant_type:    'authorization_code',
    client_id:     clientId,
    code,
    redirect_uri:  redirectUri,
    code_verifier: verifier,
  };
  if (clientSecret) params.client_secret = clientSecret;

  const resp = await fetch(XERO_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Xero token exchange failed: ${err}`);
  }

  const tokenData = await resp.json();
  storeTokens(tokenData);
  sessionStorage.removeItem(XERO_CODE_VERIFIER_KEY);

  // Fetch organisation/tenant info (non-fatal)
  let orgName = 'Xero Organisation';
  let tenantId = '';
  try {
    const connResp = await fetch(XERO_CONN_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (connResp.ok) {
      const connections = await connResp.json();
      const tenant = Array.isArray(connections) && connections[0];
      if (tenant) {
        sessionStorage.setItem(XERO_TENANT_ID_KEY, tenant.tenantId);
        sessionStorage.setItem(XERO_ORG_NAME_KEY, tenant.tenantName);
        orgName = tenant.tenantName;
        tenantId = tenant.tenantId;
      }
    }
  } catch {
    // Connection info unavailable — token still valid
  }

  return { orgName, tenantId };
}

// ── Token management ──────────────────────────────────────────────────────────

async function getValidAccessToken(): Promise<string> {
  if (!isTokenExpired()) {
    return sessionStorage.getItem(XERO_ACCESS_TOKEN_KEY)!;
  }

  const { refreshToken } = getXeroTokens();
  const clientId     = getXeroClientId();
  const clientSecret = getXeroClientSecret();
  if (!refreshToken || !clientId) throw new Error('Not authenticated with Xero — please reconnect');

  const params: Record<string, string> = {
    grant_type:    'refresh_token',
    client_id:     clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) params.client_secret = clientSecret;

  const resp = await fetch(XERO_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  if (!resp.ok) {
    clearXeroTokens();
    throw new Error('Xero session expired — please reconnect');
  }

  const tokenData = await resp.json();
  storeTokens(tokenData);
  return tokenData.access_token;
}

// ── Invoice API ───────────────────────────────────────────────────────────────

export interface XeroInvoiceRequest {
  customer: Customer;
  job: Job;
}

export interface XeroInvoiceResponse {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
}

export async function createXeroInvoice(request: XeroInvoiceRequest): Promise<XeroInvoiceResponse> {
  try {
    const accessToken = await getValidAccessToken();
    const { tenantId } = getXeroTokens();
    const { customer, job } = request;

    const lineItems = [
      {
        Description: `${job.serviceType.charAt(0).toUpperCase() + job.serviceType.slice(1)} Service`,
        Quantity:    job.laborHours,
        UnitAmount:  job.laborRate,
        AccountCode: '200',
      },
      ...(job.partsCost > 0
        ? [{
            Description: 'Parts & Materials',
            Quantity:    1,
            UnitAmount:  job.partsCost,
            AccountCode: '200',
          }]
        : []),
    ];

    const resp = await fetch(`${XERO_API_BASE}/api.xro/2.0/Invoices`, {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Content-Type':   'application/json',
        Accept:           'application/json',
      },
      body: JSON.stringify({
        Invoices: [{
          Type:        'ACCREC',
          Contact:     { Name: customer.name, EmailAddress: customer.email },
          LineItems:   lineItems,
          Status:      'DRAFT',
          Reference:   job.id,
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { success: false, error: `Xero API error: ${err}` };
    }

    const data = await resp.json();
    const created = data.Invoices?.[0];
    return {
      success:       true,
      invoiceId:     created?.InvoiceID,
      invoiceNumber: created?.InvoiceNumber,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Quote API ─────────────────────────────────────────────────────────────────

export interface XeroQuoteRequest {
  customer: Customer;
  job: Job;
}

export interface XeroQuoteResponse {
  success: boolean;
  quoteId?: string;
  quoteNumber?: string;
  onlineUrl?: string;
  error?: string;
}

export async function createXeroQuote(request: XeroQuoteRequest): Promise<XeroQuoteResponse> {
  try {
    const accessToken = await getValidAccessToken();
    const { tenantId } = getXeroTokens();
    const { customer, job } = request;

    const lineItems = [
      {
        Description: job.serviceType
          ? `${job.serviceType.charAt(0).toUpperCase() + job.serviceType.slice(1)} Service`
          : job.title || 'Service',
        Quantity: job.laborHours || 1,
        UnitAmount: job.laborRate || 0,
        AccountCode: '200',
      },
      ...(job.partsCost > 0
        ? [{
            Description: 'Parts & Materials',
            Quantity: 1,
            UnitAmount: job.partsCost,
            AccountCode: '200',
          }]
        : []),
    ];

    const resp = await fetch(`${XERO_API_BASE}/api.xro/2.0/Quotes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        Quotes: [{
          Contact: { Name: customer.name, EmailAddress: customer.email },
          LineItems: lineItems,
          Status: 'SENT',
          Title: job.title || `Quote – ${customer.name}`,
          Reference: job.id,
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { success: false, error: `Xero API error: ${err}` };
    }

    const data = await resp.json();
    const created = data.Quotes?.[0];
    const quoteId = created?.QuoteID;
    return {
      success: true,
      quoteId,
      quoteNumber: created?.QuoteNumber,
      onlineUrl: quoteId ? `https://go.xero.com/app/quotes/${quoteId}` : undefined,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Legacy compat (used by Billing.tsx etc.) ──────────────────────────────────

export const getXeroAuthUrl = (): string => {
  const clientId   = getXeroClientId();
  const redirectUri = `${window.location.origin}/xero-callback`;
  return `${XERO_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(XERO_SCOPES)}`;
};

export const checkXeroConnection = async (): Promise<boolean> => isXeroConnected();

export const xeroApi = {
  createInvoice: createXeroInvoice,

  async getOrganisation(): Promise<{ name: string } | null> {
    const { orgName } = getXeroTokens();
    return orgName ? { name: orgName } : null;
  },

  async syncCustomer(customer: Customer): Promise<boolean> {
    try {
      const accessToken = await getValidAccessToken();
      const { tenantId } = getXeroTokens();
      const resp = await fetch(`${XERO_API_BASE}/api.xro/2.0/Contacts`, {
        method:  'POST',
        headers: {
          Authorization:    `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          'Content-Type':   'application/json',
          Accept:           'application/json',
        },
        body: JSON.stringify({
          Contacts: [{
            Name:          customer.name,
            EmailAddress:  customer.email,
            Phones:        customer.phone
              ? [{ PhoneType: 'DEFAULT', PhoneNumber: customer.phone }]
              : [],
          }],
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  },
};

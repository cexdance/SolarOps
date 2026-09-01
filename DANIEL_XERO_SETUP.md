# Xero setup - one time, about 10 minutes

You only do this once. After that you never touch it again. Nothing here gives anyone
access to SolarOps, and SolarOps is not being connected to Xero. This creates a separate,
standalone app that reads the contractor bills and marks them paid.

## 1. Register the app

1. Go to https://developer.xero.com/app/manage and sign in with your normal Xero login.
2. Click **New app**.
3. Fill in:
   - App name: `Conexsol Contractor Payments`
   - Integration type: **Web app**
   - Company or application URL: `https://solarflow-dashboard-sooty.vercel.app`
   - Redirect URI: `https://cjmhfagkkayelcsprbai.supabase.co/functions/v1/xero-oauth-callback`
     (paste it exactly, no trailing slash)
4. Click **Create app**.

## 2. Send back two values

On the app page:

- **Client id** - copy it, it is safe to send.
- **Client secret** - click **Generate a secret**, copy it.

The client id is not sensitive, send it however you like.

**The client secret is a password. Do not email it, text it, or put it in Slack or
WhatsApp.** Instead, call Cesar and read it out loud while he types it in on his end.
It takes a minute and nothing gets stored anywhere. If a call is not practical, use
https://onetimesecret.com - paste the secret there, send the link, and it destroys
itself the moment he opens it.

If the secret ever gets exposed, it is not a crisis. Come back to this same page,
click to generate a new one, and we redo step 3. Nothing else breaks.

## 3. Authorize once

First, double-check that this exact address is saved in the **Redirect URIs** box on the
app's Configuration page. If it is missing, the next step fails with a redirect error:

```
https://cjmhfagkkayelcsprbai.supabase.co/functions/v1/xero-oauth-callback
```

Then open that same address in your browser:

https://cjmhfagkkayelcsprbai.supabase.co/functions/v1/xero-oauth-callback

Pick the Conexsol organisation and click **Allow**. You should land on a page that says
"Connected". Close the tab. That is the last step, and you never do it again.

## 4. One thing to fix in the Xero app

The app is currently NOT allowed to use the `accounting.transactions` permission.
Xero refuses it with "invalid scope" (also `accounting.reports.read` and
`accounting.journals.read`, while contacts, attachments and settings all work).

Without it we can create clients but cannot create invoices, read contractor bills,
or mark anything paid. Look on the app's Configuration page for a scopes or
permissions section and enable Accounting transactions. If there is no such section,
the app was likely created as the wrong integration type; delete it and create a new
one as a **Web app**, then send the new client id and secret.

## 5. One question to answer

**Which Xero bank account do the contractor Zelle payments come out of?**

And: **which revenue account code should the $120 site transfer post to?** The tax
side is settled, you confirmed it is a flat fee with no tax.

When you tick a contractor off as paid, the system posts that payment in Xero for you, and
it needs to know which account to post it against. Give the account name exactly as it
appears in Xero.

## What this app is allowed to do

- Read your contractor bills (the ACCPAY invoices) and their PDF attachments.
- Mark a bill as paid when you tick it off.

That is all. It cannot see customer invoices you raise, it cannot change amounts, and it
cannot move any money. You still send every Zelle yourself from the BofA app exactly as
you do today.

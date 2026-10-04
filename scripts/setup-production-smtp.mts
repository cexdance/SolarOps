/** Loopback-only password entry. Never log credentials or place them in the repo. */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { smtpTransport, validateSmtp, type SmtpSettings } from './production-smtp.mts';
const token = randomBytes(32).toString('hex');
const origin = 'http://127.0.0.1:4790'; let busy = false; let completed = false;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SolarOps SMTP setup</title><style>body{font:16px system-ui;background:#f1f5f9;color:#0f172a;max-width:540px;margin:40px auto;padding:20px}form{background:white;padding:24px;border-radius:14px}label{display:block;margin:14px 0 5px}input,select,button{box-sizing:border-box;width:100%;padding:10px;font:inherit;border:1px solid #cbd5e1;border-radius:6px}button{margin-top:24px;background:#0f172a;color:white;cursor:pointer}p{line-height:1.5}#message{color:#334155}</style><h1>SolarOps email notifications</h1><p>Use your outgoing SMTP account. This form connects only to your Mac. Settings will be stored in encrypted GitHub secrets for the SolarOps daily routine and in a private local file for setup checks.</p><form id="setup"><input type="hidden" name="token" value="${token}"><label for="host">SMTP server</label><input id="host" name="host" placeholder="smtp.example.com" required autocomplete="off"><label for="port">Port</label><input id="port" name="port" type="number" value="465" required min="1" max="65535"><label for="security">Encryption</label><select id="security" name="security"><option value="tls">SSL/TLS (usually port 465)</option><option value="starttls">STARTTLS (usually port 587)</option></select><label for="user">SMTP username</label><input id="user" name="user" required autocomplete="username"><label for="password">SMTP password</label><input id="password" name="password" type="password" required autocomplete="off"><label for="from">Sender email</label><input id="from" name="from" type="email" value="cesar.jurado@conexsol.us" required><button>Verify account and save to SolarOps scheduler</button><p id="message" role="status"></p></form><script>document.getElementById('setup').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button'),m=document.getElementById('message');b.disabled=true;m.textContent='Checking encrypted SMTP connection and saving scheduler settings...';try{const r=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData(f))});const j=await r.json();m.textContent=j.message||j.error;if(r.ok){document.getElementById('password').value='';b.textContent='SMTP account saved';}else b.disabled=false;}catch{m.textContent='Setup connection interrupted. Retry.';b.disabled=false;}};</script></html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");
  if (req.headers.host !== '127.0.0.1:4790') { res.writeHead(403).end(); return; }
  if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(completed ? '<h1>SMTP setup complete</h1><p>Your SolarOps scheduler settings are saved. You may close this tab.</p>' : html); return; }
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST' || req.url !== '/save' || req.headers.origin !== origin || completed || busy) { res.writeHead(403).end(JSON.stringify({ error: 'Setup request rejected' })); return; }
  busy = true;
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16384) throw new Error('Form too large'); }
    const fields = new URLSearchParams(body); const supplied = Buffer.from(fields.get('token') || ''); const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Setup request rejected');
    const config: SmtpSettings = { host: (fields.get('host') || '').trim(), port: Number(fields.get('port')), security: fields.get('security') as SmtpSettings['security'], user: (fields.get('user') || '').trim(), password: fields.get('password') || '', from: (fields.get('from') || '').trim() }; validateSmtp(config);
    const transport = smtpTransport(config); try { await transport.verify(); } finally { transport.close(); }
    const secrets = { SMTP_HOST: config.host, SMTP_PORT: String(config.port), SMTP_SECURITY: config.security, SMTP_USER: config.user, SMTP_PASSWORD: config.password, SMTP_FROM: config.from, SMTP_ENABLED: 'true' };
    for (const [key, value] of Object.entries(secrets)) {
      const saved = spawnSync('gh', ['secret', 'set', key, '--repo', 'cexdance/SolarOps'], { input: value, encoding: 'utf8' });
      if (saved.status !== 0) throw new Error('Scheduler settings could not be saved. Retry.');
    }
    const dir = join(homedir(), '.executor'); mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = join(dir, `solarops-smtp-${randomBytes(8).toString('hex')}.tmp`); writeFileSync(tmp, JSON.stringify(config), { mode: 0o600, flag: 'wx' }); renameSync(tmp, join(dir, 'solarops-smtp.json'));
    completed = true; res.end(JSON.stringify({ message: 'SMTP account verified and saved. Return to this chat and say done so the first pending alerts can be tested.' })); console.log('SMTP account verified and scheduler secrets saved.');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    res.writeHead(400).end(JSON.stringify({ error: code ? `SMTP check failed (${code}). Check host, port, encryption and credentials.` : error instanceof Error ? error.message : 'Setup failed' }));
  } finally { busy = false; }
});
server.listen(4790, '127.0.0.1', () => console.log('SMTP setup ready at http://127.0.0.1:4790/'));

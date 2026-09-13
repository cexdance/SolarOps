import type { Job, Customer } from '../types';
import { allVisits } from './visits';

// Client-facing service report: opens a print-ready window (full-color Conexsol
// header, client details, work done, date, photos). NO financials by design,
// this is the customer's copy. Print/Save-as-PDF from the browser dialog.
// ponytail: window.open + print CSS, no PDF lib. Add jsPDF only if a server-side
// or attach-to-email PDF is ever required.

interface ReportInput {
  job: Job;
  customer?: Customer;
  siteName: string;
  siteAddress?: string;
  clientId?: string;
  serviceType?: string;
  /** Multi-visit orders only: print just this visit number instead of all. */
  visit?: number;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const fmtDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

export function printServiceReport({ job, customer, siteName, siteAddress, clientId, serviceType, visit }: ReportInput): void {
  const origin = window.location.origin;
  // Multi-visit orders print one section per visit (or only the one asked for);
  // a single-visit order renders exactly as it always has.
  const visits = job.visits?.length ? allVisits(job) : [];
  const shown = visit ? visits.filter(v => v.number === visit) : visits;
  const one = visit ? shown[0] : undefined;
  const completed = one ? fmtDate(one.finishedAt) : fmtDate(job.completedAt);
  const scheduled = one ? fmtDate(one.date && `${one.date}T12:00:00`) : fmtDate(job.scheduledDate);

  const address = siteAddress ?? customer?.address ?? '';

  // System status shown in Work Performed. requiresFollowUp forces "another visit".
  const statusLabel: Record<string, string> = {
    fully_operational: 'Fully operational',
    partially_operational: 'Partial operation',
    pending_parts: 'Will need another visit',
    could_not_complete: 'Will need another visit',
  };
  const sysStatus = job.requiresFollowUp
    ? 'Will need another visit'
    : (job.serviceStatus ? statusLabel[job.serviceStatus] ?? '' : '');
  const statusColor = sysStatus === 'Fully operational' ? '#16a34a'
    : sysStatus === 'Partial operation' ? '#d97706' : '#dc2626';

  // Humanized fallback caption when a photo has no explicit name.
  const photoLabel: Record<string, string> = {
    before: 'Before', after: 'After', serial: 'Serial number', process: 'Process',
    parts: 'Parts', progress: 'Progress', ppe: 'PPE', voltage: 'Voltage',
    old_serial: 'Old serial', string_voltage: 'String voltage', cabinet_old: 'Cabinet (old)',
    cabinet_new: 'Cabinet (new)', new_serial: 'New serial', inv_overview: 'Inverter overview',
  };

  // Work-done narrative: service report, then completion notes, then notes. Scope
  // line items contribute description + qty only (prices stripped).
  const workParas = [job.serviceReport, job.completionNotes, job.notes]
    .map(t => (t ?? '').trim())
    .filter(Boolean)
    .map(t => `<p>${esc(t)}</p>`)
    .join('');

  const scopeRows = (job.lineItems ?? [])
    .filter(li => (li.description ?? '').trim())
    .map(li => `<li>${esc(li.description)}${li.quantity && li.quantity > 1 ? ` <span class="qty">×${esc(li.quantity)}</span>` : ''}</li>`)
    .join('');

  const isPdf = (p: { mimeType?: string; name?: string }) => p.mimeType === 'application/pdf' || /\.pdf(\?|$)/i.test(p.name || '');
  const figure = (src: string, cap: string) =>
    `<figure><img src="${esc(src)}" alt="${esc(cap || 'Service photo')}">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
  const capByUrl = new Map((job.woPhotos ?? []).map(p => [p.storageUrl || p.dataUrl, p]));
  const lastNumber = visits.length ? visits[visits.length - 1].number : 0;
  const visitSections = shown.map(v => {
    const final = v.number === lastNumber;
    const st = v.plan && !['approved', 'included'].includes(v.plan.approval) ? 'Awaiting quote review' : !v.finishedAt ? 'Visit pending completion' : final ? sysStatus : 'Return visit needed';
    const color = final ? statusColor : '#d97706';
    const pics = v.photoUrls
      .filter(u => { const p = capByUrl.get(u); return !p || !isPdf(p); })
      .map(u => { const p = capByUrl.get(u); return figure(u, p ? (p.name?.trim() || photoLabel[p.category] || '') : ''); })
      .join('');
    const when = fmtDate(v.date && `${v.date}T12:00:00`) || fmtDate(v.finishedAt);
    return `<h2>Visit ${v.number}${when ? ` &nbsp;·&nbsp; ${esc(when)}` : ''}</h2>
  ${st ? `<div class="status"><span class="dot" style="background:${color}"></span>System status: <strong>${esc(st)}</strong></div>` : ''}
  ${v.serviceType ? `<p><strong>Service:</strong> ${esc(v.serviceType)}</p>` : ''}
  ${v.parts?.length ? `<p><strong>Parts:</strong> ${v.parts.map(p => `${esc(p.name)} x ${p.quantity}`).join(', ')}</p>` : ''}
  ${v.labor?.length ? `<p><strong>Labor:</strong> ${v.labor.map(l => `${esc(l.description)}: ${l.hours} hours`).join('; ')}</p>` : ''}
  ${v.workDone ? `<p>${esc(v.workDone)}</p>` : '<p style="color:#94a3b8">No work summary recorded.</p>'}
  ${!final && v.nextSteps ? `<p><strong>Left for the next visit:</strong> ${esc(v.nextSteps)}</p>` : ''}
  ${pics ? `<div class="photos">${pics}</div>` : ''}`;
  }).join('');

  const photos = (job.woPhotos ?? [])
    // PDF attachments can't render as <img>, keep them out of the print report
    .filter(p => !isPdf(p))
    .map(p => ({ src: p.storageUrl || p.dataUrl, cap: (p.name?.trim() || photoLabel[p.category] || '') }))
    .filter(p => p.src)
    .map(p => figure(p.src, p.cap))
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Service Report ${esc(job.woNumber ?? '')}${one ? ` Visit ${one.number}` : ''}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; max-width: 800px; margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1565c0; padding-bottom: 16px; margin-bottom: 28px; }
  header img { height: 104px; width: auto; }
  header .meta { text-align: right; font-size: 12px; color: #64748b; }
  header .meta .wo { font-size: 18px; font-weight: 700; color: #0f172a; font-family: ui-monospace, monospace; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #1565c0; margin: 28px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 14px; }
  .grid .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .grid .val { font-weight: 600; margin-bottom: 8px; }
  p { font-size: 14px; line-height: 1.55; margin: 0 0 10px; white-space: pre-wrap; }
  ul { font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0; }
  .qty { color: #64748b; font-weight: 600; }
  .status { font-size: 13px; color: #475569; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
  .status .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .photos figure { margin: 0; break-inside: avoid; position: relative; }
  .photos img { width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; display: block; }
  .photos figcaption { position: absolute; left: 8px; right: 8px; bottom: 8px; background: rgba(15,23,42,0.62); color: #fff; font-size: 11px; line-height: 1.3; padding: 4px 8px; border-radius: 6px; }
  footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } }
</style></head>
<body>
  <header>
    <img src="${origin}/conexsol-logo.png" alt="Conexsol">
    <div class="meta">
      <div class="wo">${esc(job.woNumber ?? 'Service Order')}</div>
      ${clientId ? `<div>${esc(clientId)}</div>` : ''}
      ${completed ? `<div>Completed ${esc(completed)}</div>` : scheduled ? `<div>Scheduled ${esc(scheduled)}</div>` : ''}
    </div>
  </header>

  <h1>Service Report${one ? `, Visit ${one.number} of ${visits.length}` : visits.length ? ` (${visits.length} visits)` : ''}</h1>

  <h2>Client Details</h2>
  <div class="grid">
    <div>
      ${clientId ? `<div class="item"><div class="label">Client Number</div><div class="val">${esc(clientId)}</div></div>` : ''}
      <div class="item"><div class="label">Name</div><div class="val">${esc(customer?.name ?? siteName)}</div></div>
      ${address ? `<div class="item"><div class="label">Address</div><div class="val">${esc(address)}</div></div>` : ''}
    </div>
    <div>
      ${(completed || scheduled) ? `<div class="item"><div class="label">Service Date</div><div class="val">${esc(completed || scheduled)}</div></div>` : ''}
      ${serviceType ? `<div class="item"><div class="label">Service Type</div><div class="val">${esc(serviceType)}</div></div>` : ''}
    </div>
  </div>

  ${visits.length ? `${scopeRows ? `<h2>Scope of Work</h2><ul>${scopeRows}</ul>` : ''}
  ${visitSections}` : `<h2>Work Performed</h2>
  ${sysStatus ? `<div class="status"><span class="dot" style="background:${statusColor}"></span>System status: <strong>${esc(sysStatus)}</strong></div>` : ''}
  ${workParas || '<p style="color:#94a3b8">No work summary recorded.</p>'}
  ${scopeRows ? `<ul>${scopeRows}</ul>` : ''}

  ${photos ? `<h2>WO Details</h2><div class="photos">${photos}</div>` : ''}`}

  <footer>Conexsol Solar Operations &nbsp;·&nbsp; solar.ops@conexsol.us &nbsp;·&nbsp; Generated ${esc(fmtDate(new Date().toISOString()))}</footer>
</body></html>`;

  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) {
    alert('Please allow pop-ups to print the service report.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Wait for the logo + photos to load before invoking print, so nothing prints blank.
  win.addEventListener('load', () => {
    const imgs = Array.from(win.document.images);
    const pending = imgs.filter(img => !img.complete);
    if (pending.length === 0) { win.focus(); win.print(); return; }
    let left = pending.length;
    const go = () => { if (--left <= 0) { win.focus(); win.print(); } };
    pending.forEach(img => { img.addEventListener('load', go); img.addEventListener('error', go); });
  });
}

import { useRef, useState } from 'react';
import { Plus, Trash2, Sparkles, ClipboardCheck, Loader2, Package, Upload } from 'lucide-react';
import { authedFetch } from '../lib/supabase';
import { parseDatasheetFile } from '../lib/datasheetParse';
import { resolvePartByNumber } from '../lib/partsLookup';
import type { ReroofWorkflow, ReroofPart, ReroofPartCategory } from '../types';

// ── Category metadata + the standard reroof reinstallation checklist ──────────
// Seeded on demand so Daniel starts from the real part list instead of a blank
// form. Suggested manufacturers/part#s stay blank; the estimator/inventory fill
// them in.
const CATEGORIES: { key: ReroofPartCategory; label: string; hint: string }[] = [
  { key: 'anchors',         label: 'Anchors',                    hint: 'Qty · Part# · Manufacturer' },
  { key: 'anchor_hardware', label: 'Anchor Hardware',            hint: 'Screws, L-foot, T-bolt' },
  { key: 'flashing',        label: 'Flashing Material',          hint: 'Sealants, flashings, tar' },
  { key: 'railing',         label: 'Railing',                    hint: 'Rail + splices' },
  { key: 'micro_rail',      label: 'Microinverter Rail Hardware', hint: 'T-bolt, clips' },
];

const SEED: Record<ReroofPartCategory, string[]> = {
  anchors:         ['Anchor'],
  anchor_hardware: ['Screws', 'L-Foot', 'T-Bolt'],
  flashing:        ['Flex Seal', 'Mesh / Cloth (Flex Seal)', 'M1 Sealant', 'ChemLink Curb Link', 'Pipe Flashing', 'Tar'],
  railing:         ['Railing', 'Railing Splice'],
  micro_rail:      ['T-Bolt'],
};

const rid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const emptyPart = (category: ReroofPartCategory, name = ''): ReroofPart => ({
  id: rid(), category, name, qty: 1,
});

interface Props {
  value?: ReroofWorkflow;
  onChange: (next: ReroofWorkflow) => void;
  readOnly?: boolean;
}

export default function ReroofTab({ value, onChange, readOnly }: Props) {
  const wf: ReroofWorkflow = value ?? { parts: [] };
  const [estimating, setEstimating] = useState<Record<string, boolean>>({});
  const [datasheetBusy, setDatasheetBusy] = useState<Record<string, boolean>>({});
  const [datasheetNote, setDatasheetNote] = useState<Record<string, string>>({});
  const [pendingDatasheetPart, setPendingDatasheetPart] = useState<ReroofPart | null>(null);
  const datasheetInputRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<ReroofWorkflow>) => onChange({ ...wf, ...p });
  const setParts = (parts: ReroofPart[]) => patch({ parts });

  const addPart = (category: ReroofPartCategory, name = '') =>
    setParts([...wf.parts, emptyPart(category, name)]);

  const updatePart = (id: string, p: Partial<ReroofPart>) =>
    setParts(wf.parts.map(x => (x.id === id ? { ...x, ...p } : x)));

  const removePart = (id: string) => setParts(wf.parts.filter(x => x.id !== id));

  const seedChecklist = () => {
    const seeded: ReroofPart[] = [];
    (Object.keys(SEED) as ReroofPartCategory[]).forEach(cat => {
      // ponytail: skip categories that already have rows so a second click can't duplicate
      if (wf.parts.some(p => p.category === cat)) return;
      SEED[cat].forEach(name => seeded.push(emptyPart(cat, name)));
    });
    if (seeded.length) setParts([...wf.parts, ...seeded]);
  };

  // ── Local part# lookup (catalog + inventory) ──────────────────────────────────
  // Free and instant, so it runs on every blur with no size/cost guard, unlike
  // the paid web estimate below. Checked first so a known part never spends a
  // web search on price OR name; see resolvePartByNumber for source ordering.
  const lookupLocal = (part: ReroofPart) => {
    if (readOnly || !part.partNumber?.trim()) return;
    const hit = resolvePartByNumber(part.partNumber);
    if (!hit) return;
    const patch: Partial<ReroofPart> = {};
    if (!part.name.trim() && hit.name) patch.name = hit.name;
    if (part.unitPrice == null && hit.unitCost) {
      patch.unitPrice = hit.unitCost;
      patch.priceSource = `${hit.source} match`;
    }
    if (Object.keys(patch).length) updatePart(part.id, patch);
  };

  // ── Internet price estimate (Claude web_search via /api/parse-lead-image) ────
  const estimate = async (part: ReroofPart) => {
    if (!part.name.trim()) return;
    setEstimating(s => ({ ...s, [part.id]: true }));
    try {
      // authedFetch, not fetch: /api/parse-lead-image requires a signed-in caller
      // because every call spends ANTHROPIC_API_KEY. A plain fetch sends no
      // Authorization header and now gets a 401.
      const res = await authedFetch('/api/parse-lead-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'price-estimate',
          name: part.name,
          partNumber: part.partNumber || '',
          manufacturer: part.manufacturer || '',
        }),
      });
      if (!res.ok) throw new Error(`estimator ${res.status}`);
      const data = await res.json() as {
        estimate?: number;
        name?: string;
        manufacturer?: string;
        points?: { source: string; price: number; url?: string }[];
      };
      updatePart(part.id, {
        // Manual override wins: only fill fields the user hasn't already set.
        name: part.name.trim() ? part.name : (data.name ?? part.name),
        manufacturer: part.manufacturer || data.manufacturer,
        unitPrice: part.unitPrice ?? data.estimate,
        pricePoints: data.points ?? [],
        priceSource: data.points?.length ? `${data.points.length}-source web avg` : part.priceSource,
        priceEstimatedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[reroof] price estimate failed', e);
      updatePart(part.id, { priceSource: `estimate failed${msg ? ` (${msg})` : ''}` });
    } finally {
      setEstimating(s => ({ ...s, [part.id]: false }));
    }
  };

  // ── Datasheet upload (PDF/photo) -> auto-fill name / part# / manufacturer ────
  const handleDatasheetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const part = pendingDatasheetPart;
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !part) return;
    setDatasheetBusy(s => ({ ...s, [part.id]: true }));
    setDatasheetNote(s => ({ ...s, [part.id]: '' }));
    try {
      const p = await parseDatasheetFile(file);
      updatePart(part.id, {
        // Manual edits win: only fill fields the user hasn't already typed.
        name: part.name.trim() ? part.name : (p.name ?? part.name),
        partNumber: part.partNumber || p.partNumber,
        manufacturer: part.manufacturer || p.manufacturer,
      });
      setDatasheetNote(s => ({ ...s, [part.id]: 'Filled from datasheet' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[reroof] datasheet parse failed', err);
      setDatasheetNote(s => ({ ...s, [part.id]: `datasheet parse failed (${msg})` }));
    } finally {
      setDatasheetBusy(s => ({ ...s, [part.id]: false }));
    }
  };

  const lineTotal = (p: ReroofPart) => (p.unitPrice ?? 0) * (p.qty || 0);
  const partsTotal = wf.parts.reduce((s, p) => s + lineTotal(p), 0);
  const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const generateProcurement = () => {
    patch({
      procurement: {
        createdAt: new Date().toISOString(),
        status: 'draft',
        items: wf.parts.filter(p => (p.qty || 0) > 0).map(p => ({ ...p })),
      },
    });
  };

  // No width here: per-input widths (flex-1, w-16…) below would lose to w-full.
  const field = 'px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-slate-50';

  return (
    <div className="space-y-6">
      {/* ── System details ─────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">System</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-slate-500 space-y-1">
            <span>System Manufacturer</span>
            <input className={`${field} w-full`} disabled={readOnly} value={wf.systemManufacturer ?? ''}
              onChange={e => patch({ systemManufacturer: e.target.value })} placeholder="e.g. Enphase, SolarEdge" />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Panel Qty</span>
            <input type="number" min={0} className={`${field} w-full`} disabled={readOnly} value={wf.panelQty ?? ''}
              onChange={e => patch({ panelQty: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Roof Type</span>
            <input className={`${field} w-full`} disabled={readOnly} value={wf.roofType ?? ''}
              onChange={e => patch({ roofType: e.target.value })} placeholder="Shingle, Tile, Metal…" />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Number of Stories</span>
            <input type="number" min={1} className={`${field} w-full`} disabled={readOnly} value={wf.stories ?? ''}
              onChange={e => patch({ stories: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Rail System Type</span>
            <input className={`${field} w-full`} disabled={readOnly} value={wf.railSystemType ?? ''}
              onChange={e => patch({ railSystemType: e.target.value })} placeholder="IronRidge, Unirac…" />
          </label>
        </div>
      </section>

      {/* ── Reinstallation parts ───────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Reinstallation Parts</h3>
          {!readOnly && (
            <button onClick={seedChecklist}
              className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1">
              <ClipboardCheck className="w-3.5 h-3.5" /> Load standard checklist
            </button>
          )}
        </div>

        {wf.parts.length === 0 && (
          <p className="text-xs text-slate-400 py-6 text-center">
            No parts yet. Load the standard checklist or add rows per section below.
          </p>
        )}

        <div className="space-y-5">
          {CATEGORIES.map(cat => {
            const rows = wf.parts.filter(p => p.category === cat.key);
            return (
              <div key={cat.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-xs font-semibold text-slate-700">{cat.label}</span>
                    <span className="text-[11px] text-slate-400 ml-2">{cat.hint}</span>
                  </div>
                  {!readOnly && (
                    <button onClick={() => addPart(cat.key)}
                      className="text-[11px] text-slate-500 hover:text-orange-600 flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>

                {rows.length === 0 ? (
                  <div className="text-[11px] text-slate-300 pl-1 pb-1">none</div>
                ) : (
                  <div className="space-y-1.5">
                    {rows.map(p => {
                      const busy = estimating[p.id];
                      return (
                        <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input className={`${field} flex-1 min-w-[8rem] bg-white`} disabled={readOnly}
                              placeholder="Item" value={p.name}
                              onChange={e => updatePart(p.id, { name: e.target.value })} />
                            <input type="number" min={0} className={`${field} w-16 bg-white`} disabled={readOnly}
                              title="Qty" value={p.qty}
                              onChange={e => updatePart(p.id, { qty: Number(e.target.value) })} />
                            <input className={`${field} w-28 bg-white`} disabled={readOnly}
                              placeholder="Part#" value={p.partNumber ?? ''}
                              onChange={e => updatePart(p.id, { partNumber: e.target.value })}
                              onBlur={e => lookupLocal({ ...p, partNumber: e.target.value })} />
                            <input className={`${field} w-32 bg-white`} disabled={readOnly}
                              placeholder="Manufacturer" value={p.manufacturer ?? ''}
                              onChange={e => updatePart(p.id, { manufacturer: e.target.value })} />
                            <div className="flex items-center gap-0.5">
                              <span className="text-slate-400 text-sm">$</span>
                              <input type="number" min={0} step="0.01" className={`${field} w-20 bg-white`} disabled={readOnly}
                                placeholder="Unit" value={p.unitPrice ?? ''}
                                onChange={e => updatePart(p.id, { unitPrice: e.target.value === '' ? undefined : Number(e.target.value) })} />
                            </div>
                            {!readOnly && (
                              <>
                                <button onClick={() => { setPendingDatasheetPart(p); datasheetInputRef.current?.click(); }}
                                  disabled={datasheetBusy[p.id]}
                                  title="Upload datasheet (PDF/photo) to auto-fill name / Part# / manufacturer"
                                  className="px-2 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40">
                                  {datasheetBusy[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                </button>
                                <button onClick={() => estimate(p)} disabled={busy || !p.name.trim()}
                                  title="Estimate price from 3 web sources"
                                  className="px-2 py-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-40">
                                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                </button>
                                <button onClick={() => removePart(p.id)} title="Remove"
                                  className="px-2 py-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                          {datasheetNote[p.id] && (
                            <div className="mt-1 pl-1 text-[11px] text-slate-400">{datasheetNote[p.id]}</div>
                          )}
                          {(p.priceSource || (p.pricePoints?.length ?? 0) > 0) && (
                            <div className="mt-1 pl-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3">
                              {p.priceSource && <span>{p.priceSource}</span>}
                              {p.pricePoints?.map((pt, i) => (
                                <span key={i}>
                                  {pt.url
                                    ? <a href={pt.url} target="_blank" rel="noreferrer" className="hover:text-orange-600 underline">{pt.source}</a>
                                    : pt.source}: {money(pt.price)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <input ref={datasheetInputRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={handleDatasheetFile} />
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">Estimated parts total</span>
          <span className="text-sm font-semibold text-slate-800">{money(partsTotal)}</span>
        </div>
      </section>

      {/* ── Procurement order ──────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-slate-500" /> Procurement Order
          </h3>
          {!readOnly && (
            <button onClick={generateProcurement} disabled={wf.parts.length === 0}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">
              {wf.procurement ? 'Regenerate from parts' : 'Generate procurement order'}
            </button>
          )}
        </div>

        {!wf.procurement ? (
          <p className="text-xs text-slate-400">Generate an order from the parts above for Cesar to procure.</p>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
              <span>Created {new Date(wf.procurement.createdAt).toLocaleDateString()}</span>
              <select className="border border-slate-200 rounded px-2 py-1" disabled={readOnly}
                value={wf.procurement.status}
                onChange={e => patch({ procurement: { ...wf.procurement!, status: e.target.value as 'draft' | 'ordered' | 'received' } })}>
                <option value="draft">Draft</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
              </select>
            </div>
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left">
                <tr><th className="py-1">Item</th><th>Qty</th><th>Part#</th><th>Mfr</th><th className="text-right">Est.</th></tr>
              </thead>
              <tbody>
                {wf.procurement.items.map(it => (
                  <tr key={it.id} className="border-t border-slate-50">
                    <td className="py-1 text-slate-700">{it.name || '—'}</td>
                    <td>{it.qty}</td>
                    <td className="text-slate-500">{it.partNumber || '—'}</td>
                    <td className="text-slate-500">{it.manufacturer || '—'}</td>
                    <td className="text-right text-slate-700">{money(lineTotal(it))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-800">
                  <td className="py-1.5" colSpan={4}>Total</td>
                  <td className="text-right">
                    {money(wf.procurement.items.reduce((s, p) => s + lineTotal(p), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

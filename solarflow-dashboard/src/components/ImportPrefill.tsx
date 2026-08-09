// Reusable "prefill the Add-Customer form from a file" panel.
// Two sources, both parse ONE record and hand the parsed fields back via onParsed;
// the parent decides how to merge them onto its own formData.
//   - screenshot: a SolarEdge lead-email image, parsed by Claude Vision (/api/parse-lead-image)
//   - excel:      the first data row of an xlsx/xls/csv (SolarEdge "Site Main Contact / RMA" export)
// Extracted from the retired Lead Lobby so both Add-Customer modals share one implementation.
import React, { useRef, useState } from 'react';
import { Camera, FileSpreadsheet, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { authedFetch } from '../lib/supabase';
import { ParsedContact, mapRowToContact, mapVisionToContact, readFirstSheetRow } from '../lib/leadImport';

type Source = 'screenshot' | 'excel';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const ImportPrefill: React.FC<{
  sources: Source[];
  onParsed: (fields: ParsedContact) => void;
}> = ({ sources, onParsed }) => {
  const [open, setOpen] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const xlsRef = useRef<HTMLInputElement>(null);

  const reset = () => { setError(''); setOk(''); };
  const toggle = (s: Source) => { setOpen(o => (o === s ? null : s)); reset(); setPreview(null); };

  const parseImage = async (file: File) => {
    if (!IMAGE_TYPES.includes(file.type)) { setError('Please choose an image file.'); return; }
    reset();
    const dataUrl: string = await new Promise((res) => {
      const r = new FileReader();
      r.onload = e => res(e.target?.result as string);
      r.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setBusy(true);
    try {
      const [, imageBase64] = dataUrl.split(',');
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
      const resp = await authedFetch('/api/parse-lead-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(data.error ?? 'Could not read the screenshot. Try again.'); return; }
      onParsed(mapVisionToContact(data));
      setOk('Parsed. Review the fields below, then save.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const parseExcel = async (file: File) => {
    reset();
    setBusy(true);
    try {
      const row = await readFirstSheetRow(file);
      if (!row) { setError('No rows found in that spreadsheet.'); return; }
      const fields = mapRowToContact(row);
      if (!fields.firstName && !fields.phone && !fields.email) {
        setError('Could not find a name, phone, or email in the first row. Check the column headers.');
        return;
      }
      onParsed(fields);
      setOk('First row loaded. Review the fields below, then save.');
    } catch (err) {
      setError(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (open !== 'screenshot') return;
    const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))?.getAsFile();
    if (file) { e.preventDefault(); parseImage(file); }
  };

  return (
    <div className="space-y-2" onPaste={onPaste}>
      {sources.includes('screenshot') && (
        <div className="border-2 border-orange-200 rounded-xl bg-orange-50/40">
          <button
            type="button"
            onClick={() => toggle('screenshot')}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-orange-800 hover:bg-orange-100/60 rounded-xl transition-colors"
          >
            <span className="flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-orange-500" /> Import from Screenshot</span>
            {open === 'screenshot' ? <ChevronUp className="w-3.5 h-3.5 text-orange-500" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-500" />}
          </button>
          {open === 'screenshot' && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[11px] text-slate-500">Upload or paste a screenshot of a SolarEdge lead email. AI extracts the contact info.</p>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parseImage(f); }} />
              <div
                onClick={() => imgRef.current?.click()}
                className={`border-2 border-dashed rounded-lg overflow-hidden cursor-pointer transition-colors ${preview ? 'border-orange-300 bg-orange-50' : 'border-slate-300 bg-white hover:border-orange-400'}`}
              >
                {preview
                  ? <img src={preview} alt="Screenshot preview" className="w-full max-h-40 object-contain" />
                  : <div className="py-4 text-center text-[11px] text-slate-400">Click to upload, or paste an image here</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {sources.includes('excel') && (
        <div className="border-2 border-orange-200 rounded-xl bg-orange-50/40">
          <button
            type="button"
            onClick={() => toggle('excel')}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-orange-800 hover:bg-orange-100/60 rounded-xl transition-colors"
          >
            <span className="flex items-center gap-2"><FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" /> Import from Excel</span>
            {open === 'excel' ? <ChevronUp className="w-3.5 h-3.5 text-orange-500" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-500" />}
          </button>
          {open === 'excel' && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[11px] text-slate-500">Upload a SolarEdge RMA export (.xlsx, .xls, .csv). The first row prefills the form.</p>
              <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parseExcel(f); }} />
              <button type="button" onClick={() => xlsRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white hover:border-orange-400 py-4 text-[11px] text-slate-400">
                Click to choose a spreadsheet
              </button>
            </div>
          )}
        </div>
      )}

      {(busy || error || ok) && open && (
        <p className={`text-[11px] flex items-center gap-1.5 ${error ? 'text-red-600' : busy ? 'text-slate-500' : 'text-green-600'}`}>
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {busy ? 'Reading...' : error || ok}
        </p>
      )}
    </div>
  );
};

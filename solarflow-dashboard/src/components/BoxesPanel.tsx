// The box view: six QR-labelled containers, what is inside each, and where each
// one currently sits. Backed entirely by ordinary inventory rows, see the "Boxes"
// section of lib/inventoryStore.ts for why there is no Box type.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Package, MapPin, Camera, QrCode, Printer, ArrowLeft, Trash2, Plus, Download } from 'lucide-react';
import { InventoryItem } from '../types';
import {
  BOXES, BOX_HOMES, boxLocation, boxHome, boxContents, findBoxRow,
  moveBox, setBoxPhotos, boxRowId, listBoxes, addBox, isDefaultBox,
} from '../lib/inventoryStore';
import { uploadPhotoToStorage } from '../lib/photoStorage';
import { compressImageToDataUrlUnder } from '../lib/photoCompress';
import { QrScan } from './QrScan';

/**
 * What a box's QR sticker encodes. A plain URL rather than a bare name, so the
 * phone's own camera app opens the box too and nobody has to launch the app first.
 */
export const boxUrl = (box: string): string =>
  `${window.location.origin}/?box=${encodeURIComponent(box)}`;

/**
 * Pull a box name out of whatever was scanned. Accepts a full label URL or a bare
 * box name, so a hand-written sticker still works.
 */
export function boxFromScan(text: string, boxes: string[] = BOXES): string | null {
  let candidate = text.trim();
  try {
    const found = new URL(candidate).searchParams.get('box');
    if (found) candidate = found;
  } catch {
    // Not a URL. Treat the whole string as a box name.
  }
  return boxes.find(b => b.toLowerCase() === candidate.toLowerCase()) ?? null;
}

interface BoxesPanelProps {
  items: InventoryItem[];
  onChange: (items: InventoryItem[]) => void;
  /** Delete a custom box. Separate from onChange because the store persists the
   *  tombstone itself and hands back the fresh live list (like item delete). */
  onDeleteBox: (box: string) => void;
  /** Box to open on mount, from the `?box=` deep link on a scanned label. */
  initialBox?: string | null;
}

export const BoxesPanel: React.FC<BoxesPanelProps> = ({ items, onChange, onDeleteBox, initialBox }) => {
  const [openBox, setOpenBox] = useState<string | null>(initialBox ?? null);
  const [scanning, setScanning] = useState(false);
  // null = not printing; an array = which box labels to send to the print sheet
  // (all boxes from the header printer, or a single box from its detail view).
  const [printing, setPrinting] = useState<string[] | null>(null);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);

  const boxes = useMemo(() => listBoxes(items), [items]);

  const handleScan = (text: string) => {
    setScanning(false);
    const box = boxFromScan(text, boxes);
    if (box) { setScanMiss(null); setOpenBox(box); }
    else setScanMiss(`That code is not one of our box labels (read: "${text.slice(0, 40)}")`);
  };

  const handleAdd = () => {
    const res = addBox(items, newName);
    if (res.error) { setAddErr(res.error); return; }
    setAddErr(null);
    setNewName('');
    onChange(res.items);
    setOpenBox(newName.trim().replace(/\s+/g, ' '));
  };

  if (scanning) return <QrScan onScan={handleScan} onClose={() => setScanning(false)} />;
  if (printing) return <BoxLabelSheet boxes={printing} onClose={() => setPrinting(null)} />;
  if (openBox) {
    return (
      <BoxDetail
        box={openBox}
        items={items}
        onChange={onChange}
        onDelete={() => { onDeleteBox(openBox); setOpenBox(null); }}
        onPrint={() => setPrinting([openBox])}
        onBack={() => setOpenBox(null)}
      />
    );
  }

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setScanning(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium"
        >
          <QrCode className="w-4 h-4" /> Scan a box
        </button>
        <button
          onClick={() => setPrinting(boxes)}
          aria-label="Print all box labels"
          className="px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* Create a box: its QR is generated on demand once it opens. */}
      <div className="flex gap-2 mb-1">
        <input
          value={newName}
          onChange={e => { setNewName(e.target.value); setAddErr(null); }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="New box name (e.g. Ladders)"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 px-3 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add box
        </button>
      </div>
      {addErr && <p className="mb-2 text-xs text-amber-700">{addErr}</p>}
      {scanMiss && <p className="my-3 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{scanMiss}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        {boxes.map(box => {
          const row = findBoxRow(items, box);
          const contents = boxContents(items, box);
          return (
            <button
              key={box}
              onClick={() => setOpenBox(box)}
              className="text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300"
            >
              {row?.imageUrl ? (
                <img src={row.imageUrl} alt="" className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 bg-slate-100 flex items-center justify-center">
                  <Package className="w-7 h-7 text-slate-300" />
                </div>
              )}
              <div className="p-3">
                <div className="font-medium text-slate-900 text-sm">
                  {box}
                  {!isDefaultBox(box) && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">custom</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" /> {boxHome(items, box)}
                  <span className="ml-auto">{contents.length} items</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── One box ──────────────────────────────────────────────────────────────────

const BoxDetail: React.FC<{
  box: string;
  items: InventoryItem[];
  onChange: (items: InventoryItem[]) => void;
  onDelete: () => void;
  onPrint: () => void;
  onBack: () => void;
}> = ({ box, items, onChange, onDelete, onPrint, onBack }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const row = findBoxRow(items, box);
  const photos = row?.photos ?? [];
  const contents = useMemo(() => boxContents(items, box), [items, box]);
  const home = boxHome(items, box);
  const canDelete = !isDefaultBox(box) && contents.length === 0;

  const downloadQr = async () => {
    // Generate a bigger PNG than the on-screen preview so it prints crisp.
    const url = await QRCode.toDataURL(boxUrl(box), { width: 512, margin: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `box-${box.toLowerCase().replace(/\s+/g, '-')}-qr.png`;
    a.click();
  };

  const handleDelete = () => {
    if (!canDelete) return;
    if (confirm(`Delete the "${box}" box? Its QR label stops working. This cannot be undone.`)) onDelete();
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // ponytail: the box row id stands in for the "job id" path segment the
      // uploader takes. Reusing the helper beats a parallel upload path.
      const { url } = await uploadPhotoToStorage(file, boxRowId(box), id);
      // Storage refused (offline, no session): keep a compressed local copy so the
      // photo is not simply lost. It still syncs, just as a fatter data URL.
      added.push(url ?? await compressImageToDataUrlUnder(file));
    }
    onChange(setBoxPhotos(items, box, [...photos, ...added]));
    setBusy(false);
  };

  return (
    <div className="p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-3">
        <ArrowLeft className="w-4 h-4" /> All boxes
      </button>

      <h2 className="text-lg font-semibold text-slate-900">{box}</h2>

      <div className="flex items-center gap-2 mt-3">
        <MapPin className="w-4 h-4 text-slate-400" />
        {BOX_HOMES.map(h => (
          <button
            key={h}
            onClick={() => onChange(moveBox(items, box, h))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              home === h ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {h}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-700">What is inside</h3>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 text-xs text-slate-600 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" /> {busy ? 'Saving...' : 'Add photo'}
          </button>
        </div>
        {/* `capture` opens the camera straight away on a phone, the file picker on desktop. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={e => { addPhotos(e.target.files); e.target.value = ''; }}
        />
        {photos.length === 0 ? (
          <p className="text-sm text-slate-400">No photos yet. Snap one so nobody has to open the box.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(url => (
              <div key={url} className="relative group">
                <img src={url} alt="" className="w-full h-24 object-cover rounded-lg" />
                <button
                  onClick={() => onChange(setBoxPhotos(items, box, photos.filter(p => p !== url)))}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Tracked stock ({contents.length})</h3>
        {contents.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing logged in this box. Receive stock into "{boxLocation(box)}" to track it here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {contents.map(item => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-white">
                <div className="min-w-0">
                  <div className="text-sm text-slate-900 truncate">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.sku}</div>
                </div>
                <span className="text-sm font-medium text-slate-700 shrink-0 ml-3">
                  {item.stockByLocation?.[boxLocation(box)] ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Label</h3>
        <BoxQr box={box} size={160} />
        <div className="flex gap-2 mt-3">
          <button
            onClick={downloadQr}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Save PNG
          </button>
          <button
            onClick={onPrint}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {!isDefaultBox(box) && (
        <div className="mt-8 pt-4 border-t border-slate-100">
          <button
            onClick={handleDelete}
            disabled={!canDelete}
            className="flex items-center gap-1 text-sm text-red-600 disabled:text-slate-300"
          >
            <Trash2 className="w-4 h-4" /> Delete box
          </button>
          {!canDelete && (
            <p className="text-xs text-slate-400 mt-1">Empty this box before deleting it.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── QR rendering ─────────────────────────────────────────────────────────────

const BoxQr: React.FC<{ box: string; size?: number }> = ({ box, size = 128 }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(boxUrl(box), { width: size, margin: 1 })
      .then(url => { if (live) setSrc(url); })
      .catch(() => {});
    return () => { live = false; };
  }, [box, size]);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      {src ? <img src={src} width={size} height={size} alt={`QR label for ${box}`} /> : <div style={{ width: size, height: size }} />}
      <span className="text-xs font-semibold text-slate-900">{box}</span>
    </div>
  );
};

/** Printable sheet of stickers (one box, or all). Print, cut, stick. */
const BoxLabelSheet: React.FC<{ boxes: string[]; onClose: () => void }> = ({ boxes, onClose }) => (
  <div className="p-4">
    <div className="flex gap-2 mb-4 print:hidden">
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <button
        onClick={() => window.print()}
        className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
      >
        <Printer className="w-4 h-4" /> Print
      </button>
    </div>
    <div className="grid grid-cols-2 gap-6">
      {boxes.map(box => (
        <div key={box} className="border border-slate-300 rounded-lg p-4 flex justify-center">
          <BoxQr box={box} size={150} />
        </div>
      ))}
    </div>
  </div>
);

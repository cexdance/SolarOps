// The box view: six QR-labelled containers, what is inside each, and where each
// one currently sits. Backed entirely by ordinary inventory rows, see the "Boxes"
// section of lib/inventoryStore.ts for why there is no Box type.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Package, MapPin, Camera, QrCode, Printer, ArrowLeft, Trash2 } from 'lucide-react';
import { InventoryItem } from '../types';
import {
  BOXES, BOX_HOMES, boxLocation, boxHome, boxContents, findBoxRow,
  moveBox, setBoxPhotos, boxRowId,
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
export function boxFromScan(text: string): string | null {
  let candidate = text.trim();
  try {
    const found = new URL(candidate).searchParams.get('box');
    if (found) candidate = found;
  } catch {
    // Not a URL. Treat the whole string as a box name.
  }
  return BOXES.find(b => b.toLowerCase() === candidate.toLowerCase()) ?? null;
}

interface BoxesPanelProps {
  items: InventoryItem[];
  onChange: (items: InventoryItem[]) => void;
  /** Box to open on mount, from the `?box=` deep link on a scanned label. */
  initialBox?: string | null;
}

export const BoxesPanel: React.FC<BoxesPanelProps> = ({ items, onChange, initialBox }) => {
  const [openBox, setOpenBox] = useState<string | null>(initialBox ?? null);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);

  const handleScan = (text: string) => {
    setScanning(false);
    const box = boxFromScan(text);
    if (box) { setScanMiss(null); setOpenBox(box); }
    else setScanMiss(`That code is not one of our box labels (read: "${text.slice(0, 40)}")`);
  };

  if (scanning) return <QrScan onScan={handleScan} onClose={() => setScanning(false)} />;
  if (printing) return <BoxLabelSheet onClose={() => setPrinting(false)} />;
  if (openBox) {
    return <BoxDetail box={openBox} items={items} onChange={onChange} onBack={() => setOpenBox(null)} />;
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
          onClick={() => setPrinting(true)}
          className="px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {scanMiss && <p className="mb-3 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{scanMiss}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BOXES.map(box => {
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
                <div className="font-medium text-slate-900 text-sm">{box}</div>
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
  onBack: () => void;
}> = ({ box, items, onChange, onBack }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const row = findBoxRow(items, box);
  const photos = row?.photos ?? [];
  const contents = useMemo(() => boxContents(items, box), [items, box]);
  const home = boxHome(items, box);

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
      </div>
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

/** Printable sheet of all six stickers. Print once, cut, stick. */
const BoxLabelSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => (
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
      {BOXES.map(box => (
        <div key={box} className="border border-slate-300 rounded-lg p-4 flex justify-center">
          <BoxQr box={box} size={150} />
        </div>
      ))}
    </div>
  </div>
);

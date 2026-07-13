// Shared full-screen image viewer: click any thumbnail to enlarge, with a
// download button. Used by the customer card (Files & Photos, comments) and the
// Service Order photos grid so every image in the app enlarges the same way.
// Pass `items` + `index` + `onNavigate` to enable gallery mode: prev/next
// arrows, arrow-key navigation, a counter, and a thumbnail strip.
import { useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';

export interface LightboxItem {
  src: string;
  name?: string;
}

interface ImageLightboxProps {
  src: string;
  name?: string;
  onClose: () => void;
  /** Gallery mode: all browsable images, in display order. */
  items?: LightboxItem[];
  /** Gallery mode: index of the currently shown image within `items`. */
  index?: number;
  /** Gallery mode: called with the new index when the user navigates. */
  onNavigate?: (index: number) => void;
}

export function ImageLightbox({ src, name, onClose, items, index, onNavigate }: ImageLightboxProps) {
  const gallery = !!(items && items.length > 1 && index !== undefined && onNavigate);
  const goTo = (i: number) => {
    if (!gallery) return;
    const n = items!.length;
    onNavigate!(((i % n) + n) % n); // wrap around
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (gallery && e.key === 'ArrowLeft') goTo(index! - 1);
      else if (gallery && e.key === 'ArrowRight') goTo(index! + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Force a real download even for cross-origin (Supabase) URLs, where the
  // anchor `download` attribute is otherwise ignored and the file just opens.
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'image';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin/CORS blocked the blob fetch. Fall back to the storage
      // download endpoint: Supabase public URLs honor `?download=<name>` by
      // returning Content-Disposition: attachment, so the browser SAVES the file
      // server-side (the anchor `download` attr alone is ignored cross-origin).
      const sep = src.includes('?') ? '&' : '?';
      const dl = `${src}${sep}download=${encodeURIComponent(name || 'image')}`;
      const a = document.createElement('a');
      a.href = dl;
      a.download = name || 'image';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handleDownload}
          className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Download"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {gallery && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-3 py-1.5 rounded-lg font-medium">
          {index! + 1} / {items!.length}
        </div>
      )}

      {gallery && (
        <>
          <button
            onClick={e => { e.stopPropagation(); goTo(index! - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Previous"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); goTo(index! + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Next"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      <img
        src={src}
        alt={name || ''}
        className={`max-w-full object-contain rounded-lg ${gallery ? 'max-h-[calc(100%-7rem)]' : 'max-h-full'}`}
        onClick={e => e.stopPropagation()}
      />

      {gallery ? (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[92%] flex flex-col items-center gap-1.5"
          onClick={e => e.stopPropagation()}
        >
          {name && (
            <div className="text-white/80 text-xs bg-black/40 px-3 py-1 rounded-lg max-w-full truncate">
              {name}
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1">
            {items!.map((it, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 cursor-pointer transition-all ${
                  i === index ? 'border-orange-400' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={it.src} alt={it.name || ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        name && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-3 py-1.5 rounded-lg max-w-[80%] truncate">
            {name}
          </div>
        )
      )}
    </div>
  );
}

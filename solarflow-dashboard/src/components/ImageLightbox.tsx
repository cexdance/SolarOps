// Shared full-screen image viewer: click any thumbnail to enlarge, with a
// download button. Used by the customer card (Files & Photos, comments) and the
// Service Order photos grid so every image in the app enlarges the same way.
import { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  name?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, name, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      <div className="absolute top-4 right-4 flex gap-2">
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
      <img
        src={src}
        alt={name || ''}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />
      {name && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-3 py-1.5 rounded-lg max-w-[80%] truncate">
          {name}
        </div>
      )}
    </div>
  );
}

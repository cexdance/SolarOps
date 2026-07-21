// Live QR scanner: camera stream -> canvas frame -> jsQR.
//
// jsQR rather than the native BarcodeDetector API, which iOS Safari still does
// not implement. One code path that works on every phone beats two that each
// work on half of them.

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, CameraOff } from 'lucide-react';

interface QrScanProps {
  /** Fires once with the decoded text, then the scanner closes itself. */
  onScan: (text: string) => void;
  onClose: () => void;
  title?: string;
}

export const QrScan: React.FC<QrScanProps> = ({ onScan, onClose, title = 'Scan a box label' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    // Guards the unmount race: a frame already queued must not fire onScan after
    // the component is gone, and must not decode into a torn-down canvas.
    let live = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const video = videoRef.current;
      if (!live || !ctx || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        if (live) frame = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (hit?.data) {
        live = false;
        onScan(hit.data);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      // `environment` is a preference, not a demand: on a laptop with only a
      // front camera an exact constraint would fail outright instead of degrading.
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (!live) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setError('No camera access. Allow the camera, or pick the box from the list.'));

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-medium">{title}</span>
        <button onClick={onClose} aria-label="Close scanner" className="p-2 rounded-lg hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <div className="text-center px-8">
            <CameraOff className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
            {/* Aiming frame. Purely cosmetic: jsQR reads the whole frame. */}
            <div className="absolute w-56 h-56 border-2 border-white/70 rounded-2xl pointer-events-none" />
          </>
        )}
      </div>

      <p className="text-center text-slate-400 text-xs pb-6 px-8">
        Point at the QR sticker on the box.
      </p>
    </div>
  );
};

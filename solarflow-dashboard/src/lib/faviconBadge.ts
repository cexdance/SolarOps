let originalHref: string | null = null;
let cachedImg: HTMLImageElement | null = null;
let lastCount = -1;

function getLinkEl(): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'icon';
    document.head.appendChild(el);
  }
  return el;
}

function getBaseImage(): Promise<HTMLImageElement> {
  if (cachedImg) return Promise.resolve(cachedImg);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { cachedImg = img; resolve(img); };
    img.onerror = () => resolve(img);
    img.src = '/favicon-32.png';
  });
}

function drawBadge(img: HTMLImageElement, count: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, 32, 32);
  } else {
    ctx.fillStyle = '#1e40af';
    ctx.beginPath();
    ctx.roundRect(0, 0, 32, 32, 6);
    ctx.fill();
  }

  const label = count > 99 ? '99+' : String(count);
  const r = label.length > 1 ? 10 : 8;
  const cx = 32 - r;
  const cy = r;

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 2 ? 7 : 9}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 0.5);

  return canvas.toDataURL('image/png');
}

export function setBadge(count: number): void {
  if (count === lastCount) return;
  lastCount = count;

  try {
    const link = getLinkEl();
    if (originalHref === null) originalHref = link.href;

    if (count <= 0) {
      link.href = originalHref;
      document.title = 'SolarOps';
      if ('clearAppBadge' in navigator) {
        (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge().catch(() => {});
      }
      return;
    }

    const label = count > 9 ? '9+' : String(count);
    document.title = `(${label}) SolarOps`;
    if ('setAppBadge' in navigator) {
      (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(Math.min(count, 99)).catch(() => {});
    }

    getBaseImage().then(img => {
      try {
        const dataUrl = drawBadge(img, count);
        if (dataUrl) {
          getLinkEl().href = dataUrl;
        }
      } catch {
        // favicon is cosmetic, never throw
      }
    });
  } catch {
    // favicon is cosmetic, never throw
  }
}

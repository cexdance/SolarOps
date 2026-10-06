// SOW Completion Report as a PDF, captured from the report on screen so the
// file matches what people review and print. Image-based (text is not
// selectable): the owner's choice over a second, hand-drawn layout that would
// drift from the report (2026-10-05). Both libraries load only on click.

const MARGIN_MM = 12;
const A4 = { w: 210, h: 297 };
const SCALE = 2;
// Blocks a page break must not cut through. The tops of these are the only
// places a page may end, unless one block is taller than a whole page.
const BLOCKS = '.sow-section, .sow-photo-grid, .sow-photo-grid .aspect-square, .sow-pdf-page';

/**
 * Where each page ends, in canvas px. Breaks at the lowest block top that fits,
 * but never in the first 30% of a page (that would leave it mostly blank); a
 * page with no usable block top is cut at its full height.
 */
export function pickBreaks(blockTops: number[], total: number, pageH: number): number[] {
  const tops = [...new Set(blockTops)].filter(t => t > 0 && t < total).sort((a, b) => a - b);
  const cuts: number[] = [];
  let start = 0;
  while (total - start > pageH) {
    const limit = start + pageH;
    const fit = tops.filter(t => t > start + pageH * 0.3 && t <= limit).pop();
    start = fit ?? limit;
    cuts.push(start);
  }
  return cuts;
}

/** Render the report in `#sow-dist-print-area` to an A4 PDF. */
export async function buildSowPdf(area: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  let tops: number[] = [];
  const canvas = await html2canvas(area, {
    scale: SCALE,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (doc) => {
      // Same un-floating as the print stylesheet: the report scrolls inside a
      // centered fixed modal, which would clip it to one screen.
      doc.querySelectorAll<HTMLElement>('body > *:not(.sow-print-root)').forEach(e => { e.style.display = 'none'; });
      doc.querySelectorAll<HTMLElement>('.sow-overlay').forEach(e => Object.assign(e.style, { position: 'static', display: 'block', padding: '0', background: 'white' }));
      doc.querySelectorAll<HTMLElement>('.sow-modal-box, .sow-body').forEach(e => Object.assign(e.style, { maxHeight: 'none', overflow: 'visible' }));
      // A browser cannot paint an embedded PDF into a canvas; keep its header.
      doc.querySelectorAll('.sow-pdf-page iframe').forEach(f => f.remove());
      const clone = doc.getElementById(area.id);
      if (!clone) return;
      const base = clone.getBoundingClientRect().top;
      tops = [...clone.querySelectorAll(BLOCKS)].map(b => Math.round((b.getBoundingClientRect().top - base) * SCALE));
    },
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const contentW = A4.w - 2 * MARGIN_MM;
  const pxPerMm = canvas.width / contentW;
  const pageH = Math.floor((A4.h - 2 * MARGIN_MM) * pxPerMm);
  const edges = [0, ...pickBreaks(tops, canvas.height, pageH), canvas.height];
  for (let i = 0; i < edges.length - 1; i++) {
    const h = edges[i + 1] - edges[i];
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = h;
    slice.getContext('2d')!.drawImage(canvas, 0, edges[i], canvas.width, h, 0, 0, canvas.width, h);
    if (i > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.85), 'JPEG', MARGIN_MM, MARGIN_MM, contentW, h / pxPerMm);
  }
  return pdf.output('blob');
}

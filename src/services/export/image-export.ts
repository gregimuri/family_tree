import { toPng, toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

export type ExportImageFormat = 'png' | 'jpeg' | 'pdf';

export interface ExportOptions {
  format: ExportImageFormat;
  widthMm: number;
  heightMm: number;
  pixelRatio?: number;
}

const MM_TO_PX = 3.78;

export async function exportTreeElement(
  element: HTMLElement | SVGSVGElement,
  options: ExportOptions,
): Promise<void> {
  const { format, widthMm, heightMm } = options;
  const pixelRatio = options.pixelRatio ?? 2;
  const widthPx = Math.round(widthMm * MM_TO_PX);
  const heightPx = Math.round(heightMm * MM_TO_PX);

  const common = {
    pixelRatio,
    width: widthPx,
    height: heightPx,
    backgroundColor: '#f5f5f0',
  };

  const node = element as unknown as HTMLElement;

  if (format === 'pdf') {
    const dataUrl = await toPng(node, common);
    const pdf = new jsPDF({
      orientation: widthMm > heightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm);
    pdf.save('drevo-export.pdf');
    return;
  }

  const dataUrl =
    format === 'jpeg'
      ? await toJpeg(node, { ...common, quality: 0.95 })
      : await toPng(node, common);

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `drevo-export.${format}`;
  a.click();
}

export const PRESET_SIZES = [
  { label: 'A4', widthMm: 210, heightMm: 297 },
  { label: 'A3', widthMm: 297, heightMm: 420 },
  { label: 'A2', widthMm: 420, heightMm: 594 },
];

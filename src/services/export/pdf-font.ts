import type { jsPDF } from 'jspdf';

export const PDF_FONT_REGULAR = 'Roboto';
export const PDF_FONT_BOLD = 'Roboto-Bold';

let regularBase64: string | null = null;
let boldBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function loadFontBase64(path: string): Promise<string> {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`Не удалось загрузить шрифт: ${path}`);
  return arrayBufferToBase64(await response.arrayBuffer());
}

async function loadFontData(): Promise<void> {
  if (regularBase64 && boldBase64) return;
  [regularBase64, boldBase64] = await Promise.all([
    loadFontBase64('fonts/Roboto-Regular.ttf'),
    loadFontBase64('fonts/Roboto-Bold.ttf'),
  ]);
}

/** Регистрирует шрифты с поддержкой кириллицы для jsPDF / svg2pdf. */
export async function ensurePdfCyrillicFonts(pdf: jsPDF): Promise<void> {
  await loadFontData();
  const fonts = pdf.getFontList() as Record<string, unknown>;
  if (!fonts[PDF_FONT_REGULAR]) {
    pdf.addFileToVFS('Roboto-Regular.ttf', regularBase64!);
    pdf.addFont('Roboto-Regular.ttf', PDF_FONT_REGULAR, 'normal');
  }
  if (!fonts[PDF_FONT_BOLD]) {
    pdf.addFileToVFS('Roboto-Bold.ttf', boldBase64!);
    pdf.addFont('Roboto-Bold.ttf', PDF_FONT_BOLD, 'normal');
  }
}

export function applyPdfFontFamily(svg: SVGSVGElement): void {
  svg.querySelectorAll('text').forEach((text) => {
    const weight = text.getAttribute('font-weight');
    const isBold = weight === '600' || weight === '700' || weight === 'bold';
    text.setAttribute('font-family', isBold ? PDF_FONT_BOLD : PDF_FONT_REGULAR);
    if (isBold) text.setAttribute('font-weight', 'normal');
  });
}

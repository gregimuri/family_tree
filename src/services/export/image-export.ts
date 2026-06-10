import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import 'svg2pdf.js';
import type { LayoutResult, Project } from '../../types';
import type { TreeFrame } from '../../layout/center-focus';
import { getTreeSheetBounds } from '../../layout/content-bounds';
import { getTreeContentRect } from '../../hooks/tree-viewport';
import { getExportPersonNodes, replaceForeignObjectsWithVectorCards } from './vector-card-export';
import { applyPdfFontFamily, ensurePdfCyrillicFonts } from './pdf-font';
import { throwIfAborted } from './export-abort';

export type ExportImageFormat = 'png' | 'jpeg' | 'pdf';
export type ExportSizeMode = 'tree' | 'fixed';
export type ExportOrientation = 'landscape' | 'portrait';

export interface ExportOptions {
  format: ExportImageFormat;
  sizeMode: ExportSizeMode;
  widthMm?: number;
  heightMm?: number;
  pixelRatio?: number;
  theme?: 'clean' | 'forest';
  signal?: AbortSignal;
}

export interface ExportResolution {
  widthPx: number;
  heightPx: number;
  pixelRatio: number;
  cardRasterRatio: number;
  dpi: number;
}

export interface TreeExportSource {
  svg: SVGSVGElement;
  layout: LayoutResult;
  frame: TreeFrame;
  project: Project;
  getMediaUrl: (filename: string) => string | undefined;
}

export type ExportProgressCallback = (message: string, progress: number) => void;

const EXPORT_PAD = 32;
const MAX_CARD_RASTER_RATIO = 6;
/** Browser canvas limits — scale down raster exports beyond this edge. */
const MAX_RASTER_EDGE_PX = 8192;
const MAX_RASTER_AREA_PX = 50_000_000;

export const EXPORT_DPI = 300;

export function mmToPx(mm: number, dpi: number = EXPORT_DPI): number {
  return Math.round((mm / 25.4) * dpi);
}

/** Физический размер экспорта «по дереву» при заданном DPI. */
export function viewportSizeMm(
  viewport: { width: number; height: number },
  dpi: number = EXPORT_DPI,
): { widthMm: number; heightMm: number } {
  const widthPx = Math.max(1, Math.round(viewport.width * (dpi / 96)));
  const heightPx = Math.max(1, Math.round(viewport.height * (dpi / 96)));
  return {
    widthMm: Math.round((widthPx / dpi) * 25.4 * 10) / 10,
    heightMm: Math.round((heightPx / dpi) * 25.4 * 10) / 10,
  };
}

export function resolveExportResolution(
  options: ExportOptions,
  viewport: { width: number; height: number },
): ExportResolution {
  const dpi = EXPORT_DPI;

  if (options.sizeMode === 'fixed' && options.widthMm && options.heightMm) {
    const widthPx = mmToPx(options.widthMm, dpi);
    const heightPx = mmToPx(options.heightMm, dpi);
    const layoutScale = Math.max(widthPx / viewport.width, heightPx / viewport.height);
    const cardRasterRatio = Math.min(
      MAX_CARD_RASTER_RATIO,
      Math.max(3, Math.ceil(layoutScale * 1.25)),
    );
    return { widthPx, heightPx, pixelRatio: 1, cardRasterRatio, dpi };
  }

  const layoutScale = dpi / 96;
  const widthPx = Math.max(1, Math.round(viewport.width * layoutScale));
  const heightPx = Math.max(1, Math.round(viewport.height * layoutScale));
  const cardRasterRatio = Math.min(
    MAX_CARD_RASTER_RATIO,
    Math.max(2, Math.ceil(layoutScale * 2)),
  );
  return { widthPx, heightPx, pixelRatio: 1, cardRasterRatio, dpi };
}

/** Keeps raster export within browser canvas limits for large trees. */
export function clampExportResolution(resolution: ExportResolution): ExportResolution {
  let { widthPx, heightPx, cardRasterRatio, dpi } = resolution;
  const { pixelRatio } = resolution;
  let scale = 1;
  if (widthPx > MAX_RASTER_EDGE_PX) scale = Math.min(scale, MAX_RASTER_EDGE_PX / widthPx);
  if (heightPx > MAX_RASTER_EDGE_PX) scale = Math.min(scale, MAX_RASTER_EDGE_PX / heightPx);
  const area = widthPx * heightPx;
  if (area > MAX_RASTER_AREA_PX) scale = Math.min(scale, Math.sqrt(MAX_RASTER_AREA_PX / area));
  if (scale >= 1) return resolution;

  widthPx = Math.max(1, Math.round(widthPx * scale));
  heightPx = Math.max(1, Math.round(heightPx * scale));
  cardRasterRatio = Math.max(1, Math.round(cardRasterRatio * scale));
  dpi = Math.max(96, Math.round(dpi * scale));
  return { widthPx, heightPx, pixelRatio, cardRasterRatio, dpi };
}

const INLINE_STYLE_PROPS = [
  'background',
  'background-color',
  'border',
  'border-radius',
  'border-color',
  'border-width',
  'border-style',
  'box-shadow',
  'box-sizing',
  'color',
  'display',
  'flex',
  'flex-direction',
  'flex-shrink',
  'font-family',
  'font-size',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-top',
  'min-height',
  'min-width',
  'object-fit',
  'opacity',
  'outline',
  'outline-offset',
  'overflow',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'width',
  'word-wrap',
  'overflow-wrap',
  '-webkit-line-clamp',
  '-webkit-box-orient',
] as const;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = url;
  });
}

async function waitForImages(root: ParentNode): Promise<void> {
  const images = root.querySelectorAll('img');
  await Promise.all(
    [...images].map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
}

async function embedImages(root: ParentNode): Promise<void> {
  const images = root.querySelectorAll('img');
  await Promise.all(
    [...images].map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const response = await fetch(src, { cache: 'force-cache' });
        const blob = await response.blob();
        img.setAttribute('src', await blobToDataUrl(blob));
      } catch {
        img.remove();
      }
    }),
  );
}

function inlineStylesFromSource(source: Element, clone: Element): void {
  if (source instanceof HTMLElement && clone instanceof HTMLElement) {
    const computed = window.getComputedStyle(source);
    const parts: string[] = [];
    for (const prop of INLINE_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) parts.push(`${prop}:${value}`);
    }
    const existing = clone.getAttribute('style');
    clone.setAttribute('style', existing ? `${existing};${parts.join(';')}` : parts.join(';'));
  }

  const sourceChildren = [...source.children];
  const cloneChildren = [...clone.children];
  for (let i = 0; i < cloneChildren.length; i++) {
    if (sourceChildren[i]) inlineStylesFromSource(sourceChildren[i], cloneChildren[i]);
  }
}

const SELECTION_YELLOW = /#eab308|rgb\(234,\s*179,\s*8\)/i;

function isSelectionColor(value: string): boolean {
  return SELECTION_YELLOW.test(value);
}

/** Remove selection/highlight chrome from a person card DOM subtree before raster export. */
export function stripPersonCardSelectionChrome(root: HTMLElement): void {
  root.classList.remove('selected', 'layout-selected', 'highlighted');

  const html = root.classList.contains('person-card-html')
    ? root
    : (root.querySelector('.person-card-html') as HTMLElement | null);
  if (!html) return;

  html.classList.remove('selected', 'layout-selected');

  const exportBorder = html.dataset.exportBorder;
  if (exportBorder) {
    html.style.borderColor = exportBorder;
  } else if (isSelectionColor(html.style.borderColor)) {
    html.style.removeProperty('border-color');
  }

  const exportShadow = html.dataset.exportBoxShadow;
  if (exportShadow !== undefined) {
    html.style.boxShadow = exportShadow || '0 2px 10px rgba(28, 25, 23, 0.08)';
  } else if (isSelectionColor(html.style.boxShadow)) {
    html.style.boxShadow = '0 2px 10px rgba(28, 25, 23, 0.08)';
  }
}

/** Remove selection styling from SVG clone (edges and card groups). */
export function stripSvgSelectionChrome(svg: SVGSVGElement): void {
  svg.querySelectorAll('.person-card').forEach((node) => {
    node.classList.remove('selected', 'layout-selected', 'highlighted');
  });

  svg.querySelectorAll('.tree-edge--selected').forEach((node) => {
    node.classList.remove('tree-edge--selected');
    node.querySelectorAll('path, line, polyline').forEach((edge) => {
      if (edge.getAttribute('stroke') === '#eab308') {
        edge.removeAttribute('stroke');
      }
    });
  });

  svg.querySelectorAll('.tree-edge-hit.selected').forEach((node) => {
    node.classList.remove('selected');
  });
}

function prepareSvgClone(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('.person-card-html__drag-hint').forEach((el) => el.remove());
  clone.querySelectorAll('.manual-layout-grid').forEach((el) => el.remove());
  stripSvgSelectionChrome(clone);
  return clone;
}

/** svg2pdf requires a DOM tree without foreignObject/HTML and without editor chrome. */
export function sanitizeSvgForVectorExport(svg: SVGSVGElement): void {
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  svg
    .querySelectorAll(
      '.tree-edge-hit, .tree-edge-handle, .layout-marquee, .manual-layout-grid, .person-card-html__drag-hint',
    )
    .forEach((el) => el.remove());

  svg.querySelectorAll('foreignObject').forEach((el) => el.remove());

  svg.querySelectorAll('text').forEach((text) => {
    const fontFamily = text.getAttribute('font-family');
    if (fontFamily?.includes('var(')) {
      text.setAttribute('font-family', 'system-ui, sans-serif');
    }
  });
}

function mountSvgForExport(svg: SVGSVGElement): () => void {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  host.appendChild(svg);
  document.body.appendChild(host);
  return () => {
    host.remove();
  };
}

/** html-to-image не рисует foreignObject в SVG — растеризуем карточки в <image>. */
async function rasterizePersonCards(
  source: SVGSVGElement,
  clone: SVGSVGElement,
  cardRasterRatio: number,
  onProgress?: ExportProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const sourceCards = [...source.querySelectorAll('foreignObject .person-card-html')] as HTMLElement[];
  const cloneForeignObjects = [...clone.querySelectorAll('foreignObject')];
  const total = sourceCards.length;

  for (let i = 0; i < sourceCards.length; i++) {
    throwIfAborted(signal);
    const card = sourceCards[i];
    const foreignObject = cloneForeignObjects[i];
    if (!card || !foreignObject) continue;

    onProgress?.(`Растеризация карточек: ${i + 1} / ${total}`, total > 0 ? (i + 0.5) / total : 0);

    const width = Number.parseFloat(foreignObject.getAttribute('width') ?? '120');
    const height = Number.parseFloat(foreignObject.getAttribute('height') ?? '240');
    const x = foreignObject.getAttribute('x') ?? '0';
    const y = foreignObject.getAttribute('y') ?? '0';

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '-1';

    const cardCopy = card.cloneNode(true) as HTMLElement;
    cardCopy.querySelector('.person-card-html__drag-hint')?.remove();
    cardCopy.style.width = `${width}px`;
    cardCopy.style.height = `${height}px`;
    cardCopy.style.transform = 'none';
    host.appendChild(cardCopy);
    document.body.appendChild(host);
    inlineStylesFromSource(card, cardCopy);
    stripPersonCardSelectionChrome(cardCopy);

    let dataUrl: string;
    try {
      await waitForImages(cardCopy);
      dataUrl = await toPng(cardCopy, {
        pixelRatio: cardRasterRatio,
        cacheBust: true,
        backgroundColor: '#ffffff',
        width,
        height,
      });
    } finally {
      document.body.removeChild(host);
    }

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', dataUrl);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
    image.setAttribute('x', x);
    image.setAttribute('y', y);
    image.setAttribute('width', String(width));
    image.setAttribute('height', String(height));

    foreignObject.parentNode?.replaceChild(image, foreignObject);
  }
}

async function svgToRaster(
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number,
  pixelRatio: number,
  backgroundColor: string,
  format: 'png' | 'jpeg',
  jpegQuality = 0.95,
): Promise<string> {
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx * pixelRatio));
    canvas.height = Math.max(1, Math.round(heightPx * pixelRatio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return format === 'jpeg'
      ? canvas.toDataURL('image/jpeg', jpegQuality)
      : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function computeExportViewport(
  frame: TreeFrame,
  layout: LayoutResult,
  pad = EXPORT_PAD,
) {
  return getTreeContentRect(frame, layout, pad, getTreeSheetBounds(layout));
}

/** Обрезка SVG под экспорт: viewBox, размер растра и фон листа совпадают. */
export function configureSvgForExport(
  svg: SVGSVGElement,
  viewport: { x: number; y: number; width: number; height: number },
  widthPx: number,
  heightPx: number,
  options: { letterbox?: boolean } = {},
): void {
  svg.setAttribute('viewBox', `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
  svg.setAttribute('width', String(widthPx));
  svg.setAttribute('height', String(heightPx));

  if (options.letterbox) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  } else {
    svg.removeAttribute('preserveAspectRatio');
  }

  const bgRect = svg.querySelector('rect');
  if (bgRect) {
    bgRect.setAttribute('x', String(viewport.x));
    bgRect.setAttribute('y', String(viewport.y));
    bgRect.setAttribute('width', String(viewport.width));
    bgRect.setAttribute('height', String(viewport.height));
  }
}

/** @deprecated use configureSvgForExport */
export function configureSvgForFixedPage(
  svg: SVGSVGElement,
  viewport: { x: number; y: number; width: number; height: number },
  widthPx: number,
  heightPx: number,
): void {
  configureSvgForExport(svg, viewport, widthPx, heightPx, { letterbox: true });
}

async function exportVectorPdf(
  svg: SVGSVGElement,
  page: { widthMm: number; heightMm: number },
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  sanitizeSvgForVectorExport(svg);
  applyPdfFontFamily(svg);

  const pdf = new jsPDF({
    orientation: page.widthMm > page.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [page.widthMm, page.heightMm],
  });
  await ensurePdfCyrillicFonts(pdf);
  throwIfAborted(signal);

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const unmount = mountSvgForExport(svg);
  try {
    if (typeof pdf.svg === 'function') {
      await pdf.svg(svg, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      await svg2pdf(svg, pdf, { x: 0, y: 0, width: pageW, height: pageH });
    }
  } finally {
    unmount();
  }

  throwIfAborted(signal);
  pdf.save('drevo-export.pdf');
}

export async function exportTreeElement(
  source: TreeExportSource,
  options: ExportOptions,
  onProgress?: ExportProgressCallback,
): Promise<void> {
  const { format, sizeMode, theme = 'clean', signal } = options;
  const { svg, layout, frame, project, getMediaUrl } = source;
  const backgroundColor = theme === 'forest' ? '#f3e9dc' : '#ffffff';

  throwIfAborted(signal);
  onProgress?.('Подготовка дерева…', 0.02);
  await waitForImages(svg);
  throwIfAborted(signal);
  await embedImages(svg);

  const viewport = computeExportViewport(frame, layout);
  const resolution = clampExportResolution(resolveExportResolution(options, viewport));
  const { widthPx, heightPx, pixelRatio, cardRasterRatio } = resolution;

  const prepared = prepareSvgClone(svg);
  const personNodes = getExportPersonNodes(layout);

  if (format === 'pdf') {
    onProgress?.('Сборка векторных карточек…', 0.15);
    throwIfAborted(signal);
    await replaceForeignObjectsWithVectorCards(prepared, personNodes, project, getMediaUrl);
  } else {
    onProgress?.('Подготовка карточек…', 0.1);
    throwIfAborted(signal);
    await rasterizePersonCards(svg, prepared, cardRasterRatio, onProgress, signal);
  }

  throwIfAborted(signal);
  configureSvgForExport(prepared, viewport, widthPx, heightPx, {
    letterbox: sizeMode === 'fixed',
  });

  if (format === 'pdf') {
    onProgress?.('Формирование PDF…', 0.85);
    const page =
      sizeMode === 'fixed' && options.widthMm && options.heightMm
        ? { widthMm: options.widthMm, heightMm: options.heightMm }
        : viewportSizeMm(viewport);
    await exportVectorPdf(prepared, page, signal);
    onProgress?.('Готово', 1);
    return;
  }

  throwIfAborted(signal);
  onProgress?.('Сборка изображения…', 0.85);
  const rasterFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const dataUrl = await svgToRaster(
    prepared,
    widthPx,
    heightPx,
    pixelRatio,
    backgroundColor,
    rasterFormat,
    0.98,
  );

  onProgress?.('Сохранение файла…', 0.95);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `drevo-export.${format}`;
  a.click();
  onProgress?.('Готово', 1);
}

export const PRESET_SIZES = [
  { label: 'A4', widthMm: 210, heightMm: 297 },
  { label: 'A3', widthMm: 297, heightMm: 420 },
  { label: 'A2', widthMm: 420, heightMm: 594 },
];

export function orientPageDimensions(
  widthMm: number,
  heightMm: number,
  orientation: ExportOrientation,
): { widthMm: number; heightMm: number } {
  const isLandscape = widthMm > heightMm;
  const wantLandscape = orientation === 'landscape';
  if (isLandscape === wantLandscape) return { widthMm, heightMm };
  return { widthMm: heightMm, heightMm: widthMm };
}

export function getPresetDimensions(
  label: string,
  orientation: ExportOrientation = 'landscape',
): { widthMm: number; heightMm: number } {
  const preset = PRESET_SIZES.find((s) => s.label === label);
  if (!preset) return orientPageDimensions(210, 297, orientation);
  return orientPageDimensions(preset.widthMm, preset.heightMm, orientation);
}

import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import type { LayoutResult } from '../../types';
import type { TreeFrame } from '../../layout/center-focus';
import { getTreeContentRect } from '../../hooks/tree-viewport';

export type ExportImageFormat = 'png' | 'jpeg' | 'pdf';
export type ExportSizeMode = 'tree' | 'fixed';

export interface ExportOptions {
  format: ExportImageFormat;
  sizeMode: ExportSizeMode;
  widthMm?: number;
  heightMm?: number;
  pixelRatio?: number;
}

export interface TreeExportSource {
  svg: SVGSVGElement;
  layout: LayoutResult;
  frame: TreeFrame;
}

const MM_TO_PX = 3.78;
const EXPORT_PAD = 32;
const CARD_RASTER_RATIO = 2;

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

function prepareSvgClone(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('.person-card-html__drag-hint').forEach((el) => el.remove());
  clone.querySelectorAll('.manual-layout-grid').forEach((el) => el.remove());
  return clone;
}

/** html-to-image не рисует foreignObject в SVG — растеризуем карточки в <image>. */
async function rasterizePersonCards(source: SVGSVGElement, clone: SVGSVGElement): Promise<void> {
  const sourceCards = [...source.querySelectorAll('foreignObject .person-card-html')] as HTMLElement[];
  const cloneForeignObjects = [...clone.querySelectorAll('foreignObject')];

  for (let i = 0; i < sourceCards.length; i++) {
    const card = sourceCards[i];
    const foreignObject = cloneForeignObjects[i];
    if (!card || !foreignObject) continue;

    const width = Number.parseFloat(foreignObject.getAttribute('width') ?? '148');
    const height = Number.parseFloat(foreignObject.getAttribute('height') ?? '208');
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

    let dataUrl: string;
    try {
      await waitForImages(cardCopy);
      dataUrl = await toPng(cardCopy, {
        pixelRatio: CARD_RASTER_RATIO,
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
      ? canvas.toDataURL('image/jpeg', 0.95)
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
  return getTreeContentRect(frame, layout, pad);
}

/** Fit tree content inside a fixed page without cropping (letterboxing). */
export function configureSvgForFixedPage(
  svg: SVGSVGElement,
  viewport: { x: number; y: number; width: number; height: number },
  widthPx: number,
  heightPx: number,
): void {
  svg.setAttribute('viewBox', `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
  svg.setAttribute('width', String(widthPx));
  svg.setAttribute('height', String(heightPx));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const bgRect = svg.querySelector('rect');
  if (bgRect) {
    bgRect.setAttribute('x', String(viewport.x));
    bgRect.setAttribute('y', String(viewport.y));
    bgRect.setAttribute('width', String(viewport.width));
    bgRect.setAttribute('height', String(viewport.height));
  }
}

export async function exportTreeElement(
  source: TreeExportSource,
  options: ExportOptions,
): Promise<void> {
  const { format, sizeMode } = options;
  const pixelRatio = options.pixelRatio ?? 2;
  const { svg, layout, frame } = source;
  const backgroundColor = '#f7f3eb';

  await waitForImages(svg);
  await embedImages(svg);

  const prepared = prepareSvgClone(svg);
  await rasterizePersonCards(svg, prepared);

  const viewport = computeExportViewport(frame, layout);
  let widthPx: number;
  let heightPx: number;

  if (sizeMode === 'fixed' && options.widthMm && options.heightMm) {
    widthPx = Math.round(options.widthMm * MM_TO_PX);
    heightPx = Math.round(options.heightMm * MM_TO_PX);
    configureSvgForFixedPage(prepared, viewport, widthPx, heightPx);
  } else {
    prepared.setAttribute(
      'viewBox',
      `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    );
    prepared.setAttribute('width', String(Math.round(viewport.width)));
    prepared.setAttribute('height', String(Math.round(viewport.height)));
    widthPx = Math.round(viewport.width);
    heightPx = Math.round(viewport.height);
  }

  const rasterFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const dataUrl = await svgToRaster(
    prepared,
    widthPx,
    heightPx,
    pixelRatio,
    backgroundColor,
    rasterFormat,
  );

  if (format === 'pdf') {
    const widthMm = options.widthMm ?? 210;
    const heightMm = options.heightMm ?? 297;
    const pdf = new jsPDF({
      orientation: widthMm > heightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: sizeMode === 'fixed' ? [widthMm, heightMm] : 'a4',
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
    pdf.save('drevo-export.pdf');
    return;
  }

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

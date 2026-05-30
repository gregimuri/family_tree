export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): LayoutRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function rectsIntersect(a: LayoutRect, b: LayoutRect): boolean {
  if (a.width < 1 || a.height < 1) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Пустое место на листе древа — не карточка и не редактируемая линия. */
export function isMarqueePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('.tree-edge-hit, .tree-edge-handle')) return false;
  if (target.closest('.person-card-html')) return false;
  const foreignObject = target.closest('foreignObject');
  if (foreignObject?.parentElement?.classList.contains('person-card')) return false;
  if (target.closest('.person-card')) return false;
  if (target.classList.contains('layout-marquee')) return false;
  return true;
}

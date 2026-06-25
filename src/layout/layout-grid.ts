import { CARD_GRID_CELL, CARD_H_FULL } from './card-dimensions';
import type { LayoutNode } from '../types';

/** Стандартный зазор в клетках сетки (как на эталонной схеме). */
export const GRID_CELLS_COUPLE = 2;
export const GRID_CELLS_SIBLING = 2;
export const GRID_CELLS_GENERATION = 2;
export const GRID_CELLS_UNIT = 2;
export const GRID_CELLS_MIN = 2;

export function gridPixels(cells: number, scale = 1): number {
  return CARD_GRID_CELL * cells * scale;
}

export function coupleGap(scale = 1): number {
  return gridPixels(GRID_CELLS_COUPLE, scale);
}

export function siblingGap(scale = 1): number {
  return gridPixels(GRID_CELLS_SIBLING, scale);
}

export function unitGap(scale = 1): number {
  return gridPixels(GRID_CELLS_UNIT, scale);
}

export function generationGap(scale = 1): number {
  return gridPixels(GRID_CELLS_GENERATION, scale);
}

/** Шаг между центрами поколений: высота карточки + 2 клетки. */
export function layerStep(scale = 1): number {
  return CARD_H_FULL * scale + generationGap(scale);
}

/** Y-центр карточки на слое layer (pedigree layer index). */
export function layerCenterY(layer: number, scale = 1): number {
  return layer * layerStep(scale);
}

export function snapTopLeftToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Привязать центры unit-ов к сетке (целое число клеток). */
export function snapUnitCenterToGrid(centerX: number, scale = 1): number {
  const g = CARD_GRID_CELL * scale;
  return Math.round(centerX / g) * g;
}

/** Y по слою pedigree; X не меняем (сохраняем выравнивание блоков). */
export function enforcePedigreeLayerY(nodes: LayoutNode[], layerGap = layerStep(1)): void {
  for (const node of nodes) {
    const centerY = node.layer * layerGap;
    node.y = centerY - node.height / 2;
  }
}

import { CARD_GRID_CELL, CARD_W } from '../card-dimensions';
import { GRID_CELLS_COUPLE, GRID_CELLS_SIBLING, GRID_CELLS_UNIT } from '../layout-grid';

/** Ширина карточки в клетках сетки (6 клеток = 120 px). */
export const CARD_WIDTH_CELLS = CARD_W / CARD_GRID_CELL;

export const COUPLE_GAP_CELLS = GRID_CELLS_COUPLE;
export const SIBLING_GAP_CELLS = GRID_CELLS_SIBLING;
export const UNIT_GAP_CELLS = GRID_CELLS_UNIT;

export function cellsToPixels(cells: number, scale = 1): number {
  return cells * CARD_GRID_CELL * scale;
}

export function cardHalfWidthCells(scale = 1): number {
  return (CARD_WIDTH_CELLS * scale) / 2;
}

export function coupleSpanCells(scale = 1): number {
  return CARD_WIDTH_CELLS * scale * 2 + COUPLE_GAP_CELLS;
}

export function singleSpanCells(scale = 1): number {
  return CARD_WIDTH_CELLS * scale;
}

/** Левый/правый край карточки (в клетках) по центру. */
export function cardLeftEdge(centerCells: number, scale = 1): number {
  return centerCells - cardHalfWidthCells(scale);
}

export function cardRightEdge(centerCells: number, scale = 1): number {
  return centerCells + cardHalfWidthCells(scale);
}

export function boxesOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
  gapCells: number,
): boolean {
  return aMax + gapCells > bMin && bMax + gapCells > aMin;
}

import { CARD_GRID_CELL, CARD_W } from '../card-dimensions';
import { GRID_CELLS_COUPLE } from '../layout-grid';

export const CARD_WIDTH_CELLS = CARD_W / CARD_GRID_CELL;
export const COUPLE_GAP_CELLS = GRID_CELLS_COUPLE;

export function cardHalfWidthCells(scale = 1): number {
  return (CARD_WIDTH_CELLS * scale) / 2;
}

export function cardLeftEdge(centerCells: number, scale = 1): number {
  return centerCells - cardHalfWidthCells(scale);
}

export function cardRightEdge(centerCells: number, scale = 1): number {
  return centerCells + cardHalfWidthCells(scale);
}

export function coupleSpanCells(scale = 1): number {
  return CARD_WIDTH_CELLS * scale * 2 + COUPLE_GAP_CELLS;
}

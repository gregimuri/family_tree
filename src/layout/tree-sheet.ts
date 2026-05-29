import type { LayoutResult } from '../types';
import { getTreeSheetBounds } from './content-bounds';

/** Отступ содержимого от края фона листа (SVG). */
export const TREE_SHEET_PAD = 80;

/** Запас под обводку фона (половина stroke-width). */
export const TREE_SHEET_STROKE_PAD = 4;

/** Дополнительный отступ при вписывании дерева в область просмотра. */
export const TREE_VIEW_PAD = 56;

export function getSheetContentBounds(layout: LayoutResult): LayoutResult['bounds'] {
  return getTreeSheetBounds(layout);
}

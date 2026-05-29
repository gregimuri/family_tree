import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { LayoutResult, Project } from '../types';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { CARD_H_TEXT, CARD_W } from '../layout/card-dimensions';
import type { TreeFrame } from '../layout/center-focus';

export const TREE_FIT_PADDING = 0.9;
export const TREE_MIN_SCALE = 0.12;
export const TREE_MAX_SCALE = 2.5;
export const TREE_CONTENT_PAD = 56;

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportTransform {
  positionX: number;
  positionY: number;
  scale: number;
}

export interface FitViewportInput {
  wrapperWidth: number;
  wrapperHeight: number;
  contentRect: ViewportRect;
  padding?: number;
  minScale?: number;
  maxScale?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Прямоугольник с карточками и связями в координатах SVG (до масштабирования TransformWrapper).
 */
export function getTreeContentRect(
  frame: TreeFrame,
  layout: LayoutResult,
  pad = TREE_CONTENT_PAD,
  bounds = layout.bounds,
): ViewportRect {
  const { minX, minY, maxX, maxY } = bounds;
  const width = Math.max(maxX - minX, CARD_W);
  const height = Math.max(maxY - minY, CARD_H_TEXT);

  return {
    x: frame.offsetX + minX - pad,
    y: frame.offsetY + minY - pad,
    width: width + pad * 2,
    height: height + pad * 2,
  };
}

/**
 * Масштаб и сдвиг: центр contentRect попадает в центр viewport, дерево целиком видно.
 * TransformWrapper масштабирует контент от левого верхнего угла.
 */
export function computeFitTransform(input: FitViewportInput): ViewportTransform | null {
  const {
    wrapperWidth,
    wrapperHeight,
    contentRect,
    padding = TREE_FIT_PADDING,
    minScale = TREE_MIN_SCALE,
    maxScale = TREE_MAX_SCALE,
  } = input;

  if (
    wrapperWidth < 1 ||
    wrapperHeight < 1 ||
    contentRect.width < 1 ||
    contentRect.height < 1
  ) {
    return null;
  }

  const scaleX = (wrapperWidth / contentRect.width) * padding;
  const scaleY = (wrapperHeight / contentRect.height) * padding;
  const scale = clamp(Math.min(scaleX, scaleY), minScale, maxScale);

  const centerX = contentRect.x + contentRect.width / 2;
  const centerY = contentRect.y + contentRect.height / 2;

  return {
    positionX: wrapperWidth / 2 - centerX * scale,
    positionY: wrapperHeight / 2 - centerY * scale,
    scale,
  };
}

export function applyViewportTransform(
  ref: ReactZoomPanPinchRef,
  transform: ViewportTransform,
  animationTime = 0,
): void {
  ref.setTransform(transform.positionX, transform.positionY, transform.scale, animationTime);
}

export function fitTreeToViewport(
  ref: ReactZoomPanPinchRef,
  frame: TreeFrame,
  layout: LayoutResult,
  animationTime = 0,
  _project?: Project | null,
): boolean {
  const wrapper = ref.instance.wrapperComponent;
  if (!wrapper) return false;

  const bounds = getTreeSheetBounds(layout);
  const contentRect = getTreeContentRect(frame, layout, TREE_CONTENT_PAD, bounds);
  const transform = computeFitTransform({
    wrapperWidth: wrapper.clientWidth,
    wrapperHeight: wrapper.clientHeight,
    contentRect,
  });

  if (!transform) return false;

  applyViewportTransform(ref, transform, animationTime);
  return true;
}

/** Ключ для определения, нужно ли пересчитывать viewport. */
export function buildViewportKey(
  centerType: string,
  centerId: string,
  layout: LayoutResult,
  frame: TreeFrame,
  manualCount: number,
  generationsUp: number,
  generationsDown: number,
  sideBranchesAt: number,
  sideBranchDepth: number,
  cardSizeMode: string,
): string {
  const b = layout.bounds;
  return [
    centerType,
    centerId,
    layout.nodes.length,
    manualCount,
    generationsUp,
    generationsDown,
    sideBranchesAt,
    sideBranchDepth,
    cardSizeMode,
    frame.svgW,
    frame.svgH,
    b.minX.toFixed(1),
    b.maxX.toFixed(1),
    b.minY.toFixed(1),
    b.maxY.toFixed(1),
  ].join('|');
}

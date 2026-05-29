import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { buildLayout } from '../layout';
import { getCenterFocusPoint, getSymmetricTreeFrame } from '../layout/center-focus';
import { CARD_W, getCardDimensions } from '../layout/card-dimensions';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { TREE_SHEET_PAD, TREE_SHEET_STROKE_PAD, TREE_VIEW_PAD } from '../layout/tree-sheet';
import {
  computeFitTransform,
  getTreeContentRect,
} from '../hooks/tree-viewport';

describe('tree sheet layout', () => {
  it('maps normalized focus to the center of the svg sheet', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const focus = getCenterFocusPoint(project, layout)!;
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;

    expect(focus.x).toBeCloseTo(0, 0);
    expect(focus.y).toBeCloseTo(0, 0);
    expect(frame.focusSvgX).toBeCloseTo(frame.svgW / 2, 5);
    expect(frame.focusSvgY).toBeCloseTo(frame.svgH / 2, 5);
    expect(frame.offsetX + focus.x).toBeCloseTo(frame.focusSvgX, 5);
    expect(frame.offsetY + focus.y).toBeCloseTo(frame.focusSvgY, 5);
  });

  it('keeps padded content inside the background rect', () => {
    const project = createEmptyProject();
    const orphan = createEmptyPerson({ givenName: 'Extra', surname: 'Person' });
    project.persons[orphan.id] = orphan;

    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const sheet = getTreeSheetBounds(layout);
    const contentRect = getTreeContentRect(frame, layout, TREE_VIEW_PAD, sheet);

    expect(contentRect.x).toBeGreaterThanOrEqual(TREE_SHEET_STROKE_PAD);
    expect(contentRect.y).toBeGreaterThanOrEqual(TREE_SHEET_STROKE_PAD);
    expect(contentRect.x + contentRect.width).toBeLessThanOrEqual(
      frame.svgW - TREE_SHEET_STROKE_PAD + 1,
    );
    expect(contentRect.y + contentRect.height).toBeLessThanOrEqual(
      frame.svgH - TREE_SHEET_STROKE_PAD + 1,
    );
  });

  it('centers viewport on focus person for asymmetric trees', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const sheet = getTreeSheetBounds(layout);
    const contentRect = getTreeContentRect(frame, layout, TREE_VIEW_PAD, sheet);

    const transform = computeFitTransform({
      wrapperWidth: 1200,
      wrapperHeight: 900,
      contentRect,
      pivot: { x: frame.focusSvgX, y: frame.focusSvgY },
      padding: 1,
    })!;

    const screenFocusX = transform.positionX + frame.focusSvgX * transform.scale;
    const screenFocusY = transform.positionY + frame.focusSvgY * transform.scale;

    expect(screenFocusX).toBeCloseTo(600, 0);
    expect(screenFocusY).toBeCloseTo(450, 0);
  });

  it('layout node size matches card dimensions used for rendering', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);

    for (const node of layout.nodes) {
      if (!node.personId) continue;
      const person = project.persons[node.personId];
      const dims = getCardDimensions(project, person, project.viewSettings, node.scale);
      expect(node.width).toBeCloseTo(dims.w, 5);
      expect(node.height).toBeCloseTo(dims.h, 5);
      expect(node.width).toBeGreaterThanOrEqual(CARD_W * 0.5);
    }
  });
});

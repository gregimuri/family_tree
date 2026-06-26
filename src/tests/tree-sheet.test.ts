import { describe, it, expect } from 'vitest';
import { importGedcom } from '../services/gedcom/import';
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
  it('maps focus point into svg coordinates', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const focus = getCenterFocusPoint(project, layout)!;
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;

    expect(focus.y).toBeCloseTo(0, 0);
    expect(focus.x).toBeCloseTo(0, 0);
    const sheet = getTreeSheetBounds(layout, project);
    expect(frame.offsetX + focus.x).toBeCloseTo(frame.focusSvgX, 5);
    expect(frame.offsetY + focus.y).toBeCloseTo(frame.focusSvgY, 5);
  });

  it('avoids mirrored empty margin on the shorter side of the focus', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Root /Tree/
1 SEX M
0 @P1@ INDI
1 NAME Parent1 /Tree/
1 SEX M
0 @P2@ INDI
1 NAME Parent2 /Tree/
1 SEX F
0 @GP1@ INDI
1 NAME Grand1 /Tree/
1 SEX M
0 @GP2@ INDI
1 NAME Grand2 /Tree/
1 SEX F
0 @C1@ INDI
1 NAME Child /Tree/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @P2@
1 CHIL @C1@
0 @F2@ FAM
1 HUSB @P1@
1 WIFE @P2@
1 CHIL @I1@
0 @F3@ FAM
1 HUSB @GP1@
1 WIFE @GP2@
1 CHIL @P1@
0 TRLR`;
    const project = importGedcom(ged, 'Asymmetric');
    project.center = { type: 'person', id: 'I1' };
    const layout = buildLayout(project);
    const focus = getCenterFocusPoint(project, layout)!;
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const sheet = getTreeSheetBounds(layout);

    const topSpan = focus.y - sheet.minY;
    const bottomSpan = sheet.maxY - focus.y;
    const symmetricHeight = Math.max(topSpan, bottomSpan) * 2 + TREE_SHEET_PAD * 2 + TREE_SHEET_STROKE_PAD * 2;
    const contentHeight = sheet.maxY - sheet.minY;

    expect(topSpan).toBeGreaterThan(0);
    expect(bottomSpan).toBeGreaterThan(0);
    expect(frame.svgH).toBeLessThan(symmetricHeight - 40);
    expect(frame.svgH).toBeLessThan(contentHeight + TREE_SHEET_PAD * 2 + TREE_SHEET_STROKE_PAD * 2 + 20);
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

  it('centers viewport on visible tree for asymmetric trees', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const sheet = getTreeSheetBounds(layout);
    const contentRect = getTreeContentRect(frame, layout, TREE_VIEW_PAD, sheet);
    const contentCenterX = contentRect.x + contentRect.width / 2;

    const transform = computeFitTransform({
      wrapperWidth: 1200,
      wrapperHeight: 900,
      contentRect,
      pivot: { x: contentCenterX, y: frame.focusSvgY },
      padding: 1,
    })!;

    const screenCenterX = transform.positionX + contentCenterX * transform.scale;
    const screenFocusY = transform.positionY + frame.focusSvgY * transform.scale;

    expect(screenCenterX).toBeCloseTo(600, 0);
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

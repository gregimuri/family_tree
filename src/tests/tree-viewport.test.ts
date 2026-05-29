import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { buildLayout } from '../layout';
import { getSymmetricTreeFrame } from '../layout/center-focus';
import { getTreeSheetBounds } from '../layout/content-bounds';
import {
  computeFitTransform,
  getTreeContentRect,
  TREE_CONTENT_PAD,
} from '../hooks/tree-viewport';

describe('tree viewport', () => {
  it('content rect covers sheet bounds inside svg frame', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const sheet = getTreeSheetBounds(layout);
    const rect = getTreeContentRect(frame, layout, TREE_CONTENT_PAD, sheet);

    expect(rect.x).toBeLessThanOrEqual(frame.offsetX + sheet.minX);
    expect(rect.y).toBeLessThanOrEqual(frame.offsetY + sheet.minY);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(frame.offsetX + sheet.maxX);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(frame.offsetY + sheet.maxY);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('content rect is smaller than full svg canvas', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const rect = getTreeContentRect(frame, layout);

    expect(rect.width).toBeLessThan(frame.svgW);
    expect(rect.height).toBeLessThan(frame.svgH);
  });

  it('computeFitTransform centers content in viewport', () => {
    const rect = { x: 200, y: 100, width: 400, height: 300 };
    const transform = computeFitTransform({
      wrapperWidth: 1000,
      wrapperHeight: 800,
      contentRect: rect,
      padding: 1,
    })!;

    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const screenCenterX = transform.positionX + centerX * transform.scale;
    const screenCenterY = transform.positionY + centerY * transform.scale;

    expect(screenCenterX).toBeCloseTo(500, 0);
    expect(screenCenterY).toBeCloseTo(400, 0);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it('computeFitTransform scales down large content', () => {
    const transform = computeFitTransform({
      wrapperWidth: 800,
      wrapperHeight: 600,
      contentRect: { x: 0, y: 0, width: 4000, height: 3000 },
    })!;

    expect(transform.scale).toBeLessThan(1);
  });

  it('uses padding around cards', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const sheet = getTreeSheetBounds(layout);
    const tight = getTreeContentRect(frame, layout, 0, sheet);
    const padded = getTreeContentRect(frame, layout, TREE_CONTENT_PAD, sheet);

    expect(padded.width).toBeGreaterThan(tight.width);
    expect(padded.height).toBeGreaterThan(tight.height);
  });

  it('svg canvas fits orphan strip without excessive empty margin', () => {
    const project = createEmptyProject();
    const orphanA = createEmptyPerson({ givenName: 'Orphan', surname: 'One', gender: 'male' });
    const orphanB = createEmptyPerson({ givenName: 'Orphan', surname: 'Two', gender: 'female' });
    project.persons[orphanA.id] = orphanA;
    project.persons[orphanB.id] = orphanB;

    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const sheet = getTreeSheetBounds(layout);
    const contentRect = getTreeContentRect(frame, layout, TREE_CONTENT_PAD, sheet);

    expect(contentRect.width).toBeLessThanOrEqual(frame.svgW + 1);
    expect(contentRect.height).toBeLessThanOrEqual(frame.svgH + 1);
    expect(frame.svgW).toBeLessThan(8000);
  });
});

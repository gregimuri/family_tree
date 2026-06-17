import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { CARD_H_FULL, CARD_W } from '../layout/card-dimensions';

describe('tree sheet bounds', () => {
  it('includes edge geometry beyond card boxes', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const nodeBounds = layout.bounds;
    const sheet = getTreeSheetBounds(layout);

    expect(sheet.minX).toBeLessThanOrEqual(nodeBounds.minX);
    expect(sheet.minY).toBeLessThanOrEqual(nodeBounds.minY);
    expect(sheet.maxX).toBeGreaterThanOrEqual(nodeBounds.maxX);
    expect(sheet.maxY).toBeGreaterThanOrEqual(nodeBounds.maxY);
    expect(sheet.maxX - sheet.minX).toBeGreaterThanOrEqual(CARD_W);
    expect(sheet.maxY - sheet.minY).toBeGreaterThanOrEqual(CARD_H_FULL);
  });

  it('matches actual node and edge geometry without artificial inflation', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const nodeBounds = layout.bounds;
    const sheet = getTreeSheetBounds(layout);

    expect(sheet.maxY - sheet.minY).toBeLessThanOrEqual(nodeBounds.maxY - nodeBounds.minY + 40);
    expect(sheet.maxY).toBeGreaterThanOrEqual(nodeBounds.maxY - 1);
  });
});

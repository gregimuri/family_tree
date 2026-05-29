import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { LAYER_GAP } from '../layout/graph-builder';
import { CARD_H_TEXT, CARD_W } from '../layout/card-dimensions';

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
    expect(sheet.maxY - sheet.minY).toBeGreaterThanOrEqual(CARD_H_TEXT);
  });

  it('spans at least one layer gap per generation', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const sheet = getTreeSheetBounds(layout);
    const layers = layout.nodes.map((n) => n.layer);
    const spread = Math.max(...layers) - Math.min(...layers);
    expect(sheet.maxY - sheet.minY).toBeGreaterThanOrEqual(spread * LAYER_GAP + CARD_H_TEXT - 1);
  });
});

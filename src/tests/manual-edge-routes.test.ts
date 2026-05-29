import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { applyManualEdgeRoutes } from '../layout/manual-edge-routes';
import { getPresetDimensions, mmToPx, orientPageDimensions, resolveExportResolution } from '../services/export/image-export';

describe('manual edge routes', () => {
  it('overrides auto-computed edge points', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const edge = layout.edges[0];
    expect(edge).toBeTruthy();

    const custom = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 120 },
    ];
    const next = applyManualEdgeRoutes(layout, {
      ...project,
      manualEdgeRoutes: { [edge.id]: custom },
    });

    const updated = next.edges.find((e) => e.id === edge.id);
    expect(updated?.points).toEqual(custom);
  });
});

describe('export orientation', () => {
  it('defaults A4 preset to landscape', () => {
    const dims = getPresetDimensions('A4', 'landscape');
    expect(dims.widthMm).toBe(297);
    expect(dims.heightMm).toBe(210);
  });

  it('swaps dimensions for portrait', () => {
    const dims = orientPageDimensions(297, 210, 'portrait');
    expect(dims.widthMm).toBe(210);
    expect(dims.heightMm).toBe(297);
  });
});

describe('export resolution', () => {
  it('uses 300 dpi for print quality on fixed A4', () => {
    const res = resolveExportResolution(
      {
        format: 'png',
        sizeMode: 'fixed',
        quality: 'print',
        widthMm: 297,
        heightMm: 210,
        orientation: 'landscape',
      },
      { width: 1000, height: 800 },
    );
    expect(res.dpi).toBe(300);
    expect(res.widthPx).toBe(mmToPx(297, 300));
    expect(res.heightPx).toBe(mmToPx(210, 300));
    expect(res.cardRasterRatio).toBeGreaterThanOrEqual(3);
  });

  it('supersamples tree export at high quality', () => {
    const res = resolveExportResolution(
      { format: 'png', sizeMode: 'tree', quality: 'high' },
      { width: 1200, height: 900 },
    );
    expect(res.pixelRatio).toBe(3);
    expect(res.cardRasterRatio).toBe(3);
    expect(res.widthPx).toBe(1200);
  });
});

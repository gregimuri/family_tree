import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { applyManualEdgeRoutes } from '../layout/manual-edge-routes';
import { getPresetDimensions, orientPageDimensions } from '../services/export/image-export';

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

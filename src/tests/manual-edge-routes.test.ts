import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import {
  applyManualEdgeRoutes,
  constrainManualRoutePoint,
  rebuildEdgePathD,
} from '../layout/manual-edge-routes';
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

  it('rebuilds pathD for fam-tree overrides', () => {
    const points = [
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 5, y: 40 },
      { x: 5, y: 80 },
    ];
    const pathD = rebuildEdgePathD('fam-tree-u1', points);
    expect(pathD).toContain('M 10 0');
    expect(pathD).toContain('M 5 40');
  });

  it('keeps fam-tree bus and drops aligned when moving forkY', () => {
    const points = [
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 5, y: 40 },
      { x: 5, y: 80 },
      { x: 15, y: 40 },
      { x: 15, y: 90 },
    ];
    const next = constrainManualRoutePoint(
      { id: 'fam-tree-u1', points },
      1,
      { x: 10, y: 50 },
    );
    expect(next[1].y).toBe(50);
    expect(next[2].y).toBe(50);
    expect(next[3].y).toBe(50);
    expect(next[4].y).toBe(50);
    expect(next[6].y).toBe(50);
    expect(next[5].x).toBe(5);
    expect(next[7].x).toBe(15);
  });

  it('keeps fam-tree drop vertical when moving child endpoint', () => {
    const points = [
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 5, y: 40 },
      { x: 5, y: 80 },
    ];
    const next = constrainManualRoutePoint(
      { id: 'fam-tree-u1', points },
      5,
      { x: 99, y: 100 },
    );
    expect(next[5]).toEqual({ x: 5, y: 100 });
    expect(next[4].x).toBe(5);
  });

  it('allows vertical movement of marriage bond', () => {
    const points = [
      { x: 100, y: 80 },
      { x: 120, y: 80 },
    ];
    const next = constrainManualRoutePoint(
      { id: 'bond@u1', points },
      0,
      { x: 100, y: 90 },
    );
    expect(next[0].y).toBe(90);
    expect(next[1].y).toBe(90);
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
  it('uses 300 dpi for fixed A4', () => {
    const res = resolveExportResolution(
      {
        format: 'png',
        sizeMode: 'fixed',
        widthMm: 297,
        heightMm: 210,
      },
      { width: 1000, height: 800 },
    );
    expect(res.dpi).toBe(300);
    expect(res.widthPx).toBe(mmToPx(297, 300));
    expect(res.heightPx).toBe(mmToPx(210, 300));
    expect(res.cardRasterRatio).toBeGreaterThanOrEqual(3);
  });

  it('uses 300 dpi for tree export', () => {
    const res = resolveExportResolution(
      { format: 'png', sizeMode: 'tree' },
      { width: 1200, height: 900 },
    );
    expect(res.dpi).toBe(300);
    expect(res.pixelRatio).toBe(1);
    expect(res.widthPx).toBe(Math.round(1200 * (300 / 96)));
    expect(res.heightPx).toBe(Math.round(900 * (300 / 96)));
    expect(res.cardRasterRatio).toBeGreaterThanOrEqual(3);
  });
});

import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { buildLayout } from '../layout';
import { bondEdgeId } from '../layout/edge-router';
import {
  applyManualEdgeRoutes,
  constrainManualRoutePoint,
  isLockedManualRoutePoint,
  rebuildEdgePathD,
} from '../layout/manual-edge-routes';
import { getPresetDimensions, mmToPx, orientPageDimensions, resolveExportResolution } from '../services/export/image-export';

describe('manual edge routes', () => {
  it('merges manual bond routes with auto card anchors', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const bond = layout.edges.find((e) => e.id.startsWith('bond@'));
    expect(bond).toBeTruthy();

    const shiftedY = bond!.points[0].y + 12;
    const custom = [
      { x: 0, y: shiftedY },
      { x: 999, y: shiftedY },
    ];
    const next = applyManualEdgeRoutes(layout, {
      ...project,
      manualEdgeRoutes: { [bond!.id]: custom },
    });

    const updated = next.edges.find((e) => e.id === bond!.id);
    expect(updated?.points[0].x).toBe(bond!.points[0].x);
    expect(updated?.points[1].x).toBe(bond!.points[1].x);
    expect(updated?.points[0].y).toBe(shiftedY);
    expect(updated?.points[1].y).toBe(shiftedY);
  });

  it('rebuilds pathD for fam-tree overrides with marriage stem', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 5, y: 40 },
      { x: 5, y: 80 },
    ];
    const pathD = rebuildEdgePathD('fam-tree-u1', points, { midX: 10, bondY: 10, stemStartY: 20 });
    expect(pathD).toContain('M 10 10');
    expect(pathD).toContain('L 10 20');
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

  it('locks child card endpoints on fam-tree routes', () => {
    const points = [
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 5, y: 40 },
      { x: 5, y: 80 },
    ];
    expect(isLockedManualRoutePoint('fam-tree-u1', 5, points)).toBe(true);
    const next = constrainManualRoutePoint(
      { id: 'fam-tree-u1', points },
      5,
      { x: 99, y: 100 },
    );
    expect(next).toEqual(points);
  });

  it('allows vertical movement of marriage bond while keeping card anchors', () => {
    const points = [
      { x: 100, y: 80 },
      { x: 120, y: 80 },
    ];
    const next = constrainManualRoutePoint(
      { id: 'bond@u1', points },
      0,
      { x: 50, y: 90 },
    );
    expect(next[0]).toEqual({ x: 100, y: 90 });
    expect(next[1]).toEqual({ x: 120, y: 90 });
  });

  it('connects fam-tree path to bond after manual bond move', () => {
    let project = createEmptyProject();
    const unionId = Object.keys(project.unions)[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок', surname: 'Иванов', gender: 'male' });
    project = {
      ...project,
      persons: { ...project.persons, [child.id]: child },
      unions: {
        ...project.unions,
        [unionId]: {
          ...project.unions[unionId],
          childIds: [child.id],
        },
      },
    };
    project.persons[child.id] = {
      ...child,
      parentUnionIds: [unionId],
    };

    const layout = buildLayout(project);
    const bond = layout.edges.find((e) => e.id === bondEdgeId(unionId));
    const tree = layout.edges.find(
      (e) => e.id === `fam-tree-${unionId}` || e.id.startsWith(`fam-branch-${unionId}-`),
    );
    expect(bond).toBeTruthy();
    expect(tree).toBeTruthy();

    const shiftedY = bond!.points[0].y + 16;
    const midX = (bond!.points[0].x + bond!.points[1].x) / 2;
    const next = applyManualEdgeRoutes(layout, {
      ...project,
      manualEdgeRoutes: {
        [bond!.id]: [
          { x: bond!.points[0].x, y: shiftedY },
          { x: bond!.points[1].x, y: shiftedY },
        ],
      },
    });

    const updatedTree = next.edges.find((e) => e.id === tree!.id);
    expect(updatedTree?.pathD).toContain(`M ${midX} ${shiftedY}`);
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

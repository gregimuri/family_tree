import { describe, it, expect } from 'vitest';
import type { Project, LayoutEdge } from '../types';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { computeExportViewport } from '../services/export/image-export';
import { getSymmetricTreeFrame } from '../layout/center-focus';
import { TREE_SHEET_PAD } from '../layout/tree-sheet';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

function loadFixture(centerId: string): Project {
  const p = repairProjectRelationships(projectJson as Project);
  p.center = { type: 'person', id: centerId };
  return p;
}

function maxHorizontalEdgeSpan(edges: LayoutEdge[]): number {
  let max = 0;
  for (const edge of edges) {
    const xs = edge.points.map((p) => p.x);
    if (xs.length < 2) continue;
    max = Math.max(max, Math.max(...xs) - Math.min(...xs));
  }
  return max;
}

function maxBusSpan(edges: LayoutEdge[]): number {
  return maxHorizontalEdgeSpan(edges.filter((e) => e.id.startsWith('fam-bus-')));
}

describe('collateral center regression', () => {
  const MARIA_PARENT = 'fce0025a-7dbf-4161-bff9-65e3079372f0';
  const IVAN_PARENT = '83ab0bcf-2d59-48a5-a282-20d24b3e210b';

  for (const [label, centerId] of [
    ['Maria parent', MARIA_PARENT],
    ['Ivan parent', IVAN_PARENT],
    ['Ivan', '63c1b808-93fd-4479-b390-fcc9d3ce8beb'],
  ] as const) {
    it(`compact layout and edges when centered on ${label}`, () => {
      const project = loadFixture(centerId);
      const layout = buildLayout(project);
      const sheet = getTreeSheetBounds(layout);
      const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
      const viewport = computeExportViewport(frame, layout);

      expect(sheet.maxX - sheet.minX).toBeLessThan(1400);
      expect(maxBusSpan(layout.edges)).toBeLessThan(900);
      expect(maxHorizontalEdgeSpan(layout.edges)).toBeLessThan(1400);
      expect(viewport.width).toBeLessThan(1500);
      expect(viewport.width / viewport.height).toBeLessThan(2.5);
    });
  }
});

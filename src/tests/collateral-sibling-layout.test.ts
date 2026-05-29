import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildGraph } from '../layout/graph-builder';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

function load(centerId: string): Project {
  const p = repairProjectRelationships(projectJson as Project);
  p.center = { type: 'person', id: centerId };
  return p;
}

function maxLayerGap(layout: ReturnType<typeof buildLayout>): number {
  const byLayer = new Map<number, number[]>();
  for (const n of layout.nodes) {
    const xs = byLayer.get(n.layer) ?? [];
    xs.push(n.x + n.width / 2);
    byLayer.set(n.layer, xs);
  }
  let max = 0;
  for (const xs of byLayer.values()) {
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) max = Math.max(max, xs[i] - xs[i - 1]);
  }
  return max;
}

describe('collateral sibling layout', () => {
  it('centers children of focal parent in one row, not at opposite ends', () => {
    const project = load('fce0025a-7dbf-4161-bff9-65e3079372f0');
    const layout = buildLayout(project);
    const sheet = getTreeSheetBounds(layout);

    expect(sheet.maxX - sheet.minX).toBeLessThan(700);
    expect(maxLayerGap(layout)).toBeLessThan(500);
  });

  it('does not place collateral siblings on main line when center is spouse', () => {
    const project = load('63c1b808-93fd-4479-b390-fcc9d3ce8beb');
    const graph = buildGraph(project, project.viewSettings);
    const layout = buildLayout(project);
    const sheet = getTreeSheetBounds(layout);

    const mariaSiblings = ['6f1ed5f2-2c20-4da9-866d-e4b020ed077e', 'fc118401-0e0a-480e-bbf8-673cbf1fae3a'];
    for (const id of mariaSiblings) {
      const gn = graph.nodes.find((n) => n.kind === 'person' && n.personId === id);
      if (gn) expect(gn.isSideBranch).toBe(true);
    }

    expect(sheet.maxX - sheet.minX).toBeLessThan(900);
    expect(maxLayerGap(layout)).toBeLessThan(600);
  });
});

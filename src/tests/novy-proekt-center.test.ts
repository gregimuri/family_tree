import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

function loadFixture(): Project {
  return repairProjectRelationships(projectJson as Project);
}

function nodeCenterX(n: { x: number; width: number }) {
  return n.x + n.width / 2;
}

function maxClusterGap(nodes: { x: number; width: number; layer: number }[]): number {
  const byLayer = new Map<number, number[]>();
  for (const n of nodes) {
    const xs = byLayer.get(n.layer) ?? [];
    xs.push(nodeCenterX(n));
    byLayer.set(n.layer, xs);
  }
  let maxGap = 0;
  for (const xs of byLayer.values()) {
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      maxGap = Math.max(maxGap, xs[i] - xs[i - 1]);
    }
  }
  return maxGap;
}

describe('novy-proekt center changes', () => {
  const personIds = Object.keys(projectJson.persons);

  for (const centerId of personIds) {
    it(`keeps related cards aligned when center is ${centerId.slice(0, 8)}`, () => {
      const project = loadFixture();
      project.center = { type: 'person', id: centerId };
      const layout = buildLayout(project);
      const sheet = getTreeSheetBounds(layout);
      const spread = sheet.maxX - sheet.minX;
      const maxGap = maxClusterGap(layout.nodes);

      // Siblings/couples on same layer should not be thousands of px apart
      expect(maxGap).toBeLessThan(700);
      // Total width should stay proportional to tree size, not screen-wide
      expect(spread).toBeLessThan(1400);
    });
  }
});

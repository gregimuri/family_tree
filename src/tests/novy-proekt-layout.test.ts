import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { getSymmetricTreeFrame } from '../layout/center-focus';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { LAYER_GAP } from '../layout/graph-builder';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

function loadFixture(): Project {
  return repairProjectRelationships(projectJson as Project);
}

describe('novy-proekt fixture layout', () => {
  it('siblings on the same layer share the same y', () => {
    const layout = buildLayout(loadFixture());
    const byLayer = new Map<number, number[]>();
    for (const node of layout.nodes) {
      const ys = byLayer.get(node.layer) ?? [];
      ys.push(node.y);
      byLayer.set(node.layer, ys);
    }
    for (const ys of byLayer.values()) {
      if (ys.length < 2) continue;
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
    }
  });

  it('generations are spaced by LAYER_GAP', () => {
    const layout = buildLayout(loadFixture());
    const layerYs = new Map<number, number>();
    for (const node of layout.nodes) {
      const centerY = node.y + node.height / 2;
      layerYs.set(node.layer, centerY);
    }
    const sorted = [...layerYs.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i][1] - sorted[i - 1][1];
      expect(gap).toBeCloseTo(LAYER_GAP, 0);
    }
  });

  it('sheet size is not much larger than content', () => {
    const project = loadFixture();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const sheet = getTreeSheetBounds(layout);
    const contentW = sheet.maxX - sheet.minX;
    const contentH = sheet.maxY - sheet.minY;
    expect(frame.svgW).toBeLessThan(contentW + 400);
    expect(frame.svgH).toBeLessThan(contentH + 400);
  });
});

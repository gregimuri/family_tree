import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

function load(centerId?: string): Project {
  const p = repairProjectRelationships(projectJson as Project);
  if (centerId) p.center = { type: 'person', id: centerId };
  return p;
}

function hasOverlap(
  nodes: { x: number; width: number; layer: number; personId?: string }[],
  gap = 1,
): { a: string; b: string } | null {
  const byLayer = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const list = byLayer.get(n.layer) ?? [];
    list.push(n);
    byLayer.set(n.layer, list);
  }
  for (const layerNodes of byLayer.values()) {
    const sorted = [...layerNodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.x < prev.x + prev.width + gap) {
        return { a: prev.personId ?? '?', b: curr.personId ?? '?' };
      }
    }
  }
  return null;
}

describe('overlap detection', () => {
  const personIds = Object.keys(projectJson.persons);

  for (const centerId of personIds) {
    it(`no horizontal overlap for center ${centerId.slice(0, 8)}`, () => {
      const layout = buildLayout(load(centerId));
      const overlap = hasOverlap(layout.nodes);
      if (overlap) {
        const project = load(centerId);
        for (const n of layout.nodes) {
          const p = project.persons[n.personId!];
          console.log(n.layer, Math.round(n.x), n.width, p?.givenName || 'Без', n.personId?.slice(0, 8));
        }
      }
      expect(overlap).toBeNull();
    });
  }
});

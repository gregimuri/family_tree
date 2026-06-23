import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildGraph } from '../layout/graph-builder';
import { buildLayout } from '../layout';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { repairProjectRelationships } from '../models/person-utils';
import { findHorizontalOverlap, assertNoCardOverlaps2D } from './helpers/layout-quality';
import projectJson from './fixtures/novy-proekt/project.json';

const IVAN = '92312a00-8c2a-42ea-8078-1b5d6507302b';
const MARIA_SIBLINGS = [
  'bef57a98-ef26-44a2-b230-6bc86dc17bca',
  '4eef35b8-50f5-4433-ad1e-36590d1a211b',
];

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
    const project = load('a5a08cef-6502-42a8-9f09-3e54857eea11');
    const layout = buildLayout(project);
    const sheet = getTreeSheetBounds(layout);

    expect(sheet.maxX - sheet.minX).toBeLessThan(1000);
    expect(maxLayerGap(layout)).toBeLessThan(500);
  });

  it('does not place collateral siblings on main line when center is spouse', () => {
    const project = load(IVAN);
    const graph = buildGraph(project, project.viewSettings);
    const layout = buildLayout(project);
    const sheet = getTreeSheetBounds(layout);

    for (const id of MARIA_SIBLINGS) {
      const gn = graph.nodes.find((n) => n.kind === 'person' && n.personId === id);
      if (gn) expect(gn.isSideBranch).toBe(true);
    }

    expect(sheet.maxX - sheet.minX).toBeLessThan(900);
    expect(maxLayerGap(layout)).toBeLessThan(600);
  });

  it('no horizontal overlap with Ivan center, 4 children and collateral', () => {
    const project = load(IVAN);
    const unionId = '325a9de7-6a3a-4351-8131-fcb5c80545d4';
    for (let i = 0; i < 4; i++) {
      const id = `collateral-child-${i}`;
      project.persons[id] = {
        id,
        gender: 'unknown',
        surname: '',
        givenName: '',
        patronymic: '',
        nicknamePriority: false,
        biography: '',
        parentUnionIds: [unionId],
        unionIds: [],
        mediaIds: [],
        cardLocationSource: 'birth',
      };
      project.unions[unionId].childIds.push(id);
    }
    const layout = buildLayout(project);
    expect(findHorizontalOverlap(layout.nodes)).toBeNull();
    expect(() => assertNoCardOverlaps2D(layout.nodes)).not.toThrow();
  });
});

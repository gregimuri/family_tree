import { describe, it, expect } from 'vitest';
import { buildLayout } from '../layout';
import { COUPLE_GAP } from '../layout/graph-builder';
import { CARD_GRID_CELL } from '../layout/card-dimensions';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import type { LayoutNode } from '../types';

function nodeCenterX(n: { x: number; width: number }): number {
  return n.x + n.width / 2;
}

function findHorizontalOverlaps(nodes: LayoutNode[]) {
  const byLayer = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    if (!n.personId) continue;
    const list = byLayer.get(n.layer) ?? [];
    list.push(n);
    byLayer.set(n.layer, list);
  }
  const overlaps: { layer: number; a: string; b: string }[] = [];
  for (const [layer, list] of byLayer) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.x < prev.x + prev.width - 1) {
        overlaps.push({ layer, a: prev.personId!, b: curr.personId! });
      }
    }
  }
  return overlaps;
}

describe('ancestor layout engine', () => {
  it('places parent couple over child with 2-cell gap', () => {
    const project = createEmptyProject();
    const father = createEmptyPerson({ id: 'f', gender: 'male', givenName: 'Father' });
    const mother = createEmptyPerson({ id: 'm', gender: 'female', givenName: 'Mother' });
    const child = createEmptyPerson({ id: 'c', gender: 'male', givenName: 'Child' });
    project.persons = { f: father, m: mother, c: child };
    project.unions = {
      u: { id: 'u', partnerIds: ['f', 'm'], childIds: ['c'] },
    };
    father.unionIds = ['u'];
    mother.unionIds = ['u'];
    child.parentUnionIds = ['u'];
    project.center = { type: 'person', id: 'c' };

    const layout = buildLayout(project);
    const f = layout.nodes.find((n) => n.personId === 'f')!;
    const m = layout.nodes.find((n) => n.personId === 'm')!;
    const ch = layout.nodes.find((n) => n.personId === 'c')!;

    expect(Math.abs(m.x - (f.x + f.width + COUPLE_GAP))).toBeLessThan(5);
    const coupleCenter = (nodeCenterX(f) + nodeCenterX(m)) / 2;
    expect(Math.abs(coupleCenter - nodeCenterX(ch))).toBeLessThan(COUPLE_GAP + 20);
  });

  it('three-generation ancestry places all grandparents', () => {
    const project = createEmptyProject();
    const ids = ['c', 'f', 'm', 'pgf', 'pgm', 'mgf', 'mgm'] as const;
    const genders: Record<string, 'male' | 'female'> = {
      c: 'male',
      f: 'male',
      m: 'female',
      pgf: 'male',
      pgm: 'female',
      mgf: 'male',
      mgm: 'female',
    };
    for (const id of ids) {
      project.persons[id] = createEmptyPerson({ id, gender: genders[id], givenName: id });
    }
    project.unions = {
      fc: { id: 'fc', partnerIds: ['f', 'm'], childIds: ['c'] },
      ff: { id: 'ff', partnerIds: ['pgf', 'pgm'], childIds: ['f'] },
      fm: { id: 'fm', partnerIds: ['mgf', 'mgm'], childIds: ['m'] },
    };
    project.persons.c.parentUnionIds = ['fc'];
    project.persons.f.parentUnionIds = ['ff'];
    project.persons.m.parentUnionIds = ['fm'];
    project.persons.f.unionIds = ['fc'];
    project.persons.m.unionIds = ['fc'];
    project.persons.pgf.unionIds = ['ff'];
    project.persons.pgm.unionIds = ['ff'];
    project.persons.mgf.unionIds = ['fm'];
    project.persons.mgm.unionIds = ['fm'];
    project.center = { type: 'person', id: 'c' };
    project.viewSettings = { ...project.viewSettings, generationsUp: 2, generationsDown: 0 };

    const layout = buildLayout(project);
    const byPerson = new Map(layout.nodes.filter((n) => n.personId).map((n) => [n.personId!, n]));
    expect(byPerson.has('pgf')).toBe(true);
    expect(byPerson.has('pgm')).toBe(true);
    expect(byPerson.has('mgf')).toBe(true);
    expect(byPerson.has('mgm')).toBe(true);
  });

  it('couple gap equals 2 grid cells', () => {
    const project = createEmptyProject();
    const father = createEmptyPerson({ id: 'f', gender: 'male', givenName: 'F' });
    const mother = createEmptyPerson({ id: 'm', gender: 'female', givenName: 'M' });
    const child = createEmptyPerson({ id: 'c', gender: 'male', givenName: 'C' });
    project.persons = { f: father, m: mother, c: child };
    project.unions = { u: { id: 'u', partnerIds: ['f', 'm'], childIds: ['c'] } };
    father.unionIds = ['u'];
    mother.unionIds = ['u'];
    child.parentUnionIds = ['u'];
    project.center = { type: 'person', id: 'c' };

    const layout = buildLayout(project);
    const f = layout.nodes.find((n) => n.personId === 'f')!;
    const m = layout.nodes.find((n) => n.personId === 'm')!;
    const gap = m.x - (f.x + f.width);
    expect(gap).toBeGreaterThanOrEqual(COUPLE_GAP - 1);
    expect(gap).toBeLessThanOrEqual(COUPLE_GAP + 1);
    expect(COUPLE_GAP).toBe(CARD_GRID_CELL * 2);
  });

  it('resolves overlapping grandparent couples on the same layer (step 5)', () => {
    const project = createEmptyProject();
    const ids = ['c', 'f', 'm', 'pgf', 'pgm', 'mgf', 'mgm'] as const;
    const genders: Record<string, 'male' | 'female'> = {
      c: 'male',
      f: 'male',
      m: 'female',
      pgf: 'male',
      pgm: 'female',
      mgf: 'male',
      mgm: 'female',
    };
    for (const id of ids) {
      project.persons[id] = createEmptyPerson({ id, gender: genders[id], givenName: id });
    }
    project.unions = {
      fc: { id: 'fc', partnerIds: ['f', 'm'], childIds: ['c'] },
      ff: { id: 'ff', partnerIds: ['pgf', 'pgm'], childIds: ['f'] },
      fm: { id: 'fm', partnerIds: ['mgf', 'mgm'], childIds: ['m'] },
    };
    project.persons.c.parentUnionIds = ['fc'];
    project.persons.f.parentUnionIds = ['ff'];
    project.persons.m.parentUnionIds = ['fm'];
    project.persons.f.unionIds = ['fc'];
    project.persons.m.unionIds = ['fc'];
    project.persons.pgf.unionIds = ['ff'];
    project.persons.pgm.unionIds = ['ff'];
    project.persons.mgf.unionIds = ['fm'];
    project.persons.mgm.unionIds = ['fm'];
    project.center = { type: 'person', id: 'c' };
    project.viewSettings = { ...project.viewSettings, generationsUp: 2, generationsDown: 0 };

    const layout = buildLayout(project);
    expect(findHorizontalOverlaps(layout.nodes)).toEqual([]);

    const byId = (id: string) => layout.nodes.find((n) => n.personId === id)!;
    const leftCoupleCenter = (nodeCenterX(byId('pgf')) + nodeCenterX(byId('pgm'))) / 2;
    const rightCoupleCenter = (nodeCenterX(byId('mgf')) + nodeCenterX(byId('mgm'))) / 2;
    const fCenter = nodeCenterX(byId('f'));
    const mCenter = nodeCenterX(byId('m'));
    const leftSpread = fCenter - leftCoupleCenter;
    const rightSpread = rightCoupleCenter - mCenter;
    expect(leftSpread).toBeGreaterThan(0);
    expect(rightSpread).toBeGreaterThan(0);
    expect(Math.abs(leftSpread - rightSpread)).toBeLessThan(5);
  });
});

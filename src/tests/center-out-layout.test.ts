import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { buildGraph } from '../layout/graph-builder';
import { runCenterOutLayout } from '../layout/center-out-layout';
import { COUPLE_GAP } from '../layout/graph-builder';
import { CARD_GRID_CELL } from '../layout/card-dimensions';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';
import { findHorizontalOverlap } from './helpers/layout-quality';

function nodeCenterX(n: { x: number; width: number }): number {
  return n.x + n.width / 2;
}

describe('center-out layout engine', () => {
  it('uses center-out engine by default', () => {
    const project = createEmptyProject();
    expect(project.viewSettings.layoutEngine).toBe('center-out');
  });

  it('places parent couple 2 grid cells apart over child', () => {
    const project = createEmptyProject();
    const father = createEmptyPerson({ id: 'f', gender: 'male', givenName: 'Father' });
    const mother = createEmptyPerson({ id: 'm', gender: 'female', givenName: 'Mother' });
    const child = createEmptyPerson({ id: 'c', gender: 'male', givenName: 'Child' });
    project.persons = { f: father, m: mother, c: child };

    const unionId = 'u1';
    project.unions = {
      [unionId]: { id: unionId, partnerIds: ['f', 'm'], childIds: ['c'] },
    };
    for (const p of [father, mother, child]) {
      p.unionIds = p.id === 'f' || p.id === 'm' ? [unionId] : [];
      p.parentUnionIds = p.id === 'c' ? [unionId] : [];
    }
    project.center = { type: 'person', id: 'c' };

    const layout = buildLayout(project);
    const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
    const f = byPerson.get('f')!;
    const m = byPerson.get('m')!;
    const ch = byPerson.get('c')!;

    expect(Math.abs(m.x - (f.x + f.width + COUPLE_GAP))).toBeLessThan(5);
    const coupleCenter = (nodeCenterX(f) + nodeCenterX(m)) / 2;
    const childCenter = nodeCenterX(ch);
    expect(Math.abs(coupleCenter - childCenter)).toBeLessThan(COUPLE_GAP + 10);
  });

  it('three-generation ascent: grandparents partial then complete', () => {
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
      project.persons[id] = createEmptyPerson({
        id,
        gender: genders[id],
        givenName: id,
      });
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

    const graph = buildGraph(project, project.viewSettings);
    const nodes = runCenterOutLayout(project, graph);
    expect(findHorizontalOverlap(nodes)).toBeNull();

    const byPerson = new Map(nodes.filter((n) => n.personId).map((n) => [n.personId!, n]));
    expect(byPerson.has('pgf')).toBe(true);
    expect(byPerson.has('mgf')).toBe(true);
    expect(byPerson.has('pgm')).toBe(true);
    expect(byPerson.has('mgm')).toBe(true);
  });

  it('couple gap equals 2 grid cells', () => {
    const project = createEmptyProject();
    const father = createEmptyPerson({ id: 'f', gender: 'male', givenName: 'F' });
    const mother = createEmptyPerson({ id: 'm', gender: 'female', givenName: 'M' });
    const child = createEmptyPerson({ id: 'c', gender: 'male', givenName: 'C' });
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
    const gap = m.x - (f.x + f.width);
    expect(gap).toBeGreaterThanOrEqual(COUPLE_GAP - 1);
    expect(gap).toBeLessThanOrEqual(COUPLE_GAP + 1);
    expect(COUPLE_GAP).toBe(CARD_GRID_CELL * 2);
  });
  it('cross-union spouses: Ivan left of Maria with couple gap', () => {
    const project = repairProjectRelationships(JSON.parse(JSON.stringify(projectJson)) as Project);
    project.center = { type: 'person', id: '92312a00-8c2a-42ea-8078-1b5d6507302b' };
    project.viewSettings = { ...project.viewSettings, showAllPersons: true, layoutEngine: 'center-out' };
    const layout = buildLayout(project);
    const ivan = layout.nodes.find((n) => n.personId === '92312a00-8c2a-42ea-8078-1b5d6507302b')!;
    const maria = layout.nodes.find((n) => n.personId === '2cf738cd-bf1e-4ccf-b0d6-96d978901502')!;
    expect(ivan.x + ivan.width).toBeLessThanOrEqual(maria.x + 1);
    expect(maria.x - (ivan.x + ivan.width)).toBeGreaterThanOrEqual(COUPLE_GAP - 2);
    expect(maria.x - (ivan.x + ivan.width)).toBeLessThanOrEqual(COUPLE_GAP + 4);
    expect(findHorizontalOverlap(layout.nodes)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { buildGraph } from '../layout/graph-builder';
import { buildFamilyUnits, runFamilyLayout, syncSpouseLayers } from '../layout/family-layout';
import { repairProjectRelationships } from '../models/person-utils';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { COUPLE_GAP } from '../layout/graph-builder';
import { findHorizontalOverlap } from './helpers/layout-quality';
import projectJson from './fixtures/novy-proekt/project.json';

function nodeCenterX(n: { x: number; width: number }): number {
  return n.x + n.width / 2;
}

describe('family layout engine', () => {
  it('centers couple over two children', () => {
    const project = createEmptyProject();
    const father = createEmptyPerson({ id: 'f', gender: 'male', givenName: 'Father' });
    const mother = createEmptyPerson({ id: 'm', gender: 'female', givenName: 'Mother' });
    const c1 = createEmptyPerson({ id: 'c1', gender: 'male', givenName: 'C1' });
    const c2 = createEmptyPerson({ id: 'c2', gender: 'female', givenName: 'C2' });
    project.persons = { f: father, m: mother, c1, c2 };

    const unionId = 'u1';
    project.unions = {
      [unionId]: {
        id: unionId,
        partnerIds: ['f', 'm'],
        childIds: ['c1', 'c2'],
      },
    };
    for (const p of [father, mother, c1, c2]) {
      p.unionIds = p.id === 'f' || p.id === 'm' ? [unionId] : [];
      p.parentUnionIds = p.id === 'c1' || p.id === 'c2' ? [unionId] : [];
    }
    project.center = { type: 'person', id: 'f' };

    const layout = buildLayout(project);
    const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
    const f = byPerson.get('f')!;
    const m = byPerson.get('m')!;
    const child1 = byPerson.get('c1')!;
    const child2 = byPerson.get('c2')!;

    const coupleCenter = (nodeCenterX(f) + nodeCenterX(m)) / 2;
    const childCenter = (nodeCenterX(child1) + nodeCenterX(child2)) / 2;
    expect(Math.abs(coupleCenter - childCenter)).toBeLessThan(80);
    expect(Math.abs(m.x - (f.x + f.width + COUPLE_GAP))).toBeLessThan(5);
  });

  it('keeps siblings on the same row', () => {
    const project = repairProjectRelationships(JSON.parse(JSON.stringify(projectJson)) as Project);
    project.center = { type: 'person', id: '92312a00-8c2a-42ea-8078-1b5d6507302b' };
    const layout = buildLayout(project);
    const unionId = '325a9de7-6a3a-4351-8131-fcb5c80545d4';
    const union = project.unions[unionId];
    const children = union.childIds
      .map((id) => layout.nodes.find((n) => n.personId === id))
      .filter(Boolean);
    if (children.length >= 2) {
      const ys = children.map((c) => c!.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
    }
  });

  it('buildFamilyUnits links parent and child units', () => {
    const project = repairProjectRelationships(JSON.parse(JSON.stringify(projectJson)) as Project);
    project.center = { type: 'person', id: '92312a00-8c2a-42ea-8078-1b5d6507302b' };
    const graph = buildGraph(project, project.viewSettings);
    syncSpouseLayers(graph, project);
    const fl = buildFamilyUnits(project, graph);
    expect(fl.units.length).toBeGreaterThan(0);
    const withParent = fl.units.filter((u) => u.parentUnitId);
    expect(withParent.length).toBeGreaterThan(0);
  });

  it('uses family engine by default', () => {
    const project = createEmptyProject();
    expect(project.viewSettings.layoutEngine ?? 'family').toBe('family');
    const graph = buildGraph(project, project.viewSettings);
    const nodes = runFamilyLayout(project, graph);
    expect(Array.isArray(nodes)).toBe(true);
  });

  it('cross-union spouses: Maria stays in sibling row, Ivan adjacent on the right', () => {
    const project = repairProjectRelationships(JSON.parse(JSON.stringify(projectJson)) as Project);
    project.center = { type: 'person', id: '92312a00-8c2a-42ea-8078-1b5d6507302b' };
    project.viewSettings = { ...project.viewSettings, showAllPersons: true };
    const layout = buildLayout(project);
    const ivan = layout.nodes.find((n) => n.personId === '92312a00-8c2a-42ea-8078-1b5d6507302b')!;
    const maria = layout.nodes.find((n) => n.personId === '2cf738cd-bf1e-4ccf-b0d6-96d978901502')!;
    expect(ivan.x + ivan.width).toBeLessThanOrEqual(maria.x + 1);
    expect(maria.x - (ivan.x + ivan.width)).toBeGreaterThanOrEqual(COUPLE_GAP - 2);
    expect(maria.x - (ivan.x + ivan.width)).toBeLessThanOrEqual(COUPLE_GAP + 4);

    const graph = buildGraph(project, project.viewSettings);
    syncSpouseLayers(graph, project);
    const fl = buildFamilyUnits(project, graph);
    const ivanUnit = fl.units.find((u) => u.personIds.includes('92312a00-8c2a-42ea-8078-1b5d6507302b'));
    const mariaUnit = fl.units.find((u) => u.personIds.includes('2cf738cd-bf1e-4ccf-b0d6-96d978901502'));
    expect(ivanUnit?.kind).toBe('single');
    expect(mariaUnit?.kind).not.toBe('couple');
  });

  it('no overlap when centered on Maria grandparent', () => {
    const project = repairProjectRelationships(JSON.parse(JSON.stringify(projectJson)) as Project);
    project.center = { type: 'person', id: 'a5a08cef-6502-42a8-9f09-3e54857eea11' };
    const graph = buildGraph(project, project.viewSettings);
    syncSpouseLayers(graph, project);
    const familyNodes = runFamilyLayout(project, graph);
    expect(findHorizontalOverlap(familyNodes)).toBeNull();

    const layout = buildLayout(project);
    expect(findHorizontalOverlap(layout.nodes)).toBeNull();
  });
});

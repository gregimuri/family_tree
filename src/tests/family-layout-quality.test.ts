import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { createEmptyProject } from '../models/defaults';
import { importGedcom } from '../services/gedcom/import';
import { repairProjectRelationships } from '../models/person-utils';
import { assertLayoutQuality } from './helpers/layout-quality';
import projectJson from './fixtures/novy-proekt/project.json';

function loadFixture(center: Project['center']): Project {
  const p = repairProjectRelationships(projectJson as Project);
  p.center = center;
  return p;
}

describe('family layout quality — novy-proekt fixture', () => {
  const personIds = Object.keys(projectJson.persons);
  const unionIds = Object.keys(projectJson.unions);

  for (const centerId of personIds) {
    it(`person center ${centerId.slice(0, 8)}: couples, siblings, parents, layers`, () => {
      const project = loadFixture({ type: 'person', id: centerId });
      expect(() => assertLayoutQuality(project, buildLayout(project))).not.toThrow();
    });
  }

  for (const unionId of unionIds) {
    it(`family center ${unionId.slice(0, 8)}: couples, siblings, parents, layers`, () => {
      const project = loadFixture({ type: 'family', id: unionId });
      expect(() => assertLayoutQuality(project, buildLayout(project))).not.toThrow();
    });
  }

  it('Ivan and Maria couple has correct spacing when centered on grandparent', () => {
    const project = loadFixture({ type: 'person', id: 'a5a08cef-6502-42a8-9f09-3e54857eea11' });
    const layout = buildLayout(project);
    const ivan = layout.nodes.find((n) => n.personId === '92312a00-8c2a-42ea-8078-1b5d6507302b')!;
    const maria = layout.nodes.find((n) => n.personId === '2cf738cd-bf1e-4ccf-b0d6-96d978901502')!;
    const gap = maria.x - (ivan.x + ivan.width);
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(14);
  });
});

describe('family layout quality — synthetic trees', () => {
  it('empty starter project', () => {
    const project = createEmptyProject();
    expect(() => assertLayoutQuality(project, buildLayout(project))).not.toThrow();
  });

  it('GEDCOM import with parents, couple, child', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Root /Tree/
1 SEX M
0 @P1@ INDI
1 NAME Parent1 /Tree/
1 SEX M
0 @P2@ INDI
1 NAME Parent2 /Tree/
1 SEX F
0 @C1@ INDI
1 NAME Child /Tree/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @P2@
1 CHIL @C1@
0 @F2@ FAM
1 HUSB @P1@
1 WIFE @P2@
1 CHIL @I1@
0 TRLR`;
    const project = importGedcom(ged, 'Quality');
    project.center = { type: 'person', id: 'I1' };
    expect(() => assertLayoutQuality(project, buildLayout(project))).not.toThrow();
  });

  it('GEDCOM with siblings and collateral recenter', () => {
    const ged = `0 HEAD
0 @C@ INDI
1 NAME Child /Ivanov/
1 SEX M
0 @F@ INDI
1 NAME Father /Ivanov/
1 SEX M
0 @M@ INDI
1 NAME Mother /Ivanova/
1 SEX F
0 @PU@ INDI
1 NAME Uncle /Ivanov/
1 SEX M
0 @FC@ FAM
1 HUSB @F@
1 WIFE @M@
1 CHIL @C@
0 @FF@ FAM
1 HUSB @F@
1 WIFE @M@
1 CHIL @PU@
0 TRLR`;
    let project = importGedcom(ged, 'Collateral');
    project.center = { type: 'person', id: 'C' };
    buildLayout(project);

    project = { ...project, center: { type: 'person', id: 'PU' }, manualLayout: undefined };
    expect(() => assertLayoutQuality(project, buildLayout(project))).not.toThrow();
  });
});

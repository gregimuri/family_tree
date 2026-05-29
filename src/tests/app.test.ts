import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { removePersonFromProject } from '../models/person-utils';
import { getCenterFocusPoint } from '../layout/center-focus';
import { buildLayout } from '../layout';
import { importGedcom, parseGedcomName, parseGedcomDate } from '../services/gedcom/import';
import { exportGedcom } from '../services/gedcom/export';
import { validateViewSettings, canUseUniformCards } from '../models/validation';
import { createId } from '../utils/create-id';

describe('gedcom parsing', () => {
  it('parses slash NAME format', () => {
    const r = parseGedcomName('Эдуард Артемьевич /Шевченко/');
    expect(r.surname).toBe('Шевченко');
    expect(r.givenName).toBe('Эдуард');
    expect(r.patronymic).toBe('Артемьевич');
  });

  it('parses GEDCOM dates', () => {
    expect(parseGedcomDate('4 APR 1917')).toEqual({ day: 4, month: 4, year: 1917 });
    expect(parseGedcomDate('ABT 1951')?.year).toBe(1951);
    expect(parseGedcomDate('@#DJULIAN@ 1 JUL 1897')).toEqual({ day: 1, month: 7, year: 1897 });
    expect(parseGedcomDate('2016')?.year).toBe(2016);
  });
});

describe('layout', () => {
  it('builds layout for default project', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    expect(layout.nodes.length).toBeGreaterThan(0);
    expect(layout.bounds.maxX).toBeGreaterThan(layout.bounds.minX);
  });

  it('respects manual layout mode', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const personId = Object.keys(project.persons)[0];
    const node = layout.nodes.find((n) => n.personId === personId)!;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;

    project.manualLayout = { [personId]: { x: centerX + 120, y: centerY + 80 } };
    const manual = buildLayout(project);
    const moved = manual.nodes.find((n) => n.personId === personId)!;

    expect(moved.x).toBeCloseTo(node.x + 120, 0);
    expect(moved.y).toBeCloseTo(node.y + 80, 0);
    expect(manual.edges.length).toBeGreaterThan(0);
  });

  it('places partners on the same layer with male on the left', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`;
    const project = importGedcom(ged, 'Couple');
    project.center = { type: 'family', id: 'F1' };
    const layout = buildLayout(project);
    const husband = layout.nodes.find((n) => n.personId === 'I1');
    const wife = layout.nodes.find((n) => n.personId === 'I2');
    expect(husband).toBeTruthy();
    expect(wife).toBeTruthy();
    expect(husband!.y).toBeCloseTo(wife!.y, 0);
    expect(husband!.x).toBeLessThan(wife!.x);
  });

  it('orders siblings by birth year left to right', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @C1@ INDI
1 NAME Oldest /Ivanov/
1 SEX M
1 BIRT
2 DATE 1990
0 @C2@ INDI
1 NAME Youngest /Ivanov/
1 SEX F
1 BIRT
2 DATE 1995
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @C1@
1 CHIL @C2@
0 TRLR`;
    const project = importGedcom(ged, 'Siblings');
    project.center = { type: 'family', id: 'F1' };
    const layout = buildLayout(project);
    const oldest = layout.nodes.find((n) => n.personId === 'C1');
    const youngest = layout.nodes.find((n) => n.personId === 'C2');
    expect(oldest).toBeTruthy();
    expect(youngest).toBeTruthy();
    expect(oldest!.x).toBeLessThan(youngest!.x);
  });

  it('centers children under their parents', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @C1@ INDI
1 NAME Child /Ivanov/
1 SEX M
1 BIRT
2 DATE 1990
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @C1@
0 TRLR`;
    const project = importGedcom(ged, 'Center');
    project.center = { type: 'family', id: 'F1' };
    const layout = buildLayout(project);
    const husband = layout.nodes.find((n) => n.personId === 'I1')!;
    const wife = layout.nodes.find((n) => n.personId === 'I2')!;
    const child = layout.nodes.find((n) => n.personId === 'C1')!;
    const parentCenter = (husband.x + husband.width / 2 + wife.x + wife.width / 2) / 2;
    const childCenter = child.x + child.width / 2;
    expect(Math.abs(parentCenter - childCenter)).toBeLessThan(5);
  });

  it('uses pedigree connectors instead of duplicate parent edges', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @C1@ INDI
1 NAME Child /Ivanov/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @C1@
0 TRLR`;
    const project = importGedcom(ged, 'Pedigree');
    project.center = { type: 'family', id: 'F1' };
    const layout = buildLayout(project);
    expect(layout.edges.some((e) => e.id.startsWith('fam-stem-'))).toBe(true);
    expect(layout.edges.some((e) => e.id.startsWith('fam-drop-'))).toBe(true);
    expect(layout.edges.some((e) => e.id.includes('p-I1-p-C1'))).toBe(false);
  });
});

describe('gedcom', () => {
  it('imports and exports round-trip', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
1 BIRT
2 DATE 1980
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`;
    const project = importGedcom(ged, 'Test');
    expect(Object.keys(project.persons).length).toBe(2);
    expect(project.persons['I1'].surname).toBe('Ivanov');
    const out = exportGedcom(project);
    expect(out).toContain('@I1@ INDI');
    expect(out).toContain('@F1@ FAM');
  });
});

describe('validation', () => {
  it('forces diminish when side branches >= 3', () => {
    const project = createEmptyProject();
    const next = validateViewSettings({
      ...project.viewSettings,
      sideBranchesAt: 3,
      cardSizeMode: 'uniform',
    });
    expect(next.cardSizeMode).toBe('diminish');
    expect(canUseUniformCards(3)).toBe(false);
  });
});

describe('delete person', () => {
  it('removes person and cleans up empty unions', () => {
    const project = createEmptyProject();
    const [rootId, spouseId] = Object.keys(project.persons);
    const unionId = Object.keys(project.unions)[0];

    const next = removePersonFromProject(project, spouseId);

    expect(next.persons[spouseId]).toBeUndefined();
    expect(Object.keys(next.persons)).toHaveLength(1);
    expect(next.unions[unionId]).toBeUndefined();
    expect(next.persons[rootId].unionIds).toEqual([]);
  });

  it('keeps union with children when one partner is removed', () => {
    const project = createEmptyProject();
    const [rootId, spouseId] = Object.keys(project.persons);
    const unionId = Object.keys(project.unions)[0];
    const childId = createId();
    project.persons[childId] = {
      id: childId,
      gender: 'male',
      surname: 'Иванов',
      givenName: 'Пётр',
      patronymic: '',
      nicknamePriority: false,
      biography: '',
      parentUnionIds: [unionId],
      unionIds: [],
      mediaIds: [],
      cardLocationSource: 'birth',
    };
    project.unions[unionId] = {
      ...project.unions[unionId],
      childIds: [childId],
    };

    const next = removePersonFromProject(project, spouseId);

    expect(next.persons[spouseId]).toBeUndefined();
    expect(next.unions[unionId]).toBeTruthy();
    expect(next.unions[unionId].partnerIds).toEqual([rootId]);
    expect(next.unions[unionId].childIds).toEqual([childId]);
    expect(next.persons[childId].parentUnionIds).toEqual([unionId]);
  });

  it('updates center when deleted person was center', () => {
    const project = createEmptyProject();
    const [rootId, spouseId] = Object.keys(project.persons);
    project.center = { type: 'person', id: spouseId };

    const next = removePersonFromProject(project, spouseId);

    expect(next.center).toEqual({ type: 'person', id: rootId });
  });

  it('places tree center at layout origin after normalization', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const focus = getCenterFocusPoint(project, layout);
    expect(focus?.x).toBeCloseTo(0, 0);
    expect(focus?.y).toBeCloseTo(0, 0);
  });

  it('avoids horizontal overlap between cards on the same layer', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ivan /Ivanov/
1 SEX M
0 @I2@ INDI
1 NAME Maria /Ivanova/
1 SEX F
0 @C1@ INDI
1 NAME Child1 /Ivanov/
1 SEX M
1 BIRT
2 DATE 1990
0 @C2@ INDI
1 NAME Child2 /Ivanov/
1 SEX F
1 BIRT
2 DATE 1992
0 @C3@ INDI
1 NAME Child3 /Ivanov/
1 SEX M
1 BIRT
2 DATE 1994
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @C1@
1 CHIL @C2@
1 CHIL @C3@
0 TRLR`;
    const project = importGedcom(ged, 'Overlap');
    project.center = { type: 'family', id: 'F1' };
    const layout = buildLayout(project);
    const layer1 = layout.nodes.filter((n) => n.layer === 1);
    const sorted = [...layer1].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].width - 1);
    }
  });
});

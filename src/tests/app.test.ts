import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson, defaultCardFields, normalizeCardFields } from '../models/defaults';
import {
  calcAge,
  dateToText,
  formatAgeYears,
  formatCardAge,
  formatLifeDates,
  formatMarriageDates,
  getAllChildren,
  getCardBirthSuffix,
  getExcludedIdsForLink,
  getParents,
  linkChild,
  linkParent,
  linkPartner,
  unlinkChild,
  unlinkParent,
  unlinkPartner,
  removePersonFromProject,
  repairProjectRelationships,
  finalizeRelationshipChanges,
  removeMediaFromProject,
  validateProjectRelationships,
} from '../models/person-utils';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { getCenterFocusPoint, getSymmetricTreeFrame } from '../layout/center-focus';
import { buildLayout } from '../layout';
import { personToLayoutPerson } from '../layout/nuclear-tree-adapter';
import { buildGraph } from '../layout/graph-builder';
import { pickPartnersForUnion } from '../layout/pedigree-edges';
import type { LayoutEdge, LayoutNode } from '../types';
import { importGedcom, parseGedcomName, parseGedcomDate } from '../services/gedcom/import';
import { exportGedcom } from '../services/gedcom/export';
import { CARD_H_FULL, CARD_W } from '../layout/card-dimensions';
import { parseBondUnionId, routeCoupleBond, bondEdgeId, familyConnectorBusSpan } from '../layout/edge-router';
import { computeExportViewport, configureSvgForFixedPage } from '../services/export/image-export';
import { validateViewSettings, canUseUniformCards } from '../models/validation';
import { formatPlaceText, placeHasValue } from '../components/dossier/DossierFields';
import { countExternalMediaInProject, isExternalMediaUrl } from '../utils/media-url';
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
    expect(parseGedcomDate('@#DJULIAN@ 1 JUL 1897')).toEqual({
      day: 1,
      month: 7,
      year: 1897,
      julian: true,
    });
    expect(parseGedcomDate('2016')?.year).toBe(2016);
  });
});

describe('layout', () => {
  function maxHorizontalEdgeSpan(edges: LayoutEdge[]): number {
    if (edges.length === 0) return 0;
    return (
      Math.max(...edges.flatMap((e) => e.points.map((p) => p.x))) -
      Math.min(...edges.flatMap((e) => e.points.map((p) => p.x)))
    );
  }

  function maxBusSpan(edges: LayoutEdge[]): number {
    return edges.reduce((max, edge) => Math.max(max, familyConnectorBusSpan(edge)), 0);
  }

  it('builds layout for default project', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    expect(layout.nodes.length).toBeGreaterThan(0);
    expect(layout.bounds.maxX).toBeGreaterThan(layout.bounds.minX);
  });

  it('routes couple bond along card bottoms and parses bond union id', () => {
    const left: LayoutNode = {
      id: 'l',
      kind: 'person',
      layer: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      scale: 1,
      isSideBranch: false,
    };
    const right: LayoutNode = { ...left, id: 'r', x: 120 };
    const bond = routeCoupleBond(left, right);
    expect(bond).toEqual([
      { x: 50, y: 80 },
      { x: 170, y: 80 },
    ]);
    const unionId = '325a9de7-bf1e-4ccf-b0d6-96d978901502';
    expect(parseBondUnionId(bondEdgeId(unionId))).toBe(unionId);
    expect(parseBondUnionId(`bond-${unionId}-0`)).toBe(unionId);
  });

  it('shows parent marriage dates when a child is tree center', () => {
    let project = createEmptyProject();
    const unionId = Object.keys(project.unions)[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок', surname: 'Иванов', gender: 'male' });
    project = {
      ...project,
      persons: { ...project.persons, [child.id]: child },
      unions: {
        ...project.unions,
        [unionId]: {
          ...project.unions[unionId],
          childIds: [child.id],
        },
      },
    };
    project.persons[child.id] = {
      ...child,
      parentUnionIds: [unionId],
    };
    project.center = { type: 'person', id: child.id };
    project.viewSettings = {
      ...project.viewSettings,
      cardFields: { ...project.viewSettings.cardFields, marriageDateFormat: 'years' },
    };

    const layout = buildLayout(project);
    const bond = layout.edges.find((e) => e.id === bondEdgeId(unionId));
    const tree = layout.edges.find((e) => e.id.startsWith('fam-tree-') || e.id.startsWith('fam-branch-'));
    expect(bond).toBeTruthy();
    expect(bond!.points).toHaveLength(2);
    const midX = (bond!.points[0].x + bond!.points[1].x) / 2;
    const bondY = bond!.points[0].y;
    expect(tree?.pathD).toContain(`M ${midX} ${bondY}`);
    expect(tree?.pathD).not.toContain(`L ${bond!.points[1].x} ${bondY}`);
    expect(formatMarriageDates(project.unions[unionId], 'years')).toBe('2005');
  });

  it('expands sheet height after manual card move downward', () => {
    const project = createEmptyProject();
    const base = buildLayout(project);
    const personId = Object.keys(project.persons)[0];
    const node = base.nodes.find((n) => n.personId === personId)!;
    const shifted = {
      ...project,
      manualLayout: {
        [personId]: { x: node.x + node.width / 2, y: node.y + node.height / 2 + 400 },
      },
    };
    const moved = buildLayout(shifted);
    const baseSheet = getTreeSheetBounds(base, project);
    const movedSheet = getTreeSheetBounds(moved, shifted);
    expect(movedSheet.maxY).toBeGreaterThan(baseSheet.maxY + 300);
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

  it('keeps stored card positions when center changes', () => {
    let project = createEmptyProject();
    const [idA, idB] = Object.keys(project.persons);
    const layout1 = buildLayout(project);
    const nodeA = layout1.nodes.find((n) => n.personId === idA)!;
    const nodeB = layout1.nodes.find((n) => n.personId === idB)!;
    const cy = nodeA.y + nodeA.height / 2;

    project.manualLayout = {
      [idA]: { x: nodeA.x + nodeA.width / 2 + 3000, y: cy },
      [idB]: { x: nodeB.x + nodeB.width / 2, y: nodeB.y + nodeB.height / 2 },
    };

    project = { ...project, center: { type: 'person', id: idB } };
    const layout2 = buildLayout(project);
    const movedA = layout2.nodes.find((n) => n.personId === idA)!;
    const movedB = layout2.nodes.find((n) => n.personId === idB)!;

    expect(movedA.x + movedA.width / 2).toBeCloseTo(project.manualLayout![idA].x, 0);
    expect(movedB.x + movedB.width / 2).toBeCloseTo(project.manualLayout![idB].x, 0);
    expect(Math.abs(movedA.x + movedA.width / 2 - (movedB.x + movedB.width / 2))).toBeGreaterThan(500);
  });

  it('pickPartnersForUnion ignores partners on different layers', () => {
    const partners = [
      { layer: -1, x: 0, width: 100, personId: 'a' },
      { layer: 0, x: 2000, width: 100, personId: 'b' },
    ] as LayoutNode[];
    const children = [{ layer: 0, x: 100, width: 100, personId: 'c' }] as LayoutNode[];
    const picked = pickPartnersForUnion(partners, children);
    expect(picked).toHaveLength(1);
    expect(picked[0].personId).toBe('a');
  });

  it('recentering on collateral keeps compact family connectors', () => {
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
    let project = importGedcom(ged, 'Recenter');
    project.center = { type: 'person', id: 'C' };
    project.viewSettings = {
      ...project.viewSettings,
      generationsUp: 2,
      generationsDown: 0,
      sideBranchesAt: 1,
      sideBranchDepth: 0,
    };
    buildLayout(project);

    project = { ...project, center: { type: 'person', id: 'PU' }, manualLayout: undefined };
    const layout = buildLayout(project);
    const uncle = layout.nodes.find((n) => n.personId === 'PU')!;
    const father = layout.nodes.find((n) => n.personId === 'F')!;
    expect(Math.abs(uncle.y - father.y)).toBeLessThan(500);
    const maxEdgeSpan = maxHorizontalEdgeSpan(layout.edges);
    expect(maxEdgeSpan).toBeLessThan(2000);
  });

  it('recentering on collateral with default side-branch settings avoids long buses', () => {
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
    let project = importGedcom(ged, 'RecenterDefault');
    project.center = { type: 'person', id: 'C' };
    project.viewSettings = {
      ...project.viewSettings,
      generationsUp: 3,
      generationsDown: 1,
    };
    buildLayout(project);

    project = { ...project, center: { type: 'person', id: 'PU' }, manualLayout: undefined };
    const layout = buildLayout(project);
    expect(maxBusSpan(layout.edges)).toBeLessThan(400);
    expect(maxHorizontalEdgeSpan(layout.edges)).toBeLessThan(1200);
  });

  it('keeps remarriage partners close on the same layer', () => {
    const ged = `0 HEAD
0 @P@ INDI
1 NAME Peter /Ivanov/
1 SEX M
0 @A@ INDI
1 NAME Anna /Ivanova/
1 SEX F
0 @B@ INDI
1 NAME Bella /Belova/
1 SEX F
0 @C1@ INDI
1 NAME Child1 /Ivanov/
1 SEX M
0 @C2@ INDI
1 NAME Child2 /Ivanov/
1 SEX M
0 @F1@ FAM
1 HUSB @P@
1 WIFE @A@
1 CHIL @C1@
0 @F2@ FAM
1 HUSB @P@
1 WIFE @B@
1 CHIL @C2@
0 TRLR`;
    const project = importGedcom(ged, 'Remarriage');
    project.center = { type: 'person', id: 'P' };
    const layout = buildLayout(project);
    const p = layout.nodes.find((n) => n.personId === 'P')!;
    const a = layout.nodes.find((n) => n.personId === 'A')!;
    const b = layout.nodes.find((n) => n.personId === 'B')!;
    expect(Math.abs(p.x + p.width / 2 - (a.x + a.width / 2))).toBeLessThan(520);
    expect(Math.abs(p.x + p.width / 2 - (b.x + b.width / 2))).toBeLessThan(520);
    expect(maxHorizontalEdgeSpan(layout.edges)).toBeLessThan(1200);
  });

  it('buildLayout uses integrated nuclear layout for main line', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    expect(layout.nodes.length).toBeGreaterThan(0);
    const [idA, idB] = Object.keys(project.persons);
    const na = layout.nodes.find((n) => n.personId === idA)!;
    const nb = layout.nodes.find((n) => n.personId === idB)!;
    expect(Math.abs(na.x + na.width / 2 - (nb.x + nb.width / 2))).toBeLessThan(300);
  });

  it('places maternal collateral left and paternal collateral right', () => {
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
0 @PGF@ INDI
1 NAME PGF /Ivanov/
1 SEX M
0 @PGM@ INDI
1 NAME PGM /Ivanova/
1 SEX F
0 @PU@ INDI
1 NAME Uncle /Ivanov/
1 SEX M
0 @MGF@ INDI
1 NAME MGF /Petrov/
1 SEX M
0 @MGM@ INDI
1 NAME MGM /Petrova/
1 SEX F
0 @MA@ INDI
1 NAME Aunt /Petrova/
1 SEX F
0 @FC@ FAM
1 HUSB @F@
1 WIFE @M@
1 CHIL @C@
0 @FF@ FAM
1 HUSB @PGF@
1 WIFE @PGM@
1 CHIL @F@
1 CHIL @PU@
0 @FM@ FAM
1 HUSB @MGF@
1 WIFE @MGM@
1 CHIL @M@
1 CHIL @MA@
0 TRLR`;
    const project = importGedcom(ged, 'Collateral');
    project.center = { type: 'person', id: 'C' };
    project.viewSettings = {
      ...project.viewSettings,
      generationsUp: 3,
      generationsDown: 0,
      sideBranchesAt: 1,
      sideBranchDepth: 0,
    };
    const graph = buildGraph(project, project.viewSettings);
    expect(graph.personToNode.has('PU')).toBe(true);
    expect(graph.personToNode.has('MA')).toBe(true);
    const layout = buildLayout(project);
    const cx = (n: { x: number; width: number }) => n.x + n.width / 2;
    const uncle = layout.nodes.find((n) => n.personId === 'PU')!;
    const aunt = layout.nodes.find((n) => n.personId === 'MA')!;
    const father = layout.nodes.find((n) => n.personId === 'F')!;
    const mother = layout.nodes.find((n) => n.personId === 'M')!;
    expect(uncle).toBeTruthy();
    expect(aunt).toBeTruthy();
    expect(cx(uncle)).toBeGreaterThan(cx(father));
    expect(cx(aunt)).toBeLessThan(cx(mother));
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
    const hasPedigreeConnector =
      layout.edges.some((e) => e.id.startsWith('fam-tree-')) ||
      layout.edges.some((e) => e.id.startsWith('fam-branch-'));
    expect(hasPedigreeConnector).toBe(true);
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
  it('keeps uniform card size regardless of side branches', () => {
    const project = createEmptyProject();
    const next = validateViewSettings({
      ...project.viewSettings,
      sideBranchesAt: 3,
      cardSizeMode: 'uniform',
    });
    expect(next.cardSizeMode).toBe('uniform');
    expect(canUseUniformCards()).toBe(true);
  });

  it('allows zero generations up and down', () => {
    const project = createEmptyProject();
    const next = validateViewSettings({
      ...project.viewSettings,
      generationsUp: 0,
      generationsDown: 0,
    });
    expect(next.generationsUp).toBe(0);
    expect(next.generationsDown).toBe(0);
  });

  it('migrates legacy showMarriageYears to marriageDateFormat', () => {
    expect(normalizeCardFields({ showMarriageYears: true }).marriageDateFormat).toBe('years');
    expect(normalizeCardFields({ showMarriageYears: false }).marriageDateFormat).toBe('hidden');
  });

  it('defaults card fields to full dates and birth name', () => {
    const fields = defaultCardFields();
    expect(fields.showBirthName).toBe(true);
    expect(fields.dateFormat).toBe('full');
    expect(fields.marriageDateFormat).toBe('full');
  });
});

describe('graph generations', () => {
  it('hides children when generationsDown is 0', () => {
    const project = createEmptyProject();
    const unionId = Object.keys(project.unions)[0];
    const childId = createId();
    project.persons[childId] = createEmptyPerson({
      id: childId,
      givenName: 'Ребёнок',
      parentUnionIds: [unionId],
    });
    project.unions[unionId] = {
      ...project.unions[unionId],
      childIds: [childId],
    };
    project.viewSettings = { ...project.viewSettings, generationsDown: 0 };
    const graph = buildGraph(project, project.viewSettings);
    expect(graph.personToNode.has(childId)).toBe(false);
  });

  it('hides parents when generationsUp is 0', () => {
    const project = createEmptyProject();
    const parentId = createId();
    const [childId] = Object.keys(project.persons);
    const parentUnionId = createId();
    project.persons[parentId] = createEmptyPerson({ id: parentId, givenName: 'Родитель' });
    project.unions[parentUnionId] = {
      id: parentUnionId,
      partnerIds: [parentId],
      childIds: [childId],
    };
    project.persons[childId] = {
      ...project.persons[childId],
      parentUnionIds: [parentUnionId],
    };
    project.center = { type: 'person', id: childId };
    project.viewSettings = { ...project.viewSettings, generationsUp: 0, generationsDown: 0 };
    const graph = buildGraph(project, project.viewSettings);
    expect(graph.personToNode.has(parentId)).toBe(false);
    expect(graph.personToNode.has(childId)).toBe(true);
  });

  it('shows partner ancestors when center is a person', () => {
    const project = createEmptyProject();
    const [centerId, spouseId] = Object.keys(project.persons);
    const centerParentId = createId();
    const spouseParentId = createId();
    const centerParentUnionId = createId();
    const spouseParentUnionId = createId();

    project.persons[centerParentId] = createEmptyPerson({
      id: centerParentId,
      givenName: 'Отец',
      surname: 'Центра',
    });
    project.persons[spouseParentId] = createEmptyPerson({
      id: spouseParentId,
      givenName: 'Отец',
      surname: 'Супруга',
    });
    project.unions[centerParentUnionId] = {
      id: centerParentUnionId,
      partnerIds: [centerParentId],
      childIds: [centerId],
    };
    project.unions[spouseParentUnionId] = {
      id: spouseParentUnionId,
      partnerIds: [spouseParentId],
      childIds: [spouseId],
    };
    project.persons[centerId] = {
      ...project.persons[centerId],
      parentUnionIds: [centerParentUnionId],
    };
    project.persons[spouseId] = {
      ...project.persons[spouseId],
      parentUnionIds: [spouseParentUnionId],
    };
    project.center = { type: 'person', id: centerId };
    project.viewSettings = { ...project.viewSettings, generationsUp: 1, generationsDown: 0 };

    const graph = buildGraph(project, project.viewSettings);
    expect(graph.personToNode.has(centerParentId)).toBe(true);
    expect(graph.personToNode.has(spouseParentId)).toBe(true);
  });

  it('shows all persons when showAllPersons is enabled', () => {
    const project = createEmptyProject();
    const centerId = Object.values(project.unions)[0].partnerIds[0];
    const cousinId = createId();
    const parentId = createId();
    const parentUnionId = createId();

    project.persons[parentId] = createEmptyPerson({ id: parentId, givenName: 'Родитель' });
    project.persons[cousinId] = createEmptyPerson({ id: cousinId, givenName: 'Двоюродный' });
    project.unions[parentUnionId] = {
      id: parentUnionId,
      partnerIds: [parentId],
      childIds: [centerId, cousinId],
    };
    project.persons[centerId] = {
      ...project.persons[centerId],
      parentUnionIds: [parentUnionId],
    };
    project.persons[cousinId] = {
      ...project.persons[cousinId],
      parentUnionIds: [parentUnionId],
    };
    project.center = { type: 'person', id: centerId };
    project.viewSettings = {
      ...project.viewSettings,
      generationsUp: 0,
      generationsDown: 0,
      sideBranchesAt: 0,
      showAllPersons: false,
    };

    const limited = buildGraph(project, project.viewSettings);
    expect(limited.personToNode.has(cousinId)).toBe(false);
    expect(limited.personToNode.has(parentId)).toBe(false);

    const full = buildGraph(project, { ...project.viewSettings, showAllPersons: true });
    expect(full.personToNode.has(cousinId)).toBe(true);
    expect(full.personToNode.has(parentId)).toBe(true);
    const cousinNodeId = full.personToNode.get(cousinId)!;
    expect(full.edges.some((e) => e.to === cousinNodeId)).toBe(true);

    const layout = buildLayout({
      ...project,
      viewSettings: { ...project.viewSettings, showAllPersons: true },
    });
    expect(layout.nodes.some((n) => n.personId === cousinId)).toBe(true);
    expect(
      layout.edges.some((e) => e.id.startsWith('fam-tree-') || e.id.startsWith('fam-branch-')),
    ).toBe(true);
  });

  it('draws siblings with one aligned fam-tree connector in showAllPersons', () => {
    const project = createEmptyProject();
    const father = createId();
    const mother = createId();
    const child1 = createId();
    const child2 = createId();
    const unionId = createId();

    project.persons[father] = createEmptyPerson({ id: father, givenName: 'Отец', gender: 'male' });
    project.persons[mother] = createEmptyPerson({ id: mother, givenName: 'Мать', gender: 'female' });
    project.persons[child1] = createEmptyPerson({
      id: child1,
      givenName: 'Сын1',
      gender: 'male',
      birth: { date: { year: 2000 } },
    });
    project.persons[child2] = createEmptyPerson({
      id: child2,
      givenName: 'Сын2',
      gender: 'male',
      birth: { date: { year: 2002 } },
    });
    project.unions[unionId] = {
      id: unionId,
      partnerIds: [father, mother],
      childIds: [child1, child2],
      marriageStart: { year: 1995 },
    };
    for (const id of [father, mother]) project.persons[id].unionIds = [unionId];
    project.persons[child1].parentUnionIds = [unionId];
    project.persons[child2].parentUnionIds = [unionId];
    project.center = { type: 'person', id: child1 };
    project.viewSettings = {
      ...project.viewSettings,
      showAllPersons: true,
      cardFields: { ...project.viewSettings.cardFields, marriageDateFormat: 'years' },
    };

    const layout = buildLayout(project);
    const tree = layout.edges.find((e) => e.id === `fam-tree-${unionId}`);
    expect(tree).toBeTruthy();
    expect(tree!.pathD).toBeTruthy();
    expect(layout.edges.some((e) => e.id.startsWith('fam-drop-'))).toBe(false);

    const forkY = tree!.points[1].y;
    expect(tree!.points[2].y).toBe(forkY);
    expect(tree!.points[3].y).toBe(forkY);
    for (let i = 4; i < tree!.points.length; i += 2) {
      expect(tree!.points[i].y).toBe(forkY);
    }
    expect(tree!.points.length).toBeGreaterThanOrEqual(8);
  });

  it('uses branch connectors for distant children when showAllPersons is enabled', () => {
    const project = createEmptyProject();
    const leftParentA = createId();
    const leftParentB = createId();
    const rightParentA = createId();
    const rightParentB = createId();
    const leftChild = createId();
    const rightChild = createId();
    const leftUnionId = createId();
    const rightUnionId = createId();

    project.persons[leftParentA] = createEmptyPerson({ id: leftParentA, givenName: 'Отец', surname: 'Лев', gender: 'male' });
    project.persons[leftParentB] = createEmptyPerson({ id: leftParentB, givenName: 'Мать', surname: 'Левая', gender: 'female' });
    project.persons[rightParentA] = createEmptyPerson({ id: rightParentA, givenName: 'Отец', surname: 'Прав', gender: 'male' });
    project.persons[rightParentB] = createEmptyPerson({ id: rightParentB, givenName: 'Мать', surname: 'Правая', gender: 'female' });
    project.persons[leftChild] = createEmptyPerson({ id: leftChild, givenName: 'Сын', surname: 'Лев', gender: 'male' });
    project.persons[rightChild] = createEmptyPerson({ id: rightChild, givenName: 'Дочь', surname: 'Прав', gender: 'female' });

    project.unions[leftUnionId] = {
      id: leftUnionId,
      partnerIds: [leftParentA, leftParentB],
      childIds: [leftChild],
      marriageStart: { year: 1977 },
    };
    project.unions[rightUnionId] = {
      id: rightUnionId,
      partnerIds: [rightParentA, rightParentB],
      childIds: [rightChild],
      marriageStart: { year: 1975 },
    };

    for (const id of [leftParentA, leftParentB, rightParentA, rightParentB]) {
      project.persons[id].unionIds = [id === leftParentA || id === leftParentB ? leftUnionId : rightUnionId];
    }
    project.persons[leftChild].parentUnionIds = [leftUnionId];
    project.persons[rightChild].parentUnionIds = [rightUnionId];
    project.center = { type: 'person', id: leftChild };
    project.viewSettings = {
      ...project.viewSettings,
      showAllPersons: true,
      cardFields: { ...project.viewSettings.cardFields, marriageDateFormat: 'years' },
    };

    const layout = buildLayout(project);
    const leftBranch = layout.edges.find((e) => e.id === `fam-branch-${leftUnionId}-${leftChild}`);
    const rightBranch = layout.edges.find((e) => e.id === `fam-branch-${rightUnionId}-${rightChild}`);
    expect(leftBranch).toBeTruthy();
    expect(rightBranch).toBeTruthy();

    const wideBus = layout.edges.filter((e) => familyConnectorBusSpan(e) > 0);
    for (const bus of wideBus) {
      expect(familyConnectorBusSpan(bus)).toBeLessThan(700);
    }
  });
});

describe('link eligibility', () => {
  it('excludes descendants when linking parent', () => {
    const project = createEmptyProject();
    const unionId = Object.keys(project.unions)[0];
    const childId = createId();
    project.persons[childId] = createEmptyPerson({
      id: childId,
      parentUnionIds: [unionId],
    });
    project.unions[unionId] = {
      ...project.unions[unionId],
      childIds: [childId],
    };
    const [parentId] = Object.keys(project.persons).filter((id) => id !== childId);
    const excluded = new Set(getExcludedIdsForLink(project, parentId, 'parent'));
    expect(excluded.has(childId)).toBe(true);
  });
});

describe('dossier places', () => {
  it('shows place details when name is empty', () => {
    expect(formatPlaceText({ name: '', details: 'район X' })).toBe('район X');
    expect(placeHasValue({ name: '', details: 'район X' })).toBe(true);
  });
});

describe('dates', () => {
  it('shows text-only dates in years mode', () => {
    const person = createEmptyPerson({
      birth: { date: { text: 'ок. 1951' } },
      death: { date: { text: 'после 2000' } },
    });
    expect(formatLifeDates(person, 'years')).toBe('ок. 1951 – после 2000');
  });

  it('shows text dates in years mode when year is also stored', () => {
    const person = createEmptyPerson({
      birth: { date: { year: 1951, text: 'ABT 1951' } },
      death: { date: { year: 2000, text: 'AFT 2000' } },
    });
    expect(formatLifeDates(person, 'years')).toBe('ABT 1951 – AFT 2000');
  });

  it('shows mixed text and numeric dates in years mode', () => {
    const person = createEmptyPerson({
      birth: { date: { text: 'ок. 1951' } },
      death: { date: { year: 2010 } },
    });
    expect(formatLifeDates(person, 'years')).toBe('ок. 1951 – 2010');
  });

  it('shows only year for numeric dates in years mode', () => {
    const person = createEmptyPerson({
      birth: { date: { year: 1951, month: 3, day: 15 } },
      death: { date: { year: 2010 } },
    });
    expect(formatLifeDates(person, 'years')).toBe('1951 – 2010');
  });

  it('shows living person birth without dash', () => {
    const person = createEmptyPerson({ birth: { date: { year: 1980, month: 3, day: 1 } } });
    expect(formatLifeDates(person, 'full')).toBe('01.03.1980');
    expect(formatLifeDates(person, 'years')).toBe('1980');
  });

  it('shows death-only dates with um prefix', () => {
    const person = createEmptyPerson({ death: { date: { year: 2010, month: 5, day: 2 } } });
    expect(formatLifeDates(person, 'full')).toBe('ум. 02.05.2010');
    expect(formatLifeDates(person, 'years')).toBe('ум. 2010');
  });

  it('formats age with russian declension and hides approximate dates', () => {
    expect(formatAgeYears(71)).toBe('71\u00a0год');
    expect(formatAgeYears(63)).toBe('63\u00a0года');
    expect(formatAgeYears(80)).toBe('80\u00a0лет');
    expect(formatAgeYears(11)).toBe('11\u00a0лет');
    expect(formatAgeYears(21)).toBe('21\u00a0год');
    const approximate = createEmptyPerson({ birth: { date: { text: 'ок. 1951', year: 1951 } } });
    expect(formatCardAge(approximate)).toBeNull();
  });

  it('calcAge respects exact birth and death dates', () => {
    const person = createEmptyPerson({
      birth: { date: { year: 1980, month: 12, day: 31 } },
      death: { date: { year: 2020, month: 1, day: 1 } },
    });
    expect(calcAge(person)).toBe(39);
    const exactBirthday = createEmptyPerson({
      birth: { date: { year: 1980, month: 12, day: 31 } },
      death: { date: { year: 2020, month: 12, day: 31 } },
    });
    expect(calcAge(exactBirthday)).toBe(40);
  });

  it('appends old-style suffix for julian dates', () => {
    expect(dateToText({ year: 1897, month: 7, day: 1, julian: true })).toBe('01.07.1897\u00a0ст.');
    expect(dateToText({ text: 'ок. 1875', julian: true })).toBe('ок. 1875\u00a0ст.');
  });

  it('formats marriage dates: start only without divorce', () => {
    const union = {
      id: 'u1',
      partnerIds: ['a', 'b'],
      childIds: [],
      marriageStart: { year: 2005, month: 6, day: 12 },
    };
    expect(formatMarriageDates(union, 'years')).toBe('2005');
    expect(formatMarriageDates(union, 'full')).toBe('12.06.2005');
  });

  it('formats marriage dates: full range when divorced', () => {
    const union = {
      id: 'u1',
      partnerIds: ['a', 'b'],
      childIds: [],
      marriageStart: { year: 2005 },
      marriageEnd: { year: 2012, month: 3 },
    };
    expect(formatMarriageDates(union, 'years')).toBe('2005 – 2012');
    expect(formatMarriageDates(union, 'full')).toBe('2005 – 03.2012');
  });

  it('returns birth suffix only when different from current name', () => {
    expect(getCardBirthSuffix('Иванова', 'Петрова', true)).toBe('Петрова');
    expect(getCardBirthSuffix('Иванова', 'Иванова', true)).toBeNull();
    expect(getCardBirthSuffix('Иванова', 'Петрова', false)).toBeNull();
  });
});

describe('relationships', () => {
  it('links child to single parent without partner', () => {
    let project = createEmptyProject();
    const parentId = Object.keys(project.persons)[0];
    const child = createEmptyPerson();
    project = {
      ...project,
      persons: { ...project.persons, [child.id]: child },
    };
    project = linkChild(project, parentId, child.id);
    expect(project.unions[Object.keys(project.unions).find((id) => project.unions[id].childIds.includes(child.id))!].partnerIds).toEqual([parentId]);
    expect(project.persons[child.id].parentUnionIds.length).toBe(1);
  });

  it('links parent to child', () => {
    let project = createEmptyProject();
    const [p1, spouseId] = Object.keys(project.persons);
    const child = createEmptyPerson();
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, p1);
    project = linkParent(project, child.id, spouseId);
    const parentIds = getParentsFromProject(project, child.id).map((p) => p.id).sort();
    expect(parentIds).toEqual([p1, spouseId].sort());
  });

  it('linkChild is bidirectional: child sees parent and parent sees child', () => {
    let project = createEmptyProject();
    const parentId = Object.keys(project.persons)[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkChild(project, parentId, child.id);

    const parent = project.persons[parentId];
    expect(getParents(project, project.persons[child.id]).some((p) => p.id === parentId)).toBe(true);
    expect(getAllChildren(project, parent).some((c) => c.id === child.id)).toBe(true);
  });

  it('two isolated persons see parent-child link from both sides', () => {
    let project = createEmptyProject();
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    const parent = createEmptyPerson({ givenName: 'Родитель', gender: 'male' });
    project = {
      ...project,
      persons: { [child.id]: child, [parent.id]: parent },
      unions: {},
    };

    project = finalizeRelationshipChanges(linkParent(project, child.id, parent.id));

    expect(getParents(project, project.persons[child.id]).map((p) => p.id)).toEqual([parent.id]);
    expect(getAllChildren(project, project.persons[parent.id]).map((c) => c.id)).toEqual([child.id]);
    expect(validateProjectRelationships(project)).toEqual([]);
  });

  it('linkParent is bidirectional and adds child to marriage union when both parents linked', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[parentId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };

    project = linkParent(project, child.id, parentId);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id)).toEqual([parentId]);

    project = linkParent(project, child.id, spouseId);

    expect(project.unions[marriageUnionId].childIds).toContain(child.id);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id).sort()).toEqual(
      [parentId, spouseId].sort(),
    );
    expect(getAllChildren(project, project.persons[spouseId]).some((c) => c.id === child.id)).toBe(true);
  });

  it('unlinkParent removes one parent but keeps marriage and other parent', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[parentId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, parentId);
    project = linkParent(project, child.id, spouseId);

    project = unlinkParent(project, child.id, parentId);

    expect(project.unions[marriageUnionId]).toBeDefined();
    expect(project.unions[marriageUnionId].partnerIds.sort()).toEqual([parentId, spouseId].sort());
    expect(getParents(project, project.persons[child.id]).map((p) => p.id)).toEqual([spouseId]);
    expect(getAllChildren(project, project.persons[parentId]).some((c) => c.id === child.id)).toBe(false);
    expect(getAllChildren(project, project.persons[spouseId]).some((c) => c.id === child.id)).toBe(true);
  });

  it('unlinkParent then linkParent restores both parents and marriage child link', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[parentId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, parentId);
    project = linkParent(project, child.id, spouseId);

    project = unlinkParent(project, child.id, parentId);
    project = unlinkParent(project, child.id, spouseId);
    project = linkParent(project, child.id, parentId);
    project = linkParent(project, child.id, spouseId);

    expect(project.unions[marriageUnionId].childIds).toContain(child.id);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id).sort()).toEqual(
      [parentId, spouseId].sort(),
    );
  });

  it('after unlinking both parents, linking father then mother restores full family', () => {
    let project = createEmptyProject();
    const [fatherId, motherId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[fatherId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, fatherId);

    project = unlinkParent(project, child.id, fatherId);
    project = unlinkParent(project, child.id, motherId);

    project = linkParent(project, child.id, fatherId);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id)).toEqual([fatherId]);

    project = linkParent(project, child.id, motherId);

    expect(project.unions[marriageUnionId].childIds).toContain(child.id);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id).sort()).toEqual(
      [fatherId, motherId].sort(),
    );
    expect(getAllChildren(project, project.persons[motherId]).some((c) => c.id === child.id)).toBe(true);
    expect(getAllChildren(project, project.persons[fatherId]).some((c) => c.id === child.id)).toBe(true);
    for (const uid of project.persons[child.id].parentUnionIds) {
      expect(project.unions[uid]?.childIds).toContain(child.id);
    }
  });

  it('validateProjectRelationships passes for default project', () => {
    expect(validateProjectRelationships(createEmptyProject())).toEqual([]);
  });

  it('relationship operations stay bidirectional', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };

    project = linkChild(project, parentId, child.id);
    expect(validateProjectRelationships(project)).toEqual([]);

    project = linkParent(project, child.id, spouseId);
    expect(validateProjectRelationships(project)).toEqual([]);

    project = unlinkParent(project, child.id, parentId);
    expect(validateProjectRelationships(project)).toEqual([]);

    project = linkParent(project, child.id, parentId);
    expect(validateProjectRelationships(project)).toEqual([]);

    project = unlinkPartner(project, parentId, spouseId);
    expect(validateProjectRelationships(project)).toEqual([]);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id).sort()).toEqual(
      [parentId, spouseId].sort(),
    );
    expect(getAllChildren(project, project.persons[parentId]).some((c) => c.id === child.id)).toBe(true);
    expect(getAllChildren(project, project.persons[spouseId]).some((c) => c.id === child.id)).toBe(true);
  });

  it('unlinkPartner with children migrates to single-parent unions', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[parentId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, parentId);
    project = linkParent(project, child.id, spouseId);

    project = unlinkPartner(project, parentId, spouseId);

    expect(project.unions[marriageUnionId]).toBeUndefined();
    expect(validateProjectRelationships(project)).toEqual([]);
    expect(getParents(project, project.persons[child.id]).map((p) => p.id).sort()).toEqual(
      [parentId, spouseId].sort(),
    );
  });

  it('linkPartner and unlinkChild stay bidirectional', () => {
    let project = createEmptyProject();
    const parentId = Object.keys(project.persons)[0];
    const partner = createEmptyPerson({ givenName: 'Партнёр' });
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = {
      ...project,
      persons: { ...project.persons, [partner.id]: partner, [child.id]: child },
    };

    project = linkPartner(project, parentId, partner.id);
    expect(validateProjectRelationships(project)).toEqual([]);

    project = linkChild(project, parentId, child.id);
    expect(validateProjectRelationships(project)).toEqual([]);

    const unionId = project.persons[parentId].unionIds.find(
      (uid) => project.unions[uid].childIds.includes(child.id),
    )!;
    project = unlinkChild(project, unionId, child.id);
    expect(validateProjectRelationships(project)).toEqual([]);
    expect(getAllChildren(project, project.persons[parentId]).some((c) => c.id === child.id)).toBe(false);
    expect(getParents(project, project.persons[child.id]).length).toBe(0);
  });

  it('linkPartner merges shared children into marriage union', () => {
    let project = createEmptyProject();
    const [parentId, spouseId] = Object.keys(project.persons);
    const marriageUnionId = project.persons[parentId].unionIds[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };

    project = unlinkPartner(project, parentId, spouseId);
    project = linkParent(project, child.id, parentId);
    project = linkParent(project, child.id, spouseId);
    expect(project.unions[marriageUnionId]).toBeUndefined();

    project = linkPartner(project, parentId, spouseId);
    const marriageUnion = Object.values(project.unions).find(
      (u) => u.partnerIds.includes(parentId) && u.partnerIds.includes(spouseId) && u.partnerIds.length >= 2,
    );
    expect(marriageUnion?.childIds).toContain(child.id);
    expect(validateProjectRelationships(project)).toEqual([]);
  });

  it('removePersonFromProject cleans single-parent union with children', () => {
    let project = createEmptyProject();
    const parentId = Object.keys(project.persons)[0];
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkChild(project, parentId, child.id);

    const next = removePersonFromProject(project, parentId);
    expect(validateProjectRelationships(next)).toEqual([]);
    expect(getParents(next, next.persons[child.id]).length).toBe(0);
    expect(Object.values(next.unions).every((u) => u.partnerIds.length > 0)).toBe(true);
  });

  it('blocks parent-child cycles', () => {
    let project = createEmptyProject();
    const [parentId] = Object.keys(project.persons);
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    project = { ...project, persons: { ...project.persons, [child.id]: child } };
    project = linkParent(project, child.id, parentId);

    const blocked = linkParent(project, parentId, child.id);
    expect(validateProjectRelationships(blocked)).toEqual([]);
    expect(getParents(blocked, blocked.persons[parentId]).some((p) => p.id === child.id)).toBe(false);
  });

  it('allows at most two parents per person', () => {
    let project = createEmptyProject();
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    const parent1 = createEmptyPerson({ givenName: 'Отец', gender: 'male' });
    const parent2 = createEmptyPerson({ givenName: 'Мать', gender: 'female' });
    const parent3 = createEmptyPerson({ givenName: 'Лишний', gender: 'male' });
    project = {
      ...project,
      persons: {
        ...project.persons,
        [child.id]: child,
        [parent1.id]: parent1,
        [parent2.id]: parent2,
        [parent3.id]: parent3,
      },
    };

    project = linkParent(project, child.id, parent1.id);
    project = linkParent(project, child.id, parent2.id);
    expect(getParents(project, project.persons[child.id]).length).toBe(2);

    const blocked = linkParent(project, child.id, parent3.id);
    expect(getParents(blocked, blocked.persons[child.id]).length).toBe(2);
    expect(getParents(blocked, blocked.persons[child.id]).some((p) => p.id === parent3.id)).toBe(false);
  });

  it('creates marriage union when second parent is linked', () => {
    let project = createEmptyProject();
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    const father = createEmptyPerson({ givenName: 'Отец', gender: 'male' });
    const mother = createEmptyPerson({ givenName: 'Мать', gender: 'female' });
    project = {
      ...project,
      persons: {
        ...project.persons,
        [child.id]: child,
        [father.id]: father,
        [mother.id]: mother,
      },
    };

    project = linkParent(project, child.id, father.id);
    project = linkParent(project, child.id, mother.id);

    const parents = getParents(project, project.persons[child.id]);
    expect(parents.length).toBe(2);

    const fatherAfter = project.persons[father.id];
    const motherAfter = project.persons[mother.id];
    const sharedUnion = fatherAfter.unionIds.find(
      (uid) => motherAfter.unionIds.includes(uid) && project.unions[uid]?.partnerIds.length === 2,
    );
    expect(sharedUnion).toBeTruthy();
    expect(project.unions[sharedUnion!].childIds).toContain(child.id);
  });

  it('repairProjectRelationships fixes stale references', () => {
    let project = createEmptyProject();
    const [parentId] = Object.keys(project.persons);
    const unionId = project.persons[parentId].unionIds[0];
    project = {
      ...project,
      persons: {
        ...project.persons,
        [parentId]: {
          ...project.persons[parentId],
          unionIds: [...project.persons[parentId].unionIds, 'ghost-union'],
        },
      },
    };
    expect(validateProjectRelationships(project).length).toBeGreaterThan(0);

    project = repairProjectRelationships(project);
    expect(validateProjectRelationships(project)).toEqual([]);
    expect(project.persons[parentId].unionIds).toEqual([unionId]);
  });

  it('GEDCOM import produces valid bidirectional relationships', () => {
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
    const project = importGedcom(ged, 'Valid');
    expect(validateProjectRelationships(project)).toEqual([]);
    expect(getParents(project, Object.values(project.persons).find((p) => p.givenName === 'Child')!).length).toBe(2);
  });
});

describe('nuclear layout adapter', () => {
  it('personToLayoutPerson maps unions to parent and spouse ids', () => {
    const project = createEmptyProject();
    const [idA, idB] = Object.keys(project.persons);
    const lp = personToLayoutPerson(project.persons[idA], project);
    expect(lp.spouseIds).toContain(idB);
    expect(lp.fatherId).toBeNull();
    expect(lp.motherId).toBeNull();
  });
});

describe('media', () => {
  it('removeMediaFromProject clears media, links and avatar', () => {
    let project = createEmptyProject();
    const personId = Object.keys(project.persons)[0];
    const mediaId = createId();
    project.media[mediaId] = {
      id: mediaId,
      type: 'photo',
      filename: 'portrait.jpg',
      description: 'Портрет',
      personIds: [personId],
    };
    project.persons[personId] = {
      ...project.persons[personId],
      mediaIds: [mediaId],
      avatar: { mediaId, x: 0, y: 0, width: 1, height: 1, rotation: 0, scale: 1 },
    };

    project = removeMediaFromProject(project, mediaId);

    expect(project.media[mediaId]).toBeUndefined();
    expect(project.persons[personId].mediaIds).not.toContain(mediaId);
    expect(project.persons[personId].avatar).toBeUndefined();
  });
});

describe('privacy', () => {
  it('detects external media URLs', () => {
    expect(isExternalMediaUrl('https://example.com/photo.jpg')).toBe(true);
    expect(isExternalMediaUrl('photo.jpg')).toBe(false);
    expect(isExternalMediaUrl('blob:abc')).toBe(false);
  });

  it('counts external media in project', () => {
    const project = createEmptyProject();
    project.media = {
      m1: {
        id: 'm1',
        type: 'photo',
        filename: 'https://example.com/a.jpg',
        description: '',
        personIds: [],
      },
      m2: {
        id: 'm2',
        type: 'photo',
        filename: 'local.jpg',
        description: '',
        personIds: [],
      },
    };
    expect(countExternalMediaInProject(project)).toBe(1);
  });

  it('defaults allowExternalMedia to false', () => {
    expect(validateViewSettings({ ...createEmptyProject().viewSettings, allowExternalMedia: undefined }).allowExternalMedia).toBe(false);
  });
});

function getParentsFromProject(project: ReturnType<typeof createEmptyProject>, childId: string) {
  const child = project.persons[childId];
  const parents = [];
  for (const uid of child.parentUnionIds) {
    for (const pid of project.unions[uid]?.partnerIds ?? []) {
      if (project.persons[pid]) parents.push(project.persons[pid]);
    }
  }
  return parents;
}

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

  it('avoids vertical overlap between adjacent generations with uniform cards', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const byLayer = new Map<number, typeof layout.nodes>();
    for (const node of layout.nodes) {
      const list = byLayer.get(node.layer) ?? [];
      list.push(node);
      byLayer.set(node.layer, list);
    }
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    for (let i = 1; i < layers.length; i++) {
      const upper = byLayer.get(layers[i - 1])!;
      const lower = byLayer.get(layers[i])!;
      const upperBottom = Math.max(...upper.map((n) => n.y + n.height));
      const lowerTop = Math.min(...lower.map((n) => n.y));
      expect(lowerTop).toBeGreaterThanOrEqual(upperBottom - 1);
    }
  });

  it('export viewport fits tree content, not full symmetric canvas', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const viewport = computeExportViewport(frame, layout);
    expect(viewport.width).toBeLessThan(frame.svgW);
    expect(viewport.height).toBeLessThan(frame.svgH);
    expect(viewport.width).toBeGreaterThan(CARD_W);
    expect(viewport.height).toBeGreaterThan(CARD_H_FULL);
  });

  it('fixed page export uses meet fit inside sheet bounds', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const viewport = computeExportViewport(frame, layout);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    svg.appendChild(rect);

    configureSvgForFixedPage(svg, viewport, 794, 1123);

    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('viewBox')).toBe(
      `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    );
    expect(svg.getAttribute('width')).toBe('794');
    expect(svg.getAttribute('height')).toBe('1123');
    expect(rect.getAttribute('width')).toBe(String(viewport.width));
    expect(rect.getAttribute('height')).toBe(String(viewport.height));
  });
});

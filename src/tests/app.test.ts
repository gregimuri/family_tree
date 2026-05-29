import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import {
  dateToText,
  formatLifeDates,
  getAllChildren,
  getExcludedIdsForLink,
  getParents,
  linkChild,
  linkParent,
  linkPartner,
  unlinkChild,
  unlinkParent,
  unlinkPartner,
  removePersonFromProject,
  validateProjectRelationships,
} from '../models/person-utils';
import { getCenterFocusPoint, getSymmetricTreeFrame } from '../layout/center-focus';
import { buildLayout } from '../layout';
import { buildGraph } from '../layout/graph-builder';
import { importGedcom, parseGedcomName, parseGedcomDate } from '../services/gedcom/import';
import { exportGedcom } from '../services/gedcom/export';
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
    expect(formatLifeDates(person, 'years')).toBe('ок. 1951–после 2000');
  });

  it('appends old-style suffix for julian dates', () => {
    expect(dateToText({ year: 1897, month: 7, day: 1, julian: true })).toBe('01.07.1897 ст.');
    expect(dateToText({ text: 'ок. 1875', julian: true })).toBe('ок. 1875 ст.');
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
    expect(viewport.width).toBeGreaterThan(200);
    expect(viewport.height).toBeGreaterThan(200);
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

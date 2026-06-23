import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { COUPLE_GAP, getCardScale } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { SIBLING_GAP } from './types';

type GraphPersonNode = Extract<GraphResult['nodes'][number], { kind: 'person' }>;

/** Партнёры из одного parentUnion — можно держать в одном couple-unit. */
export function partnersShareParentUnion(
  members: GraphPersonNode[],
  project: Project,
): boolean {
  const parentUnions = new Set<string>();
  for (const m of members) {
    for (const uid of project.persons[m.personId]?.parentUnionIds ?? []) {
      if (m.parentUnionId === uid || !m.parentUnionId) {
        parentUnions.add(uid);
      }
    }
    if (m.parentUnionId) parentUnions.add(m.parentUnionId);
  }
  return parentUnions.size <= 1;
}

export function isCrossUnionCouple(unit: FamilyUnit, project: Project): boolean {
  if (unit.kind !== 'couple' || !unit.unionId || unit.personIds.length < 2) return false;
  const union = project.unions[unit.unionId];
  if (!union) return false;

  const parentUnions = new Set<string>();
  for (const pid of union.partnerIds) {
    for (const puid of project.persons[pid]?.parentUnionIds ?? []) {
      parentUnions.add(puid);
    }
  }
  return parentUnions.size > 1;
}

/** Дети для выравнивания родителей: без «уехавших» в чужую ветку супругов. */
export function childrenForParentAlignment(
  parent: FamilyUnit,
  children: FamilyUnit[],
  project: Project,
): FamilyUnit[] {
  if (!parent.unionId) return children;
  const union = project.unions[parent.unionId];
  if (!union) return children;

  return children.filter((child) => {
    if (child.kind === 'couple' && child.unionId) {
      const cu = project.unions[child.unionId];
      if (!cu) return true;
      return cu.partnerIds.some((pid) => union.childIds.includes(pid));
    }
    if (child.kind === 'single' && child.personIds.length === 1) {
      return union.childIds.includes(child.personIds[0]);
    }
    return true;
  });
}

function personNode(graph: GraphResult, personId: string): GraphPersonNode | undefined {
  const id = graph.personToNode.get(personId);
  if (!id) return undefined;
  const n = graph.nodes.find((node) => node.id === id);
  return n?.kind === 'person' ? n : undefined;
}

function crossUnionPartner(personId: string, project: Project): string | undefined {
  const person = project.persons[personId];
  if (!person) return undefined;

  for (const unionId of person.unionIds) {
    const union = project.unions[unionId];
    if (!union || union.partnerIds.length < 2) continue;
    const partnerId = union.partnerIds.find((id) => id !== personId);
    if (!partnerId) continue;

    const myParents = new Set(person.parentUnionIds);
    const partnerParents = project.persons[partnerId]?.parentUnionIds ?? [];
    const sameBranch = partnerParents.some((id) => myParents.has(id));
    if (!sameBranch) return partnerId;
  }
  return undefined;
}

export function unionHasCrossUnionMarriedChild(childIds: string[], project: Project): boolean {
  return childIds.some((id) => Boolean(crossUnionPartner(id, project)));
}

function cardWidth(pid: string, unit: FamilyUnit, project: Project): number {
  const person = project.persons[pid];
  const settings = project.viewSettings;
  const scale = getCardScale(unit.layer, unit.isSideBranch, 0, settings.cardSizeMode);
  if (person) return getCardDimensions(project, person, settings, scale).w;
  return 120;
}

/** Порядок сиблингов: «уехавший» супруг — к краю, ближе к ветке партнёра. */
export function crossUnionSiblingOrder(
  unit: FamilyUnit,
  project: Project,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
): string[] {
  if (unit.kind !== 'siblings') return [...unit.personIds];

  let order = [...unit.personIds];
  for (const pid of unit.personIds) {
    const partnerId = crossUnionPartner(pid, project);
    if (!partnerId) continue;

    const myParentCenter = parentUnionCenterForPerson(pid, layout, centers, project);
    const partnerUnit = layout.units.find((u) => u.personIds.includes(partnerId));
    const partnerParentCenter = partnerUnit
      ? parentUnionCenterForPerson(partnerId, layout, centers, project)
      : undefined;
    if (myParentCenter === undefined || partnerParentCenter === undefined) continue;

    order = order.filter((id) => id !== pid);
    if (partnerParentCenter > myParentCenter) {
      order.push(pid);
    } else {
      order.unshift(pid);
    }
  }
  return order;
}

function layoutSpanInUnit(
  unit: FamilyUnit,
  order: string[],
  centerX: number,
  project: Project,
): Map<string, number> {
  const positions = new Map<string, number>();
  const widths = order.map((pid) => cardWidth(pid, unit, project));

  if (unit.kind === 'siblings') {
    let totalW = widths.reduce((a, b) => a + b, 0);
    totalW += SIBLING_GAP * Math.max(0, order.length - 1);
    let x = centerX - totalW / 2;
    for (let i = 0; i < order.length; i++) {
      positions.set(order[i], x + widths[i] / 2);
      x += widths[i] + (i < order.length - 1 ? SIBLING_GAP : 0);
    }
    return positions;
  }

  if (unit.kind === 'couple' && order.length >= 2) {
    const totalW = widths[0] + COUPLE_GAP + widths[1];
    let x = centerX - totalW / 2;
    positions.set(order[0], x + widths[0] / 2);
    x += widths[0] + COUPLE_GAP;
    positions.set(order[1], x + widths[1] / 2);
    return positions;
  }

  positions.set(order[0], centerX);
  return positions;
}

function personEdgeTowardPartner(
  unit: FamilyUnit,
  personId: string,
  order: string[],
  centerX: number,
  attachRight: boolean,
  project: Project,
): number {
  const positions = layoutSpanInUnit(unit, order, centerX, project);
  const cx = positions.get(personId) ?? centerX;
  const w = cardWidth(personId, unit, project);
  return attachRight ? cx + w / 2 : cx - w / 2;
}

function parentUnionCenterForPerson(
  personId: string,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  project: Project,
): number | undefined {
  const puid = project.persons[personId]?.parentUnionIds[0];
  if (!puid) return undefined;
  const personUnit = layout.units.find((u) => u.personIds.includes(personId));
  if (!personUnit) return undefined;
  const parent = layout.units.find((u) => u.unionId === puid && u.layer === personUnit.layer - 1);
  if (!parent) return undefined;
  return centers.get(parent.id);
}

export function shiftUnitSubtreeFrom(
  layout: FamilyLayoutGraph,
  root: FamilyUnit,
  delta: number,
  centers: Map<string, number>,
): void {
  if (Math.abs(delta) < 0.01) return;
  const queue = [root.id];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const unit = layout.unitById.get(id);
    if (!unit) continue;
    if (unit.layer < root.layer) continue;
    centers.set(id, (centers.get(id) ?? 0) + delta);
    for (const cid of unit.childUnitIds) queue.push(cid);
  }
}

/** Супруги из разных веток — рядом, между родительскими группами; сиблинг-группу не сдвигаем. */
export function snapCrossUnionSpouses(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  graph: GraphResult,
  personOrder: Map<string, string[]>,
): void {
  const seen = new Set<string>();

  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.length < 2) continue;
    const key = [...union.partnerIds].sort().join('|');
    if (seen.has(key)) continue;

    const nodes = union.partnerIds
      .map((pid) => personNode(graph, pid))
      .filter(Boolean) as GraphPersonNode[];
    if (nodes.length < 2) continue;
    if (partnersShareParentUnion(nodes, project)) continue;

    seen.add(key);
    const [a, b] = union.partnerIds;
    const unitA = layout.units.find((u) => u.personIds.includes(a));
    const unitB = layout.units.find((u) => u.personIds.includes(b));
    if (!unitA || !unitB || unitA.layer !== unitB.layer) continue;

    const parentCenterA = parentUnionCenterForPerson(a, layout, centers, project);
    const parentCenterB = parentUnionCenterForPerson(b, layout, centers, project);

    const multiA = unitA.personIds.length > 1;
    const multiB = unitB.personIds.length > 1;

    if (multiA && !multiB) {
      attachSingleToPartnerInUnit(layout, centers, widths, project, {
        multi: unitA,
        single: unitB,
        partnerInMulti: a,
        singlePerson: b,
        parentCenterMulti: parentCenterA,
        parentCenterSingle: parentCenterB,
        personOrder,
      });
    } else if (!multiA && multiB) {
      attachSingleToPartnerInUnit(layout, centers, widths, project, {
        multi: unitB,
        single: unitA,
        partnerInMulti: b,
        singlePerson: a,
        parentCenterMulti: parentCenterB,
        parentCenterSingle: parentCenterA,
        personOrder,
      });
    } else if (!multiA && !multiB) {
      snapTwoSinglesAsCouple(
        layout,
        centers,
        widths,
        project,
        unitA,
        unitB,
        a,
        b,
        parentCenterA,
        parentCenterB,
        personOrder,
      );
    }
  }
}

function attachSingleToPartnerInUnit(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  opts: {
    multi: FamilyUnit;
    single: FamilyUnit;
    partnerInMulti: string;
    singlePerson: string;
    parentCenterMulti?: number;
    parentCenterSingle?: number;
    personOrder: Map<string, string[]>;
  },
): void {
  const {
    multi,
    single,
    partnerInMulti,
    singlePerson,
    parentCenterMulti,
    parentCenterSingle,
    personOrder,
  } = opts;

  const order =
    personOrder.get(multi.id) ??
    crossUnionSiblingOrder(multi, project, layout, centers);
  personOrder.set(multi.id, order);

  const attachRight =
    parentCenterSingle !== undefined &&
    parentCenterMulti !== undefined &&
    parentCenterSingle > parentCenterMulti;

  const multiCenter = centers.get(multi.id) ?? 0;
  const edge = personEdgeTowardPartner(
    multi,
    partnerInMulti,
    order,
    multiCenter,
    attachRight,
    project,
  );

  const singleW = widths.get(single.id) ?? cardWidth(singlePerson, single, project);
  const targetSingleCenter = attachRight
    ? edge + COUPLE_GAP + singleW / 2
    : edge - COUPLE_GAP - singleW / 2;

  const delta = targetSingleCenter - (centers.get(single.id) ?? 0);
  shiftUnitSubtreeFrom(layout, single, delta, centers);
}

function snapTwoSinglesAsCouple(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  unitA: FamilyUnit,
  unitB: FamilyUnit,
  personA: string,
  personB: string,
  parentCenterA?: number,
  parentCenterB?: number,
  personOrder?: Map<string, string[]>,
): void {
  let leftUnit = unitA;
  let rightUnit = unitB;
  let leftPerson = personA;
  let rightPerson = personB;

  if (parentCenterA !== undefined && parentCenterB !== undefined && parentCenterA > parentCenterB) {
    leftUnit = unitB;
    rightUnit = unitA;
    leftPerson = personB;
    rightPerson = personA;
  }

  const leftOrder = personOrder?.get(leftUnit.id) ?? leftUnit.personIds;
  const leftCenter = centers.get(leftUnit.id) ?? 0;
  const edge = personEdgeTowardPartner(leftUnit, leftPerson, leftOrder, leftCenter, true, project);
  const rightW = widths.get(rightUnit.id) ?? cardWidth(rightPerson, rightUnit, project);
  const targetRightCenter = edge + COUPLE_GAP + rightW / 2;
  const delta = targetRightCenter - (centers.get(rightUnit.id) ?? 0);
  shiftUnitSubtreeFrom(layout, rightUnit, delta, centers);
}

/** После пристыковки супругов — родительские unit-ы над детьми с «чужими» браками. */
export function realignCrossUnionParentUnits(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  _graph: GraphResult,
): void {
  for (const unit of layout.units) {
    if (!unit.unionId || unit.childUnitIds.length === 0) continue;
    const union = project.unions[unit.unionId];
    if (!union || !union.childIds.some((id) => crossUnionPartner(id, project))) continue;

    const childUnits = unit.childUnitIds
      .map((id) => layout.unitById.get(id))
      .filter((u): u is FamilyUnit => Boolean(u));
    const aligned = childrenForParentAlignment(unit, childUnits, project);
    if (aligned.length === 0) continue;

    const childMin = Math.min(
      ...aligned.map((c) => (centers.get(c.id) ?? 0) - (widths.get(c.id) ?? 120) / 2),
    );
    const childMax = Math.max(
      ...aligned.map((c) => (centers.get(c.id) ?? 0) + (widths.get(c.id) ?? 120) / 2),
    );
    centers.set(unit.id, (childMin + childMax) / 2);
  }
}

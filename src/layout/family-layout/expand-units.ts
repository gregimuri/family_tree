import type { LayoutNode, Project } from '../../types';
import { COUPLE_GAP, LAYER_GAP, getCardScale } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import type { GraphResult } from '../graph-builder';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { SIBLING_GAP } from './types';
import { crossUnionSiblingOrder } from './cross-union';

const W_ALIGN = 1;
const W_GENDER = 0.05;

function genderConventionPenalty(order: string[], project: Project): number {
  if (order.length < 2) return 0;
  const g0 = project.persons[order[0]]?.gender;
  const g1 = project.persons[order[1]]?.gender;
  if (g0 === 'male' && g1 === 'female') return 0;
  if (g0 === 'female' && g1 === 'male') return 1;
  return 0;
}

function alignPenalty(
  unit: FamilyUnit,
  unitCenterX: number,
  childCenters: Map<string, number>,
): number {
  if (unit.childUnitIds.length === 0) return 0;
  const childXs = unit.childUnitIds
    .map((id) => childCenters.get(id))
    .filter((v): v is number => v !== undefined);
  if (childXs.length === 0) return 0;
  const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
  return Math.abs(unitCenterX - childCenter) * W_ALIGN;
}

function bestPartnerOrder(
  unit: FamilyUnit,
  project: Project,
  unitCenterX: number,
  childCenters: Map<string, number>,
): string[] {
  if (unit.kind !== 'couple' || unit.personIds.length < 2) {
    return [...unit.personIds];
  }

  const orders: string[][] = [];
  if (unit.personIds.length === 2) {
    orders.push([unit.personIds[0], unit.personIds[1]], [unit.personIds[1], unit.personIds[0]]);
  } else {
    orders.push([...unit.personIds]);
  }

  let best = orders[0];
  let bestScore = Infinity;

  for (const order of orders) {
    const score =
      alignPenalty(unit, unitCenterX, childCenters) +
      genderConventionPenalty(order, project) * W_GENDER * 100;
    if (score < bestScore) {
      bestScore = score;
      best = order;
    }
  }

  return best;
}

function placePersonsInUnit(
  unit: FamilyUnit,
  order: string[],
  centerX: number,
  project: Project,
  graph: GraphResult,
): Map<string, number> {
  const positions = new Map<string, number>();
  const settings = project.viewSettings;

  const sizes = order.map((pid) => {
    const person = project.persons[pid];
    const node = graph.nodes.find(
      (n) => n.kind === 'person' && n.personId === pid,
    );
    const scale = getCardScale(
      unit.layer,
      unit.isSideBranch,
      node?.kind === 'person' ? node.branchDepth : 0,
      settings.cardSizeMode,
    );
    return person ? getCardDimensions(project, person, settings, scale) : { w: 120, h: 80, hasPhoto: false };
  });

  if (unit.kind === 'couple' && order.length >= 2) {
    const totalW = sizes[0].w + COUPLE_GAP + sizes[1].w;
    let x = centerX - totalW / 2;
    positions.set(order[0], x + sizes[0].w / 2);
    x += sizes[0].w + COUPLE_GAP;
    positions.set(order[1], x + sizes[1].w / 2);
    return positions;
  }

  if (unit.kind === 'siblings') {
    let totalW = sizes.reduce((s, d) => s + d.w, 0);
    totalW += SIBLING_GAP * Math.max(0, order.length - 1);
    let x = centerX - totalW / 2;
    for (let i = 0; i < order.length; i++) {
      positions.set(order[i], x + sizes[i].w / 2);
      x += sizes[i].w + (i < order.length - 1 ? SIBLING_GAP : 0);
    }
    return positions;
  }

  positions.set(order[0], centerX);
  return positions;
}

/** Развернуть unit-центры в LayoutNode[]. */
export function expandUnitsToLayoutNodes(
  layout: FamilyLayoutGraph,
  unitCenters: Map<string, number>,
  personOrder: Map<string, string[]>,
  project: Project,
  graph: GraphResult,
): LayoutNode[] {
  const childCenters = new Map(unitCenters);

  for (const unit of layout.units) {
    const cx = unitCenters.get(unit.id) ?? 0;
    let order: string[];
    if (unit.kind === 'couple') {
      order = bestPartnerOrder(unit, project, cx, childCenters);
    } else if (unit.kind === 'siblings') {
      order =
        personOrder.get(unit.id) ??
        crossUnionSiblingOrder(unit, project, layout, unitCenters);
      personOrder.set(unit.id, order);
    } else {
      order = unit.personIds;
    }
    personOrder.set(unit.id, order);
  }

  const nodes: LayoutNode[] = [];
  const seenGraphIds = new Set<string>();
  const settings = project.viewSettings;

  for (const unit of layout.units) {
    const order = personOrder.get(unit.id) ?? unit.personIds;
    const centerX = unitCenters.get(unit.id) ?? 0;
    const personCenters = placePersonsInUnit(unit, order, centerX, project, graph);

    for (const pid of order) {
      const graphNode = graph.nodes.find(
        (n) => n.kind === 'person' && n.personId === pid,
      );
      if (!graphNode || graphNode.kind !== 'person') continue;
      if (seenGraphIds.has(graphNode.id)) continue;
      seenGraphIds.add(graphNode.id);

      const person = project.persons[pid];
      const scale = getCardScale(
        graphNode.layer,
        graphNode.isSideBranch,
        graphNode.branchDepth,
        settings.cardSizeMode,
      );
      const dims = person
        ? getCardDimensions(project, person, settings, scale)
        : { w: 120, h: 80, hasPhoto: false };
      const { w, h } = dims;

      const px = personCenters.get(pid) ?? centerX;
      const py = graphNode.layer * LAYER_GAP;

      nodes.push({
        id: graphNode.id,
        kind: 'person',
        layer: graphNode.layer,
        x: px - w / 2,
        y: py - h / 2,
        width: w,
        height: h,
        scale,
        isSideBranch: graphNode.isSideBranch,
        personId: pid,
        unionId: graphNode.unionId,
      });
    }
  }

  return nodes;
}

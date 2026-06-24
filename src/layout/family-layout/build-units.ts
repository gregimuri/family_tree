import type { Project } from '../../types';
import type { GraphNode, GraphResult } from '../graph-builder';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { partnersShareParentUnion } from './cross-union';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

function graphPersons(graph: GraphResult): GraphPersonNode[] {
  return graph.nodes.filter((n): n is GraphPersonNode => n.kind === 'person');
}

function branchSideOf(nodes: GraphPersonNode[]): FamilyUnit['branchSide'] {
  if (nodes.some((n) => n.branchSide === 'left')) return 'left';
  if (nodes.some((n) => n.branchSide === 'right')) return 'right';
  return 'main';
}

function minBirthOrder(nodes: GraphPersonNode[]): number {
  if (nodes.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...nodes.map((n) => n.birthOrder ?? Number.MAX_SAFE_INTEGER));
}

function inferParentUnionId(members: GraphPersonNode[]): string | undefined {
  for (const m of members) {
    if (m.parentUnionId) return m.parentUnionId;
  }
  return undefined;
}

function unionIdForPartners(a: string, b: string, project: Project): string | undefined {
  for (const uid of project.persons[a]?.unionIds ?? []) {
    const union = project.unions[uid];
    if (union?.partnerIds.includes(a) && union.partnerIds.includes(b)) return uid;
  }
  return undefined;
}

/** Супруг на том же слое — выносим из sibling-группы в couple-unit. */
function spouseOnSameLayer(
  node: GraphPersonNode,
  layerNodeByPersonId: Map<string, GraphPersonNode>,
  project: Project,
  usedOnLayer: Set<string>,
): GraphPersonNode | undefined {
  for (const unionId of project.persons[node.personId]?.unionIds ?? []) {
    const union = project.unions[unionId];
    if (!union || union.partnerIds.length < 2) continue;
    const partnerId = union.partnerIds.find((id) => id !== node.personId);
    if (!partnerId || usedOnLayer.has(partnerId)) continue;
    const partnerNode = layerNodeByPersonId.get(partnerId);
    if (!partnerNode) continue;
    return partnerNode;
  }
  return undefined;
}

/** Пары на слое из project.unions (не cross-union), даже если unionId на graph-узле не у обоих. */
function buildMarriageCouplesOnLayer(
  layer: number,
  layerNodes: GraphPersonNode[],
  personById: Map<string, GraphPersonNode>,
  project: Project,
  units: FamilyUnit[],
  usedOnLayer: Set<string>,
  usedPersonIds: Set<string>,
): void {
  const layerNodeByPersonId = new Map(layerNodes.map((n) => [n.personId, n]));

  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.length < 2) continue;
    const members = union.partnerIds
      .map((pid) => layerNodeByPersonId.get(pid))
      .filter((n): n is GraphPersonNode => Boolean(n));
    if (members.length < 2) continue;
    if (members.some((m) => usedOnLayer.has(m.personId))) continue;
    if (!partnersShareParentUnion(members, project)) continue;

    addCoupleUnit(
      members,
      union.id,
      layer,
      personById,
      project,
      units,
      usedOnLayer,
      usedPersonIds,
    );
  }
}

function addCoupleUnit(
  members: GraphPersonNode[],
  unionId: string | undefined,
  layer: number,
  personById: Map<string, GraphPersonNode>,
  project: Project,
  units: FamilyUnit[],
  usedOnLayer: Set<string>,
  usedPersonIds: Set<string>,
): void {
  const graphNodeIds = members.map((m) => m.id);
  const personIds = members.map((m) => m.personId);
  personIds.forEach((id) => {
    usedOnLayer.add(id);
    usedPersonIds.add(id);
  });

  const union = unionId ? project.unions[unionId] : undefined;
  const childIds = (union?.childIds ?? []).filter((pid) => {
    const child = personById.get(pid);
    return child && child.layer === layer + 1;
  });

  units.push({
    id: unionId ? `union:${unionId}` : `inline-couple:${personIds.join(':')}`,
    kind: 'couple',
    layer,
    personIds,
    graphNodeIds,
    childIds,
    childUnitIds: [],
    branchSide: branchSideOf(members),
    isSideBranch: members.some((m) => m.isSideBranch),
    birthOrder: minBirthOrder(members),
    unionId,
    parentUnionId: inferParentUnionId(members),
  });
}

/** Собрать FamilyUnit-ы по слоям из видимого графа. */
export function buildFamilyUnits(project: Project, graph: GraphResult): FamilyLayoutGraph {
  const persons = graphPersons(graph);
  const personById = new Map(persons.map((n) => [n.personId, n]));
  const units: FamilyUnit[] = [];
  const usedPersonIds = new Set<string>();

  const layers = new Map<number, GraphPersonNode[]>();
  for (const node of persons) {
    const list = layers.get(node.layer) ?? [];
    list.push(node);
    layers.set(node.layer, list);
  }

  for (const [layer, layerNodes] of layers) {
    const usedOnLayer = new Set<string>();

    buildMarriageCouplesOnLayer(
      layer,
      layerNodes,
      personById,
      project,
      units,
      usedOnLayer,
      usedPersonIds,
    );

    const byParentUnion = new Map<string, GraphPersonNode[]>();
    for (const node of layerNodes) {
      if (usedOnLayer.has(node.personId) || !node.parentUnionId) continue;
      const list = byParentUnion.get(node.parentUnionId) ?? [];
      list.push(node);
      byParentUnion.set(node.parentUnionId, list);
    }

    for (const [parentUnionId, members] of byParentUnion) {
      if (members.length < 2) continue;

      const layerNodeByPersonId = new Map(layerNodes.map((n) => [n.personId, n]));
      const sorted = [...members]
        .filter((m) => !usedOnLayer.has(m.personId))
        .sort((a, b) => (a.birthOrder ?? 999) - (b.birthOrder ?? 999));

      const siblingOnly: GraphPersonNode[] = [];
      for (const m of sorted) {
        if (usedOnLayer.has(m.personId)) continue;
        const spouse = spouseOnSameLayer(m, layerNodeByPersonId, project, usedOnLayer);
        if (spouse) {
          const unionId = unionIdForPartners(m.personId, spouse.personId, project);
          addCoupleUnit(
            [m, spouse],
            unionId,
            layer,
            personById,
            project,
            units,
            usedOnLayer,
            usedPersonIds,
          );
        } else {
          siblingOnly.push(m);
        }
      }

      if (siblingOnly.length < 2) continue;

      siblingOnly.forEach((m) => {
        usedOnLayer.add(m.personId);
        usedPersonIds.add(m.personId);
      });

      units.push({
        id: `siblings:${parentUnionId}:${layer}`,
        kind: 'siblings',
        layer,
        personIds: siblingOnly.map((m) => m.personId),
        graphNodeIds: siblingOnly.map((m) => m.id),
        childIds: [],
        childUnitIds: [],
        branchSide: branchSideOf(siblingOnly),
        isSideBranch: siblingOnly.some((m) => m.isSideBranch),
        birthOrder: minBirthOrder(siblingOnly),
        parentUnionId,
      });
    }

    for (const node of layerNodes) {
      if (usedOnLayer.has(node.personId)) continue;
      usedPersonIds.add(node.personId);

      const union = node.unionId ? project.unions[node.unionId] : undefined;
      const childIds = (union?.childIds ?? []).filter((pid) => {
        const child = personById.get(pid);
        return child && child.layer === layer + 1;
      });

      units.push({
        id: `person:${node.personId}`,
        kind: 'single',
        layer,
        personIds: [node.personId],
        graphNodeIds: [node.id],
        childIds,
        childUnitIds: [],
        branchSide: node.branchSide,
        isSideBranch: node.isSideBranch,
        birthOrder: node.birthOrder ?? Number.MAX_SAFE_INTEGER,
        unionId: node.unionId,
        parentUnionId: node.parentUnionId,
      });
    }
  }

  linkParentChildUnits(units, project);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const personToUnit = new Map<string, string>();
  for (const unit of units) {
    for (const pid of unit.personIds) {
      personToUnit.set(pid, unit.id);
    }
  }

  const unitsByLayer = new Map<number, FamilyUnit[]>();
  for (const unit of units) {
    const list = unitsByLayer.get(unit.layer) ?? [];
    list.push(unit);
    unitsByLayer.set(unit.layer, list);
  }
  const sortedLayers = [...unitsByLayer.keys()].sort((a, b) => a - b);

  return {
    units,
    unitById,
    personToUnit,
    layers: unitsByLayer,
    sortedLayers,
  };
}

function linkParentChildUnits(units: FamilyUnit[], project: Project): void {
  const unionToUnit = new Map<string, FamilyUnit>();
  const personToUnitId = new Map<string, string>();

  for (const unit of units) {
    for (const pid of unit.personIds) {
      personToUnitId.set(pid, unit.id);
    }
    if (unit.unionId) {
      unionToUnit.set(unit.unionId, unit);
    }
  }

  for (const unit of units) {
    if (unit.parentUnionId) {
      const parent = unionToUnit.get(unit.parentUnionId);
      if (parent) {
        unit.parentUnitId = parent.id;
        if (!parent.childUnitIds.includes(unit.id)) {
          parent.childUnitIds.push(unit.id);
        }
      }
    }

    for (const childId of unit.childIds) {
      const childUnitId = personToUnitId.get(childId);
      if (!childUnitId || childUnitId === unit.id) continue;
      const childUnit = units.find((u) => u.id === childUnitId);
      if (!childUnit) continue;
      childUnit.parentUnitId = unit.id;
      if (!unit.childUnitIds.includes(childUnit.id)) {
        unit.childUnitIds.push(childUnit.id);
      }
    }
  }

  for (const unit of units) {
    if (unit.parentUnitId) continue;
    if (unit.personIds.length !== 1) continue;
    const person = project.persons[unit.personIds[0]];
    for (const puid of person?.parentUnionIds ?? []) {
      const parent = unionToUnit.get(puid);
      if (parent && parent.layer === unit.layer - 1) {
        unit.parentUnitId = parent.id;
        if (!parent.childUnitIds.includes(unit.id)) {
          parent.childUnitIds.push(unit.id);
        }
        break;
      }
    }
  }
}

export function graphNodeForPerson(
  graph: GraphResult,
  personId: string,
): GraphPersonNode | undefined {
  const nodeId = graph.personToNode.get(personId);
  if (!nodeId) return undefined;
  const node = graph.nodes.find((n) => n.id === nodeId);
  return node?.kind === 'person' ? node : undefined;
}

import type { Project } from '../../types';
import type { GraphNode, GraphResult } from '../graph-builder';
import type { FamilyLayoutGraph, FamilyUnit } from './types';

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

    const byUnion = new Map<string, GraphPersonNode[]>();
    for (const node of layerNodes) {
      if (!node.unionId) continue;
      const list = byUnion.get(node.unionId) ?? [];
      list.push(node);
      byUnion.set(node.unionId, list);
    }

    for (const [unionId, members] of byUnion) {
      if (members.length < 2) continue;
      const graphNodeIds = members.map((m) => m.id);
      const personIds = members.map((m) => m.personId);
      personIds.forEach((id) => {
        usedOnLayer.add(id);
        usedPersonIds.add(id);
      });

      const union = project.unions[unionId];
      const childIds = (union?.childIds ?? []).filter((pid) => {
        const child = personById.get(pid);
        return child && child.layer === layer + 1;
      });

      units.push({
        id: `union:${unionId}`,
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

    const byParentUnion = new Map<string, GraphPersonNode[]>();
    for (const node of layerNodes) {
      if (usedOnLayer.has(node.personId) || !node.parentUnionId) continue;
      const list = byParentUnion.get(node.parentUnionId) ?? [];
      list.push(node);
      byParentUnion.set(node.parentUnionId, list);
    }

    for (const [parentUnionId, members] of byParentUnion) {
      if (members.length < 2) continue;
      const sorted = [...members].sort(
        (a, b) => (a.birthOrder ?? 999) - (b.birthOrder ?? 999),
      );
      sorted.forEach((m) => {
        usedOnLayer.add(m.personId);
        usedPersonIds.add(m.personId);
      });

      units.push({
        id: `siblings:${parentUnionId}:${layer}`,
        kind: 'siblings',
        layer,
        personIds: sorted.map((m) => m.personId),
        graphNodeIds: sorted.map((m) => m.id),
        childIds: [],
        childUnitIds: [],
        branchSide: branchSideOf(sorted),
        isSideBranch: sorted.some((m) => m.isSideBranch),
        birthOrder: minBirthOrder(sorted),
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

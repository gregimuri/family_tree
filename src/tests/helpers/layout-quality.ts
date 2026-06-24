import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../../types';
import { COUPLE_GAP, LAYER_GAP } from '../../layout/graph-builder';
import { getTreeSheetBounds } from '../../layout/content-bounds';
import { unionHasCrossUnionMarriedChild } from '../../layout/family-layout/cross-union';

export function nodeCenterX(n: { x: number; width: number }): number {
  return n.x + n.width / 2;
}

export function nodeCenterY(n: { y: number; height: number }): number {
  return n.y + n.height / 2;
}

export function findHorizontalOverlap(
  nodes: LayoutNode[],
  minGap = 1,
): { a: string; b: string } | null {
  const byLayer = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const list = byLayer.get(n.layer) ?? [];
    list.push(n);
    byLayer.set(n.layer, list);
  }
  for (const layerNodes of byLayer.values()) {
    const sorted = [...layerNodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.x < prev.x + prev.width + minGap) {
        return { a: prev.personId ?? prev.id, b: curr.personId ?? curr.id };
      }
    }
  }
  return null;
}

export function assertNoOverlaps(nodes: LayoutNode[]): void {
  const overlap = findHorizontalOverlap(nodes);
  if (overlap) {
    throw new Error(`overlap ${overlap.a} ↔ ${overlap.b}`);
  }
}

export function findOverlap2D(
  nodes: LayoutNode[],
  minGap = 2,
): { a: string; b: string } | null {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (
        a.x < b.x + b.width + minGap &&
        a.x + a.width + minGap > b.x &&
        a.y < b.y + b.height + minGap &&
        a.y + a.height + minGap > b.y
      ) {
        return { a: a.personId ?? a.id, b: b.personId ?? b.id };
      }
    }
  }
  return null;
}

export function assertNoCardOverlaps2D(nodes: LayoutNode[]): void {
  const overlap = findOverlap2D(nodes);
  if (overlap) {
    throw new Error(`2D overlap ${overlap.a} ↔ ${overlap.b}`);
  }
}

export function assertCoupleSpacing(project: Project, layout: LayoutResult): void {
  const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
  for (const union of Object.values(project.unions)) {
    if (union.childIds.length > 0 && unionHasCrossUnionMarriedChild(union.childIds, project)) {
      continue;
    }
    if (union.partnerIds.length < 2) continue;
    const partners = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (partners.length < 2) continue;
    if (partners[0].layer !== partners[1].layer) continue;

    const sorted = [...partners].sort((a, b) => a.x - b.x);
    const gap = sorted[1].x - (sorted[0].x + sorted[0].width);
    if (gap + 0.5 < COUPLE_GAP || gap > COUPLE_GAP + 4) {
      throw new Error(`couple gap ${gap.toFixed(1)}px (expected ${COUPLE_GAP}) union ${union.id.slice(0, 8)}`);
    }
  }
}

export function assertParentChildLayers(project: Project, layout: LayoutResult): void {
  const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
  for (const [childId, person] of Object.entries(project.persons)) {
    const child = byPerson.get(childId);
    if (!child) continue;
    for (const unionId of person.parentUnionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      const parents = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
      if (parents.length === 0) continue;
      const parentLayer = Math.min(...parents.map((p) => p.layer));
      if (child.layer <= parentLayer) {
        throw new Error(
          `child layer ${child.layer} must be below parent layer ${parentLayer} (${childId.slice(0, 8)})`,
        );
      }
    }
  }
}

function childRowNodesForAlignment(
  directChildren: LayoutNode[],
  byPerson: Map<string, LayoutNode>,
  project: Project,
  parentChildIds: string[],
): LayoutNode[] {
  const out: LayoutNode[] = [];
  const seen = new Set<string>();
  for (const child of directChildren) {
    if (!child.personId || seen.has(child.id)) continue;
    seen.add(child.id);
    out.push(child);
    for (const unionId of project.persons[child.personId]?.unionIds ?? []) {
      const marriage = project.unions[unionId];
      if (!marriage || marriage.partnerIds.length < 2) continue;
      const partnerId = marriage.partnerIds.find((id) => id !== child.personId);
      if (!partnerId || !parentChildIds.includes(partnerId)) continue;
      const partner = byPerson.get(partnerId);
      if (partner && partner.layer === child.layer && !seen.has(partner.id)) {
        seen.add(partner.id);
        out.push(partner);
      }
    }
  }
  return out;
}

function isCrossUnionMarriedChild(
  childId: string,
  parentUnion: { childIds: string[] },
  project: Project,
): boolean {
  const person = project.persons[childId];
  if (!person) return false;
  for (const unionId of person.unionIds) {
    const marriage = project.unions[unionId];
    if (!marriage || marriage.partnerIds.length < 2) continue;
    const partnerId = marriage.partnerIds.find((id) => id !== childId);
    if (!partnerId) continue;
    if (!parentUnion.childIds.includes(partnerId)) return true;
  }
  return false;
}

export function assertParentsCenteredOverChildren(
  project: Project,
  layout: LayoutResult,
  tolerance = 100,
): void {
  const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
  for (const union of Object.values(project.unions)) {
    const parents = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    const children = union.childIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (parents.length === 0 || children.length === 0) continue;

    const parentLayer = Math.min(...parents.map((p) => p.layer));
    const sameLayerParents = parents.filter((p) => p.layer === parentLayer);
    const directChildren = children.filter((c) => c.layer === parentLayer + 1);
    if (sameLayerParents.length === 0 || directChildren.length === 0) continue;

    if (unionHasCrossUnionMarriedChild(union.childIds, project)) continue;

    if (
      union.childIds.length === 1 &&
      isCrossUnionMarriedChild(union.childIds[0], union, project)
    ) {
      continue;
    }

    const parentCenter =
      sameLayerParents.reduce((s, p) => s + nodeCenterX(p), 0) / sameLayerParents.length;
    const rowNodes = childRowNodesForAlignment(directChildren, byPerson, project, union.childIds);
    const childMin = Math.min(...rowNodes.map((c) => c.x));
    const childMax = Math.max(...rowNodes.map((c) => c.x + c.width));
    const childCenter = (childMin + childMax) / 2;
    if (Math.abs(parentCenter - childCenter) > tolerance) {
      throw new Error(
        `parents/children misaligned by ${Math.abs(parentCenter - childCenter).toFixed(0)}px`,
      );
    }
  }
}

export function assertSiblingsShareRow(project: Project, layout: LayoutResult): void {
  const byPerson = new Map(layout.nodes.map((n) => [n.personId!, n]));
  for (const union of Object.values(project.unions)) {
    if (union.childIds.length < 2) continue;
    const children = union.childIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (children.length < 2) continue;

    const byLayer = new Map<number, LayoutNode[]>();
    for (const c of children) {
      const list = byLayer.get(c.layer) ?? [];
      list.push(c);
      byLayer.set(c.layer, list);
    }
    for (const group of byLayer.values()) {
      if (group.length < 2) continue;
      const ys = group.map((n) => n.y);
      if (Math.max(...ys) - Math.min(...ys) > 2) {
        throw new Error('siblings on different rows');
      }
    }
  }
}

export function assertGenerationSpacing(layout: LayoutResult): void {
  const layerYs = new Map<number, number>();
  for (const node of layout.nodes) {
    layerYs.set(node.layer, nodeCenterY(node));
  }
  const sorted = [...layerYs.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i][1] - sorted[i - 1][1];
    if (Math.abs(gap - LAYER_GAP) > LAYER_GAP * 0.15) {
      throw new Error(`layer gap ${gap.toFixed(0)}px expected ~${LAYER_GAP}px`);
    }
  }
}

export function maxHorizontalEdgeSpan(edges: LayoutEdge[]): number {
  let max = 0;
  for (const edge of edges) {
    const xs = edge.points.map((p) => p.x);
    if (xs.length < 2) continue;
    max = Math.max(max, Math.max(...xs) - Math.min(...xs));
  }
  return max;
}

export function assertCompactTree(layout: LayoutResult, maxSpread = 1200): void {
  const sheet = getTreeSheetBounds(layout);
  if (sheet.maxX - sheet.minX > maxSpread) {
    throw new Error(`tree too wide: ${(sheet.maxX - sheet.minX).toFixed(0)}px`);
  }
}

export function assertLayoutQuality(project: Project, layout: LayoutResult): void {
  assertNoOverlaps(layout.nodes);
  assertCoupleSpacing(project, layout);
  assertParentChildLayers(project, layout);
  assertParentsCenteredOverChildren(project, layout);
  assertSiblingsShareRow(project, layout);
  assertGenerationSpacing(layout);
  assertCompactTree(layout);
  if (maxHorizontalEdgeSpan(layout.edges) > 1400) {
    throw new Error('edge span too wide');
  }
}

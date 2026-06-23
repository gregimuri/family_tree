import type { LayoutEdge, LayoutNode, Project } from '../types';
import { COUPLE_GAP } from './graph-builder';
import { CARD_GRID_CELL } from './card-dimensions';

export interface LayoutEnergyWeights {
  overlap: number;
  parentAlign: number;
  coupleGap: number;
  edgeCross: number;
  symmetry: number;
  siblingOrder: number;
  genderConvention: number;
  collateralSide: number;
  compactness: number;
}

export const DEFAULT_ENERGY_WEIGHTS: LayoutEnergyWeights = {
  overlap: 120,
  parentAlign: 2.5,
  coupleGap: 80,
  edgeCross: 25,
  symmetry: 0.3,
  siblingOrder: 0.15,
  genderConvention: 0.08,
  collateralSide: 0.05,
  compactness: 0.02,
};

function nodeCenterX(n: LayoutNode): number {
  return n.x + n.width / 2;
}

function rectsOverlap2D(a: LayoutNode, b: LayoutNode, minGap = 2): boolean {
  return (
    a.x < b.x + b.width + minGap &&
    a.x + a.width + minGap > b.x &&
    a.y < b.y + b.height + minGap &&
    a.y + a.height + minGap > b.y
  );
}

function overlapPenalty(a: LayoutNode, b: LayoutNode): number {
  if (!rectsOverlap2D(a, b, 0)) return 0;
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const det = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(det) < 1e-9) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / det;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / det;
  return t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95;
}

function genderConventionPenalty(partners: LayoutNode[], project: Project): number {
  if (partners.length < 2) return 0;
  const sorted = [...partners].sort((a, b) => a.x - b.x);
  const left = project.persons[sorted[0].personId!];
  const right = project.persons[sorted[1].personId!];
  if (left?.gender === 'male' && right?.gender === 'female') return 0;
  if (left?.gender === 'female' && right?.gender === 'male') return 100;
  return 0;
}

function collateralSidePenalty(node: LayoutNode, project: Project): number {
  if (!node.isSideBranch || !node.personId) return 0;
  const person = project.persons[node.personId];
  if (!person?.parentUnionIds.length) return 0;
  const union = project.unions[person.parentUnionIds[0]];
  if (!union) return 0;
  for (const pid of union.partnerIds) {
    const parent = project.persons[pid];
    if (parent?.gender === 'female' && node.x > 0) return 50;
    if (parent?.gender === 'male' && node.x < 0) return 50;
  }
  return 0;
}

export function computeLayoutEnergy(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  project: Project,
  weights: LayoutEnergyWeights = DEFAULT_ENERGY_WEIGHTS,
): number {
  let energy = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      energy += overlapPenalty(nodes[i], nodes[j]) * weights.overlap;
    }
  }

  const byPerson = new Map(nodes.filter((n) => n.personId).map((n) => [n.personId!, n]));
  for (const union of Object.values(project.unions)) {
    const partners = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (partners.length >= 2 && partners[0].layer === partners[1].layer) {
      const sorted = [...partners].sort((a, b) => a.x - b.x);
      const gap = sorted[1].x - (sorted[0].x + sorted[0].width);
      const diff = Math.abs(gap - COUPLE_GAP);
      if (diff > 1) energy += diff * diff * weights.coupleGap;
      energy += genderConventionPenalty(partners, project) * weights.genderConvention;
    }

    const parents = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    const children = union.childIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (parents.length && children.length) {
      const parentLayer = Math.min(...parents.map((p) => p.layer));
      const directChildren = children.filter((c) => c.layer === parentLayer + 1);
      if (directChildren.length) {
        const parentCenter = parents.reduce((s, p) => s + nodeCenterX(p), 0) / parents.length;
        const childCenter =
          directChildren.reduce((s, c) => s + nodeCenterX(c), 0) / directChildren.length;
        const diff = parentCenter - childCenter;
        energy += diff * diff * weights.parentAlign;
      }
    }

    if (union.childIds.length >= 2) {
      const children = union.childIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
      const sameLayer = children.filter((c) => c.layer === children[0].layer);
      if (sameLayer.length >= 2) {
        const sorted = [...sameLayer].sort((a, b) => (a.personId ?? '').localeCompare(b.personId ?? ''));
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].x < sorted[i - 1].x + sorted[i - 1].width) {
            energy += weights.siblingOrder * 10;
          }
        }
        const centers = sameLayer.map(nodeCenterX);
        const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
        for (const c of centers) {
          energy += (c - mean) * (c - mean) * weights.symmetry;
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.isSideBranch) {
      energy += collateralSidePenalty(node, project) * weights.collateralSide;
    }
  }

  if (nodes.length > 0) {
    const xs = nodes.map((n) => n.x);
    const span = Math.max(...xs.map((x, i) => x + nodes[i].width)) - Math.min(...xs);
    energy += span * weights.compactness;
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ea = edges[i].points;
      const eb = edges[j].points;
      if (ea.length < 2 || eb.length < 2) continue;
      for (let s1 = 0; s1 < ea.length - 1; s1++) {
        for (let s2 = 0; s2 < eb.length - 1; s2++) {
          const p1 = ea[s1];
          const p2 = ea[s1 + 1];
          const p3 = eb[s2];
          const p4 = eb[s2 + 1];
          if (segmentsCross(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y)) {
            energy += weights.edgeCross;
          }
        }
      }
    }
  }

  return energy;
}

export function energyDeltaForMoveX(
  node: LayoutNode,
  deltaX: number,
  allNodes: LayoutNode[],
  edges: LayoutEdge[],
  project: Project,
  weights: LayoutEnergyWeights = DEFAULT_ENERGY_WEIGHTS,
): number {
  const clone: LayoutNode = { ...node, x: node.x + deltaX };
  const nodes = allNodes.map((n) => (n.id === node.id ? clone : n));
  return computeLayoutEnergy(nodes, edges, project, weights);
}

export { CARD_GRID_CELL };

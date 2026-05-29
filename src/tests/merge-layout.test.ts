import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildGraph } from '../layout/graph-builder';
import { computeLayout } from '../layout/layered-layout';
import { importGedcom } from '../services/gedcom/import';

function nodeCenterX(node: { x: number; width: number }) {
  return node.x + node.width / 2;
}

function hasHorizontalOverlap(
  nodes: { x: number; width: number; layer: number }[],
  layer: number,
  gap = 4,
): boolean {
  const onLayer = nodes.filter((n) => n.layer === layer).sort((a, b) => a.x - b.x);
  for (let i = 1; i < onLayer.length; i++) {
    if (onLayer[i].x < onLayer[i - 1].x + onLayer[i - 1].width + gap) return true;
  }
  return false;
}

describe('merged layout reconciliation', () => {
  it('aligns parent generation above nuclear children on layer 0', () => {
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
    const project = importGedcom(ged, 'Align');
    project.center = { type: 'person', id: 'I1' };
    const graph = buildGraph(project, project.viewSettings);
    const layout = computeLayout(graph, project);

    const parents = layout.nodes.filter((n) => n.personId === 'P1' || n.personId === 'P2');
    const root = layout.nodes.find((n) => n.personId === 'I1');
    const child = layout.nodes.find((n) => n.personId === 'C1');
    expect(root).toBeTruthy();
    expect(child).toBeTruthy();
    expect(parents.length).toBe(2);

    const parentCenter =
      parents.reduce((sum, n) => sum + nodeCenterX(n), 0) / parents.length;
    const childCenter = (nodeCenterX(root!) + nodeCenterX(child!)) / 2;
    expect(Math.abs(parentCenter - childCenter)).toBeLessThan(80);
  });

  it('avoids card overlap on layer 0 after merge', () => {
    const project = createEmptyProject();
    const graph = buildGraph(project, project.viewSettings);
    const layout = computeLayout(graph, project);
    expect(hasHorizontalOverlap(layout.nodes, 0)).toBe(false);
  });
});

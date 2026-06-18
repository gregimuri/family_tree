import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { buildGraph } from '../layout/graph-builder';
import { refineLayoutSync } from '../layout/layout-refiner';
import { predictLayoutDeltas } from '../layout/layout-net';
import { LAYOUT_FEATURE_COUNT } from '../layout/layout-features';
import { assertLayoutQuality, assertNoCardOverlaps2D } from './helpers/layout-quality';
import projectJson from './fixtures/novy-proekt/project.json';
import type { Project } from '../types';
import { repairProjectRelationships } from '../models/person-utils';

function loadFixture(center: Project['center']): Project {
  const p = repairProjectRelationships(projectJson as Project);
  p.center = center;
  return p;
}

describe('layout refiner', () => {
  it('predictLayoutDeltas returns one delta per feature vector', () => {
    const features = [new Float32Array(LAYOUT_FEATURE_COUNT)];
    const deltas = predictLayoutDeltas(features);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toHaveLength(2);
  });

  it('refiner does not move pinned nodes', () => {
    const project = createEmptyProject();
    const graph = buildGraph(project, project.viewSettings);
    const layout = buildLayout(project);
    const pinnedId = layout.nodes[0]?.personId;
    expect(pinnedId).toBeTruthy();

    const nodes = layout.nodes.map((n) => ({ ...n }));
    const pinned = new Set([pinnedId!]);
    const before = nodes.find((n) => n.personId === pinnedId)!;

    refineLayoutSync(nodes, graph, project, { pinnedPersonIds: pinned, energyIterations: 8 });

    const after = nodes.find((n) => n.personId === pinnedId)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('layout has no 2D card overlaps on starter project', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    expect(() => assertNoCardOverlaps2D(layout.nodes)).not.toThrow();
  });

  it('novy-proekt fixture passes quality with refiner', () => {
    const personIds = Object.keys(projectJson.persons).slice(0, 5);
    for (const centerId of personIds) {
      const project = loadFixture({ type: 'person', id: centerId });
      const layout = buildLayout(project);
      expect(() => assertLayoutQuality(project, layout)).not.toThrow();
      expect(() => assertNoCardOverlaps2D(layout.nodes)).not.toThrow();
    }
  });

  it('unpinned layout updates when generations change', () => {
    const project = createEmptyProject();
    project.manualLayout = undefined;
    const layoutA = buildLayout(project);
    project.viewSettings = { ...project.viewSettings, generationsUp: 0, generationsDown: 0 };
    const layoutB = buildLayout(project);
    const nodeA = layoutA.nodes.find((n) => n.personId)?.x ?? 0;
    const nodeB = layoutB.nodes.find((n) => n.personId)?.x ?? 0;
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
  });

  it('pinned node keeps position when settings change', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const personId = layout.nodes[0]?.personId!;
    project.manualLayout = {
      [personId]: { x: 500, y: 500 },
    };
    project.viewSettings = { ...project.viewSettings, generationsUp: 1 };
    const layout2 = buildLayout(project);
    const node = layout2.nodes.find((n) => n.personId === personId)!;
    expect(node.x + node.width / 2).toBeCloseTo(500, 0);
    expect(node.y + node.height / 2).toBeCloseTo(500, 0);
  });
});

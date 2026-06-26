import type { LayoutNode, Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { LayoutContext } from './layout-context';
import { alignCenterLayer, buildAncestry, alignAllParentsOverChildren } from './build-ancestry';
import { buildDescendants } from './build-descendants';
import { layoutRemainingPersons } from './layout-collateral';
import {
  centerLineageAncestorsOverFocus,
  resolveLayerCollisionStep5,
} from './subtree-shift';
import { expandToLayoutNodes } from './expand-to-nodes';

/** Авторасположение по алгоритму построения предков (шаги 1–7). */
export function runAncestorLayout(project: Project, graph: GraphResult): LayoutNode[] {
  const ctx = new LayoutContext(project, graph);

  alignCenterLayer(ctx);
  buildAncestry(ctx);
  buildDescendants(ctx);
  layoutRemainingPersons(ctx);
  alignAllParentsOverChildren(ctx);
  centerLineageAncestorsOverFocus(ctx);

  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))].sort(
    (a, b) => a - b,
  );
  for (const layer of layers) {
    for (let round = 0; round < 4; round++) {
      if (!resolveLayerCollisionStep5(ctx, layer)) break;
    }
  }

  alignAllParentsOverChildren(ctx);
  centerLineageAncestorsOverFocus(ctx);

  const focus = ctx.getPlacement(ctx.focusPersonId);
  if (focus && Math.abs(focus.centerXCells) > 0.01) {
    const delta = focus.centerXCells;
    for (const p of ctx.placements.values()) {
      p.centerXCells -= delta;
    }
  }

  return expandToLayoutNodes(ctx, project);
}

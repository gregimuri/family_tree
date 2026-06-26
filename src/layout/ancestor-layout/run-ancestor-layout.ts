import type { LayoutNode, Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { LayoutContext } from './layout-context';
import { alignCenterLayer, buildAncestry, alignAllParentsOverChildren } from './build-ancestry';
import { buildDescendants } from './build-descendants';
import { layoutRemainingPersons } from './layout-collateral';
import {
  centerLineageAncestorsOverFocus,
  resolveAllLayerCollisions,
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

  // Шаг 5: после выравнивания — сдвиг наложившихся пар; повторное центрирование
  // родителей отменило бы эти сдвиги, поэтому выравнивание выше — финальное.
  resolveAllLayerCollisions(ctx);

  const focus = ctx.getPlacement(ctx.focusPersonId);
  if (focus && Math.abs(focus.centerXCells) > 0.01) {
    const delta = focus.centerXCells;
    for (const p of ctx.placements.values()) {
      p.centerXCells -= delta;
    }
  }

  return expandToLayoutNodes(ctx, project);
}

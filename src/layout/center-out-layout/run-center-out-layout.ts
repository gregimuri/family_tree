import type { LayoutNode, Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { LayoutContext, layer0PersonIds, resolveFocusPersonId } from './layout-context';
import { placeCoupleAtCenter } from './layout-couple';
import { layoutAncestorsUp } from './layout-ancestors-up';
import { layoutAncestorsComplete } from './layout-ancestors-complete';
import { layoutDescendants } from './layout-descendants';
import { layoutCollateral, finalizeLayout, alignAllParentsOverChildren, centerAncestorLayersOverFocus, repositionCollateralSiblings } from './layout-collateral';
import { resolveLayerOverlapAfterExpand } from './subtree-shift';
import { expandToLayoutNodes } from './expand-to-nodes';

/** Center-out авторасположение: от центра вверх/вниз с двухпроходным размещением пар. */
export function runCenterOutLayout(project: Project, graph: GraphResult): LayoutNode[] {
  const ctx = new LayoutContext(project, graph);

  const layer0 = layer0PersonIds(ctx);
  if (layer0.length === 0 && ctx.focusPersonId) {
    layer0.push(ctx.focusPersonId);
  }

  if (project.center.type === 'family') {
    const union = project.unions[project.center.id];
    const partners = union?.partnerIds.filter((id) => ctx.personToNode.has(id)) ?? [];
    if (partners.length >= 2) {
      placeCoupleAtCenter(ctx, partners, 0, 0);
    } else if (partners.length === 1) {
      ctx.placePerson(partners[0], 0, { layer: 0 });
    }
  } else {
    const focusId = resolveFocusPersonId(project);
    if (ctx.personToNode.has(focusId)) {
      ctx.placePerson(focusId, 0, { layer: 0 });
    }

    for (const pid of layer0) {
      if (pid === focusId) continue;
      const partnerGn = ctx.graphNode(pid);
      if (!partnerGn || partnerGn.layer !== 0) continue;
      const focusPlacement = ctx.getPlacement(focusId);
      if (!focusPlacement) continue;
      if (ctx.isPlaced(pid)) continue;

      const sorted = [focusId, pid].sort((a, b) => {
        const ga = project.persons[a]?.gender;
        const gb = project.persons[b]?.gender;
        if (ga === 'male' && gb !== 'male') return -1;
        if (gb === 'male' && ga !== 'male') return 1;
        return 0;
      });
      placeCoupleAtCenter(ctx, sorted, 0, 0);
    }
  }

  layoutAncestorsUp(ctx);
  layoutAncestorsComplete(ctx);
  alignAllParentsOverChildren(ctx);
  layoutDescendants(ctx);
  layoutCollateral(ctx);
  finalizeLayout(ctx);
  centerAncestorLayersOverFocus(ctx);
  repositionCollateralSiblings(ctx);

  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))].sort(
    (a, b) => a - b,
  );
  for (const layer of layers) {
    resolveLayerOverlapAfterExpand(
      ctx,
      layer,
      ctx.personsOnLayer(layer).map((p) => p.personId),
    );
  }

  anchorFocusToZero(ctx);

  return expandToLayoutNodes(ctx, project);
}

function anchorFocusToZero(ctx: LayoutContext): void {
  const focusId = ctx.focusPersonId;
  const focus = ctx.getPlacement(focusId);
  if (!focus) {
    const layer0 = ctx.personsOnLayer(0);
    if (layer0.length === 0) return;
    const avg = layer0.reduce((s, p) => s + p.centerXCells, 0) / layer0.length;
    if (Math.abs(avg) < 0.01) return;
    for (const p of ctx.placements.values()) {
      p.centerXCells -= avg;
    }
    return;
  }
  if (Math.abs(focus.centerXCells) < 0.01) return;
  const delta = focus.centerXCells;
  for (const p of ctx.placements.values()) {
    p.centerXCells -= delta;
  }
}

import type { LayoutNode, Project } from '../../types';
import { getCardScale, LAYER_GAP } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import { cellsToPixels } from './grid-math';
import type { LayoutContext } from './layout-context';

export function expandToLayoutNodes(
  ctx: LayoutContext,
  project: Project,
): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  const settings = project.viewSettings;

  for (const [personId, placement] of ctx.placements) {
    const gn = ctx.graphNode(personId);
    if (!gn) continue;

    const person = project.persons[personId];
    if (!person) continue;

    const scale = getCardScale(
      placement.layer,
      placement.isSideBranch,
      gn.branchDepth ?? 0,
      settings.cardSizeMode,
    );
    const { w, h } = getCardDimensions(project, person, settings, scale);

    const centerXPx = cellsToPixels(placement.centerXCells, scale);
    const py = placement.layer * LAYER_GAP;

    nodes.push({
      id: gn.id,
      kind: 'person',
      layer: placement.layer,
      x: centerXPx - w / 2,
      y: py - h / 2,
      width: w,
      height: h,
      scale,
      isSideBranch: placement.isSideBranch,
      personId,
      unionId: gn.unionId,
    });
  }

  return nodes;
}

import type { LayoutNode, Project } from '../../types';
import { getCardScale, LAYER_GAP } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import { CARD_GRID_CELL } from '../card-dimensions';
import type { LayoutContext } from './layout-context';

export function expandToLayoutNodes(ctx: LayoutContext, project: Project): LayoutNode[] {
  const settings = project.viewSettings;
  const nodes: LayoutNode[] = [];

  for (const placement of ctx.placements.values()) {
    const gn = ctx.graphNode(placement.personId);
    if (!gn) continue;

    const scale = getCardScale(
      placement.layer,
      placement.isSideBranch,
      gn.branchDepth,
      settings.cardSizeMode,
    );
    const person = project.persons[placement.personId];
    const { w, h } = person
      ? getCardDimensions(project, person, settings, scale)
      : { w: 120 * scale, h: 110 * scale };

    const centerXPx = placement.centerXCells * CARD_GRID_CELL * scale;
    const centerYPx = placement.layer * LAYER_GAP;

    nodes.push({
      id: gn.id,
      kind: 'person',
      layer: placement.layer,
      x: centerXPx - w / 2,
      y: centerYPx - h / 2,
      width: w,
      height: h,
      scale,
      isSideBranch: placement.isSideBranch,
      personId: placement.personId,
      unionId: gn.unionId,
    });
  }

  return nodes;
}

import type { LayoutNode, Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { buildFamilyUnits } from './build-units';
import { syncSpouseLayers } from './generations';
import { orderFamilyUnits } from './order-units';
import { refineUnitPlacements, resolveUnitLayerCollisions } from './place-units';
import { expandUnitsToLayoutNodes } from './expand-units';
import { assignSoftCollateralSides } from './side-branches';
import { snapCrossUnionSpouses, realignCrossUnionParentUnits } from './cross-union';
import type { BranchSide } from '../graph-builder';
import type { FamilyLayoutState } from './types';

/** Единый алгоритм авторасположения на FamilyUnit-графе. */
export function runFamilyLayout(project: Project, graph: GraphResult): LayoutNode[] {
  syncSpouseLayers(graph, project);

  const layout = buildFamilyUnits(project, graph);
  const unitCenters = new Map<string, number>();
  const unitWidths = new Map<string, number>();
  const personOrder = new Map<string, string[]>();
  const chosenSide = new Map<string, BranchSide>();

  orderFamilyUnits(layout, unitCenters, graph, project);
  refineUnitPlacements(layout, unitCenters, unitWidths, project, graph, personOrder, {
    skipCrossUnionSnap: true,
  });
  assignSoftCollateralSides(layout, unitCenters, unitWidths, chosenSide, project);
  refineUnitPlacements(layout, unitCenters, unitWidths, project, graph, personOrder, {
    skipCrossUnionSnap: true,
  });
  snapCrossUnionSpouses(layout, unitCenters, unitWidths, project, graph, personOrder);
  realignCrossUnionParentUnits(layout, unitCenters, unitWidths, project);
  snapCrossUnionSpouses(layout, unitCenters, unitWidths, project, graph, personOrder);
  resolveUnitLayerCollisions(layout, unitCenters, unitWidths);

  return expandUnitsToLayoutNodes(
    layout,
    unitCenters,
    personOrder,
    project,
    graph,
  );
}

export function createFamilyLayoutState(
  project: Project,
  graph: GraphResult,
): FamilyLayoutState {
  syncSpouseLayers(graph, project);
  const layout = buildFamilyUnits(project, graph);
  return {
    graph: layout,
    unitCenters: new Map(),
    unitWidths: new Map(),
    personOrder: new Map(),
    chosenSide: new Map(),
  };
}

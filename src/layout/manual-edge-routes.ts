import type { LayoutResult, Project } from '../types';

export function applyManualEdgeRoutes(layout: LayoutResult, project: Project): LayoutResult {
  const manual = project.manualEdgeRoutes;
  if (!manual || Object.keys(manual).length === 0) return layout;

  const edges = layout.edges.map((edge) => {
    const override = manual[edge.id];
    if (!override || override.length < 2) return edge;
    return { ...edge, points: override.map((p) => ({ ...p })) };
  });

  return { ...layout, edges };
}

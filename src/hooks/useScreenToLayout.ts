import { useCallback, type RefObject } from 'react';

export function useScreenToLayout(
  svgRef: RefObject<SVGSVGElement | null>,
  groupRef: RefObject<SVGGElement | null>,
) {
  return useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      const group = groupRef.current;
      if (!svg || !group) return null;

      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = group.getScreenCTM();
      if (!ctm) return null;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    },
    [svgRef, groupRef],
  );
}

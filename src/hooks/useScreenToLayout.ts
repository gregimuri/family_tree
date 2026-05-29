import { useCallback, type RefObject } from 'react';

function parseGroupOffset(group: SVGGElement): { x: number; y: number } {
  const transform = group.getAttribute('transform') ?? '';
  const match = transform.match(/translate\(\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)\s*\)/);
  if (!match) return { x: 0, y: 0 };
  return { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) };
}

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
      if (ctm) {
        const local = pt.matrixTransform(ctm.inverse());
        if (Number.isFinite(local.x) && Number.isFinite(local.y)) {
          return { x: local.x, y: local.y };
        }
      }

      // Fallback for Chrome/WebKit when SVG is inside CSS-transformed pan/zoom wrapper.
      const svgRect = svg.getBoundingClientRect();
      if (svgRect.width < 1 || svgRect.height < 1) return null;

      const svgW = svg.width.baseVal.value || svg.clientWidth;
      const svgH = svg.height.baseVal.value || svg.clientHeight;
      const svgX = ((clientX - svgRect.left) / svgRect.width) * svgW;
      const svgY = ((clientY - svgRect.top) / svgRect.height) * svgH;
      const offset = parseGroupOffset(group);

      return { x: svgX - offset.x, y: svgY - offset.y };
    },
    [svgRef, groupRef],
  );
}

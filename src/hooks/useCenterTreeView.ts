import { useEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { LayoutResult, Project } from '../types';

export const TREE_DEFAULT_SCALE = 1;

interface UseCenterTreeViewOptions {
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>;
  project: Project | null;
  layout: LayoutResult | null;
  enabled?: boolean;
}

function centerTreeInView(
  ref: ReactZoomPanPinchRef,
  scale: number,
  animationTime = 250,
): boolean {
  if (!ref.instance.wrapperComponent || !ref.instance.contentComponent) return false;
  ref.centerView(scale, animationTime);
  return true;
}

export function useCenterTreeView({
  transformRef,
  project,
  layout,
  enabled = true,
}: UseCenterTreeViewOptions) {
  const centerKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !project || !layout) return;

    const centerKey = `${project.center.type}:${project.center.id}:${layout.nodes.length}:${layout.bounds.minX}:${layout.bounds.maxX}:${layout.bounds.minY}:${layout.bounds.maxY}`;
    if (centerKeyRef.current === centerKey) return;
    centerKeyRef.current = centerKey;

    let raf = 0;
    let attempts = 0;

    const apply = () => {
      const ref = transformRef.current;
      if (!ref) return;
      if (!centerTreeInView(ref, ref.state.scale, 250)) {
        if (attempts++ < 12) raf = requestAnimationFrame(apply);
      }
    };

    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [enabled, project, layout, transformRef]);
}

/** Сброс масштаба к 1 и центрирование SVG (центр дерева — в середине холста). */
export function resetTreeView(transformRef: React.RefObject<ReactZoomPanPinchRef | null>) {
  const tryApply = (attempts = 0) => {
    const ref = transformRef.current;
    if (!ref) return;
    if (!centerTreeInView(ref, TREE_DEFAULT_SCALE, 200)) {
      if (attempts < 12) requestAnimationFrame(() => tryApply(attempts + 1));
    }
  };
  tryApply();
}

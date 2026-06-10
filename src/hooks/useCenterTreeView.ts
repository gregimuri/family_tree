import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { LayoutResult, Project } from '../types';
import type { TreeFrame } from '../layout/center-focus';
import {
  applyViewportTransform,
  buildViewportKey,
  fitTreeToViewport,
  type TreeFitMode,
  type ViewportTransform,
} from './tree-viewport';

export {
  TREE_FIT_PADDING,
  TREE_MIN_SCALE,
  TREE_MAX_SCALE,
  fitTreeToViewport,
  getTreeContentRect,
  computeFitTransform,
  type TreeFitMode,
} from './tree-viewport';

interface UseCenterTreeViewOptions {
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>;
  project: Project | null;
  layout: LayoutResult | null;
  frame: TreeFrame | null;
  enabled?: boolean;
}

const MAX_FIT_ATTEMPTS = 24;

function scheduleFit(
  ref: ReactZoomPanPinchRef,
  frame: TreeFrame,
  layout: LayoutResult,
  animationTime: number,
  mode: TreeFitMode = 'focus',
): () => void {
  let raf = 0;
  let attempts = 0;

  const tick = () => {
    if (
      fitTreeToViewport(ref, frame, layout, animationTime, mode) ||
      attempts >= MAX_FIT_ATTEMPTS
    ) {
      return;
    }
    attempts += 1;
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function computeViewportKey(project: Project, layout: LayoutResult): string {
  const manualCount = Object.keys(project.manualLayout ?? {}).length;
  return buildViewportKey(
    project.center.type,
    project.center.id,
    layout,
    manualCount,
    project.viewSettings.generationsUp,
    project.viewSettings.generationsDown,
    project.viewSettings.sideBranchesAt,
    project.viewSettings.sideBranchDepth,
    project.viewSettings.cardSizeMode,
    !!project.viewSettings.showAllPersons,
    project.viewSettings.showDiedBefore18,
  );
}

export function useCenterTreeView({
  transformRef,
  project,
  layout,
  frame,
  enabled = true,
}: UseCenterTreeViewOptions) {
  const viewportKeyRef = useRef('');
  const transformSnapshotRef = useRef<ViewportTransform | null>(null);
  const layoutRef = useRef(layout);
  const frameRef = useRef(frame);
  const projectRef = useRef(project);
  const enabledRef = useRef(enabled);
  const wrapperSizeRef = useRef({ w: 0, h: 0 });

  useLayoutEffect(() => {
    layoutRef.current = layout;
    frameRef.current = frame;
    projectRef.current = project;
    enabledRef.current = enabled;
  }, [layout, frame, project, enabled]);

  const onTransformed = useCallback((ref: ReactZoomPanPinchRef) => {
    transformSnapshotRef.current = {
      positionX: ref.state.positionX,
      positionY: ref.state.positionY,
      scale: ref.state.scale,
    };
  }, []);

  useEffect(() => {
    if (enabled) viewportKeyRef.current = '';
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled || !project || !layout || !frame) return;
    const key = computeViewportKey(project, layout);
    if (key === viewportKeyRef.current && key !== '' && transformSnapshotRef.current) {
      const ref = transformRef.current;
      if (ref) {
        applyViewportTransform(ref, transformSnapshotRef.current, 0);
      }
    }
  }, [enabled, project, layout, frame, transformRef]);

  useEffect(() => {
    if (!enabled || !project || !layout || !frame) return;

    const key = computeViewportKey(project, layout);
    if (viewportKeyRef.current === key) return;
    viewportKeyRef.current = key;

    const ref = transformRef.current;
    if (!ref) return;
    return scheduleFit(ref, frame, layout, 250, 'focus');
  }, [enabled, project, layout, frame, transformRef]);

  useEffect(() => {
    if (!enabled) return;

    let observer: ResizeObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let cancelRaf: (() => void) | null = null;
    let attachRaf = 0;
    let attachAttempts = 0;

    const onResize = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const wrapper = transformRef.current?.instance.wrapperComponent;
        if (!wrapper) return;
        const w = wrapper.clientWidth;
        const h = wrapper.clientHeight;
        if (w === wrapperSizeRef.current.w && h === wrapperSizeRef.current.h) return;
        wrapperSizeRef.current = { w, h };

        cancelRaf?.();
        const liveRef = transformRef.current;
        const liveLayout = layoutRef.current;
        const liveFrame = frameRef.current;
        if (!liveRef || !liveLayout || !liveFrame || !enabledRef.current) return;
        cancelRaf = scheduleFit(liveRef, liveFrame, liveLayout, 120, 'focus');
      }, 80);
    };

    const attach = () => {
      const wrapper = transformRef.current?.instance.wrapperComponent;
      if (!wrapper) {
        if (attachAttempts++ < MAX_FIT_ATTEMPTS) {
          attachRaf = requestAnimationFrame(attach);
        }
        return;
      }
      wrapperSizeRef.current = { w: wrapper.clientWidth, h: wrapper.clientHeight };
      observer = new ResizeObserver(onResize);
      observer.observe(wrapper);
    };

    attach();

    return () => {
      cancelAnimationFrame(attachRaf);
      observer?.disconnect();
      if (debounce) clearTimeout(debounce);
      cancelRaf?.();
    };
  }, [enabled, transformRef]);

  return { onTransformed };
}

/** Вписать всё дерево в область просмотра (кнопка «показать всё»). */
export function resetTreeView(
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>,
  frame: TreeFrame | null,
  layout: LayoutResult | null,
) {
  const ref = transformRef.current;
  if (!ref || !frame || !layout) return;
  scheduleFit(ref, frame, layout, 200, 'content');
}

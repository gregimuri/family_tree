import { useCallback, useEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { getWheelPanDelta, shouldRemapShiftWheel } from './tree-wheel';

/**
 * Перехватывает Shift+колёсико, когда браузер отдаёт deltaY вместо deltaX.
 * Обычная прокрутка и Ctrl+масштаб обрабатываются react-zoom-pan-pinch.
 */
export function useTreeWheel(transformRef: React.RefObject<ReactZoomPanPinchRef | null>) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback(
    (ref: ReactZoomPanPinchRef) => {
      cleanupRef.current?.();

      const wrapper = ref.instance.wrapperComponent;
      if (!wrapper) return;

      const handler = (event: WheelEvent) => {
        if (!shouldRemapShiftWheel(event)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const live = transformRef.current ?? ref;
        const { dx, dy } = getWheelPanDelta(event);
        const { positionX, positionY, scale } = live.state;
        live.setTransform(positionX + dx, positionY + dy, scale, 0);
      };

      wrapper.addEventListener('wheel', handler, { capture: true, passive: false });
      cleanupRef.current = () =>
        wrapper.removeEventListener('wheel', handler, { capture: true });
    },
    [transformRef],
  );

  const onInit = useCallback(
    (ref: ReactZoomPanPinchRef) => {
      attach(ref);
    },
    [attach],
  );

  useEffect(() => {
    const ref = transformRef.current;
    if (ref?.instance?.wrapperComponent) attach(ref);
    return () => cleanupRef.current?.();
  }, [attach, transformRef]);

  return onInit;
}

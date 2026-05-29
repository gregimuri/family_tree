import { useEffect } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface UseKeyboardNavOptions {
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>;
  enabled?: boolean;
}

export function useKeyboardNav({ transformRef, enabled = true }: UseKeyboardNavOptions) {
  useEffect(() => {
    if (!enabled) return;

    const step = 48;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ref = transformRef.current;
      if (!ref) return;

      if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        ref.zoomIn(0.15, 0);
        return;
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        ref.zoomOut(0.15, 0);
        return;
      }

      const { positionX, positionY, scale } = ref.state;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          ref.setTransform(positionX, positionY + step, scale, 0);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          ref.setTransform(positionX, positionY - step, scale, 0);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          ref.setTransform(positionX + step, positionY, scale, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          ref.setTransform(positionX - step, positionY, scale, 0);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, transformRef]);
}

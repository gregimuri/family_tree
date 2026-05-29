import { useEffect } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { isModifierShortcut, isPhysicalKey } from '../utils/keyboard-shortcut';

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

      if (isModifierShortcut(e) && (e.key === '+' || e.key === '=' || isPhysicalKey(e, 'Equal'))) {
        e.preventDefault();
        ref.zoomIn(0.15, 0);
        return;
      }
      if (isModifierShortcut(e) && (e.key === '-' || isPhysicalKey(e, 'Minus'))) {
        e.preventDefault();
        ref.zoomOut(0.15, 0);
        return;
      }

      const { positionX, positionY, scale } = ref.state;

      if (isPhysicalKey(e, 'ArrowUp') || isPhysicalKey(e, 'KeyW')) {
        e.preventDefault();
        ref.setTransform(positionX, positionY + step, scale, 0);
        return;
      }
      if (isPhysicalKey(e, 'ArrowDown') || isPhysicalKey(e, 'KeyS')) {
        e.preventDefault();
        ref.setTransform(positionX, positionY - step, scale, 0);
        return;
      }
      if (isPhysicalKey(e, 'ArrowLeft') || isPhysicalKey(e, 'KeyA')) {
        e.preventDefault();
        ref.setTransform(positionX + step, positionY, scale, 0);
        return;
      }
      if (isPhysicalKey(e, 'ArrowRight') || isPhysicalKey(e, 'KeyD')) {
        e.preventDefault();
        ref.setTransform(positionX - step, positionY, scale, 0);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, transformRef]);
}

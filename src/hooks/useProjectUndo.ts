import { useEffect } from 'react';
import { useProjectStore } from '../store/project-store';
import { isModifierShortcut, isPhysicalKey } from '../utils/keyboard-shortcut';

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export function useProjectUndo(enabled: boolean) {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.undoStack.length > 0);
  const canRedo = useProjectStore((s) => s.redoStack.length > 0);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) return;
      if (!isModifierShortcut(event)) return;

      if (isPhysicalKey(event, 'KeyZ') && !event.shiftKey) {
        if (!canUndo) return;
        event.preventDefault();
        undo();
        return;
      }
      if (isPhysicalKey(event, 'KeyY') || (isPhysicalKey(event, 'KeyZ') && event.shiftKey)) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, undo, redo, canUndo, canRedo]);
}

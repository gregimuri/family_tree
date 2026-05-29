/** Вычисляет смещение при прокрутке колёсиком (без масштаба). */
export function getWheelPanDelta(event: WheelEvent): { dx: number; dy: number } {
  if (event.ctrlKey || event.metaKey) {
    return { dx: 0, dy: 0 };
  }

  if (event.shiftKey) {
    const horizontal =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    return { dx: -horizontal, dy: 0 };
  }

  return { dx: -event.deltaX || 0, dy: -event.deltaY || 0 };
}

/** Shift+колёсико иногда отдаёт deltaY — нужно перехватить до библиотеки. */
export function shouldRemapShiftWheel(event: WheelEvent): boolean {
  return (
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    Math.abs(event.deltaY) > Math.abs(event.deltaX)
  );
}

export function isZoomWheel(event: WheelEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

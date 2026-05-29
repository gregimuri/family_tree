import type { LayoutResult } from '../../types';

export const MANUAL_GRID_SIZE = 28;

interface ManualLayoutGridProps {
  layout: LayoutResult;
  active: boolean;
  dragging: boolean;
}

/** Сетка в координатах дерева — совпадает с шагом привязки при перетаскивании. */
export function ManualLayoutGrid({ layout, active, dragging }: ManualLayoutGridProps) {
  if (!active) return null;

  const pad = 240;
  const { minX, minY, maxX, maxY } = layout.bounds;
  const x = Math.floor((minX - pad) / MANUAL_GRID_SIZE) * MANUAL_GRID_SIZE;
  const y = Math.floor((minY - pad) / MANUAL_GRID_SIZE) * MANUAL_GRID_SIZE;
  const width = maxX - minX + pad * 2 + MANUAL_GRID_SIZE;
  const height = maxY - minY + pad * 2 + MANUAL_GRID_SIZE;
  const stroke = dragging ? 'rgba(45, 106, 79, 0.55)' : 'rgba(45, 106, 79, 0.32)';
  const dot = dragging ? 'rgba(45, 106, 79, 0.45)' : 'rgba(45, 106, 79, 0.22)';
  const patternId = dragging ? 'manual-grid-pattern-active' : 'manual-grid-pattern';

  return (
    <>
      <defs>
        <pattern
          id={patternId}
          width={MANUAL_GRID_SIZE}
          height={MANUAL_GRID_SIZE}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M ${MANUAL_GRID_SIZE} 0 L 0 0 0 ${MANUAL_GRID_SIZE}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
          />
          <circle cx={0} cy={0} r={1.2} fill={dot} />
        </pattern>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={`url(#${patternId})`}
        className="manual-layout-grid"
        pointerEvents="none"
      />
    </>
  );
}

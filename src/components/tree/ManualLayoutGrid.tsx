import type { LayoutResult } from '../../types';
import { CARD_GRID_CELL } from '../../layout/card-dimensions';

export { CARD_GRID_CELL as MANUAL_GRID_SIZE };

interface ManualLayoutGridProps {
  layout: LayoutResult;
  active: boolean;
  dragging: boolean;
}

/** Сетка в координатах дерева — углы клеток совпадают с шагом привязки. */
export function ManualLayoutGrid({ layout, active, dragging }: ManualLayoutGridProps) {
  if (!active) return null;

  const pad = 240;
  const { minX, minY, maxX, maxY } = layout.bounds;
  const grid = CARD_GRID_CELL;
  const x = Math.floor((minX - pad) / grid) * grid;
  const y = Math.floor((minY - pad) / grid) * grid;
  const width = maxX - minX + pad * 2 + grid;
  const height = maxY - minY + pad * 2 + grid;
  const stroke = dragging ? 'rgba(45, 106, 79, 0.55)' : 'rgba(45, 106, 79, 0.32)';
  const dot = dragging ? 'rgba(45, 106, 79, 0.45)' : 'rgba(45, 106, 79, 0.22)';
  const patternId = dragging ? 'manual-grid-pattern-active' : 'manual-grid-pattern';

  return (
    <>
      <defs>
        <pattern
          id={patternId}
          width={grid}
          height={grid}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M ${grid} 0 L 0 0 0 ${grid}`}
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

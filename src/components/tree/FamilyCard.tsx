import type { Person, Project } from '../../types';
import { formatPersonName } from '../../models/person-utils';

interface FamilyCardProps {
  partnerIds: string[];
  project: Project;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: 'clean' | 'forest';
  onClick: () => void;
}

export function FamilyCard({
  partnerIds,
  project,
  selected,
  x,
  y,
  width,
  height,
  theme,
  onClick,
}: FamilyCardProps) {
  const partners = partnerIds
    .map((id) => project.persons[id])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.gender === 'male') return -1;
      if (b.gender === 'male') return 1;
      return 0;
    }) as Person[];

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="family-card"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={width}
        height={height}
        rx={theme === 'forest' ? 16 : 10}
        fill={theme === 'forest' ? '#ecfdf5' : '#f5f5f4'}
        stroke={selected ? '#eab308' : '#a8a29e'}
        strokeWidth={selected ? 3 : 1.5}
        strokeDasharray={theme === 'clean' ? '5 3' : undefined}
      />
      <text x={width / 2} y={12} textAnchor="middle" fontSize={9} fill="#78716c" fontWeight="600">
        СЕМЬЯ
      </text>
      {partners.map((p, i) => (
        <text key={p.id} x={8} y={28 + i * 18} fontSize={11} fill="#1c1917" fontWeight="500">
          {formatPersonName(p)}
        </text>
      ))}
    </g>
  );
}

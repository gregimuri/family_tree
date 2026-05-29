import type { LayoutEdge, Project } from '../../types';
import { formatMarriageDates } from '../../models/person-utils';
import { branchPath, coupleBondPath, edgePath } from '../../layout/edge-router';

interface TreeConnectionsProps {
  edges: LayoutEdge[];
  theme: 'clean' | 'forest';
  project: Project;
  showMarriageYears: boolean;
}

function bondLabel(unionId: string, project: Project): string {
  const union = project.unions[unionId];
  if (!union) return '';
  return formatMarriageDates(union);
}

export function TreeConnections({ edges, theme, project, showMarriageYears }: TreeConnectionsProps) {
  return (
    <g className="tree-connections">
      {edges.map((edge) => {
        const isBond = edge.id.startsWith('bond-');
        const isPedigree = edge.id.startsWith('fam-');
        if (isBond) {
          const unionId = edge.id.replace(/^bond-/, '');
          const label = showMarriageYears ? bondLabel(unionId, project) : '';
          const mid =
            edge.points.length >= 2
              ? {
                  x: (edge.points[0].x + edge.points[edge.points.length - 1].x) / 2,
                  y: edge.points[0].y - 10,
                }
              : null;
          return (
            <g key={edge.id}>
              <path
                d={coupleBondPath(edge.points)}
                fill="none"
                stroke={theme === 'forest' ? '#6d4c41' : '#64748b'}
                strokeWidth={theme === 'forest' ? 2.5 : 2}
                strokeLinecap="round"
              />
              {label && mid && (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  fontSize={10}
                  fill={theme === 'forest' ? '#5d4037' : '#64748b'}
                  fontFamily="var(--font-sans, system-ui, sans-serif)"
                >
                  {label}
                </text>
              )}
            </g>
          );
        }
        const d =
          isPedigree || theme === 'clean' ? edgePath(edge.points) : branchPath(edge.points);
        return (
          <path
            key={edge.id}
            d={d}
            fill="none"
            stroke={theme === 'forest' ? '#5d4037' : '#64748b'}
            strokeWidth={theme === 'forest' ? 2.5 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={theme === 'clean' && !isPedigree ? '5 4' : undefined}
          />
        );
      })}
    </g>
  );
}

import type { LayoutEdge } from '../../types';
import { branchPath, coupleBondPath, edgePath } from '../../layout/edge-router';

interface TreeConnectionsProps {
  edges: LayoutEdge[];
  theme: 'clean' | 'forest';
}

export function TreeConnections({ edges, theme }: TreeConnectionsProps) {
  return (
    <g className="tree-connections">
      {edges.map((edge) => {
        const isBond = edge.id.startsWith('bond-');
        const isPedigree = edge.id.startsWith('fam-');
        if (isBond) {
          return (
            <path
              key={edge.id}
              d={coupleBondPath(edge.points)}
              fill="none"
              stroke={theme === 'forest' ? '#6d4c41' : '#64748b'}
              strokeWidth={theme === 'forest' ? 2.5 : 2}
              strokeLinecap="round"
            />
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

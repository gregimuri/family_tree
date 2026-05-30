import type { DateDisplayFormat, LayoutEdge, Project } from '../../types';
import { formatMarriageDates } from '../../models/person-utils';
import { branchPath, coupleBondMidpoint, coupleBondPath, edgePath, parseBondUnionId } from '../../layout/edge-router';
import './TreeConnections.css';

interface TreeConnectionsProps {
  edges: LayoutEdge[];
  theme: 'clean' | 'forest';
  project: Project;
  marriageDateFormat: DateDisplayFormat;
  highlightEdgeId?: string | null;
}

function bondLabel(unionId: string, project: Project, format: DateDisplayFormat): string {
  const union = project.unions[unionId];
  if (!union) return '';
  return formatMarriageDates(union, format);
}

function MarriageBond({
  edge,
  label,
  theme,
  highlighted,
}: {
  edge: LayoutEdge;
  label: string;
  theme: 'clean' | 'forest';
  highlighted: boolean;
}) {
  const [start, end] = [edge.points[0], edge.points[edge.points.length - 1]];
  const mid = coupleBondMidpoint(edge.points);
  const stroke = theme === 'forest' ? '#6d4c41' : '#64748b';
  const strokeWidth = (theme === 'forest' ? 2.5 : 2) + (highlighted ? 1.5 : 0);
  const labelPadX = 4;
  const charW = 5.6;
  const labelW = label ? Math.max(28, label.length * charW + labelPadX * 2) : 0;
  const labelH = 14;
  const gap = label ? labelW / 2 + 2 : 0;

  const lineBefore =
    gap > 0 && mid
      ? `M ${start.x} ${start.y} L ${mid.x - gap} ${mid.y}`
      : coupleBondPath(edge.points);
  const lineAfter =
    gap > 0 && mid ? `M ${mid.x + gap} ${mid.y} L ${end.x} ${end.y}` : '';

  return (
    <g className={highlighted ? 'tree-edge--selected' : undefined}>
      <path d={lineBefore} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      {lineAfter && (
        <path d={lineAfter} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
      {label && mid && (
        <g className="marriage-bond-label">
          <rect
            x={mid.x - labelW / 2}
            y={mid.y - labelH / 2}
            width={labelW}
            height={labelH}
            rx={3}
            fill={theme === 'forest' ? '#fafaf9' : '#ffffff'}
            stroke={stroke}
            strokeWidth={1}
          />
          <text
            x={mid.x}
            y={mid.y + 3.5}
            textAnchor="middle"
            fontSize={10}
            fill={theme === 'forest' ? '#5d4037' : '#64748b'}
            fontFamily="var(--font-sans, system-ui, sans-serif)"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

export function TreeConnections({
  edges,
  theme,
  project,
  marriageDateFormat,
  highlightEdgeId,
}: TreeConnectionsProps) {
  return (
    <g className="tree-connections">
      {edges.map((edge) => {
        const isBond = edge.id.startsWith('bond-');
        const isPedigree = edge.id.startsWith('fam-');
        const highlighted = edge.id === highlightEdgeId;
        const strokeExtra = highlighted ? 1.5 : 0;
        if (isBond) {
          const unionId = parseBondUnionId(edge.id);
          const label =
            marriageDateFormat !== 'hidden' && unionId
              ? bondLabel(unionId, project, marriageDateFormat)
              : '';
          return (
            <g key={edge.id}>
              <MarriageBond edge={edge} label={label} theme={theme} highlighted={highlighted} />
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
            stroke={highlighted ? '#eab308' : theme === 'forest' ? '#5d4037' : '#64748b'}
            strokeWidth={(theme === 'forest' ? 2.5 : 1.5) + strokeExtra}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={theme === 'clean' && !isPedigree && !highlighted ? '5 4' : undefined}
            className={highlighted ? 'tree-edge--selected' : undefined}
          />
        );
      })}
    </g>
  );
}

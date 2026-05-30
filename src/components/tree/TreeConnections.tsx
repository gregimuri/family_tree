import type { DateDisplayFormat, LayoutEdge, Project } from '../../types';
import { formatMarriageDates } from '../../models/person-utils';
import {
  branchPath,
  coupleBondMidpoint,
  coupleBondPath,
  edgePath,
  MARRIAGE_BOND_LABEL_HEIGHT,
  marriageLabelTopY,
  parseBondUnionId,
} from '../../layout/edge-router';
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
  const mid = coupleBondMidpoint(edge.points);
  const stroke = theme === 'forest' ? '#6d4c41' : '#64748b';
  const strokeWidth = (theme === 'forest' ? 2.5 : 2) + (highlighted ? 1.5 : 0);
  const labelPadX = 4;
  const charW = 5.6;
  const labelW = label ? Math.max(28, label.length * charW + labelPadX * 2) : 0;
  const labelTop = mid ? marriageLabelTopY(mid.y) : 0;
  const textY = labelTop + MARRIAGE_BOND_LABEL_HEIGHT / 2 + 3.5;

  return (
    <g className={highlighted ? 'tree-edge--selected' : undefined}>
      <path
        d={coupleBondPath(edge.points)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {label && mid && (
        <g className="marriage-bond-label">
          <rect
            x={mid.x - labelW / 2}
            y={labelTop}
            width={labelW}
            height={MARRIAGE_BOND_LABEL_HEIGHT}
            rx={3}
            fill={theme === 'forest' ? '#fafaf9' : '#ffffff'}
            stroke={stroke}
            strokeWidth={1}
          />
          <text
            x={mid.x}
            y={textY}
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
  const bondEdges = edges.filter((e) => e.id.startsWith('bond-'));
  const otherEdges = edges.filter((e) => !e.id.startsWith('bond-'));

  return (
    <g className="tree-connections">
      {otherEdges.map((edge) => {
        const isPedigree = edge.id.startsWith('fam-');
        const highlighted = edge.id === highlightEdgeId;
        const strokeExtra = highlighted ? 1.5 : 0;
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
      {bondEdges.map((edge) => {
        const unionId = parseBondUnionId(edge.id);
        const label =
          marriageDateFormat !== 'hidden' && unionId
            ? bondLabel(unionId, project, marriageDateFormat)
            : '';
        return (
          <g key={edge.id}>
            <MarriageBond
              edge={edge}
              label={label}
              theme={theme}
              highlighted={edge.id === highlightEdgeId}
            />
          </g>
        );
      })}
    </g>
  );
}

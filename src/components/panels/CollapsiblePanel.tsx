import type { ReactNode } from 'react';
import { Icons } from '../ui/Icons';
import './CollapsiblePanel.css';

interface CollapsiblePanelProps {
  title: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  position: 'top-left' | 'top-right' | 'bottom-left';
  docked?: boolean;
  className?: string;
  children: ReactNode;
}

export function CollapsiblePanel({
  title,
  icon,
  open,
  onToggle,
  position,
  docked = false,
  className = '',
  children,
}: CollapsiblePanelProps) {
  const Chevron = position === 'top-right' ? Icons.ChevronRight : Icons.ChevronLeft;

  return (
    <div
      className={`collapsible-panel ${position} ${open ? 'open' : 'collapsed'} ${docked ? 'docked' : ''} ${className}`}
    >
      <button type="button" className="collapsible-panel__toggle" onClick={onToggle}>
        <span className="collapsible-panel__title">
          {icon && <span className="collapsible-panel__icon">{icon}</span>}
          {title}
        </span>
        <Chevron size={16} className={`collapsible-panel__chevron ${open ? 'open' : ''}`} />
      </button>
      {open && <div className="collapsible-panel__body">{children}</div>}
    </div>
  );
}

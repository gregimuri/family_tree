import { Icons } from '../ui/Icons';
import { useUiStore } from '../../store/ui-store';
import { useProjectStore } from '../../store/project-store';
import './ZoomControls.css';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleManualLayout?: () => void;
}

export function ZoomControls({ onZoomIn, onZoomOut, onReset, onToggleManualLayout }: ZoomControlsProps) {
  const setFullscreen = useUiStore((s) => s.setFullscreen);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const mode = useProjectStore((s) => s.mode);
  const manualLayoutMode = useProjectStore((s) => s.manualLayoutMode);
  const setManualLayoutMode = useProjectStore((s) => s.setManualLayoutMode);

  return (
    <div className="zoom-toolbar">
      <div className="zoom-toolbar__group">
        <button type="button" className="zoom-btn" title="Увеличить (Ctrl +)" onClick={onZoomIn}>
          <Icons.ZoomIn size={18} />
        </button>
        <button type="button" className="zoom-btn" title="Уменьшить (Ctrl −)" onClick={onZoomOut}>
          <Icons.ZoomOut size={18} />
        </button>
        <button type="button" className="zoom-btn" title="Вписать всё дерево в экран" onClick={onReset}>
          <Icons.Target size={18} />
        </button>
      </div>
      <div className="zoom-toolbar__group">
        <button
          type="button"
          className="zoom-btn"
          title={fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? <Icons.Minimize size={18} /> : <Icons.Maximize size={18} />}
        </button>
        {mode === 'edit' && (
          <button
            type="button"
            className={`zoom-btn ${manualLayoutMode ? 'active' : ''}`}
            title="Редактировать расположение карточек (режим edit)"
            onClick={onToggleManualLayout ?? (() => setManualLayoutMode(!manualLayoutMode))}
          >
            <Icons.Move size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

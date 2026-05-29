import { useState } from 'react';
import type { RefObject } from 'react';
import { exportTreeElement, PRESET_SIZES, type ExportImageFormat } from '../../services/export/image-export';
import { downloadGedcom } from '../../services/gedcom/export';
import { useProjectStore } from '../../store/project-store';
import { saveProjectFile } from '../../services/project-io/zip-project';
import './ExportDialog.css';

interface ExportDialogProps {
  onClose: () => void;
  svgRef: RefObject<SVGSVGElement | null>;
}

export function ExportDialog({ onClose, svgRef }: ExportDialogProps) {
  const project = useProjectStore((s) => s.project);
  const mediaBlobs = useProjectStore((s) => s.mediaBlobs);
  const [format, setFormat] = useState<ExportImageFormat>('png');
  const [preset, setPreset] = useState('A4');
  const [widthMm, setWidthMm] = useState(210);
  const [heightMm, setHeightMm] = useState(297);
  const [busy, setBusy] = useState(false);

  if (!project) return null;

  const applyPreset = (label: string) => {
    setPreset(label);
    const p = PRESET_SIZES.find((s) => s.label === label);
    if (p) {
      setWidthMm(p.widthMm);
      setHeightMm(p.heightMm);
    }
  };

  const exportImage = async () => {
    const el = svgRef.current;
    if (!el) return;
    setBusy(true);
    try {
      await exportTreeElement(el, { format, widthMm, heightMm });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Экспорт</h3>

        <fieldset>
          <legend>Лист древа</legend>
          <label>
            Формат
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportImageFormat)}>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label>
            Размер
            <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
              {PRESET_SIZES.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
              <option value="custom">Свой размер</option>
            </select>
          </label>
          {preset === 'custom' && (
            <>
              <label>
                Ширина (мм)
                <input type="number" value={widthMm} onChange={(e) => setWidthMm(+e.target.value)} />
              </label>
              <label>
                Высота (мм)
                <input type="number" value={heightMm} onChange={(e) => setHeightMm(+e.target.value)} />
              </label>
            </>
          )}
          <button type="button" className="btn primary" disabled={busy} onClick={exportImage}>
            Экспортировать лист
          </button>
        </fieldset>

        <fieldset>
          <legend>Проект</legend>
          <button
            type="button"
            className="btn"
            onClick={() => void saveProjectFile(project, mediaBlobs)}
          >
            Сохранить .drevo
          </button>
          <button type="button" className="btn" onClick={() => downloadGedcom(project)}>
            Экспорт GEDCOM
          </button>
        </fieldset>

        <button type="button" className="btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

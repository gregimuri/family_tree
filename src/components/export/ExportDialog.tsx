import { useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { LayoutResult } from '../../types';
import type { TreeFrame } from '../../layout/center-focus';
import {
  computeExportViewport,
  exportTreeElement,
  getPresetDimensions,
  PRESET_SIZES,
  viewportSizeMm,
  type ExportImageFormat,
  type ExportOrientation,
  type ExportSizeMode,
} from '../../services/export/image-export';
import { downloadGedcom } from '../../services/gedcom/export';
import { useProjectStore } from '../../store/project-store';
import './ExportDialog.css';

interface ExportDialogProps {
  onClose: () => void;
  svgRef: RefObject<SVGSVGElement | null>;
  layout: LayoutResult;
  frame: TreeFrame;
}

export function ExportDialog({ onClose, svgRef, layout, frame }: ExportDialogProps) {
  const project = useProjectStore((s) => s.project);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);
  const saveProject = useProjectStore((s) => s.saveProject);
  const saveProjectAs = useProjectStore((s) => s.saveProjectAs);
  const [format, setFormat] = useState<ExportImageFormat>('png');
  const [sizeMode, setSizeMode] = useState<ExportSizeMode>('tree');
  const [orientation, setOrientation] = useState<ExportOrientation>('landscape');
  const [preset, setPreset] = useState('A4');
  const [widthMm, setWidthMm] = useState(297);
  const [heightMm, setHeightMm] = useState(210);
  const [busy, setBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportProgress, setExportProgress] = useState(0);

  const isStandardPreset = sizeMode === 'fixed' && preset !== 'custom';
  const treeViewport = useMemo(() => computeExportViewport(frame, layout), [frame, layout]);
  const treeSizeMm = useMemo(() => viewportSizeMm(treeViewport), [treeViewport]);

  const applyPreset = (label: string, orient: ExportOrientation = orientation) => {
    setPreset(label);
    if (label === 'custom') return;
    const dims = getPresetDimensions(label, orient);
    setWidthMm(dims.widthMm);
    setHeightMm(dims.heightMm);
  };

  const changeOrientation = (next: ExportOrientation) => {
    setOrientation(next);
    applyPreset(preset, next);
  };

  const exportImage = async () => {
    const el = svgRef.current;
    if (!el || !project) return;
    setBusy(true);
    setExportStatus('Подготовка…');
    setExportProgress(0);
    try {
      await exportTreeElement(
        { svg: el, layout, frame, project, getMediaUrl },
        {
          format,
          sizeMode,
          widthMm: sizeMode === 'fixed' ? widthMm : undefined,
          heightMm: sizeMode === 'fixed' ? heightMm : undefined,
          theme: project.viewSettings.theme ?? 'clean',
        },
        (message, progress) => {
          setExportStatus(message);
          setExportProgress(progress);
        },
      );
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Ошибка экспорта');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-dialog-overlay" onClick={busy ? undefined : onClose}>
      {busy && (
        <div className="export-dialog__busy" role="status" aria-live="polite">
          <div className="export-dialog__spinner" aria-hidden />
          <p className="export-dialog__busy-title">Экспорт дерева</p>
          <p className="export-dialog__busy-status">{exportStatus}</p>
          <div className="export-dialog__progress-track">
            <div
              className="export-dialog__progress-bar"
              style={{ width: `${Math.round(exportProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog__header">
          <h3>Экспорт</h3>
        </div>

        <div className="export-dialog__body">
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
            Размер холста
            <select value={sizeMode} onChange={(e) => setSizeMode(e.target.value as ExportSizeMode)}>
              <option value="tree">По размеру дерева</option>
              <option value="fixed">Фиксированный лист</option>
            </select>
          </label>
          {sizeMode === 'tree' && (
            <p className="export-dialog__dims-hint">
              Размер листа: {treeSizeMm.widthMm} × {treeSizeMm.heightMm} мм
            </p>
          )}
          {sizeMode === 'fixed' && (
            <>
              <label>
                Формат листа
                <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
                  {PRESET_SIZES.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                  <option value="custom">Свой размер</option>
                </select>
              </label>
              {isStandardPreset && (
                <label>
                  Ориентация листа
                  <select
                    value={orientation}
                    onChange={(e) => changeOrientation(e.target.value as ExportOrientation)}
                  >
                    <option value="landscape">Альбомная</option>
                    <option value="portrait">Книжная</option>
                  </select>
                </label>
              )}
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
              {isStandardPreset && (
                <p className="export-dialog__dims-hint">
                  {widthMm} × {heightMm} мм
                </p>
              )}
              {preset === 'custom' && (
                <p className="export-dialog__dims-hint">
                  Экспорт: {widthMm} × {heightMm} мм
                </p>
              )}
            </>
          )}
          <button type="button" className="btn primary" disabled={busy} onClick={exportImage}>
            Экспортировать лист
          </button>
        </fieldset>

        <fieldset>
          <legend>Проект</legend>
          <button type="button" className="btn" onClick={() => void saveProject()}>
            Сохранить .drevo
          </button>
          <button type="button" className="btn" onClick={() => void saveProjectAs()}>
            Сохранить как…
          </button>
          <button type="button" className="btn" onClick={() => project && downloadGedcom(project)}>
            Экспорт GEDCOM
          </button>
        </fieldset>
        </div>

        <div className="export-dialog__footer">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

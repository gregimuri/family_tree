import type { ViewSettings } from '../../types';
import { useProjectStore } from '../../store/project-store';
import { useUiStore } from '../../store/ui-store';
import { validateViewSettings } from '../../models/validation';
import { countExternalMediaInProject } from '../../utils/media-url';
import { CollapsiblePanel } from './CollapsiblePanel';
import { Icons } from '../ui/Icons';

function InfinityInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const isInf = value >= 999;
  return (
    <div className="infinity-input">
      <input
        type="number"
        className="infinity-input__field"
        min={0}
        max={20}
        disabled={disabled || isInf}
        value={isInf ? 3 : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(0);
            return;
          }
          onChange(Math.max(0, Number.parseInt(raw, 10) || 0));
        }}
      />
      <button
        type="button"
        className={`infinity-input__toggle ${isInf ? 'active' : ''}`}
        title="Без ограничения"
        aria-pressed={isInf}
        disabled={disabled}
        onClick={() => onChange(isInf ? 3 : 999)}
      >
        ∞
      </button>
    </div>
  );
}

export function DisplaySettingsPanel() {
  const project = useProjectStore((s) => s.project);
  const setViewSettings = useProjectStore((s) => s.setViewSettings);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const toggleSettings = useUiStore((s) => s.toggleSettings);

  if (!project) return null;
  const s = project.viewSettings;
  const externalMediaCount = countExternalMediaInProject(project);

  const update = (patch: Partial<ViewSettings>) => {
    setViewSettings(validateViewSettings({ ...s, ...patch }));
  };

  const updateFields = (patch: Partial<ViewSettings['cardFields']>) => {
    update({ cardFields: { ...s.cardFields, ...patch } });
  };

  return (
    <CollapsiblePanel
      title="Настройки"
      icon={<Icons.Settings size={16} />}
      open={settingsOpen}
      onToggle={toggleSettings}
      position="top-right"
      docked
    >
      <div className="settings-grid">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!s.showAllPersons}
            onChange={(e) => update({ showAllPersons: e.target.checked })}
          />
          Показать всех персон
          <small className="hint">Без ограничения по поколениям и боковым ветвям</small>
        </label>
        <label className={s.showAllPersons ? 'settings-disabled' : undefined}>
          Поколения вверх
          <InfinityInput
            value={s.generationsUp}
            disabled={!!s.showAllPersons}
            onChange={(v) => update({ generationsUp: v })}
          />
          <small className="hint">0 — не показывать родителей и предков</small>
        </label>
        <label className={s.showAllPersons ? 'settings-disabled' : undefined}>
          Поколения вниз
          <InfinityInput
            value={s.generationsDown}
            disabled={!!s.showAllPersons}
            onChange={(v) => update({ generationsDown: v })}
          />
          <small className="hint">0 — не показывать детей и потомков</small>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={s.showDiedBefore18}
            onChange={(e) => update({ showDiedBefore18: e.target.checked })}
          />
          Показывать умерших до 18 лет
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!s.allowExternalMedia}
            onChange={(e) => update({ allowExternalMedia: e.target.checked })}
          />
          Загружать внешние медиа по URL
          {externalMediaCount > 0 && (
            <small className="hint">В проекте {externalMediaCount} внешн. ссылок (GEDCOM и др.)</small>
          )}
        </label>
        <label>
          Оформление
          <select
            value={s.theme}
            onChange={(e) => update({ theme: e.target.value as ViewSettings['theme'] })}
          >
            <option value="clean">Чёткие линии</option>
            <option value="forest">Лес</option>
          </select>
        </label>

        <fieldset>
          <legend>Информация на карточках</legend>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showBirthName}
              onChange={(e) => updateFields({ showBirthName: e.target.checked })}
            />
            ФИО при рождении (в скобках)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showNickname}
              onChange={(e) => updateFields({ showNickname: e.target.checked })}
            />
            Прозвище
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.nicknamePriority}
              onChange={(e) => updateFields({ nicknamePriority: e.target.checked })}
            />
            Прозвище приоритетнее ФИО
          </label>
          <label>
            Годы жизни
            <select
              value={s.cardFields.dateFormat}
              onChange={(e) =>
                updateFields({ dateFormat: e.target.value as ViewSettings['cardFields']['dateFormat'] })
              }
            >
              <option value="full">Полная дата</option>
              <option value="years">Только годы</option>
              <option value="hidden">Не показывать</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showAge}
              onChange={(e) => updateFields({ showAge: e.target.checked })}
            />
            Возраст
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showLocation}
              onChange={(e) => updateFields({ showLocation: e.target.checked })}
            />
            Населённый пункт
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showReligion}
              onChange={(e) => updateFields({ showReligion: e.target.checked })}
            />
            Вероисповедание
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showPhoto}
              onChange={(e) => updateFields({ showPhoto: e.target.checked })}
            />
            Фотография
          </label>
          <label>
            Годы брака
            <select
              value={s.cardFields.marriageDateFormat}
              onChange={(e) =>
                updateFields({
                  marriageDateFormat: e.target.value as ViewSettings['cardFields']['marriageDateFormat'],
                })
              }
            >
              <option value="full">Полная дата</option>
              <option value="years">Только годы</option>
              <option value="hidden">Не показывать</option>
            </select>
            <small className="hint">Без развода — только дата брака; при разводе — период</small>
          </label>
        </fieldset>
      </div>
    </CollapsiblePanel>
  );
}

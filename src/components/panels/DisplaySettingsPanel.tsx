import type { ViewSettings } from '../../types';
import { useProjectStore } from '../../store/project-store';
import { useUiStore } from '../../store/ui-store';
import { validateViewSettings } from '../../models/validation';
import { CollapsiblePanel } from './CollapsiblePanel';
import { Icons } from '../ui/Icons';

function InfinityInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const isInf = value >= 999;
  return (
    <div className="infinity-input">
      <input
        type="number"
        className="infinity-input__field"
        min={1}
        max={20}
        disabled={isInf}
        value={isInf ? 3 : value}
        onChange={(e) => onChange(+e.target.value || 1)}
      />
      <button
        type="button"
        className={`infinity-input__toggle ${isInf ? 'active' : ''}`}
        title="Без ограничения"
        aria-pressed={isInf}
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
        <label>
          Поколения вверх
          <InfinityInput value={s.generationsUp} onChange={(v) => update({ generationsUp: v })} />
        </label>
        <label>
          Поколения вниз
          <InfinityInput value={s.generationsDown} onChange={(v) => update({ generationsDown: v })} />
        </label>
        <label>
          Боковые ветви (поколение)
          <input
            type="number"
            min={0}
            max={10}
            value={s.sideBranchesAt}
            onChange={(e) => update({ sideBranchesAt: +e.target.value })}
          />
        </label>
        <label>
          Глубина боковых ветвей
          <input
            type="number"
            min={0}
            max={10}
            value={s.sideBranchDepth}
            onChange={(e) => update({ sideBranchDepth: +e.target.value })}
          />
        </label>
        <label>
          Размер карточек
          <select
            value={s.cardSizeMode}
            onChange={(e) => update({ cardSizeMode: e.target.value as ViewSettings['cardSizeMode'] })}
            disabled={s.sideBranchesAt >= 3}
          >
            <option value="uniform">Одинаковый</option>
            <option value="diminish">Уменьшаемый</option>
          </select>
          {s.sideBranchesAt >= 3 && (
            <small className="hint">При боковых ветвях ≥3 только уменьшаемый</small>
          )}
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={s.showDiedBefore18}
            onChange={(e) => update({ showDiedBefore18: e.target.checked })}
          />
          Показывать умерших до 18 лет
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
              checked={s.cardFields.showPhoto}
              onChange={(e) => updateFields({ showPhoto: e.target.checked })}
            />
            Фотография
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.cardFields.showMarriageYears}
              onChange={(e) => updateFields({ showMarriageYears: e.target.checked })}
            />
            Годы брака
          </label>
        </fieldset>
      </div>
    </CollapsiblePanel>
  );
}

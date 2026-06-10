import { useState } from 'react';
import type { Union } from '../../types';
import type { ProjectSnapshot } from '../../store/project-history';
import { formatMarriageDates, formatPersonName } from '../../models/person-utils';
import { useProjectStore } from '../../store/project-store';
import { DateField } from './DossierFields';
import './DossierFields.css';
import './PersonSearchDialog.css';
import './MarriageEditDialog.css';

interface MarriageEditDialogProps {
  unionId: string;
  editSnapshot: ProjectSnapshot | null;
  onClose: () => void;
}

export function MarriageEditDialog({ unionId, editSnapshot, onClose }: MarriageEditDialogProps) {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const updateUnion = useProjectStore((s) => s.updateUnion);
  const restoreProjectSnapshot = useProjectStore((s) => s.restoreProjectSnapshot);

  const storeUnion = project?.unions[unionId];
  const [draft, setDraft] = useState<Union | null>(() =>
    storeUnion ? structuredClone(storeUnion) : null,
  );

  if (!project || !storeUnion || !draft) return null;

  const canEdit = mode === 'edit';
  const partners = draft.partnerIds
    .map((id) => project.persons[id])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.gender === 'male' && b.gender !== 'male') return -1;
      if (b.gender === 'male' && a.gender !== 'male') return 1;
      return formatPersonName(a).localeCompare(formatPersonName(b), 'ru');
    });
  const title = partners.map((p) => formatPersonName(p, true)).join(' — ') || 'Брак';

  const handleDiscard = () => {
    if (canEdit && editSnapshot) {
      restoreProjectSnapshot(editSnapshot);
    }
    onClose();
  };

  const handleSave = () => {
    updateUnion(draft);
    onClose();
  };

  return (
    <div className="person-search-overlay" onClick={handleDiscard}>
      <div className="person-search-dialog marriage-edit-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="person-search-dialog__close" onClick={handleDiscard} aria-label="Закрыть">
          ×
        </button>
        <h4>{title}</h4>
        {!canEdit && (
          <p className="marriage-edit-dialog__hint">Переключитесь в режим редактирования, чтобы изменить даты.</p>
        )}
        <div className="marriage-edit-dialog__dates">
          {canEdit ? (
            <>
              <DateField
                label="Начало брака"
                value={draft.marriageStart}
                onChange={(marriageStart) => setDraft({ ...draft, marriageStart })}
              />
              <DateField
                label="Окончание брака"
                value={draft.marriageEnd}
                onChange={(marriageEnd) => setDraft({ ...draft, marriageEnd })}
              />
            </>
          ) : (
            <p className="marriage-edit-dialog__readonly">
              {formatMarriageDates(storeUnion) || 'Даты брака не указаны'}
            </p>
          )}
        </div>
        <div className="marriage-edit-dialog__actions">
          {canEdit ? (
            <>
              <button type="button" className="btn" onClick={handleDiscard}>
                Отмена
              </button>
              <button type="button" className="btn primary" onClick={handleSave}>
                Сохранить
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={handleDiscard}>
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

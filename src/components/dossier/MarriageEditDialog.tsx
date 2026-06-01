import type { Union } from '../../types';
import { formatMarriageDates, formatPersonName } from '../../models/person-utils';
import { useProjectStore } from '../../store/project-store';
import { DateField } from './DossierFields';
import './DossierFields.css';
import './PersonSearchDialog.css';
import './MarriageEditDialog.css';

interface MarriageEditDialogProps {
  unionId: string;
  onClose: () => void;
}

export function MarriageEditDialog({ unionId, onClose }: MarriageEditDialogProps) {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const updateUnion = useProjectStore((s) => s.updateUnion);

  const union = project?.unions[unionId];
  if (!union) return null;

  const canEdit = mode === 'edit';
  const partners = union.partnerIds
    .map((id) => project.persons[id])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.gender === 'male' && b.gender !== 'male') return -1;
      if (b.gender === 'male' && a.gender !== 'male') return 1;
      return formatPersonName(a).localeCompare(formatPersonName(b), 'ru');
    });
  const title = partners.map((p) => formatPersonName(p, true)).join(' — ') || 'Брак';

  const saveUnion = (patch: Partial<Union>) => {
    updateUnion({ ...union, ...patch });
  };

  return (
    <div className="person-search-overlay" onClick={onClose}>
      <div className="person-search-dialog marriage-edit-dialog" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        {!canEdit && (
          <p className="marriage-edit-dialog__hint">Переключитесь в режим редактирования, чтобы изменить даты.</p>
        )}
        <div className="marriage-edit-dialog__dates">
          {canEdit ? (
            <>
              <DateField
                label="Начало брака"
                value={union.marriageStart}
                onChange={(marriageStart) => saveUnion({ marriageStart })}
              />
              <DateField
                label="Окончание брака"
                value={union.marriageEnd}
                onChange={(marriageEnd) => saveUnion({ marriageEnd })}
              />
            </>
          ) : (
            <p className="marriage-edit-dialog__readonly">
              {formatMarriageDates(union) || 'Даты брака не указаны'}
            </p>
          )}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

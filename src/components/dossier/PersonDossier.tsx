import { useState } from 'react';
import type { Person } from '../../types';
import {
  dateToText,
  formatPersonName,
} from '../../models/person-utils';
import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';
import { AvatarEditor } from './AvatarEditor';
import { DateField, GenderSelect, LocationSourceSelect, PlaceField, formatPlaceText, getPlaceForLocationSource, placeHasValue } from './DossierFields';
import { PersonRelationships } from './PersonRelationships';
import './DossierFields.css';
import './PersonDossier.css';
import './PersonRelationships.css';

interface PersonDossierProps {
  personId: string;
}

function FactRow({
  label,
  show,
  editMode,
  children,
}: {
  label: string;
  show: boolean;
  editMode: boolean;
  children: React.ReactNode;
}) {
  if (!editMode && !show) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function PersonDossier({ personId }: PersonDossierProps) {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const closeDossier = useProjectStore((s) => s.closeDossier);
  const openDossier = useProjectStore((s) => s.openDossier);
  const updatePerson = useProjectStore((s) => s.updatePerson);
  const setCenter = useProjectStore((s) => s.setCenter);
  const openMediaViewer = useProjectStore((s) => s.openMediaViewer);
  const addMedia = useProjectStore((s) => s.addMedia);
  const updateMedia = useProjectStore((s) => s.updateMedia);
  const deleteMedia = useProjectStore((s) => s.deleteMedia);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);
  const deletePerson = useProjectStore((s) => s.deletePerson);

  const [bioOpen, setBioOpen] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(true);
  const [avatarEdit, setAvatarEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Person | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (!project) return null;
  const storePerson = project.persons[personId];
  if (!storePerson) return null;

  const person = editMode && draft ? draft : storePerson;

  const avatarMedia = person.avatar ? project.media[person.avatar.mediaId] : null;
  const avatarUrl = avatarMedia ? getMediaUrl(avatarMedia.filename) : undefined;
  const mediaItems = person.mediaIds.map((id) => project.media[id]).filter(Boolean);
  const personCount = Object.keys(project.persons).length;

  const saveField = (patch: Partial<Person>) => {
    if (editMode && draft) {
      setDraft({ ...draft, ...patch });
    } else {
      updatePerson({ ...storePerson, ...patch });
    }
  };

  const startEdit = () => {
    setDraft(structuredClone(storePerson));
    setEditMode(true);
  };

  const finishEdit = () => {
    if (draft) updatePerson(draft);
    setDraft(null);
    setEditMode(false);
  };

  const handleClose = () => {
    setDraft(null);
    setEditMode(false);
    closeDossier();
  };

  const handleDelete = () => {
    deletePerson(personId);
    closeDossier();
  };

  const removeMedia = (mediaId: string) => {
    deleteMedia(mediaId);
    saveField({ mediaIds: person.mediaIds.filter((id) => id !== mediaId) });
  };

  const genderLabels = { male: 'Мужской', female: 'Женский', unknown: 'Неизвестно' } as const;
  const locationLabels = {
    birth: 'Место рождения',
    death: 'Место смерти',
    burial: 'Место захоронения',
    current: 'Текущее проживание',
    longestResidence: 'Самое длительное проживание',
  } as const;
  const cardLocationPlace = getPlaceForLocationSource(person, person.cardLocationSource);

  return (
    <div className="dossier-overlay">
      <div className={`dossier${editMode ? ' dossier--edit' : ''}`}>
        <button type="button" className="dossier-close" onClick={handleClose}>
          ×
        </button>

        <div
          className="dossier-avatar"
          onDoubleClick={() => {
            setCenter({ type: 'person', id: personId });
            handleClose();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (mode === 'edit') setAvatarEdit(true);
          }}
          title="Двойной клик — центр древа; ПКМ — замена фото"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <div className="dossier-avatar-placeholder">{person.givenName[0] ?? '?'}</div>
          )}
        </div>

        {mode === 'edit' && (
          <button type="button" className="dossier-edit-toggle" onClick={() => (editMode ? finishEdit() : startEdit())}>
            {editMode ? 'Готово' : 'Редактировать'}
          </button>
        )}

        {mode === 'edit' && editMode && personCount > 1 && (
          <button type="button" className="dossier-delete" onClick={() => setDeleteConfirm(true)}>
            Удалить
          </button>
        )}

        <div className="dossier-main">
          {editMode ? (
            <div className="dossier-edit-names">
              <label className="dossier-field-inline dossier-field-inline--gender">
                <span>Пол</span>
                <GenderSelect value={person.gender} onChange={(gender) => saveField({ gender })} />
              </label>
              <h3>Текущее имя</h3>
              <input value={person.surname} onChange={(e) => saveField({ surname: e.target.value })} placeholder="Фамилия" />
              <input value={person.givenName} onChange={(e) => saveField({ givenName: e.target.value })} placeholder="Имя" />
              <input value={person.patronymic} onChange={(e) => saveField({ patronymic: e.target.value })} placeholder="Отчество" />
              <input value={person.nickname ?? ''} onChange={(e) => saveField({ nickname: e.target.value || undefined })} placeholder="Прозвище" />
              <label className="dossier-checkbox">
                <input type="checkbox" checked={person.nicknamePriority} onChange={(e) => saveField({ nicknamePriority: e.target.checked })} />
                Показывать прозвище вместо имени
              </label>
              <h3>Имя при рождении</h3>
              <input value={person.birthSurname ?? ''} onChange={(e) => saveField({ birthSurname: e.target.value || undefined })} placeholder="Фамилия при рождении" />
              <input value={person.birthGivenName ?? ''} onChange={(e) => saveField({ birthGivenName: e.target.value || undefined })} placeholder="Имя при рождении" />
              <input value={person.birthPatronymic ?? ''} onChange={(e) => saveField({ birthPatronymic: e.target.value || undefined })} placeholder="Отчество при рождении" />
            </div>
          ) : (
            <h2>
              {person.surname}
              {person.birthSurname && person.birthSurname !== person.surname && (
                <span className="birth-name"> ({person.birthSurname})</span>
              )}{' '}
              {person.givenName}
              {person.patronymic && ` ${person.patronymic}`}
              {person.nickname && <span className="nickname"> «{person.nickname}»</span>}
            </h2>
          )}

          <PersonRelationships
            personId={personId}
            canEdit={mode === 'edit'}
            onNavigate={openDossier}
          />

          <dl className="dossier-facts">
            {!editMode && (
              <>
                <dt>Пол</dt>
                <dd>{genderLabels[person.gender]}</dd>
              </>
            )}

            <FactRow label="Дата рождения" show={!!dateToText(person.birth?.date)} editMode={editMode}>
              {editMode ? (
                <DateField value={person.birth?.date} onChange={(date) => saveField({ birth: { ...person.birth, date } })} />
              ) : (
                dateToText(person.birth?.date)
              )}
            </FactRow>

            <FactRow label="Место рождения" show={placeHasValue(person.birth?.place)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.birth?.place} onChange={(place) => saveField({ birth: { ...person.birth, place } })} />
              ) : (
                formatPlaceText(person.birth?.place)
              )}
            </FactRow>

            <FactRow label="Основное место проживания" show={placeHasValue(person.mainResidence)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.mainResidence} onChange={(mainResidence) => saveField({ mainResidence })} />
              ) : (
                formatPlaceText(person.mainResidence)
              )}
            </FactRow>

            <FactRow label="Текущее проживание" show={placeHasValue(person.currentResidence)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.currentResidence} onChange={(currentResidence) => saveField({ currentResidence })} />
              ) : (
                formatPlaceText(person.currentResidence)
              )}
            </FactRow>

            <FactRow label="Самое длительное проживание" show={placeHasValue(person.longestResidence)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.longestResidence} onChange={(longestResidence) => saveField({ longestResidence })} />
              ) : (
                formatPlaceText(person.longestResidence)
              )}
            </FactRow>

            <FactRow
              label="Место на карточке"
              show={placeHasValue(cardLocationPlace)}
              editMode={editMode}
            >
              {editMode ? (
                <LocationSourceSelect value={person.cardLocationSource} onChange={(cardLocationSource) => saveField({ cardLocationSource })} />
              ) : (
                locationLabels[person.cardLocationSource]
              )}
            </FactRow>

            <FactRow label="Дата смерти" show={!!dateToText(person.death?.date)} editMode={editMode}>
              {editMode ? (
                <DateField value={person.death?.date} onChange={(date) => saveField({ death: { ...person.death, date } })} />
              ) : (
                dateToText(person.death?.date)
              )}
            </FactRow>

            <FactRow label="Причина смерти" show={!!person.death?.cause?.trim()} editMode={editMode}>
              {editMode ? (
                <input
                  value={person.death?.cause ?? ''}
                  onChange={(e) => saveField({ death: { ...person.death, cause: e.target.value || undefined } })}
                  placeholder="Причина смерти"
                />
              ) : (
                person.death?.cause
              )}
            </FactRow>

            <FactRow label="Место смерти" show={placeHasValue(person.death?.place)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.death?.place} onChange={(place) => saveField({ death: { ...person.death, place } })} />
              ) : (
                formatPlaceText(person.death?.place)
              )}
            </FactRow>

            <FactRow label="Захоронение" show={placeHasValue(person.burial)} editMode={editMode}>
              {editMode ? (
                <PlaceField value={person.burial} onChange={(burial) => saveField({ burial })} namePlaceholder="Место захоронения" />
              ) : (
                formatPlaceText(person.burial)
              )}
            </FactRow>
          </dl>
        </div>

        <section className="dossier-section">
          <button type="button" className="section-toggle" onClick={() => setBioOpen(!bioOpen)}>
            {bioOpen ? '▼' : '▶'} Биография
          </button>
          {bioOpen &&
            (editMode ? (
              <textarea className="bio-textarea" value={person.biography} onChange={(e) => saveField({ biography: e.target.value })} rows={8} />
            ) : (
              person.biography && <p className="bio-text">{person.biography}</p>
            ))}
        </section>

        <section className="dossier-section">
          <button type="button" className="section-toggle" onClick={() => setMediaOpen(!mediaOpen)}>
            {mediaOpen ? '▼' : '▶'} Медиа файлы
          </button>
          {mediaOpen && (
            <ul className="media-list">
              {mediaItems.map((m) => (
                <li
                  key={m.id}
                  className={editMode ? 'media-edit' : undefined}
                  onDoubleClick={() => !editMode && openMediaViewer(m.id)}
                  onContextMenu={(e) => {
                    if (editMode) return;
                    e.preventDefault();
                    alert(`Файл: ${m.filename}`);
                  }}
                >
                  {editMode ? (
                    <>
                      <div className="media-edit-meta">
                        {m.type}: {m.filename}
                      </div>
                      <div className="media-edit-row">
                        <input value={m.description} onChange={(e) => updateMedia({ ...m, description: e.target.value })} placeholder="Описание" />
                        <button type="button" className="btn tiny" onClick={() => removeMedia(m.id)} title="Удалить">
                          ×
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {m.type}: {m.description || m.filename}
                    </>
                  )}
                </li>
              ))}
              {editMode && (
                <li className="media-edit">
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const id = createId();
                      const type = file.type.startsWith('video')
                        ? 'video'
                        : file.type.startsWith('audio')
                          ? 'audio'
                          : file.type === 'application/pdf'
                            ? 'document'
                            : 'photo';
                      addMedia({ id, type, filename: file.name, description: file.name, personIds: [personId] }, file);
                      saveField({ mediaIds: [...person.mediaIds, id] });
                    }}
                  />
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {avatarEdit && <AvatarEditor personId={personId} onClose={() => setAvatarEdit(false)} />}

      {deleteConfirm && (
        <div className="dossier-confirm-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="dossier-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить персону?</h3>
            <p>
              Персона <strong>{formatPersonName(person)}</strong> будет удалена из проекта вместе со связями. Это
              действие нельзя отменить.
            </p>
            <div className="dossier-confirm-actions">
              <button type="button" className="btn" onClick={() => setDeleteConfirm(false)}>
                Отмена
              </button>
              <button type="button" className="btn danger" onClick={handleDelete}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

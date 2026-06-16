import { useRef, useState } from 'react';
import type { Person } from '../../types';
import type { ProjectSnapshot } from '../../store/project-history';
import {
  dateToText,
  formatPersonName,
} from '../../models/person-utils';
import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';
import { AvatarEditor } from './AvatarEditor';
import { MediaListThumb } from './MediaListThumb';
import { DateField, GenderSelect, LocationSourceSelect, PlaceField, ResidencesEditor, formatPlaceText, getLocationSourceLabel, getPlaceForLocationSource, personHasResidences, placeHasValue, reconcileCardLocationSource } from './DossierFields';
import { getPersonResidences, residenceCardSource } from '../../models/residences';
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
  const captureProjectSnapshot = useProjectStore((s) => s.captureProjectSnapshot);
  const restoreProjectSnapshot = useProjectStore((s) => s.restoreProjectSnapshot);

  const [bioOpen, setBioOpen] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(true);
  const [avatarEdit, setAvatarEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Person | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const editSnapshotRef = useRef<ProjectSnapshot | null>(null);

  if (!project) return null;
  const storePerson = project.persons[personId];
  if (!storePerson) return null;

  const person = editMode && draft ? draft : storePerson;

  const avatarMedia = person.avatar ? project.media[person.avatar.mediaId] : null;
  const avatarUrl = avatarMedia ? getMediaUrl(avatarMedia.filename) : undefined;
  const mediaItems = person.mediaIds.map((id) => project.media[id]).filter(Boolean);
  const archivePhotos = mediaItems.filter((item) => item.type === 'photo');
  const personCount = Object.keys(project.persons).length;
  const canEditMedia = mode === 'edit' && editMode;
  const canPickAvatar = mode === 'view' && archivePhotos.length > 0;

  const saveField = (patch: Partial<Person>) => {
    if (editMode && draft) {
      setDraft({ ...draft, ...patch });
    } else {
      updatePerson({ ...storePerson, ...patch });
    }
  };

  const startEdit = () => {
    editSnapshotRef.current = captureProjectSnapshot();
    setDraft(structuredClone(storePerson));
    setEditMode(true);
  };

  const finishEdit = () => {
    if (draft) {
      const live = project.persons[personId];
      const mediaIds = [...draft.mediaIds];
      const avatarMediaId = draft.avatar?.mediaId;
      if (avatarMediaId && !mediaIds.includes(avatarMediaId)) {
        mediaIds.push(avatarMediaId);
      }
      updatePerson({
        ...draft,
        parentUnionIds: live.parentUnionIds,
        unionIds: live.unionIds,
        mediaIds,
      });
    }
    editSnapshotRef.current = null;
    setDraft(null);
    setEditMode(false);
  };

  const handleClose = () => {
    if (editMode && editSnapshotRef.current) {
      restoreProjectSnapshot(editSnapshotRef.current);
    }
    editSnapshotRef.current = null;
    setDraft(null);
    setEditMode(false);
    closeDossier();
  };

  const handleDelete = () => {
    deletePerson(personId);
    closeDossier();
  };

  const linkDraftMedia = (mediaId: string) => {
    if (!editMode || !draft || draft.mediaIds.includes(mediaId)) return;
    setDraft({ ...draft, mediaIds: [...draft.mediaIds, mediaId] });
  };

  const applyDraftAvatar = (avatar: Person['avatar'], mediaIds: string[]) => {
    if (!editMode || !draft) return;
    setDraft({ ...draft, avatar, mediaIds });
  };

  const removeMedia = (mediaId: string) => {
    const item = project.media[mediaId];
    const label = item?.description || item?.filename || 'файл';
    if (!window.confirm(`Удалить «${label}» из проекта? Файл будет удалён без возможности восстановления.`)) {
      return;
    }
    if (editMode && draft) {
      setDraft({
        ...draft,
        mediaIds: draft.mediaIds.filter((id) => id !== mediaId),
        avatar: draft.avatar?.mediaId === mediaId ? undefined : draft.avatar,
      });
    }
    deleteMedia(mediaId);
  };

  const genderLabels = { male: 'Мужской', female: 'Женский', unknown: 'Неизвестно' } as const;
  const cardLocationPlace = getPlaceForLocationSource(person, person.cardLocationSource);
  const residences = getPersonResidences(person);

  const saveResidences = (nextEntries: typeof residences) => {
    saveField({
      residences: nextEntries.length > 0 ? nextEntries : undefined,
      cardLocationSource: reconcileCardLocationSource(person, nextEntries),
    });
  };

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
            if (canEditMedia || canPickAvatar) setAvatarEdit(true);
          }}
          title={
            canEditMedia
              ? 'Двойной клик — центр древа; ПКМ — замена фото'
              : canPickAvatar
                ? 'Двойной клик — центр древа; ПКМ — выбор фото из архива'
                : 'Двойной клик — центр древа'
          }
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
            canEdit={mode === 'edit' && editMode}
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

            <FactRow label="Адреса проживания" show={personHasResidences(person)} editMode={editMode}>
              {editMode ? (
                <ResidencesEditor entries={residences} onChange={saveResidences} />
              ) : (
                <ul className="residences-view">
                  {residences
                    .filter((entry) => placeHasValue(entry.place))
                    .map((entry) => (
                      <li key={entry.id}>{getLocationSourceLabel(person, residenceCardSource(entry.id))}</li>
                    ))}
                </ul>
              )}
            </FactRow>

            <FactRow
              label="Место на карточке"
              show={placeHasValue(cardLocationPlace) || editMode}
              editMode={editMode}
            >
              {editMode ? (
                <LocationSourceSelect
                  person={person}
                  value={person.cardLocationSource}
                  onChange={(cardLocationSource) => saveField({ cardLocationSource })}
                />
              ) : (
                getLocationSourceLabel(person, person.cardLocationSource)
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
              {mediaItems.length === 0 && !canEditMedia && (
                <li className="media-list__empty">Нет прикреплённых файлов</li>
              )}
              {mediaItems.map((m) => {
                const mediaUrl = getMediaUrl(m.filename);
                return (
                <li
                  key={m.id}
                  className={canEditMedia ? 'media-edit' : 'media-item'}
                  onDoubleClick={() => !canEditMedia && openMediaViewer(m.id)}
                  onContextMenu={(e) => {
                    if (canEditMedia) return;
                    e.preventDefault();
                    openMediaViewer(m.id);
                  }}
                >
                  <MediaListThumb media={m} url={mediaUrl} />
                  <div className="media-list__body">
                    {canEditMedia ? (
                      <>
                        <div className="media-edit-meta">
                          {m.type}: {m.filename}
                        </div>
                        <div className="media-edit-row">
                          <input value={m.description} onChange={(e) => updateMedia({ ...m, description: e.target.value })} placeholder="Описание" />
                          <button
                            type="button"
                            className="media-list__delete"
                            onClick={() => removeMedia(m.id)}
                            title="Удалить из проекта"
                            aria-label="Удалить из проекта"
                          >
                            ×
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="media-list__label">
                        {m.type}: {m.description || m.filename}
                      </span>
                    )}
                  </div>
                </li>
              );
              })}
              {canEditMedia && (
                <li className="media-edit">
                  <label className="media-upload">
                    <span>Добавить файл</span>
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
                        if (editMode && draft) {
                          setDraft({ ...draft, mediaIds: [...draft.mediaIds, id] });
                        } else {
                          saveField({ mediaIds: [...storePerson.mediaIds, id] });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {avatarEdit && (
        <AvatarEditor
          personId={personId}
          allowUpload={mode === 'edit'}
          linkedMediaIds={editMode && draft ? draft.mediaIds : undefined}
          onMediaLinked={editMode ? linkDraftMedia : undefined}
          onAvatarSaved={editMode ? applyDraftAvatar : undefined}
          onClose={() => setAvatarEdit(false)}
        />
      )}

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

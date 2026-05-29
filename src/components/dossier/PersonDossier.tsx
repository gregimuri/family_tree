import { useState } from 'react';

import type { Gender, Person, Union } from '../../types';

import {

  dateToText,

  formatPersonName,

  getChildren,

  getParents,

  getUnions,

} from '../../models/person-utils';

import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';

import { AvatarEditor } from './AvatarEditor';

import { DateField, GenderSelect, LocationSourceSelect, PlaceField } from './DossierFields';

import './DossierFields.css';

import './PersonDossier.css';



interface PersonDossierProps {

  personId: string;

}



function LinkPerson({

  id,

  label,

  onNavigate,

}: {

  id: string;

  label: string;

  onNavigate: (id: string) => void;

}) {

  return (

    <button type="button" className="link-person" onClick={() => onNavigate(id)}>

      {label}

    </button>

  );

}



export function PersonDossier({ personId }: PersonDossierProps) {

  const project = useProjectStore((s) => s.project);

  const mode = useProjectStore((s) => s.mode);

  const closeDossier = useProjectStore((s) => s.closeDossier);

  const openDossier = useProjectStore((s) => s.openDossier);

  const updatePerson = useProjectStore((s) => s.updatePerson);

  const addPerson = useProjectStore((s) => s.addPerson);

  const updateUnion = useProjectStore((s) => s.updateUnion);

  const addUnion = useProjectStore((s) => s.addUnion);

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

  const [deleteConfirm, setDeleteConfirm] = useState(false);



  if (!project) return null;

  const person = project.persons[personId];

  if (!person) return null;



  const parents = getParents(project, person);

  const unions = getUnions(project, person);

  const avatarMedia = person.avatar ? project.media[person.avatar.mediaId] : null;

  const avatarUrl = avatarMedia ? getMediaUrl(avatarMedia.filename) : undefined;



  const mediaItems = person.mediaIds

    .map((id) => project.media[id])

    .filter(Boolean);



  const saveField = (patch: Partial<Person>) => {

    updatePerson({ ...person, ...patch });

  };



  const addChild = (union: Union) => {

    const child = addPerson({ gender: 'unknown' as Gender });

    updateUnion({ ...union, childIds: [...union.childIds, child.id] });

    const updatedChild = {

      ...child,

      parentUnionIds: [...child.parentUnionIds, union.id],

    };

    updatePerson(updatedChild);

  };



  const addPartner = () => {

    const partner = addPerson({ gender: person.gender === 'male' ? 'female' : 'male' });

    const unionId = createId();

    const union: Union = {

      id: unionId,

      partnerIds: [person.id, partner.id],

      childIds: [],

    };

    addUnion(union);

    updatePerson({ ...person, unionIds: [...person.unionIds, unionId] });

    updatePerson({ ...partner, unionIds: [...partner.unionIds, unionId] });

  };



  const handleDelete = () => {

    deletePerson(personId);

    closeDossier();

  };



  const removeMedia = (mediaId: string) => {

    deleteMedia(mediaId);

    saveField({ mediaIds: person.mediaIds.filter((id) => id !== mediaId) });

  };



  const personCount = Object.keys(project.persons).length;



  return (

    <div className="dossier-overlay">

      <div className={`dossier${editMode ? ' dossier--edit' : ''}`}>

        <button type="button" className="dossier-close" onClick={closeDossier}>

          ×

        </button>



        <div

          className="dossier-avatar"

          onDoubleClick={() => {

            setCenter({ type: 'person', id: personId });

            closeDossier();

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

          <button type="button" className="dossier-edit-toggle" onClick={() => setEditMode(!editMode)}>

            {editMode ? 'Готово' : 'Редактировать'}

          </button>

        )}



        {mode === 'edit' && editMode && personCount > 1 && (

          <button

            type="button"

            className="dossier-delete"

            onClick={() => setDeleteConfirm(true)}

          >

            Удалить

          </button>

        )}



        <div className="dossier-main">

          {editMode ? (

            <div className="dossier-edit-names">

              <h3>Текущее имя</h3>

              <input value={person.surname} onChange={(e) => saveField({ surname: e.target.value })} placeholder="Фамилия" />

              <input value={person.givenName} onChange={(e) => saveField({ givenName: e.target.value })} placeholder="Имя" />

              <input value={person.patronymic} onChange={(e) => saveField({ patronymic: e.target.value })} placeholder="Отчество" />

              <input value={person.nickname ?? ''} onChange={(e) => saveField({ nickname: e.target.value || undefined })} placeholder="Прозвище" />

              <label className="dossier-checkbox">

                <input

                  type="checkbox"

                  checked={person.nicknamePriority}

                  onChange={(e) => saveField({ nicknamePriority: e.target.checked })}

                />

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



          <dl className="dossier-facts">

            <dt>Пол</dt>

            <dd>

              {editMode ? (

                <GenderSelect value={person.gender} onChange={(gender) => saveField({ gender })} />

              ) : (

                ({ male: 'Мужской', female: 'Женский', unknown: 'Неизвестно' } as const)[person.gender]

              )}

            </dd>



            <dt>Дата рождения</dt>

            <dd>

              {editMode ? (

                <DateField

                  value={person.birth?.date}

                  onChange={(date) => saveField({ birth: { ...person.birth, date } })}

                />

              ) : (

                dateToText(person.birth?.date) || '—'

              )}

            </dd>



            <dt>Место рождения</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.birth?.place}

                  onChange={(place) => saveField({ birth: { ...person.birth, place } })}

                />

              ) : (

                person.birth?.place?.name || '—'

              )}

            </dd>



            <dt>Родители</dt>

            <dd>

              {parents.length

                ? parents.map((p) => (

                    <LinkPerson

                      key={p.id}

                      id={p.id}

                      label={formatPersonName(p)}

                      onNavigate={openDossier}

                    />

                  ))

                : '—'}

              {editMode && (

                <button type="button" className="btn small" onClick={() => {

                  const parent = addPerson();

                  const unionId = createId();

                  addUnion({ id: unionId, partnerIds: [parent.id], childIds: [person.id] });

                  updatePerson({ ...person, parentUnionIds: [...person.parentUnionIds, unionId] });

                }}>

                  + родитель

                </button>

              )}

            </dd>



            {unions.map((u) => {

              const partner = u.partnerIds.map((id) => project.persons[id]).find((p) => p?.id !== person.id);

              const children = getChildren(project, u);

              return (

                <div key={u.id} className="dossier-union">

                  <dt>Брак</dt>

                  <dd>

                    {editMode ? (

                      <div className="dossier-field">

                        <DateField

                          label="Начало"

                          value={u.marriageStart}

                          onChange={(marriageStart) => updateUnion({ ...u, marriageStart })}

                        />

                        <DateField

                          label="Окончание"

                          value={u.marriageEnd}

                          onChange={(marriageEnd) => updateUnion({ ...u, marriageEnd })}

                        />

                      </div>

                    ) : (

                      <>

                        {dateToText(u.marriageStart) || '—'} — {dateToText(u.marriageEnd) || 'н.в.'}

                      </>

                    )}

                  </dd>

                  <dt>Партнёр</dt>

                  <dd>

                    {partner ? (

                      <LinkPerson id={partner.id} label={formatPersonName(partner)} onNavigate={openDossier} />

                    ) : (

                      '—'

                    )}

                  </dd>

                  <dt>Дети</dt>

                  <dd>

                    {children.map((c) => (

                      <LinkPerson key={c.id} id={c.id} label={formatPersonName(c)} onNavigate={openDossier} />

                    ))}

                    {editMode && (

                      <button type="button" className="btn small" onClick={() => addChild(u)}>

                        + ребёнок

                      </button>

                    )}

                  </dd>

                </div>

              );

            })}



            {editMode && (
              <>
                <dt className="dossier-facts-label">Связи</dt>
                <dd className="dossier-facts-actions">
                  <button type="button" className="btn small" onClick={addPartner}>
                    + партнёр
                  </button>
                </dd>
              </>
            )}



            <dt>Основное место проживания</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.mainResidence}

                  onChange={(mainResidence) => saveField({ mainResidence })}

                />

              ) : (

                person.mainResidence?.name || '—'

              )}

            </dd>



            <dt>Текущее проживание</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.currentResidence}

                  onChange={(currentResidence) => saveField({ currentResidence })}

                />

              ) : (

                person.currentResidence?.name || '—'

              )}

            </dd>



            <dt>Самое длительное проживание</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.longestResidence}

                  onChange={(longestResidence) => saveField({ longestResidence })}

                />

              ) : (

                person.longestResidence?.name || '—'

              )}

            </dd>



            <dt>Место на карточке</dt>

            <dd>

              {editMode ? (

                <LocationSourceSelect

                  value={person.cardLocationSource}

                  onChange={(cardLocationSource) => saveField({ cardLocationSource })}

                />

              ) : (

                ({

                  birth: 'Место рождения',

                  death: 'Место смерти',

                  burial: 'Место захоронения',

                  current: 'Текущее проживание',

                  longestResidence: 'Самое длительное проживание',

                })[person.cardLocationSource]

              )}

            </dd>



            <dt>Дата смерти</dt>

            <dd>

              {editMode ? (

                <DateField

                  value={person.death?.date}

                  onChange={(date) => saveField({ death: { ...person.death, date } })}

                />

              ) : (

                dateToText(person.death?.date) || '—'

              )}

            </dd>



            <dt>Причина смерти</dt>

            <dd>

              {editMode ? (

                <input

                  value={person.death?.cause ?? ''}

                  onChange={(e) => saveField({ death: { ...person.death, cause: e.target.value || undefined } })}

                  placeholder="Причина смерти"

                />

              ) : (

                person.death?.cause || '—'

              )}

            </dd>



            <dt>Место смерти</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.death?.place}

                  onChange={(place) => saveField({ death: { ...person.death, place } })}

                />

              ) : (

                person.death?.place?.name || '—'

              )}

            </dd>



            <dt>Захоронение</dt>

            <dd>

              {editMode ? (

                <PlaceField

                  value={person.burial}

                  onChange={(burial) => saveField({ burial })}

                  namePlaceholder="Место захоронения"

                />

              ) : (

                person.burial?.name || '—'

              )}

            </dd>

          </dl>

        </div>



        <section className="dossier-section">

          <button type="button" className="section-toggle" onClick={() => setBioOpen(!bioOpen)}>

            {bioOpen ? '▼' : '▶'} Биография

          </button>

          {bioOpen && (

            editMode ? (

              <textarea

                className="bio-textarea"

                value={person.biography}

                onChange={(e) => saveField({ biography: e.target.value })}

                rows={8}

              />

            ) : (

              <p className="bio-text">{person.biography || 'Биография не заполнена.'}</p>

            )

          )}

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

                      <div className="media-edit-meta">{m.type}: {m.filename}</div>

                      <div className="media-edit-row">

                        <input

                          value={m.description}

                          onChange={(e) => updateMedia({ ...m, description: e.target.value })}

                          placeholder="Описание"

                        />

                        <button type="button" className="btn tiny" onClick={() => removeMedia(m.id)} title="Удалить">

                          ×

                        </button>

                      </div>

                    </>

                  ) : (

                    <>{m.type}: {m.description || m.filename}</>

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

                      addMedia(

                        {

                          id,

                          type,

                          filename: file.name,

                          description: file.name,

                          personIds: [personId],

                        },

                        file,

                      );

                      updatePerson({ ...person, mediaIds: [...person.mediaIds, id] });

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

              Персона <strong>{formatPersonName(person)}</strong> будет удалена из проекта вместе со

              связями. Это действие нельзя отменить.

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



import { useMemo, useState } from 'react';
import type { Union } from '../../types';
import {
  formatMarriageDates,
  formatPersonName,
  getChildren,
  getExcludedIdsForLink,
  getParents,
  getUnions,
  type LinkKind,
} from '../../models/person-utils';
import { useProjectStore } from '../../store/project-store';
import { DateField } from './DossierFields';
import { PersonSearchDialog } from './PersonSearchDialog';
import './PersonRelationships.css';

interface PersonRelationshipsProps {
  personId: string;
  canEdit: boolean;
  onNavigate: (id: string) => void;
}

type PendingLink = { kind: LinkKind; unionId?: string };

function LinkPersonRow({
  id,
  label,
  canEdit,
  onNavigate,
  onUnlink,
}: {
  id: string;
  label: string;
  canEdit: boolean;
  onNavigate: (id: string) => void;
  onUnlink: () => void;
}) {
  return (
    <span className="relationship-chip">
      <button type="button" className="link-person" onClick={() => onNavigate(id)}>
        {label}
      </button>
      {canEdit && (
        <button
          type="button"
          className="relationship-chip__unlink"
          onClick={onUnlink}
          title="Удалить связь (персона останется в проекте)"
          aria-label="Удалить связь"
        >
          ×
        </button>
      )}
    </span>
  );
}

function LinkActions({
  createLabel,
  linkLabel,
  onCreate,
  onLink,
}: {
  createLabel: string;
  linkLabel: string;
  onCreate: () => void;
  onLink: () => void;
}) {
  return (
    <div className="relationship-actions">
      <button type="button" className="btn small primary" onClick={onCreate}>
        {createLabel}
      </button>
      <button type="button" className="btn small" onClick={onLink}>
        {linkLabel}
      </button>
    </div>
  );
}

const LINK_HINTS: Record<LinkKind, string> = {
  parent: 'Выберите персону, которая станет родителем. Нельзя выбрать потомков или уже добавленных родителей.',
  partner: 'Выберите партнёра для нового или существующего союза. Нельзя выбрать родителей, детей или текущих партнёров.',
  child: 'Выберите ребёнка для привязки. Нельзя выбрать родителей или уже добавленных детей.',
};

const LINK_TITLES: Record<LinkKind, string> = {
  parent: 'Привязать родителя',
  partner: 'Привязать партнёра',
  child: 'Привязать ребёнка',
};

export function PersonRelationships({ personId, canEdit, onNavigate }: PersonRelationshipsProps) {
  const project = useProjectStore((s) => s.project);
  const person = project?.persons[personId];
  const addPerson = useProjectStore((s) => s.addPerson);
  const linkParent = useProjectStore((s) => s.linkParent);
  const unlinkParent = useProjectStore((s) => s.unlinkParent);
  const linkPartner = useProjectStore((s) => s.linkPartner);
  const unlinkPartner = useProjectStore((s) => s.unlinkPartner);
  const linkChild = useProjectStore((s) => s.linkChild);
  const unlinkChild = useProjectStore((s) => s.unlinkChild);
  const updateUnion = useProjectStore((s) => s.updateUnion);
  const placeNewPersonNear = useProjectStore((s) => s.placeNewPersonNear);

  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);

  const excludeIds = useMemo(() => {
    if (!pendingLink || !project) return [personId];
    return getExcludedIdsForLink(project, personId, pendingLink.kind);
  }, [pendingLink, project, personId]);

  if (!project || !person) return null;

  const parents = getParents(project, person);
  const unions = getUnions(project, person);

  const hasAnyLinks =
    parents.length > 0 ||
    unions.some((u) => {
      const partner = u.partnerIds.map((id) => project.persons[id]).find((p) => p?.id !== personId);
      return partner || getChildren(project, u).length > 0 || formatMarriageDates(u);
    });

  const defaultPartnerGender = () => {
    if (person.gender === 'male') return 'female' as const;
    if (person.gender === 'female') return 'male' as const;
    return 'unknown' as const;
  };

  const createAndLink = (kind: LinkKind, unionId?: string) => {
    const gender = kind === 'partner' ? defaultPartnerGender() : 'unknown';
    const newPerson = addPerson({ gender });
    placeNewPersonNear(newPerson.id, personId);
    if (kind === 'parent') linkParent(personId, newPerson.id);
    else if (kind === 'partner') linkPartner(personId, newPerson.id);
    else linkChild(personId, newPerson.id, unionId);
  };

  const handleLinkSelect = (targetId: string) => {
    if (!pendingLink) return;
    if (pendingLink.kind === 'parent') linkParent(personId, targetId);
    else if (pendingLink.kind === 'partner') linkPartner(personId, targetId);
    else linkChild(personId, targetId, pendingLink.unionId);
    setPendingLink(null);
  };

  const openLink = (kind: LinkKind, unionId?: string) => setPendingLink({ kind, unionId });

  const renderUnion = (union: Union, index: number) => {
    const partner = union.partnerIds.map((id) => project.persons[id]).find((p) => p?.id !== personId);
    const children = getChildren(project, union);
    const marriageText = formatMarriageDates(union);
    const showUnion = canEdit || partner || children.length > 0 || !!marriageText;
    if (!showUnion) return null;

    const unionLabel = unions.length > 1 ? `Союз ${index + 1}` : 'Союз';

    return (
      <div key={union.id} className="relationship-group">
        <div className="relationship-group__title">{unionLabel}</div>

        {(canEdit || marriageText) && (
          <div className="relationship-subgroup">
            <span className="relationship-subgroup__label">Брак</span>
            <div className="relationship-subgroup__body">
              {canEdit ? (
                <div className="relationship-marriage-dates">
                  <DateField
                    label="Начало"
                    value={union.marriageStart}
                    onChange={(marriageStart) => updateUnion({ ...union, marriageStart })}
                  />
                  <DateField
                    label="Окончание"
                    value={union.marriageEnd}
                    onChange={(marriageEnd) => updateUnion({ ...union, marriageEnd })}
                  />
                </div>
              ) : (
                marriageText || <span className="muted">—</span>
              )}
            </div>
          </div>
        )}

        {(canEdit || partner) && (
          <div className="relationship-subgroup">
            <span className="relationship-subgroup__label">Партнёр</span>
            <div className="relationship-subgroup__body">
              {partner ? (
                <LinkPersonRow
                  id={partner.id}
                  label={formatPersonName(partner)}
                  canEdit={canEdit}
                  onNavigate={onNavigate}
                  onUnlink={() => unlinkPartner(personId, partner.id)}
                />
              ) : (
                canEdit && (
                  <>
                    <span className="muted relationship-empty">Не указан</span>
                    <LinkActions
                      createLabel="+ Создать партнёра"
                      linkLabel="Привязать…"
                      onCreate={() => createAndLink('partner')}
                      onLink={() => openLink('partner')}
                    />
                  </>
                )
              )}
            </div>
          </div>
        )}

        {(canEdit || children.length > 0) && (
          <div className="relationship-subgroup">
            <span className="relationship-subgroup__label">Дети</span>
            <div className="relationship-subgroup__body">
              <div className="relationship-chip-list">
                {children.map((c) => (
                  <LinkPersonRow
                    key={c.id}
                    id={c.id}
                    label={formatPersonName(c)}
                    canEdit={canEdit}
                    onNavigate={onNavigate}
                    onUnlink={() => unlinkChild(union.id, c.id)}
                  />
                ))}
                {!children.length && canEdit && <span className="muted relationship-empty">Нет детей</span>}
              </div>
              {canEdit && (
                <LinkActions
                  createLabel="+ Создать ребёнка"
                  linkLabel="Привязать…"
                  onCreate={() => createAndLink('child', union.id)}
                  onLink={() => openLink('child', union.id)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="dossier-relationships">
      <h3 className="dossier-relationships__heading">Связи</h3>

      {!canEdit && (
        <p className="relationship-view-hint">
          Для добавления, привязки или удаления связей переключитесь в режим «Редактировать» в шапке приложения.
        </p>
      )}

      {canEdit && !hasAnyLinks && (
        <p className="relationship-edit-hint">
          Добавьте родителей, партнёра или детей — создайте новую персону или привяжите существующую через поиск.
        </p>
      )}

      <div className="relationship-group">
        <div className="relationship-group__title">Родители</div>
        <div className="relationship-chip-list">
          {parents.map((p) => (
            <LinkPersonRow
              key={p.id}
              id={p.id}
              label={formatPersonName(p)}
              canEdit={canEdit}
              onNavigate={onNavigate}
              onUnlink={() => unlinkParent(personId, p.id)}
            />
          ))}
          {!parents.length && !canEdit && <span className="muted relationship-empty">Не указаны</span>}
        </div>
        {canEdit && (
          <LinkActions
            createLabel="+ Создать родителя"
            linkLabel="Привязать…"
            onCreate={() => createAndLink('parent')}
            onLink={() => openLink('parent')}
          />
        )}
      </div>

      {unions.map(renderUnion)}

      {canEdit && (
        <div className="relationship-group relationship-group--footer">
          <LinkActions
            createLabel="+ Новый партнёр"
            linkLabel="Привязать партнёра…"
            onCreate={() => createAndLink('partner')}
            onLink={() => openLink('partner')}
          />
          <LinkActions
            createLabel="+ Ребёнок без партнёра"
            linkLabel="Привязать ребёнка…"
            onCreate={() => createAndLink('child')}
            onLink={() => openLink('child')}
          />
        </div>
      )}

      {canEdit && pendingLink && (
        <PersonSearchDialog
          project={project}
          excludeIds={excludeIds}
          title={LINK_TITLES[pendingLink.kind]}
          hint={LINK_HINTS[pendingLink.kind]}
          onSelect={handleLinkSelect}
          onClose={() => setPendingLink(null)}
        />
      )}
    </section>
  );
}

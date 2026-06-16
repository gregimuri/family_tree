import type { Person, Project, ViewSettings } from '../../types';
import {
  formatCardAge,
  formatLifeDates,
  formatPersonName,
  getCardBirthSuffix,
  getPersonLocationCardText,
} from '../../models/person-utils';
import { personShowsCardPhoto, CARD_W } from '../../layout/card-dimensions';
import { buildCardNameFontLines, computeCardNameFontSizes, resolveCardTypography } from '../../layout/card-name-font';
import './PersonCard.css';

interface PersonCardProps {
  person: Person;
  project: Project;
  settings: ViewSettings;
  selected: boolean;
  highlighted: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: ViewSettings['theme'];
  getMediaUrl: (filename: string) => string | undefined;
  onClick: () => void;
  onDoubleClick: () => void;
  draggable?: boolean;
  manualPlaced?: boolean;
  layoutSelected?: boolean;
  screenToLayout?: (clientX: number, clientY: number) => { x: number; y: number } | null;
  onLayoutPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragMove?: (centerX: number, centerY: number) => void;
  onDragEnd?: (centerX: number, centerY: number) => void;
}

function buildCardBoxShadow(manualPlaced: boolean, showSelection: boolean): string | undefined {
  const parts: string[] = ['0 2px 10px rgba(28, 25, 23, 0.08)'];
  if (showSelection) {
    parts.unshift('0 4px 14px rgba(28, 25, 23, 0.12)');
    parts.unshift('0 0 0 2px #eab308');
  } else if (manualPlaced) {
    parts.unshift('0 0 0 2px rgba(45, 106, 79, 0.45)');
  } else {
    return undefined;
  }
  return parts.join(', ');
}

function trimField(value: string | undefined): string {
  return value?.trim() ?? '';
}

function BirthNameSuffix({
  current,
  birth,
  showBirth,
  fontSize,
}: {
  current: string | undefined;
  birth: string | undefined;
  showBirth: boolean;
  fontSize?: number;
}) {
  const suffix = getCardBirthSuffix(current, birth, showBirth);
  if (!suffix) return null;
  return (
    <span className="person-card-html__birth-name" style={fontSize ? { fontSize } : undefined}>
      {' '}
      ({suffix})
    </span>
  );
}

function SurnameBlock({
  person,
  showBirth,
  surnameSize,
  birthSurnameSize,
}: {
  person: Person;
  showBirth: boolean;
  surnameSize: number;
  birthSurnameSize?: number;
}) {
  const main = trimField(person.surname);
  const birth = getCardBirthSuffix(person.surname, person.birthSurname, showBirth);

  if (!main && birth) {
    return (
      <div className="person-card-html__surname" style={{ fontSize: surnameSize }}>
        ({birth})
      </div>
    );
  }

  if (!main) return null;

  return (
    <div className="person-card-html__surname-block">
      <div className="person-card-html__surname" style={{ fontSize: surnameSize }}>
        {main}
      </div>
      {birth ? (
        <div
          className="person-card-html__birth-surname"
          style={birthSurnameSize ? { fontSize: birthSurnameSize } : undefined}
        >
          ({birth})
        </div>
      ) : null}
    </div>
  );
}

function FullNameRow({
  person,
  showBirth,
  nameSize,
}: {
  person: Person;
  showBirth: boolean;
  nameSize: number;
}) {
  const given = trimField(person.givenName);
  const patronymic = trimField(person.patronymic);
  if (!given && !patronymic) return null;

  return (
    <div className="person-card-html__full-name">
      {given ? (
        <span className="person-card-html__given" style={{ fontSize: nameSize }}>
          {given}
          <BirthNameSuffix
            current={person.givenName}
            birth={person.birthGivenName}
            showBirth={showBirth}
            fontSize={nameSize}
          />
        </span>
      ) : null}
      {given && patronymic ? ' ' : null}
      {patronymic ? (
        <span className="person-card-html__patronymic" style={{ fontSize: nameSize }}>
          {patronymic}
          <BirthNameSuffix
            current={person.patronymic}
            birth={person.birthPatronymic}
            showBirth={showBirth}
            fontSize={nameSize}
          />
        </span>
      ) : null}
    </div>
  );
}

export function PersonCardWithMedia({
  person,
  project,
  settings,
  selected,
  highlighted,
  x,
  y,
  width,
  height,
  theme,
  getMediaUrl,
  onClick,
  onDoubleClick,
  draggable,
  manualPlaced,
  layoutSelected,
  screenToLayout,
  onLayoutPointerDown,
  onDragMove,
  onDragEnd,
}: PersonCardProps) {
  const cf = settings.cardFields;
  const borderColor =
    person.gender === 'male'
      ? theme === 'forest'
        ? '#1e40af'
        : '#2563eb'
      : person.gender === 'female'
        ? theme === 'forest'
          ? '#9d174d'
          : '#db2777'
        : '#78716c';
  const dates = formatLifeDates(person, cf.dateFormat);
  const ageLabel = cf.showAge ? formatCardAge(person) : null;
  const location = cf.showLocation ? getPersonLocationCardText(person) : null;
  const hasPhoto = personShowsCardPhoto(project, person, settings);
  const avatarUrl = hasPhoto
    ? (() => {
        const media = project.media[person.avatar!.mediaId];
        return media ? getMediaUrl(media.filename) : undefined;
      })()
    : undefined;

  const showBirth = cf.showBirthName;
  const cardScale = width / CARD_W;
  const nicknameAsPrimary = Boolean(cf.showNickname && person.nickname && cf.nicknamePriority);
  const hasDetails = Boolean(dates || ageLabel || location);
  const typography = resolveCardTypography(person, {
    showBirth,
    nicknameAsPrimary,
    width,
    height,
    hasPhoto,
    cardScale,
    footer: {
      hasDates: Boolean(dates),
      hasAge: Boolean(ageLabel),
      hasReligion: false,
      hasLocation: Boolean(location),
      hasNickname: Boolean(cf.showNickname && person.nickname && !cf.nicknamePriority),
    },
  });
  const { surname: surnameSize, given: nameLineSize } = typography;
  const metaSize = typography.meta;
  const secondarySize = typography.secondary;
  const nicknameSize = typography.nickname;
  const nameLines = buildCardNameFontLines(person, showBirth, nicknameAsPrimary);
  const nameFontSizes = computeCardNameFontSizes(nameLines, width, cardScale);
  const birthSurnameSize =
    !nicknameAsPrimary &&
    getCardBirthSuffix(person.surname, person.birthSurname, showBirth) &&
    person.surname?.trim()
      ? nameFontSizes[1]
      : undefined;

  const showSelection = selected || layoutSelected;
  const exportBorderColor = borderColor;
  const exportBoxShadow = buildCardBoxShadow(!!manualPlaced, false);

  const className = [
    'person-card',
    theme === 'forest' ? 'person-card--forest' : '',
    showSelection ? 'selected' : '',
    layoutSelected ? 'layout-selected' : '',
    highlighted ? 'highlighted' : '',
    draggable ? 'person-card--draggable' : '',
    manualPlaced ? 'person-card--manual' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const htmlClassName = [
    'person-card-html',
    'person-card-html--vertical',
    hasPhoto ? 'person-card-html--with-photo' : 'person-card-html--text-only',
    theme === 'forest' ? 'person-card-html--forest' : '',
    selected ? 'selected' : '',
    layoutSelected ? 'layout-selected' : '',
    manualPlaced ? 'manual-placed' : '',
    draggable ? 'person-card-html--draggable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handlePointerDown = draggable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (onLayoutPointerDown) {
          onLayoutPointerDown(e);
          return;
        }
        if (!screenToLayout) return;
        e.preventDefault();
        e.stopPropagation();

        const start = screenToLayout(e.clientX, e.clientY);
        if (!start) return;

        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);

        const offsetX = start.x - (x + width / 2);
        const offsetY = start.y - (y + height / 2);

        const move = (ev: PointerEvent) => {
          const pt = screenToLayout(ev.clientX, ev.clientY);
          if (!pt) return;
          onDragMove?.(pt.x - offsetX, pt.y - offsetY);
        };

        const up = (ev: PointerEvent) => {
          target.releasePointerCapture(ev.pointerId);
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
          const pt = screenToLayout(ev.clientX, ev.clientY);
          if (pt) onDragEnd?.(pt.x - offsetX, pt.y - offsetY);
        };

        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
      }
    : undefined;

  const hasIdentity =
    nicknameAsPrimary ||
    trimField(person.surname) ||
    trimField(person.givenName) ||
    trimField(person.patronymic) ||
    (cf.showNickname && person.nickname);

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      <rect
        width={width}
        height={height}
        rx={theme === 'forest' ? 8 : 12}
        fill="transparent"
        stroke="none"
      />
      <foreignObject x={0} y={0} width={width} height={height} overflow="hidden">
        <div
          className={htmlClassName}
          data-person-id={person.id}
          data-export-border={exportBorderColor}
          data-export-box-shadow={exportBoxShadow ?? ''}
          style={{
            width,
            height,
            borderColor: showSelection ? '#eab308' : borderColor,
            boxShadow: buildCardBoxShadow(!!manualPlaced, !!showSelection),
            ['--card-scale' as string]: cardScale,
          }}
          onPointerDown={handlePointerDown}
        >
          {draggable && (
            <div className="person-card-html__drag-hint" title="Перетащите для перемещения">
              ⋮⋮
            </div>
          )}
          {hasPhoto && avatarUrl && (
            <div className="person-card-html__photo">
              <img className="person-card-html__avatar" src={avatarUrl} alt="" />
            </div>
          )}
          <div className="person-card-html__body">
            {hasIdentity && (
              <section className="person-card-html__identity">
                {nicknameAsPrimary ? (
                  <div
                    className="person-card-html__nickname-primary"
                    style={{ fontSize: surnameSize }}
                  >
                    {person.nickname}
                  </div>
                ) : (
                  <>
                    <SurnameBlock
                      person={person}
                      showBirth={showBirth}
                      surnameSize={surnameSize}
                      birthSurnameSize={birthSurnameSize}
                    />
                    <FullNameRow
                      person={person}
                      showBirth={showBirth}
                      nameSize={nameLineSize}
                    />
                    {!trimField(person.surname) &&
                      !trimField(person.givenName) &&
                      !trimField(person.patronymic) && (
                        <div className="person-card-html__given">{formatPersonName(person)}</div>
                      )}
                  </>
                )}
                {cf.showNickname && person.nickname && !cf.nicknamePriority && (
                  <div className="person-card-html__nickname" style={{ fontSize: nicknameSize }}>
                    «{person.nickname}»
                  </div>
                )}
              </section>
            )}
            {hasDetails && (
              <section className="person-card-html__details">
                {(dates || ageLabel) && (
                  <div className="person-card-html__meta-row" style={{ fontSize: metaSize }}>
                    {dates && <span className="person-card-html__dates">{dates}</span>}
                    {ageLabel && (
                      <span className="person-card-html__age">
                        {dates ? ' · ' : ''}
                        {ageLabel}
                      </span>
                    )}
                  </div>
                )}
                {location && (
                  <div className="person-card-html__location" style={{ fontSize: secondarySize }}>
                    {location}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

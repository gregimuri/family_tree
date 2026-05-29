import type { Person, Project, ViewSettings } from '../../types';
import {
  calcAge,
  formatLifeDates,
  formatPersonName,
  getCardBirthSuffix,
  getPersonLocation,
} from '../../models/person-utils';
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
  screenToLayout?: (clientX: number, clientY: number) => { x: number; y: number } | null;
  onDragMove?: (centerX: number, centerY: number) => void;
  onDragEnd?: (centerX: number, centerY: number) => void;
}

function CardNameLine({
  text,
  birthSuffix,
  className,
}: {
  text: string;
  birthSuffix?: string | null;
  className: string;
}) {
  if (!text) return null;
  return (
    <div className={className}>
      <span>{text}</span>
      {birthSuffix && <span className="person-card-html__birth-part"> ({birthSuffix})</span>}
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
  screenToLayout,
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
  const age = cf.showAge ? calcAge(person) : null;
  const location = cf.showLocation ? getPersonLocation(person)?.name : null;
  const avatarUrl =
    cf.showPhoto && person.avatar
      ? (() => {
          const media = project.media[person.avatar!.mediaId];
          return media ? getMediaUrl(media.filename) : undefined;
        })()
      : undefined;

  const nicknameAsPrimary = cf.showNickname && person.nickname && cf.nicknamePriority;
  const showBirth = cf.showBirthName;
  const surnameBirth = getCardBirthSuffix(person.surname, person.birthSurname, showBirth);
  const givenBirth = getCardBirthSuffix(person.givenName, person.birthGivenName, showBirth);
  const patronymicBirth = getCardBirthSuffix(person.patronymic, person.birthPatronymic, showBirth);

  const className = [
    'person-card',
    theme === 'forest' ? 'person-card--forest' : '',
    selected ? 'selected' : '',
    highlighted ? 'highlighted' : '',
    draggable ? 'person-card--draggable' : '',
    manualPlaced ? 'person-card--manual' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleMouseDown = draggable
    ? (e: React.MouseEvent) => {
        if (e.button !== 0 || !screenToLayout) return;
        e.preventDefault();
        e.stopPropagation();

        const start = screenToLayout(e.clientX, e.clientY);
        if (!start) return;

        const offsetX = start.x - (x + width / 2);
        const offsetY = start.y - (y + height / 2);

        const move = (ev: MouseEvent) => {
          const pt = screenToLayout(ev.clientX, ev.clientY);
          if (!pt) return;
          onDragMove?.(pt.x - offsetX, pt.y - offsetY);
        };

        const up = (ev: MouseEvent) => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          const pt = screenToLayout(ev.clientX, ev.clientY);
          if (pt) onDragEnd?.(pt.x - offsetX, pt.y - offsetY);
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }
    : undefined;

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
      onMouseDown={handleMouseDown}
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
          className={`person-card-html ${theme === 'forest' ? 'person-card-html--forest' : ''} ${selected ? 'selected' : ''} ${manualPlaced ? 'manual-placed' : ''}`}
          style={{
            width,
            height,
            borderColor: selected ? '#eab308' : borderColor,
            boxShadow: selected ? '0 0 0 2px #eab308, 0 4px 14px rgba(28, 25, 23, 0.12)' : undefined,
          }}
        >
          {draggable && (
            <div className="person-card-html__drag-hint" title="Перетащите для перемещения">
              ⋮⋮
            </div>
          )}
          <div className="person-card-html__photo">
            {avatarUrl ? (
              <img className="person-card-html__avatar" src={avatarUrl} alt="" />
            ) : (
              <div className="person-card-html__avatar person-card-html__avatar--empty" />
            )}
          </div>
          <div className="person-card-html__names">
            {nicknameAsPrimary ? (
              <div className="person-card-html__nickname-primary">{person.nickname}</div>
            ) : (
              <>
                <CardNameLine
                  text={person.surname}
                  birthSuffix={surnameBirth}
                  className="person-card-html__surname"
                />
                <CardNameLine
                  text={person.givenName}
                  birthSuffix={givenBirth}
                  className="person-card-html__given"
                />
                <CardNameLine
                  text={person.patronymic}
                  birthSuffix={patronymicBirth}
                  className="person-card-html__patronymic"
                />
                {!person.surname && !person.givenName && !person.patronymic && (
                  <div className="person-card-html__given">{formatPersonName(person)}</div>
                )}
              </>
            )}
            {cf.showNickname && person.nickname && !cf.nicknamePriority && (
              <div className="person-card-html__nickname">«{person.nickname}»</div>
            )}
          </div>
          <div className="person-card-html__footer">
            {(dates || age !== null) && (
              <div className="person-card-html__meta">
                {dates && <span>{dates}</span>}
                {age !== null && <span>{age} лет</span>}
              </div>
            )}
            {location && <div className="person-card-html__location">{location}</div>}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

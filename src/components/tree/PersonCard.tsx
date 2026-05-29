import type { Person, Project, ViewSettings } from '../../types';
import {
  calcAge,
  formatLifeDates,
  formatPersonName,
  getPersonLocation,
} from '../../models/person-utils';
import { personShowsCardPhoto } from '../../layout/card-dimensions';
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

function cardNameLine(text: string | undefined): string {
  return text?.trim() ?? '';
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
  const hasPhoto = personShowsCardPhoto(project, person, settings);
  const avatarUrl = hasPhoto
    ? (() => {
        const media = project.media[person.avatar!.mediaId];
        return media ? getMediaUrl(media.filename) : undefined;
      })()
    : undefined;

  const showBirth = cf.showBirthName;
  const surname = showBirth
    ? cardNameLine(person.birthSurname) || cardNameLine(person.surname)
    : cardNameLine(person.surname);
  const givenName = showBirth
    ? cardNameLine(person.birthGivenName) || cardNameLine(person.givenName)
    : cardNameLine(person.givenName);
  const patronymic = showBirth
    ? cardNameLine(person.birthPatronymic) || cardNameLine(person.patronymic)
    : cardNameLine(person.patronymic);
  const nicknameAsPrimary = cf.showNickname && person.nickname && cf.nicknamePriority;

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

  const htmlClassName = [
    'person-card-html',
    'person-card-html--vertical',
    hasPhoto ? 'person-card-html--with-photo' : 'person-card-html--text-only',
    theme === 'forest' ? 'person-card-html--forest' : '',
    selected ? 'selected' : '',
    manualPlaced ? 'manual-placed' : '',
    draggable ? 'person-card-html--draggable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handlePointerDown = draggable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !screenToLayout) return;
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
          style={{
            width,
            height,
            borderColor: selected ? '#eab308' : borderColor,
            boxShadow: selected ? '0 0 0 2px #eab308, 0 4px 14px rgba(28, 25, 23, 0.12)' : undefined,
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
            <div className="person-card-html__names">
              {nicknameAsPrimary ? (
                <div className="person-card-html__nickname-primary">{person.nickname}</div>
              ) : (
                <>
                  {surname && <div className="person-card-html__surname">{surname}</div>}
                  {givenName && <div className="person-card-html__given">{givenName}</div>}
                  {patronymic && <div className="person-card-html__patronymic">{patronymic}</div>}
                  {!surname && !givenName && !patronymic && (
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
        </div>
      </foreignObject>
    </g>
  );
}

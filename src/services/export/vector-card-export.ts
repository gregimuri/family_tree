import type { LayoutNode, Person, Project, ViewSettings } from '../../types';
import { personShowsCardPhoto, CARD_W } from '../../layout/card-dimensions';
import { resolveCardTypography } from '../../layout/card-name-font';
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from './pdf-font';
import {
  formatCardAge,
  formatLifeDates,
  getCardBirthSuffix,
  getPersonLocationCardText,
} from '../../models/person-utils';
import { formatReligion } from '../../models/religion';

const SVG_NS = 'http://www.w3.org/2000/svg';

function cardBorderColor(person: Person, theme: ViewSettings['theme']): string {
  if (person.gender === 'male') return theme === 'forest' ? '#1e40af' : '#2563eb';
  if (person.gender === 'female') return theme === 'forest' ? '#9d174d' : '#db2777';
  return '#78716c';
}

function appendText(
  parent: SVGGElement,
  x: number,
  y: number,
  text: string,
  options: {
    fontSize: number;
    fontWeight?: number;
    fill?: string;
    fontFamily?: string;
  },
): void {
  if (!text.trim()) return;
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('font-size', String(options.fontSize));
  el.setAttribute('fill', options.fill ?? '#44403c');
  el.setAttribute('font-family', options.fontFamily ?? PDF_FONT_REGULAR);
  if (options.fontWeight) el.setAttribute('font-weight', String(options.fontWeight));
  el.textContent = text;
  parent.appendChild(el);
}

function appendTspan(
  parent: SVGTextElement,
  text: string,
  options: { fontSize: number; fill?: string; fontFamily?: string; fontWeight?: number },
): void {
  if (!text) return;
  const tspan = document.createElementNS(SVG_NS, 'tspan');
  tspan.setAttribute('font-size', String(options.fontSize));
  tspan.setAttribute('fill', options.fill ?? '#44403c');
  tspan.setAttribute('font-family', options.fontFamily ?? PDF_FONT_REGULAR);
  if (options.fontWeight) tspan.setAttribute('font-weight', String(options.fontWeight));
  tspan.textContent = text;
  parent.appendChild(tspan);
}

function appendCombinedFullName(
  parent: SVGGElement,
  x: number,
  y: number,
  given: string | undefined,
  birthGiven: string | undefined,
  patronymic: string | undefined,
  birthPatronymic: string | undefined,
  showBirth: boolean,
  givenSize: number,
  patronymicSize: number,
  fontFamily: string,
): number {
  const givenMain = (given ?? '').trim();
  const patronymicMain = (patronymic ?? '').trim();
  if (!givenMain && !patronymicMain) return y;

  const givenSuffix = getCardBirthSuffix(given, birthGiven, showBirth);
  const patronymicSuffix = getCardBirthSuffix(patronymic, birthPatronymic, showBirth);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', fontFamily);

  if (givenMain) {
    appendTspan(text, givenMain, { fontSize: givenSize, fill: '#1c1917', fontFamily });
    if (givenSuffix) {
      appendTspan(text, ` (${givenSuffix})`, {
        fontSize: givenSize,
        fill: '#78716c',
        fontFamily,
      });
    }
  }
  if (patronymicMain) {
    if (givenMain) {
      appendTspan(text, '\u00a0', { fontSize: givenSize, fill: '#1c1917', fontFamily });
    }
    appendTspan(text, patronymicMain, {
      fontSize: patronymicSize,
      fill: '#57534e',
      fontFamily,
    });
    if (patronymicSuffix) {
      appendTspan(text, ` (${patronymicSuffix})`, {
        fontSize: patronymicSize,
        fill: '#78716c',
        fontFamily,
      });
    }
  }

  parent.appendChild(text);
  return y + Math.max(givenSize, patronymicSize) * 1.25;
}

export async function replaceForeignObjectsWithVectorCards(
  clone: SVGSVGElement,
  personNodes: LayoutNode[],
  project: Project,
  getMediaUrl: (filename: string) => string | undefined,
): Promise<void> {
  const settings = project.viewSettings;
  const cf = settings.cardFields;
  const theme = settings.theme;
  const cardGroups = [...clone.querySelectorAll('g.person-card')];

  for (let i = 0; i < cardGroups.length; i++) {
    const cardGroup = cardGroups[i];
    const foreignObject = cardGroup?.querySelector('foreignObject');
    const node = personNodes[i];
    if (!foreignObject || !node?.personId) continue;

    const person = project.persons[node.personId];
    if (!person) continue;

    const x = Number.parseFloat(foreignObject.getAttribute('x') ?? '0');
    const y = Number.parseFloat(foreignObject.getAttribute('y') ?? '0');
    const width = Number.parseFloat(foreignObject.getAttribute('width') ?? '120');
    const height = Number.parseFloat(foreignObject.getAttribute('height') ?? '80');
    const cardScale = width / CARD_W;
    const cx = width / 2;
    const border = cardBorderColor(person, theme);
    const fontFamily = PDF_FONT_REGULAR;
    const fontFamilyBold = PDF_FONT_BOLD;
    const bg = theme === 'forest' ? '#fafaf9' : '#ffffff';
    const rx = theme === 'forest' ? 8 : 12;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', `translate(${x} ${y})`);

    const cardRect = document.createElementNS(SVG_NS, 'rect');
    cardRect.setAttribute('width', String(width));
    cardRect.setAttribute('height', String(height));
    cardRect.setAttribute('rx', String(rx));
    cardRect.setAttribute('fill', bg);
    cardRect.setAttribute('stroke', border);
    cardRect.setAttribute('stroke-width', '2');
    group.appendChild(cardRect);

    const hasPhoto = personShowsCardPhoto(project, person, settings);
    const photoH = hasPhoto ? Math.round((height * 8) / 12) : 0;
    let textY = hasPhoto ? photoH + 14 : 14;

    if (hasPhoto && person.avatar?.mediaId) {
      const media = project.media[person.avatar.mediaId];
      const url = media ? getMediaUrl(media.filename) : undefined;
      if (url) {
        try {
          const response = await fetch(url, { cache: 'force-cache' });
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const clipId = `card-photo-${i}`;
          const defs =
            clone.querySelector('defs') ??
            (() => {
              const d = document.createElementNS(SVG_NS, 'defs');
              clone.insertBefore(d, clone.firstChild);
              return d;
            })();
          const clip = document.createElementNS(SVG_NS, 'clipPath');
          clip.setAttribute('id', clipId);
          const clipRect = document.createElementNS(SVG_NS, 'rect');
          clipRect.setAttribute('width', String(width));
          clipRect.setAttribute('height', String(photoH));
          clip.appendChild(clipRect);
          defs.appendChild(clip);

          const image = document.createElementNS(SVG_NS, 'image');
          image.setAttribute('href', dataUrl);
          image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
          image.setAttribute('x', '0');
          image.setAttribute('y', '0');
          image.setAttribute('width', String(width));
          image.setAttribute('height', String(photoH));
          image.setAttribute('clip-path', `url(#${clipId})`);
          image.setAttribute('preserveAspectRatio', 'xMidYMin slice');
          group.appendChild(image);

          const divider = document.createElementNS(SVG_NS, 'line');
          divider.setAttribute('x1', '0');
          divider.setAttribute('y1', String(photoH));
          divider.setAttribute('x2', String(width));
          divider.setAttribute('y2', String(photoH));
          divider.setAttribute('stroke', '#e7e5e4');
          divider.setAttribute('stroke-width', '1');
          group.appendChild(divider);
        } catch {
          /* photo optional */
        }
      }
    }

    const nicknameAsPrimary = Boolean(cf.showNickname && person.nickname && cf.nicknamePriority);
    const dates = formatLifeDates(person, cf.dateFormat);
    const ageLabel = cf.showAge ? formatCardAge(person) : null;
    const religionText =
      cf.showReligion && (person.religion ?? 'none') !== 'none'
        ? formatReligion(person.religion)
        : null;
    const location = cf.showLocation ? getPersonLocationCardText(person) : null;

    const typography = resolveCardTypography(person, {
      showBirth: cf.showBirthName,
      nicknameAsPrimary,
      width,
      height,
      hasPhoto,
      cardScale,
      footer: {
        hasDates: Boolean(dates),
        hasAge: Boolean(ageLabel),
        hasReligion: Boolean(religionText),
        hasLocation: Boolean(location),
        hasNickname: Boolean(cf.showNickname && person.nickname && !cf.nicknamePriority),
      },
    });

    if (nicknameAsPrimary) {
      appendText(group, cx, textY, person.nickname!, {
        fontSize: typography.surname,
        fontWeight: 700,
        fontFamily: fontFamilyBold,
      });
      textY += typography.surname * 1.25;
    } else {
      const surnameMainSize = typography.surname;
      const surnameBirthSize = typography.surname * 0.9;
      const surnameMain = (person.surname ?? '').trim();
      const surnameBirth = getCardBirthSuffix(person.surname, person.birthSurname, cf.showBirthName);

      if (!surnameMain && surnameBirth) {
        appendText(group, cx, textY, `(${surnameBirth})`, {
          fontSize: surnameMainSize,
          fontWeight: 700,
          fill: '#1c1917',
          fontFamily: fontFamilyBold,
        });
        textY += surnameMainSize * 1.25;
      } else {
        if (surnameMain) {
          appendText(group, cx, textY, surnameMain, {
            fontSize: surnameMainSize,
            fontWeight: 700,
            fill: '#1c1917',
            fontFamily: fontFamilyBold,
          });
          textY += surnameMainSize * 1.2;
        }
        if (surnameBirth && surnameMain) {
          appendText(group, cx, textY, `(${surnameBirth})`, {
            fontSize: surnameBirthSize,
            fill: '#78716c',
            fontFamily,
          });
          textY += surnameBirthSize * 1.2;
        }
      }

      textY = appendCombinedFullName(
        group,
        cx,
        textY + 1,
        person.givenName,
        person.birthGivenName,
        person.patronymic,
        person.birthPatronymic,
        cf.showBirthName,
        typography.given,
        typography.patronymic,
        fontFamily,
      );
      if (cf.showNickname && person.nickname && !cf.nicknamePriority) {
        appendText(group, cx, textY, `«${person.nickname}»`, {
          fontSize: typography.nickname,
          fill: '#78716c',
          fontFamily,
        });
        textY += typography.nickname * 1.25 + 2;
      }
    }

    const hasDetails = Boolean(dates || ageLabel || religionText || location);
    if (hasDetails) {
      const detailsTop = textY + 3;
      const divider = document.createElementNS(SVG_NS, 'line');
      divider.setAttribute('x1', String(width * 0.12));
      divider.setAttribute('y1', String(detailsTop));
      divider.setAttribute('x2', String(width * 0.88));
      divider.setAttribute('y2', String(detailsTop));
      divider.setAttribute('stroke', '#e7e5e4');
      divider.setAttribute('stroke-width', '1');
      group.appendChild(divider);
      textY = detailsTop + 8;
    }

    if (dates || ageLabel) {
      const metaLine = [dates, ageLabel].filter(Boolean).join(' · ');
      appendText(group, cx, textY, metaLine, {
        fontSize: typography.meta,
        fill: '#57534e',
        fontFamily,
      });
      textY += typography.meta * 1.25;
    }

    if (religionText) {
      appendText(group, cx, textY + 1, religionText, {
        fontSize: typography.secondary,
        fill: '#78716c',
        fontFamily,
      });
      textY += typography.secondary * 1.25 + 1;
    }

    if (location) {
      appendText(group, cx, textY + 2, location, {
        fontSize: typography.secondary,
        fill: '#78716c',
        fontFamily,
      });
    }

    foreignObject.parentNode?.replaceChild(group, foreignObject);
  }
}

export function getExportPersonNodes(layout: { nodes: LayoutNode[] }): LayoutNode[] {
  return layout.nodes.filter((n) => n.kind === 'person' && n.personId);
}

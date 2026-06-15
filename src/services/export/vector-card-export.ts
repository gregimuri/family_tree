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

function buildNameLine(
  parent: SVGGElement,
  x: number,
  y: number,
  current: string | undefined,
  birth: string | undefined,
  showBirth: boolean,
  mainFontSize: number,
  birthFontSize: number,
  fontWeight: number,
  fill: string,
  fontFamily: string,
  birthOnNewLine = false,
): number {
  const main = (current ?? '').trim();
  const suffix = getCardBirthSuffix(current, birth, showBirth);
  if (!main && !suffix) return y;
  if (!birthOnNewLine) {
    const line = !main && suffix ? `(${suffix})` : suffix ? `${main} (${suffix})` : main;
    appendText(parent, x, y, line, { fontSize: mainFontSize, fontWeight, fill, fontFamily });
    return y + mainFontSize * 1.25;
  }
  if (!main && suffix) {
    appendText(parent, x, y, `(${suffix})`, {
      fontSize: mainFontSize,
      fontWeight,
      fill: '#78716c',
      fontFamily,
    });
    return y + mainFontSize * 1.25;
  }
  if (main) {
    appendText(parent, x, y, main, { fontSize: mainFontSize, fontWeight, fill, fontFamily });
    y += mainFontSize * 1.25;
  }
  if (suffix) {
    appendText(parent, x, y, `(${suffix})`, {
      fontSize: birthFontSize,
      fontWeight: 400,
      fill: '#78716c',
      fontFamily,
    });
    y += birthFontSize * 1.25;
  }
  return y;
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

      textY = buildNameLine(
        group,
        cx,
        textY,
        person.surname,
        person.birthSurname,
        cf.showBirthName,
        surnameMainSize,
        surnameBirthSize,
        700,
        '#1c1917',
        fontFamilyBold,
        true,
      );
      textY = buildNameLine(
        group,
        cx,
        textY,
        person.givenName,
        person.birthGivenName,
        cf.showBirthName,
        typography.given,
        typography.given,
        400,
        '#1c1917',
        fontFamily,
      );
      textY = buildNameLine(
        group,
        cx,
        textY,
        person.patronymic,
        person.birthPatronymic,
        cf.showBirthName,
        typography.patronymic,
        typography.patronymic,
        400,
        '#57534e',
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

    if (dates) {
      appendText(group, cx, textY, dates, {
        fontSize: typography.meta,
        fill: '#57534e',
        fontFamily,
      });
      textY += typography.meta * 1.25;
    }
    if (ageLabel) {
      appendText(group, cx, textY, `(${ageLabel})`, {
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

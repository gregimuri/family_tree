import type { LayoutNode, Person, Project, ViewSettings } from '../../types';
import { personShowsCardPhoto } from '../../layout/card-dimensions';
import { computeCardNameFontSizes } from '../../layout/card-name-font';
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
  el.setAttribute('font-family', options.fontFamily ?? 'system-ui, sans-serif');
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
  fontSize: number,
  fontWeight: number,
  fill: string,
  fontFamily: string,
): number {
  const main = (current ?? '').trim();
  const suffix = getCardBirthSuffix(current, birth, showBirth);
  if (!main && !suffix) return y;
  const line = suffix ? `${main} (${suffix})` : main;
  appendText(parent, x, y, line, { fontSize, fontWeight, fill, fontFamily });
  return y + fontSize * 1.25;
}

function buildLineText(
  current: string | undefined,
  birth: string | undefined,
  showBirth: boolean,
): string {
  const main = (current ?? '').trim();
  const suffix = getCardBirthSuffix(current, birth, showBirth);
  if (!main && suffix) return `(${suffix})`;
  if (suffix) return `${main} (${suffix})`;
  return main;
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
    const cx = width / 2;
    const border = cardBorderColor(person, theme);
    const fontFamily =
      theme === 'forest' ? "Georgia, 'Times New Roman', serif" : 'system-ui, sans-serif';
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

    const nicknameAsPrimary = cf.showNickname && person.nickname && cf.nicknamePriority;
    const nameLines = nicknameAsPrimary
      ? [{ text: person.nickname ?? '', base: 11 }]
      : [
          {
            text: buildLineText(person.surname, person.birthSurname, cf.showBirthName),
            base: 11,
          },
          {
            text: buildLineText(person.givenName, person.birthGivenName, cf.showBirthName),
            base: 10,
          },
          {
            text: buildLineText(person.patronymic, person.birthPatronymic, cf.showBirthName),
            base: 9,
          },
        ];
    const nameSizes = computeCardNameFontSizes(nameLines, width);

    if (nicknameAsPrimary) {
      appendText(group, cx, textY, person.nickname!, {
        fontSize: nameSizes[0],
        fontWeight: 700,
        fontFamily,
      });
      textY += nameSizes[0] * 1.25;
    } else {
      textY = buildNameLine(
        group,
        cx,
        textY,
        person.surname,
        person.birthSurname,
        cf.showBirthName,
        nameSizes[0],
        700,
        '#1c1917',
        fontFamily,
      );
      textY = buildNameLine(
        group,
        cx,
        textY,
        person.givenName,
        person.birthGivenName,
        cf.showBirthName,
        nameSizes[1],
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
        nameSizes[2],
        400,
        '#57534e',
        fontFamily,
      );
      if (cf.showNickname && person.nickname && !cf.nicknamePriority) {
        appendText(group, cx, textY, `«${person.nickname}»`, {
          fontSize: 9,
          fill: '#78716c',
          fontFamily,
        });
        textY += 12;
      }
    }

    const dates = formatLifeDates(person, cf.dateFormat);
    const ageLabel = cf.showAge ? formatCardAge(person) : null;
    if (dates) {
      appendText(group, cx, Math.min(textY, height - 10), dates, {
        fontSize: 9,
        fill: '#57534e',
        fontFamily,
      });
      textY += 11;
    }
    if (ageLabel) {
      appendText(group, cx, Math.min(textY, height - 10), `(${ageLabel})`, {
        fontSize: 9,
        fill: '#57534e',
        fontFamily,
      });
      textY += 11;
    }

    const religion =
      cf.showReligion && (person.religion ?? 'none') !== 'none'
        ? formatReligion(person.religion)
        : null;
    if (religion) {
      appendText(group, cx, Math.min(textY + 1, height - 6), religion, {
        fontSize: 8,
        fill: '#78716c',
        fontFamily,
      });
      textY += 10;
    }

    const location = cf.showLocation ? getPersonLocationCardText(person) : null;
    if (location) {
      appendText(group, cx, Math.min(textY + 2, height - 4), location, {
        fontSize: 8,
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

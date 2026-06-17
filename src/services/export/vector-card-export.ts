import type { LayoutNode, Person, Project, ViewSettings } from '../../types';
import { personShowsCardPhoto, CARD_W, CARD_PHOTO_CELLS, CARD_BODY_CELLS } from '../../layout/card-dimensions';
import { buildCardNameLines, type CardNameLineEmphasis } from '../../layout/card-display-lines';
import { resolveCardTypography, scaleCardMetaFontSize } from '../../layout/card-name-font';
import { normalizeAvatarCrop } from '../../utils/avatar-crop';
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from './pdf-font';
import {
  formatCardAge,
  formatLifeDates,
  getPersonLocationCardText,
} from '../../models/person-utils';

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

function lineStyle(emphasis: CardNameLineEmphasis): {
  fill: string;
  fontWeight?: number;
  fontFamily: string;
  lineHeight: number;
} {
  switch (emphasis) {
    case 'surname':
      return { fill: '#1c1917', fontWeight: 700, fontFamily: PDF_FONT_BOLD, lineHeight: 1.2 };
    case 'birth':
      return { fill: '#78716c', fontFamily: PDF_FONT_REGULAR, lineHeight: 1.18 };
    case 'nickname':
      return { fill: '#78716c', fontFamily: PDF_FONT_REGULAR, lineHeight: 1.18 };
    default:
      return { fill: '#1c1917', fontWeight: 500, fontFamily: PDF_FONT_REGULAR, lineHeight: 1.18 };
  }
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
    const height = Number.parseFloat(foreignObject.getAttribute('height') ?? '120');
    const cardScale = width / CARD_W;
    const cx = width / 2;
    const border = cardBorderColor(person, theme);
    const fontFamily = PDF_FONT_REGULAR;
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
    const photoH = hasPhoto
      ? Math.round((height * CARD_PHOTO_CELLS) / (CARD_PHOTO_CELLS + CARD_BODY_CELLS))
      : 0;
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

          const crop = person.avatar ? normalizeAvatarCrop(person.avatar) : { x: 0, y: 0, width: 1, height: 1 };
          const imgW = width / crop.width;
          const imgH = photoH / crop.height;

          const image = document.createElementNS(SVG_NS, 'image');
          image.setAttribute('href', dataUrl);
          image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
          image.setAttribute('x', String(-crop.x * imgW));
          image.setAttribute('y', String(-crop.y * imgH));
          image.setAttribute('width', String(imgW));
          image.setAttribute('height', String(imgH));
          image.setAttribute('clip-path', `url(#${clipId})`);
          image.setAttribute('preserveAspectRatio', 'none');
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
    const location = cf.showLocation ? getPersonLocationCardText(person) : null;
    const nameLines = buildCardNameLines(person, {
      showBirth: cf.showBirthName,
      showNickname: Boolean(cf.showNickname),
      nicknameAsPrimary,
    });

    const typography = resolveCardTypography(person, {
      showBirth: cf.showBirthName,
      showNickname: Boolean(cf.showNickname),
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
      },
    });

    for (let lineIndex = 0; lineIndex < nameLines.length; lineIndex++) {
      const line = nameLines[lineIndex]!;
      const size = typography.lineSizes[lineIndex] ?? line.base * cardScale;
      const style = lineStyle(line.emphasis);
      appendText(group, cx, textY, line.text, {
        fontSize: size,
        fontWeight: style.fontWeight,
        fill: style.fill,
        fontFamily: style.fontFamily,
      });
      textY += size * style.lineHeight;
    }

    const hasDetails = Boolean(dates || ageLabel || location);
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

    if (dates) {
      const datesSize = scaleCardMetaFontSize(dates, typography.meta, width);
      appendText(group, cx, textY, dates, {
        fontSize: datesSize,
        fill: '#57534e',
        fontFamily,
      });
      textY += datesSize * 1.25;
    }

    if (ageLabel) {
      appendText(group, cx, textY, ageLabel, {
        fontSize: typography.meta,
        fill: '#57534e',
        fontFamily,
      });
      textY += typography.meta * 1.25;
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

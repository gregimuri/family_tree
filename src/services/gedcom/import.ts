import type { DateValue, Person, Project, Union, MediaItem } from '../../types';
import { createEmptyPerson, defaultViewSettings } from '../../models/defaults';
import { repairProjectRelationships, sortChildrenByAge } from '../../models/person-utils';

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function splitRussianName(givenPart: string, surname: string): {
  givenName: string;
  surname: string;
  patronymic: string;
} {
  const safeGiven = givenPart ?? '';
  const tokens = safeGiven.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    return {
      givenName: tokens[0],
      patronymic: tokens.slice(1).join(' '),
      surname: surname ?? '',
    };
  }
  if (tokens.length === 2) {
    return { givenName: tokens[0], patronymic: tokens[1], surname: surname ?? '' };
  }
  return { givenName: tokens[0] ?? safeGiven, patronymic: '', surname: surname ?? '' };
}

export function parseGedcomName(value: string): { givenName: string; surname: string; patronymic: string } {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { givenName: '', surname: '', patronymic: '' };

  const slashMatch = trimmed.match(/^(.+?)\s+\/([^/]*)\/(.*)$/);
  if (slashMatch) {
    const givenPart = slashMatch[1].trim();
    const surname = slashMatch[2].trim();
    return splitRussianName(givenPart, surname);
  }

  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { givenName: '', surname: '', patronymic: '' };
    if (parts.length === 1) {
      if (trimmed.startsWith('/')) return splitRussianName('', parts[0]);
      return splitRussianName(parts[0], '');
    }
    return splitRussianName(parts[0], parts[parts.length - 1] ?? '');
  }

  return splitRussianName(trimmed, '');
}

export function parseGedcomDate(value?: string): DateValue | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const julian = /@#DJULIAN@/i.test(raw);

  const withJulian = (d: DateValue): DateValue => (julian ? { ...d, julian: true } : d);

  if (raw === '?' || /^unknown$/i.test(raw)) return withJulian({ text: raw });

  const dmy = raw.match(/^(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{4})$/);
  if (dmy) return withJulian({ day: +dmy[1], month: +dmy[2], year: +dmy[3] });

  let ged = raw.replace(/@#[^@]+@\s*/g, ' ').replace(/\s+/g, ' ').trim();

  const betRange = ged.match(/\bBET(?:WEEN)?\s+(\d{4})\s+AND\s+(\d{4})\b/i);
  if (betRange) return withJulian({ year: +betRange[1], text: raw });

  const fromTo = ged.match(/\bFROM\s+(\d{4})\s+TO\s+(\d{4})\b/i);
  if (fromTo) return withJulian({ year: +fromTo[1], text: raw });

  const yearRange = ged.match(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/);
  if (yearRange) return withJulian({ year: +yearRange[1], text: raw });

  ged = ged.replace(/\b(ABT|ABOUT|BEF|AFT|CAL|EST|FROM|TO|BET|AND|BETWEEN)\b/gi, ' ').replace(/\s+/g, ' ').trim();

  const dayMonYear = ged.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i);
  if (dayMonYear) {
    const month = MONTHS[dayMonYear[2].toUpperCase()];
    if (month) {
      const result: DateValue = { day: +dayMonYear[1], month, year: +dayMonYear[3] };
      if (/ABT|BEF|AFT|CAL|EST|FROM|TO|BET/i.test(raw)) result.text = raw;
      return withJulian(result);
    }
  }

  const monYear = ged.match(/^([A-Z]{3})\s+(\d{4})$/i);
  if (monYear) {
    const month = MONTHS[monYear[1].toUpperCase()];
    if (month) return withJulian({ month, year: +monYear[2], text: raw });
  }

  const yearOnly = ged.match(/^(\d{4})$/);
  if (yearOnly) {
    const result: DateValue = { year: +yearOnly[1] };
    if (raw !== yearOnly[1]) result.text = raw;
    return withJulian(result);
  }

  const anyYear = raw.match(/\b(\d{4})\b/);
  if (anyYear) return withJulian({ year: +anyYear[1], text: raw });

  return withJulian({ text: raw });
}

interface GedLine {
  level: number;
  tag: string;
  value?: string;
  xref?: string;
}

function parseLines(text: string): GedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(@\S+@\s+)?(\S+)(?:\s+(.*))?$/);
      if (!m) return null;
      return {
        level: +m[1],
        xref: m[2]?.trim().replace(/@/g, ''),
        tag: m[3],
        value: m[4],
      };
    })
    .filter(Boolean) as GedLine[];
}

function applyNameSubtag(person: Person, tag: string, value?: string) {
  if (!value?.trim()) return;
  const v = value.trim();
  if (tag === 'GIVN') {
    const parsed = splitRussianName(v, person.surname);
    person.givenName = parsed.givenName;
    person.patronymic = parsed.patronymic || person.patronymic;
    if (!person.surname && parsed.surname) person.surname = parsed.surname;
  }
  if (tag === 'SURN') {
    person.birthSurname = v;
    person.surname = v;
  }
  if (tag === '_MARNM') {
    person.surname = v;
  }
}

function pickCenter(project: Project): Project['center'] {
  let bestId = '';
  let bestScore = -1;

  for (const person of Object.values(project.persons)) {
    const score =
      person.parentUnionIds.length * 2 +
      person.unionIds.length * 2 +
      person.parentUnionIds.reduce((n, uid) => {
        const u = project.unions[uid];
        return n + (u?.childIds.length ?? 0);
      }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestId = person.id;
    }
  }

  if (!bestId) {
    const first = Object.values(project.persons)[0];
    return first ? { type: 'person', id: first.id } : { type: 'person', id: 'unknown' };
  }

  const person = project.persons[bestId];
  if (person.unionIds.length > 0) {
    return { type: 'family', id: person.unionIds[0] };
  }
  return { type: 'person', id: bestId };
}

export function importGedcom(text: string, projectName = 'Импорт GEDCOM'): Project {
  const lines = parseLines(text);
  const now = new Date().toISOString();

  const indiMap = new Map<string, Person>();
  const famMap = new Map<string, Partial<Union> & { id: string }>();
  const mediaMap = new Map<string, MediaItem>();

  let currentIndi: string | null = null;
  let currentFam: string | null = null;
  let currentObje: string | null = null;
  const stack: string[] = [];

  const addMediaToPerson = (personId: string, mediaId: string) => {
    const person = indiMap.get(personId);
    if (!person || person.mediaIds.includes(mediaId)) return;
    person.mediaIds.push(mediaId);
    const media = mediaMap.get(mediaId);
    if (media && !media.personIds.includes(personId)) {
      media.personIds.push(personId);
    }
  };

  for (const line of lines) {
    while (stack.length > line.level) stack.pop();

    if (line.level === 0 && line.tag === 'INDI' && line.xref) {
      currentIndi = line.xref;
      currentFam = null;
      currentObje = null;
      stack.length = 0;
      indiMap.set(currentIndi, createEmptyPerson({ id: currentIndi }));
      continue;
    }

    if (line.level === 0 && line.tag === 'FAM' && line.xref) {
      currentFam = line.xref;
      currentIndi = null;
      currentObje = null;
      stack.length = 0;
      famMap.set(currentFam, { id: currentFam, partnerIds: [], childIds: [] });
      continue;
    }

    if (line.level === 0) {
      currentIndi = null;
      currentFam = null;
      currentObje = null;
      stack.length = 0;
      continue;
    }

    if (currentIndi && indiMap.has(currentIndi)) {
      const person = indiMap.get(currentIndi)!;
      const parentTag = stack[0];

      if (line.level === 1) {
        stack.length = 0;
        stack.push(line.tag);
        currentObje = null;

        if (line.tag === 'NAME' && line.value) {
          const parsed = parseGedcomName(line.value);
          person.givenName = parsed.givenName;
          person.surname = parsed.surname;
          person.patronymic = parsed.patronymic;
        }
        if (line.tag === 'SEX') {
          person.gender = line.value === 'F' ? 'female' : line.value === 'M' ? 'male' : 'unknown';
        }
        if (line.tag === 'BIRT') person.birth = person.birth ?? {};
        if (line.tag === 'DEAT') person.death = person.death ?? {};
        if (line.tag === 'BURI') person.burial = person.burial ?? { name: '' };
        if (line.tag === 'FAMC' && line.value) {
          const famId = line.value.replace(/@/g, '');
          if (!person.parentUnionIds.includes(famId)) person.parentUnionIds.push(famId);
        }
        if (line.tag === 'FAMS' && line.value) {
          const famId = line.value.replace(/@/g, '');
          if (!person.unionIds.includes(famId)) person.unionIds.push(famId);
        }
        if (line.tag === 'OBJE') {
          currentObje = line.value?.replace(/@/g, '') ?? `obje-${currentIndi}-${person.mediaIds.length}`;
          if (!mediaMap.has(currentObje)) {
            mediaMap.set(currentObje, {
              id: currentObje,
              type: 'photo',
              filename: '',
              description: '',
              personIds: [currentIndi],
            });
          }
          addMediaToPerson(currentIndi, currentObje);
        }
      } else if (line.level >= 2) {
        if (line.level === 2) stack[1] = line.tag;

        if (parentTag === 'NAME') {
          applyNameSubtag(person, line.tag, line.value);
        }
        if (parentTag === 'BIRT') {
          if (line.tag === 'DATE') person.birth!.date = parseGedcomDate(line.value);
          if (line.tag === 'PLAC') person.birth!.place = { name: line.value ?? '' };
        }
        if (parentTag === 'DEAT') {
          if (line.tag === 'DATE') person.death!.date = parseGedcomDate(line.value);
          if (line.tag === 'PLAC') person.death!.place = { name: line.value ?? '' };
          if (line.tag === 'CAUS') person.death!.cause = line.value ?? '';
        }
        if (parentTag === 'BURI' && line.tag === 'PLAC') {
          person.burial = { name: line.value ?? '' };
        }
        if (parentTag === 'OBJE' && currentObje && mediaMap.has(currentObje)) {
          const media = mediaMap.get(currentObje)!;
          if (line.tag === 'FILE' && line.value) {
            media.filename = line.value.trim();
            if (!person.avatar && media.type === 'photo') {
              person.avatar = {
                mediaId: currentObje,
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                rotation: 0,
                scale: 1,
              };
            }
          }
          if (line.tag === 'FORM' && line.value) {
            const form = line.value.toLowerCase();
            if (form.includes('pdf')) media.type = 'document';
            else if (form.includes('mp4') || form.includes('mov') || form.includes('video')) media.type = 'video';
            else if (form.includes('mp3') || form.includes('wav') || form.includes('audio')) media.type = 'audio';
            else media.type = 'photo';
          }
          if (line.tag === 'TITL' && line.value) media.description = line.value;
        }
      }
    }

    if (currentFam && famMap.has(currentFam)) {
      const fam = famMap.get(currentFam)!;
      const parentTag = stack[0];

      if (line.level === 1) {
        stack.length = 0;
        stack.push(line.tag);

        if (line.tag === 'HUSB' && line.value) {
          const id = line.value.replace(/@/g, '');
          if (!fam.partnerIds!.includes(id)) fam.partnerIds!.push(id);
        }
        if (line.tag === 'WIFE' && line.value) {
          const id = line.value.replace(/@/g, '');
          if (!fam.partnerIds!.includes(id)) fam.partnerIds!.push(id);
        }
        if (line.tag === 'CHIL' && line.value) {
          const id = line.value.replace(/@/g, '');
          if (!fam.childIds!.includes(id)) fam.childIds!.push(id);
        }
      } else if (line.level === 2) {
        if (parentTag === 'MARR' && line.tag === 'DATE') {
          fam.marriageStart = parseGedcomDate(line.value);
        }
        if (parentTag === 'DIV' && line.tag === 'DATE') {
          fam.marriageEnd = parseGedcomDate(line.value);
        }
      }
    }
  }

  const unions: Record<string, Union> = {};
  for (const [id, fam] of famMap) {
    const children = sortChildrenByAge(
      (fam.childIds ?? []).map((cid) => indiMap.get(cid)).filter(Boolean) as Person[],
    );
    unions[id] = {
      id,
      partnerIds: fam.partnerIds ?? [],
      childIds: children.map((c) => c.id),
      marriageStart: fam.marriageStart,
      marriageEnd: fam.marriageEnd,
    };
    for (const pid of fam.partnerIds ?? []) {
      const partner = indiMap.get(pid);
      if (partner && !partner.unionIds.includes(id)) partner.unionIds.push(id);
    }
    for (const child of children) {
      if (!child.parentUnionIds.includes(id)) child.parentUnionIds.push(id);
    }
  }

  const project: Project = {
    version: 1,
    meta: { name: projectName, createdAt: now, modifiedAt: now },
    persons: Object.fromEntries(indiMap),
    unions,
    media: Object.fromEntries(mediaMap),
    viewSettings: {
      ...defaultViewSettings(),
      generationsUp: 4,
      generationsDown: 4,
    },
    center: { type: 'person', id: '' },
  };

  project.center = pickCenter(project);
  return repairProjectRelationships(project);
}

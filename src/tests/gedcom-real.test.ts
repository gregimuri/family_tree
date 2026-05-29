import { existsSync, readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { importGedcom, parseGedcomDate } from '../services/gedcom/import';
import { buildLayout } from '../layout';
import { formatBirthName, formatPersonName } from '../models/person-utils';

/** Локальные GEDCOM для ручной проверки; задайте пути через env или пропустите тесты в CI. */
const FILES = {
  familio: process.env.GEDCOM_FAMILIO ?? '',
  famytale: process.env.GEDCOM_FAMYTALE ?? '',
};

const hasRealGedcom = Object.values(FILES).every((p) => p && existsSync(p));

describe.skipIf(!hasRealGedcom)('real GEDCOM files', () => {
  for (const [label, file] of Object.entries(FILES)) {
    it(`imports ${label}`, () => {
      const text = readFileSync(file, 'utf8');
      const project = importGedcom(text, file);
      expect(Object.keys(project.persons).length).toBeGreaterThan(10);
      expect(Object.keys(project.unions).length).toBeGreaterThan(5);
      expect(buildLayout(project).nodes.length).toBeGreaterThan(0);
    });
  }

  it('parses Familio NAME format correctly', () => {
    const project = importGedcom(readFileSync(FILES.familio, 'utf8'), 'familio');
    const edu = project.persons['I1'];
    expect(edu).toBeDefined();
    expect(edu.surname).toBe('Шевченко');
    expect(edu.givenName).toBe('Эдуард');
    expect(edu.patronymic).toBe('Артемьевич');
    expect(edu.birth?.date?.year).toBe(1917);
    expect(edu.birth?.date?.month).toBe(4);
    expect(edu.birth?.date?.day).toBe(4);
    expect(edu.death?.date?.year).toBe(1943);
  });

  it('parses Familio birth place and Julian calendar dates', () => {
    const project = importGedcom(readFileSync(FILES.familio, 'utf8'), 'familio');
    const pavel = project.persons['I10'];
    expect(pavel?.birth?.date?.year).toBe(1897);
    expect(pavel?.birth?.date?.month).toBe(7);
    expect(pavel?.birth?.date?.day).toBe(1);
    expect(pavel?.birth?.place?.name).toContain('Низовка');
    expect(pavel?.patronymic).toBe('Степанов');
  });

  it('parses Familio marriage date ranges', () => {
    const project = importGedcom(readFileSync(FILES.familio, 'utf8'), 'familio');
    const f2 = project.unions['F2'];
    expect(f2?.marriageStart?.year).toBe(1858);
    expect(f2?.marriageStart?.text).toContain('1858');
    const f3 = project.unions['F3'];
    expect(f3?.marriageStart?.year).toBe(1872);
    expect(f3?.marriageStart?.text).toContain('1874');
  });

  it('imports Familio photo references', () => {
    const project = importGedcom(readFileSync(FILES.familio, 'utf8'), 'familio');
    expect(Object.keys(project.media).length).toBeGreaterThan(50);
    const karina = project.persons['I42'];
    expect(karina?.avatar?.mediaId).toBeTruthy();
    const media = project.media[karina!.avatar!.mediaId];
    expect(media.filename).toMatch(/^https?:\/\//);
  });

  it('parses FamyTale GIVN/SURN correctly', () => {
    const project = importGedcom(readFileSync(FILES.famytale, 'utf8'), 'famytale');
    const alex = project.persons['I51'];
    expect(alex?.surname).toBe('Титков');
    expect(alex?.givenName).toBe('Александр');
    expect(alex?.birth?.date?.year).toBe(2002);
  });

  it('parses FamyTale married and birth surnames', () => {
    const project = importGedcom(readFileSync(FILES.famytale, 'utf8'), 'famytale');
    const svetlana = project.persons['I57'];
    expect(svetlana?.surname).toBe('Титкова');
    expect(svetlana?.birthSurname).toBe('Дербина');
    expect(formatBirthName(svetlana!)).toContain('Дербина');

    const irina = project.persons['I59'];
    expect(irina?.surname).toBe('Антман');
    expect(irina?.birthSurname).toBe('Агапова');
    expect(formatPersonName(irina!)).toContain('Антман');

    const elena = project.persons['I511'];
    expect(elena?.surname).toBe('Антман');
    expect(elena?.birthSurname).toBe('Шевченко');
  });

  it('parses FamyTale complex dates', () => {
    const project = importGedcom(readFileSync(FILES.famytale, 'utf8'), 'famytale');
    const ivan = project.persons['I513'];
    expect(ivan?.death?.date?.text).toBe('1941-1945');
    expect(ivan?.givenName).toBe('Иван');
    expect(ivan?.patronymic).toContain('Денисович');
  });

  it('picks a connected center for large tree', () => {
    const project = importGedcom(readFileSync(FILES.familio, 'utf8'), 'familio');
    const centerExists =
      project.center.type === 'family'
        ? !!project.unions[project.center.id]
        : !!project.persons[project.center.id];
    expect(centerExists).toBe(true);
    expect(buildLayout(project).nodes.length).toBeGreaterThan(10);
  });
});

describe('parseGedcomDate edge cases', () => {
  it('parses calendar and qualifier combinations', () => {
    expect(parseGedcomDate('ABT @#DJULIAN@ 1875')?.year).toBe(1875);
    expect(parseGedcomDate('BEF @#DJULIAN@ 1856')?.year).toBe(1856);
    expect(parseGedcomDate('ABT 1951')?.year).toBe(1951);
    expect(parseGedcomDate('?')?.text).toBe('?');
    expect(parseGedcomDate('1941-1945')?.text).toBe('1941-1945');
  });
});

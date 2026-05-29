import type { Project } from '../../types';
import { dateToText } from '../../models/person-utils';

function fmtDate(d?: { year?: number; month?: number; day?: number; text?: string }): string {
  return dateToText(d) || '';
}

export function exportGedcom(project: Project): string {
  const lines: string[] = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 SOUR Drevo'];

  for (const person of Object.values(project.persons)) {
    lines.push(`0 @${person.id}@ INDI`);
    lines.push(`1 NAME ${person.givenName} /${person.surname}/`);
    if (person.patronymic) lines.push(`2 GIVN ${person.givenName} ${person.patronymic}`);
    if (person.surname) lines.push(`2 SURN ${person.surname}`);
    lines.push(`1 SEX ${person.gender === 'female' ? 'F' : person.gender === 'male' ? 'M' : 'U'}`);
    if (person.birth?.date || person.birth?.place) {
      lines.push('1 BIRT');
      if (person.birth.date) lines.push(`2 DATE ${fmtDate(person.birth.date)}`);
      if (person.birth.place) lines.push(`2 PLAC ${person.birth.place.name}`);
    }
    if (person.death?.date || person.death?.place) {
      lines.push('1 DEAT');
      if (person.death.date) lines.push(`2 DATE ${fmtDate(person.death.date)}`);
      if (person.death.place) lines.push(`2 PLAC ${person.death.place.name}`);
    }
    for (const uid of person.parentUnionIds) lines.push(`1 FAMC @${uid}@`);
    for (const uid of person.unionIds) lines.push(`1 FAMS @${uid}@`);
  }

  for (const union of Object.values(project.unions)) {
    lines.push(`0 @${union.id}@ FAM`);
    const [husb, wife] = union.partnerIds;
    const hp = husb ? project.persons[husb] : undefined;
    const wp = wife ? project.persons[wife] : undefined;
    const male = hp?.gender === 'male' ? husb : wp?.gender === 'male' ? wife : husb;
    const female = male === husb ? wife : husb;
    if (male) lines.push(`1 HUSB @${male}@`);
    if (female) lines.push(`1 WIFE @${female}@`);
    if (union.marriageStart) {
      lines.push('1 MARR');
      lines.push(`2 DATE ${fmtDate(union.marriageStart)}`);
    }
    for (const cid of union.childIds) lines.push(`1 CHIL @${cid}@`);
  }

  lines.push('0 TRLR');
  return lines.join('\n');
}

export function downloadGedcom(project: Project): void {
  const text = exportGedcom(project);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.meta.name || 'tree'}.ged`;
  a.click();
  URL.revokeObjectURL(url);
}

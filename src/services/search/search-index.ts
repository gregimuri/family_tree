import type { Person, Project, SearchResult } from '../../types';
import { dateToText, formatPersonName, getPersonLocation } from '../../models/person-utils';

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function scoreMatch(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 50;
  return 0;
}

export function searchPersons(project: Project, query: string): SearchResult[] {
  if (!query.trim()) return [];
  const results: SearchResult[] = [];

  for (const person of Object.values(project.persons)) {
    const name = formatPersonName(person, true);
    const birthName = [person.birthSurname, person.birthGivenName, person.birthPatronymic]
      .filter(Boolean)
      .join(' ');
    const years = `${dateToText(person.birth?.date)} ${dateToText(person.death?.date)}`;
    const places = [
      person.birth?.place?.name,
      person.death?.place?.name,
      person.burial?.name,
      person.currentResidence?.name,
      person.longestResidence?.name,
      person.mainResidence?.name,
      getPersonLocation(person)?.name,
    ]
      .filter(Boolean)
      .join(' ');

    const searchable = [name, birthName, person.nickname ?? '', years, places].join(' ');
    const score = Math.max(
      scoreMatch(name, query),
      scoreMatch(birthName, query),
      scoreMatch(person.nickname ?? '', query),
      scoreMatch(years, query),
      scoreMatch(places, query),
      scoreMatch(searchable, query),
    );

    if (score > 0) {
      results.push({
        personId: person.id,
        score,
        label: name,
        snippet: [years.trim(), getPersonLocation(person)?.name].filter(Boolean).join(' · '),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function findPersonById(project: Project, id: string): Person | undefined {
  return project.persons[id];
}

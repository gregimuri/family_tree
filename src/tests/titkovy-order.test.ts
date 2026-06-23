import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { loadProjectFromDamagedZipBytes } from '../services/project-io/zip-recovery';
import { buildLayout } from '../layout';

const titkovyPath = 'c:/Users/Gregor/Downloads/Titkovy_6.drevo';
const hasTitkovy = fs.existsSync(titkovyPath);

function countParentChildCrossings(
  parents: { id: string; x: number }[],
  children: { id: string; x: number }[],
  links: { parentId: string; childId: string }[],
): number {
  const pPos = new Map(parents.map((p, i) => [p.id, i]));
  const cPos = new Map(children.map((c, i) => [c.id, i]));
  const mapped = links
    .map((l) => ({
      pi: pPos.get(l.parentId),
      ci: cPos.get(l.childId),
    }))
    .filter((l): l is { pi: number; ci: number } => l.pi !== undefined && l.ci !== undefined);

  let crossings = 0;
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      const a = mapped[i];
      const b = mapped[j];
      if ((a.pi < b.pi && a.ci > b.ci) || (a.pi > b.pi && a.ci < b.ci)) crossings++;
    }
  }
  return crossings;
}

async function loadTitkovy() {
  const bytes = new Uint8Array(fs.readFileSync(titkovyPath));
  return (await loadProjectFromDamagedZipBytes(bytes)).project;
}

function personName(project: import('../types').Project, id: string): string {
  const p = project.persons[id];
  if (!p) return id.slice(0, 8);
  return [p.surname, p.givenName].filter(Boolean).join(' ');
}

describe.skipIf(!hasTitkovy)('Titkovy ancestor ordering', () => {
  it('Georgiy parent is left of Anatoliy when Svetlana is left of Irina', async () => {
    const project = await loadTitkovy();
    project.viewSettings = { ...project.viewSettings, showAllPersons: true };
    const layout = buildLayout(project);
    const byPerson = new Map(
      layout.nodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
    );

    const findId = (substr: string) =>
      Object.keys(project.persons).find((id) => personName(project, id).includes(substr));

    const georgiyId = findId('Георгий');
    const anatoliyId = findId('Анатолий');
    const svetlanaId = findId('Светлана');
    const irinaId = findId('Ирина');

    expect(georgiyId && anatoliyId && svetlanaId && irinaId).toBeTruthy();

    const georgiy = byPerson.get(georgiyId!)!;
    const anatoliy = byPerson.get(anatoliyId!)!;
    const svetlana = byPerson.get(svetlanaId!)!;
    const irina = byPerson.get(irinaId!)!;

    expect(svetlana.x).toBeLessThan(irina.x);
    expect(georgiy.x + georgiy.width).toBeLessThanOrEqual(anatoliy.x + 2);
  });

  it('ancestor order avoids crossings when centered on Ilya', async () => {
    const project = await loadTitkovy();
    const ilyaId = Object.keys(project.persons).find((id) =>
      personName(project, id).includes('Илья'),
    );
    expect(ilyaId).toBeTruthy();
    project.center = { type: 'person', id: ilyaId! };
    project.viewSettings = { ...project.viewSettings, showAllPersons: true };

    const layout = buildLayout(project);
    const byPerson = new Map(
      layout.nodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
    );

    const findId = (substr: string) =>
      Object.keys(project.persons).find((id) => personName(project, id).includes(substr));

    const georgiy = byPerson.get(findId('Георгий')!)!;
    const anatoliy = byPerson.get(findId('Анатолий')!)!;
    const svetlana = byPerson.get(findId('Светлана')!)!;
    const irina = byPerson.get(findId('Ирина')!)!;

    expect(svetlana.x).toBeLessThan(irina.x);
    expect(georgiy.x + georgiy.width).toBeLessThanOrEqual(anatoliy.x + 2);
  }, 20_000);

  it('no parent-child line crossings on grandparent row for common centers', async () => {
    const base = await loadTitkovy();
    base.viewSettings = { ...base.viewSettings, showAllPersons: true };

    const centers = Object.keys(base.persons).filter((id) => {
      const n = personName(base, id);
      return n.includes('Илья') || n.includes('Елизавета') || n.includes('Светлана') || n.includes('Василий');
    });

    for (const centerId of centers) {
      const project = structuredClone(base);
      project.center = { type: 'person', id: centerId };
      const layout = buildLayout(project);
      const byPerson = new Map(
        layout.nodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
      );

      const findId = (substr: string) =>
        Object.keys(project.persons).find((id) => personName(project, id).includes(substr));

      const georgiyId = findId('Георгий');
      const anatoliyId = findId('Анатолий');
      const svetlanaId = findId('Светлана');
      const irinaId = findId('Ирина');
      if (!georgiyId || !anatoliyId || !svetlanaId || !irinaId) continue;

      const g = byPerson.get(georgiyId);
      const a = byPerson.get(anatoliyId);
      const s = byPerson.get(svetlanaId);
      const i = byPerson.get(irinaId);
      if (!g || !a || !s || !i || g.layer === s.layer) continue;

      const parentRow = [g, a].map((n) => ({ id: n.personId!, x: n.x + n.width / 2 }));
      parentRow.sort((x, y) => x.x - y.x);
      const childRow = [s, i].map((n) => ({ id: n.personId!, x: n.x + n.width / 2 }));
      childRow.sort((x, y) => x.x - y.x);

      const crossings = countParentChildCrossings(parentRow, childRow, [
        { parentId: georgiyId, childId: svetlanaId },
        { parentId: anatoliyId, childId: irinaId },
      ]);
      expect(crossings, `center ${personName(project, centerId)}`).toBe(0);
    }
  }, 30_000);

  it('default project center has no Georgiy/Anatoliy crossing when visible', async () => {
    const project = await loadTitkovy();
    const layout = buildLayout(project);
    const byPerson = new Map(
      layout.nodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
    );

    const findId = (substr: string) =>
      Object.keys(project.persons).find((id) => personName(project, id).includes(substr));

    const georgiyId = findId('Георгий');
    const anatoliyId = findId('Анатолий');
    const svetlanaId = findId('Светлана');
    const irinaId = findId('Ирина');
    if (!georgiyId || !anatoliyId || !svetlanaId || !irinaId) return;

    const g = byPerson.get(georgiyId);
    const a = byPerson.get(anatoliyId);
    const s = byPerson.get(svetlanaId);
    const i = byPerson.get(irinaId);
    if (!g || !a || !s || !i) return;

    if (s.x < i.x) {
      expect(g.x + g.width).toBeLessThanOrEqual(a.x + 2);
    }
  }, 20_000);
});

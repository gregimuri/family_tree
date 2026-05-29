/**
 * Алгоритм автоматической раскладки генеалогического древа (нисходящее от корня).
 *
 * Основные идеи:
 * 1. Поколения (глубина) считаются от rootId вниз.
 * 2. Дерево раскладывается по «нуклеарным семьям» (FamilyUnit): родители + общие дети.
 * 3. Рекурсивно строятся поддеревья детей, затем родители центрируются над ними.
 * 4. Соседние поддеревья раздвигаются по контурам (упрощённый Reingold–Tilford).
 * 5. У одного человека может быть несколько браков — блоки браков ставятся в ряд.
 */

/** Упрощённая модель персоны для расчёта координат. */
export interface LayoutPerson {
  id: string;
  name: string;
  fatherId: string | null;
  motherId: string | null;
  spouseIds: string[];
}

export interface LayoutOptions {
  verticalGap?: number;
  horizontalGap?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  spouseGap?: number;
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  type: 'parent-child' | 'spouse';
}

export interface LayoutOutput {
  positions: Map<string, LayoutPosition>;
  edges: LayoutEdge[];
}

/** Семейная ячейка: 1–2 родителя и их общие дети в этом браке/союзе. */
interface FamilyUnit {
  parentIds: string[];
  childIds: string[];
}

/** Горизонтальные границы поддерева на одном уровне Y (поколении). */
interface ContourLevel {
  left: number;
  right: number;
}

/** Результат раскладки поддерева (относительные координаты, до финального сдвига). */
interface SubtreeLayout {
  positions: Map<string, LayoutPosition>;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  /** Контур: поколение → левый/правый край занятой области. */
  contour: Map<number, ContourLevel>;
}

interface ResolvedOptions {
  verticalGap: number;
  horizontalGap: number;
  nodeWidth: number;
  nodeHeight: number;
  spouseGap: number;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  nodeWidth: 120,
  nodeHeight: 60,
  verticalGap: 80,
  horizontalGap: 30,
  spouseGap: 20,
};

function resolveOptions(options?: LayoutOptions): ResolvedOptions {
  return {
    nodeWidth: options?.nodeWidth ?? DEFAULT_OPTIONS.nodeWidth,
    nodeHeight: options?.nodeHeight ?? DEFAULT_OPTIONS.nodeHeight,
    verticalGap: options?.verticalGap ?? DEFAULT_OPTIONS.verticalGap,
    horizontalGap: options?.horizontalGap ?? DEFAULT_OPTIONS.horizontalGap,
    spouseGap: options?.spouseGap ?? DEFAULT_OPTIONS.spouseGap,
  };
}

function generationToY(generation: number, opts: ResolvedOptions): number {
  return generation * (opts.nodeHeight + opts.verticalGap);
}

// ─── Индексация и поколения ───────────────────────────────────────────────

function buildPersonMap(persons: LayoutPerson[]): Map<string, LayoutPerson> {
  return new Map(persons.map((p) => [p.id, p]));
}

/** Множество personId, достижимых от rootId (потомки + супруги на каждом уровне). */
function collectDescendants(
  rootId: string,
  persons: LayoutPerson[],
  personById: Map<string, LayoutPerson>,
): Set<string> {
  const reachable = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of persons) {
      if (reachable.has(p.id)) continue;
      const linkedToAncestor =
        (p.fatherId !== null && reachable.has(p.fatherId)) ||
        (p.motherId !== null && reachable.has(p.motherId));
      if (linkedToAncestor) {
        reachable.add(p.id);
        changed = true;
      }
    }
    for (const id of [...reachable]) {
      const person = personById.get(id);
      if (!person) continue;
      for (const spouseId of person.spouseIds) {
        if (!reachable.has(spouseId) && personById.has(spouseId)) {
          reachable.add(spouseId);
          changed = true;
        }
      }
    }
  }
  return reachable;
}

/**
 * Поколение 0 у корня; ребёнок = max(поколение родителей) + 1.
 * Учитываются только потомки rootId.
 */
function computeGenerations(
  persons: LayoutPerson[],
  rootId: string,
  reachable: Set<string>,
): Map<string, number> {
  const generations = new Map<string, number>();
  if (!reachable.has(rootId)) return generations;
  generations.set(rootId, 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of persons) {
      if (!reachable.has(p.id)) continue;

      const fatherGen = p.fatherId !== null ? generations.get(p.fatherId) : undefined;
      const motherGen = p.motherId !== null ? generations.get(p.motherId) : undefined;

      let parentGen: number | undefined;
      if (fatherGen !== undefined && motherGen !== undefined) {
        parentGen = Math.max(fatherGen, motherGen);
      } else if (fatherGen !== undefined) {
        parentGen = fatherGen;
      } else if (motherGen !== undefined) {
        parentGen = motherGen;
      } else {
        continue;
      }

      const nextGen = parentGen + 1;
      const current = generations.get(p.id);
      if (current === undefined || nextGen > current) {
        generations.set(p.id, nextGen);
        changed = true;
      }
    }
  }

  for (const id of reachable) {
    if (!generations.has(id)) generations.set(id, 0);
  }

  // Супруги на одном поколении с партнёром
  let spouseChanged = true;
  while (spouseChanged) {
    spouseChanged = false;
    for (const id of reachable) {
      const person = persons.find((p) => p.id === id);
      if (!person) continue;
      for (const spouseId of person.spouseIds) {
        if (!reachable.has(spouseId)) continue;
        const myGen = generations.get(id);
        const spGen = generations.get(spouseId);
        if (myGen !== undefined && spGen === undefined) {
          generations.set(spouseId, myGen);
          spouseChanged = true;
        } else if (spGen !== undefined && myGen === undefined) {
          generations.set(id, spGen);
          spouseChanged = true;
        }
      }
    }
  }

  return generations;
}

// ─── FamilyUnit ───────────────────────────────────────────────────────────

function unionPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Общие дети двух родителей (порядок father/mother не важен). */
function getCommonChildrenOfPair(
  parentA: string,
  parentB: string,
  persons: LayoutPerson[],
  reachable: Set<string>,
): string[] {
  return persons
    .filter((p) => {
      if (!reachable.has(p.id)) return false;
      return (
        (p.fatherId === parentA && p.motherId === parentB) ||
        (p.fatherId === parentB && p.motherId === parentA)
      );
    })
    .map((p) => p.id)
    .sort();
}

/** Дети только одного родителя (второй не указан). */
function getSingleParentChildren(
  parentId: string,
  persons: LayoutPerson[],
  reachable: Set<string>,
  assignedToPair: Set<string>,
): string[] {
  return persons
    .filter((p) => {
      if (!reachable.has(p.id) || assignedToPair.has(p.id)) return false;
      const hasFather = p.fatherId !== null;
      const hasMother = p.motherId !== null;
      if (hasFather && hasMother) return false;
      return p.fatherId === parentId || p.motherId === parentId;
    })
    .map((p) => p.id)
    .sort();
}

/** Все семейные ячейки, в которых участвует personId. */
function getFamilyUnitsForPerson(
  personId: string,
  persons: LayoutPerson[],
  personById: Map<string, LayoutPerson>,
  reachable: Set<string>,
): FamilyUnit[] {
  const person = personById.get(personId);
  if (!person) return [];

  const units: FamilyUnit[] = [];
  const assignedChildren = new Set<string>();
  const seenPairs = new Set<string>();

  for (const spouseId of person.spouseIds) {
    if (!personById.has(spouseId)) continue;
    const key = unionPairKey(personId, spouseId);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    const childIds = getCommonChildrenOfPair(personId, spouseId, persons, reachable);
    childIds.forEach((id) => assignedChildren.add(id));
    units.push({
      parentIds: personId < spouseId ? [personId, spouseId] : [spouseId, personId],
      childIds,
    });
  }

  const singleChildren = getSingleParentChildren(personId, persons, reachable, assignedChildren);
  if (singleChildren.length > 0) {
    units.push({ parentIds: [personId], childIds: singleChildren });
  }

  if (units.length === 0) {
    units.push({ parentIds: [personId], childIds: [] });
  }

  return units;
}

// ─── Геометрия и контуры ──────────────────────────────────────────────────

function nodeHalfWidth(opts: ResolvedOptions): number {
  return opts.nodeWidth / 2;
}

function updateBBox(
  bbox: SubtreeLayout['bbox'],
  x: number,
  y: number,
  opts: ResolvedOptions,
): SubtreeLayout['bbox'] {
  const hw = nodeHalfWidth(opts);
  const hh = opts.nodeHeight / 2;
  return {
    minX: Math.min(bbox.minX, x - hw),
    maxX: Math.max(bbox.maxX, x + hw),
    minY: Math.min(bbox.minY, y - hh),
    maxY: Math.max(bbox.maxY, y + hh),
  };
}

function emptyBBox(): SubtreeLayout['bbox'] {
  return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
}

function mergeBBoxes(a: SubtreeLayout['bbox'], b: SubtreeLayout['bbox']): SubtreeLayout['bbox'] {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Добавляет узел в positions/bbox/contour. */
function placeNode(
  layout: SubtreeLayout,
  id: string,
  x: number,
  y: number,
  generation: number,
  opts: ResolvedOptions,
): void {
  layout.positions.set(id, { x, y });
  layout.bbox = updateBBox(layout.bbox, x, y, opts);
  const hw = nodeHalfWidth(opts);
  const level = layout.contour.get(generation) ?? { left: x - hw, right: x + hw };
  level.left = Math.min(level.left, x - hw);
  level.right = Math.max(level.right, x + hw);
  layout.contour.set(generation, level);
}

/** Размещает 1–2 родителей на одном уровне, центрируя блок относительно centerX. */
function placeParentsHorizontally(
  parentIds: string[],
  centerX: number,
  generation: number,
  layout: SubtreeLayout,
  opts: ResolvedOptions,
): void {
  const y = generationToY(generation, opts);

  if (parentIds.length === 1) {
    placeNode(layout, parentIds[0], centerX, y, generation, opts);
    return;
  }

  const [leftId, rightId] = parentIds;
  const blockWidth = opts.nodeWidth * 2 + opts.spouseGap;
  const leftX = centerX - blockWidth / 2 + nodeHalfWidth(opts);
  const rightX = centerX + blockWidth / 2 - nodeHalfWidth(opts);
  placeNode(layout, leftId, leftX, y, generation, opts);
  placeNode(layout, rightId, rightX, y, generation, opts);
}

function mergePositions(target: Map<string, LayoutPosition>, source: Map<string, LayoutPosition>): void {
  for (const [id, pos] of source) {
    target.set(id, pos);
  }
}

function mergeContours(target: Map<number, ContourLevel>, source: Map<number, ContourLevel>): void {
  for (const [gen, level] of source) {
    const existing = target.get(gen);
    if (!existing) {
      target.set(gen, { ...level });
    } else {
      existing.left = Math.min(existing.left, level.left);
      existing.right = Math.max(existing.right, level.right);
    }
  }
}

/** Сдвигает всё поддерево по X (для разрешения наложений). */
function shiftSubtree(layout: SubtreeLayout, dx: number): void {
  if (Math.abs(dx) < 1e-9) return;
  for (const pos of layout.positions.values()) {
    pos.x += dx;
  }
  layout.bbox.minX += dx;
  layout.bbox.maxX += dx;
  for (const level of layout.contour.values()) {
    level.left += dx;
    level.right += dx;
  }
}

/**
 * Минимальный сдвиг вправо для rightSubtree, чтобы не пересекаться с leftSubtree.
 * Сравниваем контуры на общих уровнях поколений.
 */
function separationOffset(
  left: SubtreeLayout,
  right: SubtreeLayout,
  gap: number,
): number {
  let needed = gap;
  for (const [gen, rightLevel] of right.contour) {
    const leftLevel = left.contour.get(gen);
    if (!leftLevel) continue;
    const dist = rightLevel.left - leftLevel.right;
    if (dist < gap) {
      needed = Math.max(needed, gap - dist);
    }
  }
  if (left.bbox.maxX !== -Infinity && right.bbox.minX !== Infinity) {
    const dist = right.bbox.minX - left.bbox.maxX;
    if (dist < gap) {
      needed = Math.max(needed, gap - dist);
    }
  }
  return needed;
}

/** Ставит блоки поддеревьев в ряд с раздвижением по контурам. */
function placeBlocksHorizontally(blocks: SubtreeLayout[], gap: number): SubtreeLayout {
  if (blocks.length === 0) {
    return { positions: new Map(), bbox: emptyBBox(), contour: new Map() };
  }

  const result: SubtreeLayout = {
    positions: new Map(),
    bbox: emptyBBox(),
    contour: new Map(),
  };

  let cursorX = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (i === 0) {
      const offset = cursorX - block.bbox.minX;
      shiftSubtree(block, offset);
    } else {
      const prev = blocks[i - 1];
      const shift = Math.max(
        prev.bbox.maxX + gap - block.bbox.minX,
        separationOffset(prev, block, gap),
      );
      shiftSubtree(block, shift);
    }
    mergePositions(result.positions, block.positions);
    result.bbox = i === 0 ? { ...block.bbox } : mergeBBoxes(result.bbox, block.bbox);
    mergeContours(result.contour, block.contour);
  }

  return result;
}

// ─── Рекурсивная раскладка ────────────────────────────────────────────────

interface LayoutContext {
  persons: LayoutPerson[];
  personById: Map<string, LayoutPerson>;
  generations: Map<string, number>;
  reachable: Set<string>;
  opts: ResolvedOptions;
}

/** Рекурсивная раскладка семейной ячейки. */
function layoutFamilyUnit(unit: FamilyUnit, ctx: LayoutContext): SubtreeLayout {
  const { opts, generations } = ctx;
  const parentGen = Math.min(...unit.parentIds.map((id) => generations.get(id) ?? 0));

  const layout: SubtreeLayout = {
    positions: new Map(),
    bbox: emptyBBox(),
    contour: new Map(),
  };

  if (unit.childIds.length === 0) {
    placeParentsHorizontally(unit.parentIds, 0, parentGen, layout, opts);
    return layout;
  }

  const childBlocks: SubtreeLayout[] = [];
  for (const childId of unit.childIds) {
    childBlocks.push(layoutPersonWithSpouses(childId, ctx));
  }

  const childrenLayout = placeBlocksHorizontally(childBlocks, opts.horizontalGap);
  const childrenCenterX = (childrenLayout.bbox.minX + childrenLayout.bbox.maxX) / 2;

  placeParentsHorizontally(unit.parentIds, childrenCenterX, parentGen, layout, opts);

  mergePositions(layout.positions, childrenLayout.positions);
  layout.bbox = mergeBBoxes(layout.bbox, childrenLayout.bbox);
  mergeContours(layout.contour, childrenLayout.contour);

  return layout;
}

/**
 * Раскладка человека со всеми браками: каждый брак — отдельный FamilyUnit,
 * блоки браков ставятся горизонтально (MVP: узел человека может дублироваться в ячейках).
 */
function layoutPersonWithSpouses(personId: string, ctx: LayoutContext): SubtreeLayout {
  const units = getFamilyUnitsForPerson(personId, ctx.persons, ctx.personById, ctx.reachable);

  if (units.length === 1) {
    return layoutFamilyUnit(units[0], ctx);
  }

  const marriageBlocks = units.map((unit) => layoutFamilyUnit(unit, ctx));
  return placeBlocksHorizontally(marriageBlocks, ctx.opts.horizontalGap);
}

/** Точка входа раскладки от корня. */
function layoutFromRoot(rootId: string, ctx: LayoutContext): SubtreeLayout {
  return layoutPersonWithSpouses(rootId, ctx);
}

// ─── Слияние дубликатов и рёбра ───────────────────────────────────────────

/**
 * Если один id встретился в нескольких брачных блоках, усредняем координаты (MVP).
 */
function deduplicatePositions(positions: Map<string, LayoutPosition>): Map<string, LayoutPosition> {
  const sums = new Map<string, { x: number; y: number; n: number }>();
  for (const [id, pos] of positions) {
    const entry = sums.get(id) ?? { x: 0, y: 0, n: 0 };
    entry.x += pos.x;
    entry.y += pos.y;
    entry.n += 1;
    sums.set(id, entry);
  }
  const result = new Map<string, LayoutPosition>();
  for (const [id, { x, y, n }] of sums) {
    result.set(id, { x: x / n, y: y / n });
  }
  return result;
}

function buildEdges(persons: LayoutPerson[], reachable: Set<string>): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  const spousePairs = new Set<string>();

  for (const p of persons) {
    if (!reachable.has(p.id)) continue;

    if (p.fatherId !== null && reachable.has(p.fatherId)) {
      edges.push({ from: p.fatherId, to: p.id, type: 'parent-child' });
    }
    if (p.motherId !== null && reachable.has(p.motherId)) {
      edges.push({ from: p.motherId, to: p.id, type: 'parent-child' });
    }

    for (const spouseId of p.spouseIds) {
      if (!reachable.has(spouseId)) continue;
      const key = unionPairKey(p.id, spouseId);
      if (spousePairs.has(key)) continue;
      spousePairs.add(key);
      edges.push({ from: p.id, to: spouseId, type: 'spouse' });
    }
  }

  return edges;
}

// ─── Публичный API ──────────────────────────────────────────────────────────

/**
 * Вычисляет координаты узлов и описание рёбер для отрисовки генеalogического древа.
 *
 * @param persons — массив персон (не мутируется)
 * @param rootId — корень нисходящего древа (поколение 0)
 * @param options — отступы и размеры узлов
 * @returns positions (центры узлов) и edges для линий parent-child / spouse
 */
export function computeNuclearTreeLayout(
  persons: LayoutPerson[],
  rootId: string,
  options?: LayoutOptions,
): LayoutOutput {
  const opts = resolveOptions(options);
  const personById = buildPersonMap(persons);

  if (!personById.has(rootId)) {
    return { positions: new Map(), edges: [] };
  }

  const reachable = collectDescendants(rootId, persons, personById);
  const generations = computeGenerations(persons, rootId, reachable);

  const ctx: LayoutContext = {
    persons,
    personById,
    generations,
    reachable,
    opts,
  };

  const subtree = layoutFromRoot(rootId, ctx);
  const positions = deduplicatePositions(subtree.positions);
  const edges = buildEdges(persons, reachable);

  return { positions, edges };
}

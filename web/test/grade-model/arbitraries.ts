/**
 * fast-check arbitraries for whole `ModelInput`s (L2).
 *
 * Shapes follow the live schemes: flat top-level components plus, sometimes,
 * one parent with two children (IST.323 `final_project`); scores are whole
 * percentages of `possible`, never above it; a points-method `sum` has at least
 * the points its items can carry, as the seeds do; rank weights are stored
 * highest rank first (non-increasing), as ECN.304's [30, 25, 20].
 */

import fc from 'fast-check';
import type { Aggregation, ComponentInput, ItemInput, Method, ModelInput } from '@/lib/grade-model';
import { PCT_SCALE } from './builders';

export interface GenOptions {
  /** Allow extra-credit components and items. */
  readonly extraCredit: boolean;
  /** Allow `tentative` / `inferred` links (muting). */
  readonly unsure: boolean;
}

const AGGREGATIONS: readonly Aggregation[] = [
  'sum', 'average', 'average_drop_lowest', 'rank_weighted', 'normalized', 'single', 'manual',
];

const rare = fc.integer({ min: 0, max: 9 }).map((n) => n === 0);

export interface ItemSpec {
  readonly possible: number | null;
  readonly scorePct: number | null;
  readonly whatIfPct: number | null;
  readonly exempt: boolean;
  readonly excluded: boolean;
  readonly placeholder: boolean;
  readonly confidence: 'confirmed' | 'tentative' | 'inferred';
  readonly override: boolean;
  readonly dueDay: number | null;
  readonly extraCredit: boolean;
}

function itemSpecArb(options: GenOptions): fc.Arbitrary<ItemSpec> {
  return fc.record({
    possible: fc.oneof(
      { weight: 8, arbitrary: fc.integer({ min: 1, max: 50 }) },
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 1, arbitrary: fc.constant(null) },
    ),
    scorePct: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    whatIfPct: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    exempt: rare,
    excluded: rare,
    placeholder: fc.boolean(),
    confidence: options.unsure
      ? fc.constantFrom('confirmed' as const, 'confirmed' as const, 'confirmed' as const, 'tentative' as const, 'inferred' as const)
      : fc.constant('confirmed' as const),
    override: rare,
    dueDay: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
    extraCredit: options.extraCredit ? rare : fc.constant(false),
  });
}

export interface ComponentSpec {
  readonly aggregation: Aggregation;
  readonly cap: number;
  readonly slack: number;
  readonly countExpected: number | null;
  readonly dropLowest: number;
  readonly rankWeights: readonly number[];
  readonly normalizeTo: number | null;
  readonly extraCredit: boolean;
  readonly items: readonly ItemSpec[];
}

function componentSpecArb(options: GenOptions): fc.Arbitrary<ComponentSpec> {
  return fc.record({
    aggregation: fc.constantFrom(...AGGREGATIONS),
    cap: fc.integer({ min: 1, max: 40 }),
    slack: fc.integer({ min: 0, max: 20 }),
    countExpected: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
    dropLowest: fc.integer({ min: 0, max: 2 }),
    rankWeights: fc
      .array(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 4 })
      .map((weights) => [...weights].sort((a, b) => b - a)),
    normalizeTo: fc.option(fc.constant(5), { nil: null }),
    extraCredit: options.extraCredit ? rare : fc.constant(false),
    items: fc.array(itemSpecArb(options), { maxLength: 5 }),
  });
}

export interface InputSpec {
  readonly method: Extract<Method, 'weighted_pct' | 'points'>;
  readonly components: readonly ComponentSpec[];
  readonly family: readonly ComponentSpec[] | null;
  readonly unlinked: readonly ItemSpec[];
  readonly useGradedOutOf: boolean;
  readonly total: { readonly scorePct: number; readonly running: boolean | null } | null;
}

export function inputSpecArb(options: GenOptions): fc.Arbitrary<InputSpec> {
  return fc.record({
    method: fc.constantFrom('weighted_pct' as const, 'points' as const),
    components: fc.array(componentSpecArb(options), { minLength: 1, maxLength: 4 }),
    family: fc.option(fc.array(componentSpecArb(options), { minLength: 2, maxLength: 2 }), { nil: null }),
    unlinked: fc.array(itemSpecArb(options), { maxLength: 2 }),
    useGradedOutOf: fc.boolean(),
    total: fc.option(
      fc.record({
        scorePct: fc.integer({ min: 0, max: 120 }),
        running: fc.constantFrom(true as boolean | null, false as boolean | null, null),
      }),
      { nil: null },
    ),
  });
}

export function modelInputArb(options: GenOptions): fc.Arbitrary<ModelInput> {
  return inputSpecArb(options).map(buildInput);
}

/* ---------- building a ModelInput from a spec ---------- */

/** A manual part always carries one scored, confirmed column so most inputs compute. */
const MANUAL_ANCHOR: ItemSpec = {
  possible: 10, scorePct: 80, whatIfPct: null, exempt: false, excluded: false, placeholder: false,
  confidence: 'confirmed', override: false, dueDay: null, extraCredit: false,
};

function itemsFor(spec: ComponentSpec): readonly ItemSpec[] {
  return spec.aggregation === 'manual' ? [MANUAL_ANCHOR, ...spec.items] : spec.items;
}

function toItem(spec: ItemSpec, key: string, componentId: number | null): ItemInput {
  const placeholder = spec.placeholder && componentId !== null;
  const scored = !placeholder && spec.scorePct !== null && spec.possible !== null;
  return {
    key,
    componentId,
    linkSource: componentId === null ? null : spec.override ? 'override' : 'assignment',
    linkConfidence: componentId === null ? null : spec.override ? 'confirmed' : spec.confidence,
    excluded: spec.excluded,
    name: key,
    possible: spec.possible,
    score: scored ? ((spec.scorePct ?? 0) * (spec.possible ?? 0)) / 100 : null,
    exempt: spec.exempt,
    kind: placeholder ? 'placeholder' : 'item',
    isExtraCredit: spec.extraCredit,
    dueAt: spec.dueDay === null ? null : `2026-10-${String(spec.dueDay).padStart(2, '0')}T12:00:00Z`,
  };
}

function capFor(method: InputSpec['method'], spec: ComponentSpec): number {
  if (method === 'weighted_pct' || spec.aggregation !== 'sum') return spec.cap;
  const carried = itemsFor(spec).reduce((total, item) => total + Math.max(0, item.possible ?? 0), 0);
  return carried + spec.slack;
}

function toComponent(method: InputSpec['method'], spec: ComponentSpec, id: number, parentId: number | null): ComponentInput {
  const cap = capFor(method, spec);
  return {
    id,
    code: `c${id}`,
    name: `Component ${id}`,
    parentId,
    weightPct: method === 'weighted_pct' ? cap : null,
    points: method === 'points' ? cap : null,
    countExpected: spec.countExpected,
    aggregation: spec.aggregation,
    dropLowest: spec.dropLowest,
    rankWeights: spec.rankWeights,
    normalizeTo: spec.normalizeTo,
    isExtraCredit: spec.extraCredit,
  };
}

interface Leaf {
  readonly spec: ComponentSpec;
  readonly id: number;
  readonly parentId: number | null;
}

interface Built {
  readonly components: readonly ComponentInput[];
  readonly items: readonly ItemInput[];
  readonly specs: ReadonlyMap<string, ItemSpec>;
}

function toParent(method: InputSpec['method'], id: number): ComponentInput {
  return {
    id, code: `c${id}`, name: `Component ${id}`, parentId: null, weightPct: method === 'weighted_pct' ? 0 : null,
    points: method === 'points' ? 0 : null, countExpected: null, aggregation: 'sum', dropLowest: 0,
    rankWeights: null, normalizeTo: null, isExtraCredit: false,
  };
}

/** Flat components get ids 1..n, the parent n+1, its two children n+2 and n+3. */
function buildComponents(input: InputSpec): Built {
  const flat: Leaf[] = input.components.map((spec, index) => ({ spec, id: index + 1, parentId: null }));
  const parentId = flat.length + 1;
  const family: Leaf[] = (input.family ?? []).map((spec, index) => ({ spec, id: parentId + 1 + index, parentId }));
  const parent = input.family === null ? [] : [toParent(input.method, parentId)];
  const leaves = [...flat, ...family];
  const keyed = leaves.flatMap((leaf) =>
    itemsFor(leaf.spec).map((spec, index) => ({ spec, item: toItem(spec, `col:c${leaf.id}:${index}`, leaf.id) })),
  );
  return {
    components: [
      ...flat.map((leaf) => toComponent(input.method, leaf.spec, leaf.id, null)),
      ...parent,
      ...family.map((leaf) => toComponent(input.method, leaf.spec, leaf.id, leaf.parentId)),
    ],
    items: keyed.map(({ item }) => item),
    specs: new Map(keyed.map(({ spec, item }) => [item.key, spec])),
  };
}

function scenarioFor(items: readonly ItemInput[], specs: ReadonlyMap<string, ItemSpec>): Record<string, number> {
  const entries = items.flatMap((item) => {
    const whatIfPct = specs.get(item.key)?.whatIfPct ?? null;
    const eligible = item.score === null && item.possible !== null && item.possible > 0;
    return eligible && whatIfPct !== null ? [[item.key, (whatIfPct * (item.possible ?? 0)) / 100] as const] : [];
  });
  return Object.fromEntries([...entries, ['asg:orphan', 3]]);
}

function capOf(component: ComponentInput, method: InputSpec['method']): number {
  return (method === 'weighted_pct' ? component.weightPct : component.points) ?? 0;
}

/** Σ capacity of regular top-level components, a parent counted through its regular children. */
function regularCap(components: readonly ComponentInput[], method: InputSpec['method']): number {
  const regularChildren = (id: number) => components.filter((c) => c.parentId === id && !c.isExtraCredit);
  const nodeCap = (c: ComponentInput): number => {
    const children = regularChildren(c.id);
    return children.length > 0 ? children.reduce((total, child) => total + capOf(child, method), 0) : capOf(c, method);
  };
  return components
    .filter((c) => c.parentId === null && !c.isExtraCredit)
    .reduce((total, c) => total + nodeCap(c), 0);
}

export function buildInput(input: InputSpec): ModelInput {
  const built = buildComponents(input);
  const unlinked = input.unlinked.map((spec, index) => ({ spec, item: toItem(spec, `col:unlinked:${index}`, null) }));
  const items = [...built.items, ...unlinked.map(({ item }) => item)];
  const specs = new Map([...built.specs, ...unlinked.map(({ spec, item }) => [item.key, spec] as const)]);
  const regular = regularCap(built.components, input.method);
  const points = input.method === 'points';
  return {
    scheme: {
      courseId: 'PROP.100',
      method: input.method,
      totalPoints: points ? regular : null,
      gradedOutOf: points && input.useGradedOutOf ? regular : null,
      letterScale: PCT_SCALE,
    },
    components: built.components,
    items,
    scenario: { itemScores: scenarioFor(items, specs) },
    blackboardTotal:
      input.total === null
        ? null
        : { score: input.total.scorePct, possible: 100, running: input.total.running, seenAt: '2026-09-16T17:14:02Z' },
  };
}

/** Does the input carry any extra credit at all? */
export function hasExtraCredit(input: ModelInput): boolean {
  return input.components.some((c) => c.isExtraCredit) || input.items.some((i) => i.isExtraCredit);
}

// `<pdx-filter-builder :value="savedFilters" logic="or">` starts with those filters, joined by OR.
//
// Both props are read: declared, typed and defaulted but read by nothing, the builder would start
// empty and always join by AND. Between them they are the difference between a filter bar you can
// restore a saved view into and one that can only ever be built by hand, from empty, every time.
//
// `logic` matters because an array handed to `setFilter` is an implicit AND (`matchesFilters` in
// core/data/data-utils.ts): OR has to be expressed as a CompositeFilter, which the builder builds.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/filter-builder/pdx-filter-builder';

const FIELDS = [
    { field: 'name', label: 'Name', type: 'string' },
    { field: 'age', label: 'Age', type: 'number' },
];

/** A DataSource as far as this component is concerned: it calls one method on it. */
function fakeSource() {
    const calls: unknown[][] = [];
    return { calls, setFilter(f: unknown[]) { calls.push(f); } };
}

async function mountFB(opts: { value?: unknown[]; logic?: string; source?: ReturnType<typeof fakeSource> } = {}) {
    const attrs: Record<string, string> = {};
    if (opts.logic) attrs.logic = opts.logic;
    const el = await mount('pdx-filter-builder', attrs) as any;
    el.fields = FIELDS;
    if (opts.source) el.source = opts.source;
    if (opts.value) el.value = opts.value;
    await tick(200);
    return el;
}

const chips = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('.pdx-fb-chip-label')].map(c => c.textContent ?? '');

beforeEach(cleanup);

describe('pdx-filter-builder value', () => {
    it('shows nothing when given nothing', async () => {
        // The control: a seeder that seeds unconditionally would satisfy every other test here.
        expect(chips(await mountFB())).toEqual([]);
    });

    it('shows a chip for each descriptor it was given', async () => {
        const el = await mountFB({ value: [
            { field: 'name', operator: 'contains', value: 'ada' },
            { field: 'age', operator: 'gt', value: 30 },
        ] });
        const text = chips(el);
        expect(text.length, 'no chips were seeded').toBe(2);
        expect(text[0]).toContain('Name');
        expect(text[0]).toContain('ada');
        expect(text[1]).toContain('Age');
    });

    it('ignores a descriptor whose field is not declared', async () => {
        // Otherwise a stale saved view puts a chip on screen that no editor can open.
        const el = await mountFB({ value: [{ field: 'ghost', operator: 'eq', value: 'x' }] });
        expect(chips(el)).toEqual([]);
    });

    it('pushes what it was given to the source, without waiting for an edit', async () => {
        const source = fakeSource();
        await mountFB({ source, value: [{ field: 'name', operator: 'contains', value: 'ada' }] });
        expect(source.calls.length, 'the source was never told').toBeGreaterThan(0);
        expect(source.calls.at(-1)).toEqual([{ field: 'name', operator: 'contains', value: 'ada' }]);
    });
});

describe('pdx-filter-builder logic', () => {
    const TWO = [
        { field: 'name', operator: 'contains', value: 'ada' },
        { field: 'age', operator: 'gt', value: 30 },
    ];

    it('defaults to and, which is a flat array', async () => {
        const source = fakeSource();
        await mountFB({ source, value: TWO });
        expect(source.calls.at(-1)).toEqual(TWO);
    });

    it('wraps in a composite when asked for or', async () => {
        const source = fakeSource();
        await mountFB({ source, logic: 'or', value: TWO });
        expect(source.calls.at(-1)).toEqual([{ logic: 'or', filters: TWO }]);
    });

    it('does not wrap a single filter, since one filter has no logic', async () => {
        const source = fakeSource();
        await mountFB({ source, logic: 'or', value: [TWO[0]] });
        expect(source.calls.at(-1)).toEqual([TWO[0]]);
    });

    it('applies a logic set after mount to the source', async () => {
        // `logic` is a model (#292): a parent that writes it changes how the filters already there
        // are joined, without waiting for the next edit.
        const source = fakeSource();
        const el = await mountFB({ source, value: TWO });
        el.logic = 'or';
        await tick(200);
        expect(source.calls.at(-1)).toEqual([{ logic: 'or', filters: TWO }]);
    });
});

// `value` and `logic` are models (#292): an edit writes `value` and announces it with `value-change`
// `{ value }`; the alpha `pdx-filter-change` is gone. A model announces the component's own writes
// only, and nothing in the bar writes `logic` yet, so `logic-change` has no edit to test here.
describe('pdx-filter-builder models', () => {
    it('an edit writes value, the flat descriptors, and announces value-change', async () => {
        const el = await mountFB({ logic: 'or', value: [
            { field: 'name', operator: 'contains', value: 'ada' },
            { field: 'age', operator: 'gt', value: 30 },
        ] });
        const seen: unknown[] = [];
        el.addEventListener('value-change', (e: Event) => seen.push((e as CustomEvent).detail));
        (el.querySelector('.pdx-fb-chip-remove') as HTMLElement).click();
        await tick(50);
        expect(seen.at(-1), 'no value-change after removing a chip').toEqual({ value: [{ field: 'age', operator: 'gt', value: 30 }] });
        expect(el.value).toEqual([{ field: 'age', operator: 'gt', value: 30 }]);
    });

    it('no longer emits pdx-filter-change', async () => {
        const el = await mountFB({ value: [{ field: 'name', operator: 'contains', value: 'ada' }] });
        let alpha = 0;
        el.addEventListener('pdx-filter-change', () => { alpha++; });
        (el.querySelector('.pdx-fb-chip-remove') as HTMLElement).click();
        await tick(50);
        expect(alpha).toBe(0);
    });
});

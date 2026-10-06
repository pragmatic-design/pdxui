// A computed that reads a DataSource's sort, filter or page size sees the new one.
//
// The failure this guards: a `$derived` reading `source.sort()` keeps serving the value it had
// after the grid sorts, while the same read inline in a template is fresh at the same instant and
// the DataSource object itself holds the new sort — the object is right and the computed is not.
// Its signature: adding a SECOND, unrelated computed reading the same signal makes the first one
// correct.
//
// This is the smallest version of that: no grid, no compiler, no DOM.
import { describe, it, expect } from 'vitest';
import { signal, computed, effect, createDataSource, useDataGrid } from '../src/index';

const ROWS = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
];

const src = () => createDataSource({ data: ROWS, pageSize: 10 });

describe('a computed over a DataSource', () => {
    it('sees a sort set after it was first read', () => {
        const source = src();
        const sortField = computed(() => source.sort()[0]?.field ?? '-');
        expect(sortField()).toBe('-');

        source.setSort([{ field: 'name', dir: 'asc' }]);

        expect(sortField(), 'the computed served the sort it was born with').toBe('name');
    });

    it('and a filter, and a page size', () => {
        const source = src();
        const filterCount = computed(() => (source.filter() ?? []).length);
        const size = computed(() => source.pageSize());
        expect(filterCount()).toBe(0);
        expect(size()).toBe(10);

        source.setFilter([{ field: 'name', operator: 'eq', value: 'Ada' }]);
        source.setPageSize(25);

        expect(filterCount(), 'the filter did not reach the computed').toBe(1);
        expect(size(), 'the page size did not reach the computed').toBe(25);
    });

    it('a computed over a computed sees it too', () => {
        // The shape the showcase actually had: one `$derived` assembling the arrangement, another
        // reading it. One level of nesting is where it went wrong on screen.
        const source = src();
        const state = computed(() => ({ sort: source.sort(), filter: source.filter() }));
        const key = computed(() => JSON.stringify(state().sort));
        expect(key()).toBe('[]');

        source.setSort([{ field: 'name', dir: 'desc' }]);

        expect(key(), 'the nested computed served the arrangement it was born with')
            .toBe('[{"field":"name","dir":"desc"}]');
    });

    it('a dependency reached only on a LATER run is subscribed to', () => {
        // The shape the showcase's «changed, not saved» marker has, and the one that reproduces:
        //
        //     viewModified = savedKey !== '' && liveKey !== savedKey
        //
        // `&&` short-circuits, so on the FIRST evaluation — before any view is saved, when
        // `savedKey` is empty — `liveKey` is never read and the computed does not depend on it.
        // It becomes a dependency only once the gate opens. A computed that collects its
        // dependencies on the first run alone never learns about it, and the marker then stays
        // hidden however the arrangement changes.
        const gate = signal('');
        const arrangement = signal('a');
        const changed = computed(() => gate() !== '' && arrangement() !== gate());

        let seen: boolean | null = null;
        const stop = effect(() => { seen = changed(); });
        expect(seen, 'the gate is shut, so nothing has changed yet').toBe(false);

        gate.set('a');                 // a view is saved: the arrangement matches it
        expect(changed()).toBe(false);

        arrangement.set('b');          // and now it moves
        expect(changed(), 'the computed never subscribed to what it read on its second run')
            .toBe(true);
        expect(seen, 'and the effect over it was never told').toBe(true);
        stop();
    });

    it('a chain of computeds passes it on', () => {
        // Two levels, as the page has them: the arrangement is one computed, the comparison
        // another, and a `:show` binding is the effect at the end.
        const value = signal(1);
        const gate = signal(false);
        const key = computed(() => String(value()));
        const out = computed(() => gate() && key() !== '1');

        let seen: boolean | null = null;
        const stop = effect(() => { seen = out(); });
        expect(seen).toBe(false);

        gate.set(true);
        value.set(2);

        expect(out(), 'the second level never learned about the first').toBe(true);
        expect(seen).toBe(true);
        stop();
    });

    it('an effect over the same signal does not change the answer', () => {
        // The failure's signature: a SECOND reader makes the first one correct. If that is
        // true, one of these two assertions passes and the other does not.
        const source = src();
        const alone = computed(() => source.sort()[0]?.field ?? '-');

        const withNeighbour = createDataSource({ data: ROWS, pageSize: 10 });
        const first = computed(() => withNeighbour.sort()[0]?.field ?? '-');
        const second = computed(() => withNeighbour.sort().length);
        let seen = 0;
        const stop = effect(() => { second(); seen++; });

        alone();
        first();
        source.setSort([{ field: 'name', dir: 'asc' }]);
        withNeighbour.setSort([{ field: 'name', dir: 'asc' }]);

        expect(alone(), 'a lone computed is the one that goes stale').toBe('name');
        expect(first(), 'a computed with a neighbour reading the same signal').toBe('name');
        expect(seen).toBeGreaterThan(1);
        stop();
    });
});

// ─── The grid's own columns computed ───────────────────────────────

describe('an effect over useDataGrid().columns', () => {
    it('re-runs when a column is reordered', () => {
        const grid = useDataGrid({
            source: [{ id: 1, a: 1, b: 2, c: 3 }],
            columns: [{ field: 'a' }, { field: 'b' }, { field: 'c' }],
        });

        let runs = 0;
        let order: string[] = [];
        const stop = effect(() => { runs++; order = grid.columns().map((c) => c.field); });
        expect(order).toEqual(['a', 'b', 'c']);
        const before = runs;

        grid.reorder('c', 'a');

        expect(order, 'the effect over columns() did not see the new order').toEqual(['c', 'a', 'b']);
        expect(runs, 'the effect never re-ran').toBeGreaterThan(before);
        stop();
    });

    it('and when a column is hidden', () => {
        const grid = useDataGrid({
            source: [{ id: 1, a: 1, b: 2 }],
            columns: [{ field: 'a' }, { field: 'b' }],
        });

        let visible: string[] = [];
        const stop = effect(() => { visible = grid.columns().filter((c) => c.visible).map((c) => c.field); });
        expect(visible).toEqual(['a', 'b']);

        grid.toggleColumn('b');

        expect(visible, 'hiding a column did not reach an effect over columns()').toEqual(['a']);
        stop();
    });

    it('and when a state is loaded back', () => {
        const grid = useDataGrid({
            source: [{ id: 1, a: 1, b: 2, c: 3 }],
            columns: [{ field: 'a' }, { field: 'b' }, { field: 'c' }],
        });

        let order: string[] = [];
        const stop = effect(() => { order = grid.columns().map((c) => c.field); });
        expect(order).toEqual(['a', 'b', 'c']);

        grid.loadState({ columnOrder: ['b', 'c', 'a'] });

        expect(order, 'restoring an arrangement did not reach an effect over columns()')
            .toEqual(['b', 'c', 'a']);
        stop();
    });
});

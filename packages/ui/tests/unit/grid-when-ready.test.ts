// The grid says when its API can be used.
//
// The grid builds itself in a frame after it connects (`ctx.frame` → `buildGrid`), and until then
// `el.grid` is null and `el.applyState(…)` does nothing — silently. Without a signal, an application
// that puts a saved view back on arrival depends on the order its own `onMount` happens to run in:
// a list header placed BEFORE the grid in the page captures the default arrangement with no
// columns, and a view just saved says it is changed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const COLS = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
];

function append(): Grid {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.data = [{ id: 1, name: 'Ada', city: 'Torino' }];
    document.body.appendChild(el);
    return el;
}

beforeEach(cleanup);

describe('pdx-data-grid whenReady()', () => {
    it('resolves once the grid is built, with its state readable', async () => {
        const el = append();
        await el.whenReady();
        expect(el.grid, 'resolved before the grid existed').not.toBeNull();
        expect(el.grid.saveState().columnOrder).toEqual(['name', 'city']);
    });

    it('control — right after it connects, the grid is not built yet', () => {
        // Why there is something to wait for: the build is a frame away.
        const el = append();
        expect(el.grid ?? null).toBeNull();
    });

    it('says so with pdx-ready, which a listener attached BEFORE the element is up still hears', async () => {
        // The case `whenReady` cannot serve: a page's `:ref` hands the element over before it has
        // connected, so nothing is exposed on it yet — but a listener can be added to any element.
        const el = document.createElement('pdx-data-grid') as Grid;
        let heard = 0;
        el.addEventListener('pdx-ready', () => { heard++; });
        el.columns = COLS;
        el.data = [{ id: 1, name: 'Ada', city: 'Torino' }];
        document.body.appendChild(el);
        await el.whenReady();
        expect(heard, 'no pdx-ready').toBe(1);
        expect(el.grid).not.toBeNull();
        // Once: a rebuild (new columns) is not a second arrival.
        el.columns = [...COLS, { field: 'note', header: 'Note' }];
        await tick(40);
        expect(heard, 'pdx-ready fired again on a rebuild').toBe(1);
    });

    it('a caller that asks late is answered at once', async () => {
        const el = append();
        await el.whenReady();
        await tick(20);
        let answered = false;
        void el.whenReady().then(() => { answered = true; });
        await Promise.resolve();
        expect(answered, 'a late whenReady() waited for a build that already happened').toBe(true);
    });
});

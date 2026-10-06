// The grid's CHROME takes a late dictionary too, not only its header and its rows.
//
// The header and the rows follow a dictionary that lands after the first render: the grid's one
// reactive effect reads `componentStringsChanged()` and rebuilds them. The toolbar, the group bar and
// the footer are built outside that rebuild — `buildToolbar()` writes seven names with `t(…)` once,
// and the `updateToolbar()` the effect calls only redraws the chips — so they must re-read the
// strings too, or a locale switched at runtime leaves «Reload», «Export to CSV» and «Table tools» in
// English under an otherwise translated page.
//
// The rows below name the chrome the way a screen reader meets it, and each has its control: the
// name goes BACK when the override is cleared, which is what says the grid re-reads on any change
// and not only on the first one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource, setLocaleStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;

const PEOPLE = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }];
const COLS = [{ field: 'name', header: 'Name' }];

const IT = {
    'data-grid': {
        'toolbar.label': 'Strumenti tabella',
        'toolbar.reload': 'Ricarica',
        'toolbar.export': 'Esporta in CSV',
        'toolbar.columns': 'Colonne',
        'groupBar.dropHere': 'Trascina qui le colonne per raggruppare',
    },
};

const named = (el: Element, selector: string) =>
    el.querySelector(selector)?.getAttribute('aria-label') ?? null;

describe('a grid whose dictionary lands after its chrome is built', () => {
    let el: Grid;

    beforeEach(async () => {
        el = document.createElement('pdx-data-grid') as Grid;
        el.source = createDataSource(PEOPLE);
        el.columns = COLS;
        el.showToolbar = true;
        el.showGroupBar = true;
        document.body.appendChild(el);
        await tick(40);
        await tick(20);
    });

    afterEach(() => {
        clearComponentStrings();
        cleanup();
    });

    it('starts with the English it registered', () => {
        expect(named(el, '.pdx-dg-toolbar')).toBe('Table tools');
        expect(named(el, '[data-dg-reload]') ?? named(el, '.pdx-dg-toolbar button')).toBe('Reload');
    });

    it('the toolbar takes the translation that arrives afterwards', async () => {
        setLocaleStrings(IT);
        await tick(40);
        await tick(20);

        expect(named(el, '.pdx-dg-toolbar'),
            'the toolbar kept the name it was built with')
            .toBe('Strumenti tabella');
    });

    it('so do the buttons the toolbar names by aria-label alone', async () => {
        setLocaleStrings(IT);
        await tick(40);
        await tick(20);

        const names = [...el.querySelectorAll('.pdx-dg-toolbar button')]
            .map(b => b.getAttribute('aria-label'))
            .filter((n): n is string => !!n);
        expect(names, 'these buttons have no text: the name is all a screen reader reads')
            .toEqual(expect.arrayContaining(['Ricarica', 'Esporta in CSV', 'Colonne']));
    });

    it('the group bar takes it too', async () => {
        setLocaleStrings(IT);
        await tick(40);
        await tick(20);

        expect(el.querySelector('.pdx-dg-group-bar')?.textContent,
            'the empty group bar says what to drop into it')
            .toContain('Trascina qui le colonne per raggruppare');
    });

    it('control — the chrome goes back when the overrides are cleared', async () => {
        setLocaleStrings(IT);
        await tick(40);
        await tick(20);
        expect(named(el, '.pdx-dg-toolbar')).toBe('Strumenti tabella');

        clearComponentStrings();
        await tick(40);
        await tick(20);
        expect(named(el, '.pdx-dg-toolbar'),
            'it re-reads on any change, not only on the first one')
            .toBe('Table tools');
    });
});

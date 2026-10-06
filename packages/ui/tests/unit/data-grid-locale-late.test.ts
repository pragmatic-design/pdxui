// A dictionary that arrives after the grid is on screen reaches it.
//
// The grid writes its accessible names ONCE, with `setAttribute`, at the moment it builds a header
// or a row. That is enough only when the dictionaries are installed before the first render.
//
// A locale loaded as a CHUNK arrives later: a returning Italian visitor gets the page first and the
// dictionary a round-trip later, and what had already rendered would keep the English it was built
// with — on the showcase, `/intake`'s grid header would keep `aria-label="Details"` after everything
// else on the page had turned Italian.
//
// `uiAttr` is what the rest of @pdxui/ui uses, and it is the wrong one here: the grid writes
// a name per ROW, so a virtualised list of thousands would push thousands of entries into its
// registry on every scroll. The grid already has one reactive effect that rebuilds the header and
// the rows, so it reads the registry's version there and rebuilds when it moves.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource, setLocaleStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;

const PEOPLE = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }];
const COLS = [{ field: 'name', header: 'Name' }];

/** The header cell the expandable column reserves — it has no text, only a name. */
const detailHeader = (el: Element) =>
    el.querySelector('.pdx-dg-expand-cell')?.getAttribute('aria-label') ?? null;

describe('a grid on screen when the dictionary lands', () => {
    let el: Grid;

    beforeEach(async () => {
        el = document.createElement('pdx-data-grid') as Grid;
        el.source = createDataSource(PEOPLE);
        el.columns = COLS;
        // An expandable row is what gives the header the one cell whose whole content is its name.
        el.expandable = true;
        document.body.appendChild(el);
        await tick(40);
        await tick(20);
    });

    afterEach(() => {
        clearComponentStrings();
        cleanup();
    });

    it('starts with the English it registered', () => {
        expect(detailHeader(el)).toBe('Details');
    });

    it('takes the translation that arrives afterwards', async () => {
        setLocaleStrings({ 'data-grid': { 'detail.column': 'Dettagli' } });
        await tick(40);
        await tick(20);

        expect(detailHeader(el),
            'the grid kept the English it mounted with: a late dictionary does not reach it')
            .toBe('Dettagli');
    });

    it('control — it goes back when the overrides are cleared', async () => {
        setLocaleStrings({ 'data-grid': { 'detail.column': 'Dettagli' } });
        await tick(40);
        await tick(20);
        expect(detailHeader(el)).toBe('Dettagli');

        clearComponentStrings();
        await tick(40);
        await tick(20);
        expect(detailHeader(el), 'it re-renders on any change, not only on the first one')
            .toBe('Details');
    });
});

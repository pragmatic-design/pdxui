// Closing a searchable pdx-select over a DataSource drops the filter its search set.
//
// The search filters an external source with `setFilter`, and closing the list was meant to drop
// that filter when the user had typed. It emptied the query first and then asked whether the query
// was empty, so the filter was never dropped: the next opening showed the last search's matches with
// an empty search field.
import { describe, it, expect, beforeEach } from 'vitest';
import { createDataSource } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select.pdx';

beforeEach(cleanup);

const rows = () => [{ label: 'Rossi', value: 1 }, { label: 'Verdi', value: 2 }];

async function openWithSource() {
    const ds = createDataSource({ data: rows(), pageSize: 0 });
    const el = await mount('pdx-select', { searchable: '' });
    (el as unknown as { source: unknown }).source = ds;
    await tick(50);
    const search = el.querySelector<HTMLInputElement>('input.pdx-select-search')!;
    search.focus();
    search.dispatchEvent(new FocusEvent('focus'));
    await tick(50);
    return { ds, el, search };
}

const escape = (target: HTMLElement) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

describe('pdx-select over a DataSource — closing after a search', () => {
    it('drops the filter the search set', async () => {
        const { ds, search } = await openWithSource();
        search.value = 'Ross';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(50);
        expect(ds.filter(), 'the search set no filter: the test measures nothing').not.toEqual([]);
        escape(search);
        await tick(50);
        expect(ds.filter(), 'the filter of the last search is still on the source').toEqual([]);
    });

    it('control — closing with nothing typed sets no filter', async () => {
        const { ds, search } = await openWithSource();
        escape(search);
        await tick(50);
        expect(ds.filter()).toEqual([]);
    });
});

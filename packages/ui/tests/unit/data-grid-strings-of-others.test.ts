// A grid rebuilds for its own strings, not for every component's (#407).
//
// The grid tracks the string registry to rebuild its header and rows when a dictionary lands. It
// tracked ANY change, and a component module registers its English defaults when it is imported:
// so every component loaded after the grid — a page's lazy chunk, an editor loaded on first use —
// rebuilt every grid on the page, its header detached under the pointer and its open filter
// popover closed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup } from './helpers';
import { registerComponentStrings, setComponentStrings } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & { columns: unknown; data: unknown; whenReady(): Promise<void> };

async function mount(): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    Object.assign(el, { columns: [{ field: 'name', header: 'Name' }], data: [{ id: 1, name: 'Ada' }] });
    document.body.appendChild(el);
    await el.whenReady();
    await vi.waitFor(() => expect(el.textContent).toContain('Ada'));
    return el;
}

const frames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

describe('pdx-data-grid and the string registry', () => {
    beforeEach(cleanup);

    it('another component registering its strings does not rebuild the grid', async () => {
        const el = await mount();
        const header = el.querySelector('.pdx-dg-th');
        registerComponentStrings('some-component-loaded-later', { hello: 'Hello' });
        await frames();
        expect(el.querySelector('.pdx-dg-th'), 'the header was rebuilt for strings the grid never reads').toBe(header);
    });

    it('control — a dictionary for the grid reaches it', async () => {
        const el = await mount();
        setComponentStrings('data-grid', { 'filter.forColumn': 'Filtra {column}' });
        await vi.waitFor(() => expect(el.querySelector('.pdx-dg-filter-icon')?.getAttribute('aria-label')).toBe('Filtra Name'));
    });
});

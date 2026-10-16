// An editor created before its module has arrived takes the focus when it does (#407).
//
// pdx-data-grid loads its editors on first use (shared/lazy-tags.ts). Here the idle prefetch never
// runs, so the double-click is what asks for pdx-input: the editor is created as an unknown
// element, has no <input> yet, and the grid has to wait for the upgrade before it focuses.
//
// Its own module graph: pdx-input is not loaded by anything else in this file.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup } from './helpers';

vi.stubGlobal('requestIdleCallback', () => 0);
await import('../../src/data-grid/pdx-data-grid');

type Grid = HTMLElement & { columns: unknown; data: unknown; editable: boolean; whenReady(): Promise<void> };

describe('an editor created before its module', () => {
    beforeEach(cleanup);

    it('is focused once it is upgraded', async () => {
        const el = document.createElement('pdx-data-grid') as Grid;
        Object.assign(el, { columns: [{ field: 'name', header: 'Name' }], data: [{ id: 1, name: 'Ada' }], editable: true });
        document.body.appendChild(el);
        await el.whenReady();
        await vi.waitFor(() => expect(el.textContent).toContain('Ada'));
        expect(customElements.get('pdx-input'), 'pdx-input was loaded before the edit asked for it').toBeUndefined();

        el.querySelector<HTMLElement>('.pdx-dg-row[data-row-id="1"] .pdx-dg-td[data-field="name"]')!
            .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await vi.waitFor(() => {
            const input = el.querySelector<HTMLInputElement>('.pdx-dg-cell-editing pdx-input input');
            expect(input, 'the editor was never upgraded').toBeTruthy();
            expect(document.activeElement, 'the upgraded editor did not get the focus').toBe(input);
        }, { timeout: 5000 });
    }, 10_000);
});

// pdx-list loads pdx-spinner only when its loading overlay shows (#963, held here by #969).
//
// This file is its own module graph: it imports nothing but the list.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/list/pdx-list';

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-list');
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-list and pdx-spinner', () => {
    beforeEach(cleanup);

    it('a list with its rows never loads pdx-spinner', async () => {
        await mount({ items: [{ id: 1, label: 'One' }] });
        await tick(50);
        expect(customElements.get('pdx-spinner'), 'pdx-spinner was loaded for a list that is not loading').toBeUndefined();
    });

    it('control — a list whose source loads shows the spinner, and loads it', async () => {
        const source = { data: signal<unknown[]>([]), isLoading: signal(true), refresh: () => {} };
        const el = await mount({ source });
        await customElements.whenDefined('pdx-spinner');
        await tick();
        expect(el.querySelector('pdx-spinner [role="status"]'), 'the spinner did not upgrade').not.toBeNull();
    });
});

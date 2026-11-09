// pdx-block-ui loads pdx-spinner only when the input is first blocked (#969).
//
// Its overlay, the spinner element in it, is built at mount, but drawn only past `delay` while
// blocked: the module, and the stylesheet it draws from since #821, arrive when the block starts.
// Imported statically they were in the first wave of every page with a block-ui (#963).
//
// This file is its own module graph: it imports nothing but the block-ui.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/block-ui/pdx-block-ui';

async function mount(attrs: Record<string, string>): Promise<HTMLElement> {
    const el = document.createElement('pdx-block-ui');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.innerHTML = '<p>content</p>';
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

describe('pdx-block-ui and pdx-spinner', () => {
    beforeEach(cleanup);

    it('a block-ui that is not blocked never loads pdx-spinner', async () => {
        const el = await mount({});
        expect(el.querySelector('.pdx-block-ui-overlay pdx-spinner'), 'the overlay built no spinner: nothing was measured').not.toBeNull();
        await tick(50);
        expect(customElements.get('pdx-spinner'), 'pdx-spinner was loaded for a block-ui that is not blocked').toBeUndefined();
    });

    it('a variant with no spinner does not load it when blocked', async () => {
        await mount({ blocked: '', delay: '0', variant: 'none' });
        await tick(50);
        expect(customElements.get('pdx-spinner'), 'variant="none" loaded a spinner it never draws').toBeUndefined();
    });

    it('control — blocked, it shows the spinner, and loads it', async () => {
        const el = await mount({ blocked: '', delay: '0' });
        await customElements.whenDefined('pdx-spinner');
        await tick();
        expect(el.querySelector('.pdx-block-ui-overlay pdx-spinner [role="status"]'), 'the spinner did not upgrade').not.toBeNull();
    });
});

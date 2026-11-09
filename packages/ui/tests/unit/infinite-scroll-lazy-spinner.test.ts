// pdx-infinite-scroll loads pdx-spinner only when its loading status draws it (#969).
//
// The status builds its spinner the first time it loads; the module, and the stylesheet it draws
// from since #821, arrive then. Imported statically they were in the first wave of every page with an
// infinite scroll (#963).
//
// This file is its own module graph: it imports nothing but the infinite scroll.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/infinite-scroll/pdx-infinite-scroll';

async function mount(loading: boolean): Promise<HTMLElement> {
    const el = document.createElement('pdx-infinite-scroll');
    if (loading) el.setAttribute('loading', '');
    el.innerHTML = '<p>one</p><p>two</p>';
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

describe('pdx-infinite-scroll and pdx-spinner', () => {
    beforeEach(cleanup);

    it('an infinite scroll at rest never loads pdx-spinner', async () => {
        await mount(false);
        await tick(50);
        expect(customElements.get('pdx-spinner'), 'pdx-spinner was loaded for a scroll that is not loading').toBeUndefined();
    });

    it('control — one that loads shows the spinner, and loads it', async () => {
        const el = await mount(true);
        expect(el.querySelector('.pdx-infinite-scroll-loading pdx-spinner'), 'the loading status built no spinner').not.toBeNull();
        await customElements.whenDefined('pdx-spinner');
        await tick();
        expect(el.querySelector('.pdx-infinite-scroll-loading pdx-spinner [role="status"]'), 'the spinner did not upgrade').not.toBeNull();
    });
});

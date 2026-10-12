// pdx-list says it is loading only while it is (#299; beta spec, agents.md, A4).
//
// The list builds a block-UI overlay holding a pdx-spinner — role="status", named «Loading» — and only
// toggled a class on it: idle, the overlay was transparent but still in the accessibility tree, so a
// list that had finished loading announced a «Loading» status beside its rows. pdx-block-ui's rules
// are the model: the overlay is aria-hidden while it is not drawn, and the host is aria-busy while
// its source loads.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/list/pdx-list';

/** The two members of a DataSource the list reads, with loading under the test's control. */
function fakeSource(loading: boolean) {
    return {
        data: signal<unknown[]>([{ id: 1, label: 'One' }]),
        isLoading: signal(loading),
        refresh: () => {},
    };
}

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-list');
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(100);
    return el;
}

const overlay = (el: HTMLElement) => el.querySelector('.pdx-block-ui-overlay')!;

describe('pdx-list busy state', () => {
    beforeEach(cleanup);

    it('a list with static items: the overlay is hidden from assistive technology, the host is not busy', async () => {
        const el = await mount({ items: [{ id: 1, label: 'One' }] });
        expect(overlay(el), 'the list has no overlay: nothing to measure').not.toBeNull();
        expect(overlay(el).getAttribute('aria-hidden'), 'an idle overlay is in the accessibility tree').toBe('true');
        expect(el.hasAttribute('aria-busy')).toBe(false);
    });

    it('over a source: busy and announced while it loads, quiet once it has', async () => {
        const source = fakeSource(true);
        const el = await mount({ source });
        expect(overlay(el).classList.contains('pdx-block-ui-visible'), 'control: the overlay is not drawn while loading').toBe(true);
        expect(overlay(el).hasAttribute('aria-hidden'), 'the loading status is hidden while the list loads').toBe(false);
        expect(el.getAttribute('aria-busy')).toBe('true');

        source.isLoading.set(false);
        await tick(50);
        expect(overlay(el).getAttribute('aria-hidden'), 'the finished list still announces «Loading»').toBe('true');
        expect(el.hasAttribute('aria-busy'), 'the finished list is still busy').toBe(false);

        source.isLoading.set(true);
        await tick(50);
        expect(overlay(el).hasAttribute('aria-hidden')).toBe(false);
        expect(el.getAttribute('aria-busy')).toBe('true');
    });
});

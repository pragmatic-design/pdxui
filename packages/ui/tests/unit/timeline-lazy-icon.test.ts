// pdx-timeline loads pdx-icon only when an item names an icon.
//
// This file is its own module graph: it imports nothing but the timeline.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/timeline/pdx-timeline';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-timeline');
    Object.assign(el, { items });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-timeline and pdx-icon', () => {
    beforeEach(cleanup);

    it('events with dots only never load pdx-icon', async () => {
        const el = await mount([{ key: 'a', title: 'Opened' }, { key: 'b', title: 'Closed' }]);
        expect(el.textContent).toContain('Closed');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for events that name no icon').toBeUndefined();
    });

    it('control — an event that names an icon loads it', async () => {
        const el = await mount([{ key: 'a', title: 'Opened', icon: 'check' }]);
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('check');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

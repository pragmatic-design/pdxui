// pdx-statistic loads pdx-icon only when it has an icon or a trend to draw.
//
// This file is its own module graph: it imports nothing but the statistic.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/statistic/pdx-statistic';

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-statistic');
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-statistic and pdx-icon', () => {
    beforeEach(cleanup);

    it('a title and a value never load pdx-icon', async () => {
        const el = await mount({ title: 'Open tickets', value: '12' });
        expect(el.textContent).toContain('12');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a statistic with no icon').toBeUndefined();
    });

    it('control — a trend draws its arrow, and loads it', async () => {
        const el = await mount({ title: 'Open tickets', value: '12', trend: 'up', trendValue: '+2' });
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('trending-up');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

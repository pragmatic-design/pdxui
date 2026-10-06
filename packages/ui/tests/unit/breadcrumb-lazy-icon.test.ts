// pdx-breadcrumb loads pdx-icon only when a crumb names an icon.
//
// This file is its own module graph: it imports nothing but the breadcrumb.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/breadcrumb/pdx-breadcrumb';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-breadcrumb');
    Object.assign(el, { items });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-breadcrumb and pdx-icon', () => {
    beforeEach(cleanup);

    it('a trail of labels never loads pdx-icon', async () => {
        const el = await mount([{ key: 'a', label: 'Home', href: '/' }, { key: 'b', label: 'Here' }]);
        expect(el.querySelectorAll('.pdx-breadcrumb-item').length).toBe(2);
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for crumbs that name no icon').toBeUndefined();
    });

    it('control — a crumb that names an icon loads it', async () => {
        const el = await mount([{ key: 'a', label: 'Home', href: '/', icon: 'home' }, { key: 'b', label: 'Here' }]);
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('home');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

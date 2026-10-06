// pdx-navbar loads pdx-icon only when the brand or an item names an icon.
//
// This file is its own module graph: it imports nothing but the navbar.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/navbar/pdx-navbar';

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-navbar');
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-navbar and pdx-icon', () => {
    beforeEach(cleanup);

    it('a brand and items without icons never load pdx-icon', async () => {
        const el = await mount({ brand: 'Acme', items: [{ key: 'home', label: 'Home', href: '/' }] });
        expect(el.textContent).toContain('Home');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a navbar that names no icon').toBeUndefined();
    });

    it('control — an item that names an icon loads it', async () => {
        const el = await mount({ brand: 'Acme', items: [{ key: 'home', label: 'Home', href: '/', icon: 'home' }] });
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('home');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

// pdx-split-button loads pdx-icon only when the button or an item names an icon.
//
// This file is its own module graph: it imports nothing but the split button.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/split-button/pdx-split-button';

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-split-button');
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(150);
    return el;
}

describe('pdx-split-button and pdx-icon', () => {
    beforeEach(cleanup);

    it('a label and items without icons never load pdx-icon', async () => {
        const el = await mount({ label: 'Save', items: [{ key: 'draft', label: 'Save as draft' }] });
        expect(el.textContent).toContain('Save');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a button that names no icon').toBeUndefined();
    });

    it('control — a button that names an icon loads it', async () => {
        const el = await mount({ label: 'Save', icon: 'check', items: [{ key: 'draft', label: 'Save as draft' }] });
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('check');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

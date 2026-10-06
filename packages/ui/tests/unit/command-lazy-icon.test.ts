// pdx-command loads pdx-icon only when an item names an icon.
//
// This file is its own module graph: it imports nothing but the command palette.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/command/pdx-command';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-command');
    Object.assign(el, { items, open: true });
    document.body.appendChild(el);
    await tick(150);
    return el;
}

describe('pdx-command and pdx-icon', () => {
    beforeEach(cleanup);

    it('commands with labels only never load pdx-icon', async () => {
        const el = await mount([{ key: 'new', label: 'New ticket' }]);
        expect(el.textContent).toContain('New ticket');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for commands that name no icon').toBeUndefined();
    });

    it('control — a command that names an icon loads it', async () => {
        const el = await mount([{ key: 'new', label: 'New ticket', icon: 'plus' }]);
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('plus');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});

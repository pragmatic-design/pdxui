// pdx-empty-state follows its props after mount: the icon, the title, the description and the action.
//
// The TypeScript version found its icon to update with `.pdx-empty-state-icon pdx-icon`, a pdx-icon
// INSIDE the element with that class, while the class is on the pdx-icon itself: a new `icon` after
// mount was never drawn (found moving it to .pdx, #1210).

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/empty-state/pdx-empty-state.pdx';

async function mount(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(20);
    await tick();
    return document.body.firstElementChild as HTMLElement;
}

async function frames(): Promise<void> {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await tick(20);
}

beforeEach(cleanup);

describe('pdx-empty-state after mount', () => {
    it('draws a new icon', async () => {
        const el = await mount('<pdx-empty-state icon="inbox" title="Nothing"></pdx-empty-state>');
        expect(el.querySelector('[data-part="icon"]')!.getAttribute('name')).toBe('inbox');
        el.setAttribute('icon', 'search');
        await frames();
        expect(el.querySelector('[data-part="icon"]')!.getAttribute('name')).toBe('search');
    });

    it('draws a new title, description and action label', async () => {
        const el = await mount('<pdx-empty-state title="A" description="B" action-label="C"></pdx-empty-state>');
        el.setAttribute('title', 'A2');
        el.setAttribute('description', 'B2');
        el.setAttribute('action-label', 'C2');
        await frames();
        expect(el.querySelector('[data-part="title"]')!.textContent).toBe('A2');
        expect(el.querySelector('[data-part="description"]')!.textContent).toBe('B2');
        expect(el.querySelector('[data-part="action"]')!.textContent).toBe('C2');
    });
});

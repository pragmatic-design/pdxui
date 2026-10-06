// The wizard's Back and Next are the design system's buttons at the wizard's own size, and Back is
// a secondary action as an app draws one.
//
// Pinned at `size="sm"` (34px) whatever the wizard's size, they would sit beside the form's own
// submit, a default button (40px), and a Back drawn as `pdx-outline` has a dark border no other
// secondary action in the app has.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/wizard/pdx-wizard';

beforeEach(cleanup);

async function wizard(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-wizard');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    for (let i = 0; i < 3; i++) {
        const step = document.createElement('div');
        step.setAttribute('data-wizard-step', '');
        step.setAttribute('data-label', `Step ${i + 1}`);
        el.appendChild(step);
    }
    document.body.appendChild(el);
    await tick(100);
    return el;
}

const back = (el: Element) => el.querySelector<HTMLButtonElement>('[data-wizard-back]')!;
const next = (el: Element) => el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;

describe('pdx-wizard navigation buttons', () => {
    it('at the default size they are default-size buttons, not small ones', async () => {
        const el = await wizard();
        expect(back(el).hasAttribute('size'), 'Back is pinned small').toBe(false);
        expect(next(el).hasAttribute('size'), 'Next is pinned small').toBe(false);
    });

    it('and still on the last step, where Next becomes Complete', async () => {
        const el = await wizard({ value: '2' });
        await tick(50);
        expect(next(el).hasAttribute('size')).toBe(false);
    });

    it('a small wizard has small buttons', async () => {
        const el = await wizard({ size: 'sm' });
        expect(back(el).getAttribute('size')).toBe('sm');
        expect(next(el).getAttribute('size')).toBe('sm');
    });

    it('Back is a secondary action (ghost), Next the primary one', async () => {
        const el = await wizard();
        expect(back(el).className).toBe('pdx-ghost');
        expect(next(el).className).toBe('pdx-primary');
    });
});

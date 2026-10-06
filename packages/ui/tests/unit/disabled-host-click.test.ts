// A disabled (or loading) button must not deliver a click to the handler the app bound on its host.
// Disabling only the inner <button> is not enough, because the app's `@click` sits on the HOST: a click
// on the host's box — or, in Chromium, a click that reaches the ancestors of a disabled control — would
// still run it. A disabled «Next» on the last photo would go to «Photo 4 of 3»; with `loading`, a
// double tap on Save would save twice. pdx-toggle has the same shape.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/button/pdx-button';
import '../../src/toggle/pdx-toggle';

async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

async function mount(tag: string, attrs: Record<string, string>): Promise<HTMLElement> {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.innerHTML = '<span class="label">Save</span>';
    document.body.appendChild(el);
    await until(() => el.querySelector('button'), `${tag}'s inner button`);
    return el;
}

/** Clicks a listener on the host receives — what `@click` on <pdx-button> compiles to. */
function hostClicks(el: HTMLElement): { count: number } {
    const seen = { count: 0 };
    el.addEventListener('click', () => { seen.count++; });
    return seen;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a disabled host does not deliver clicks', () => {
    for (const [tag, attr] of [['pdx-button', 'disabled'], ['pdx-button', 'loading'], ['pdx-toggle', 'disabled']] as const) {
        it(`${tag} ${attr}: a click on the host reaches no host listener`, async () => {
            const el = await mount(tag, { [attr]: '' });
            const seen = hostClicks(el);
            el.click();
            expect(seen.count).toBe(0);
        });

        it(`${tag} ${attr}: a click on its content reaches no host listener`, async () => {
            const el = await mount(tag, { [attr]: '' });
            const seen = hostClicks(el);
            el.querySelector('.label')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(seen.count).toBe(0);
        });
    }

    it('the control: an enabled pdx-button delivers exactly one click', async () => {
        const el = await mount('pdx-button', {});
        const seen = hostClicks(el);
        el.click();
        expect(seen.count).toBe(1);
    });

    it('the control: once re-enabled, the click is delivered again', async () => {
        const el = await mount('pdx-button', { disabled: '' });
        const seen = hostClicks(el);
        el.removeAttribute('disabled');
        await new Promise(r => requestAnimationFrame(r));
        el.click();
        expect(seen.count).toBe(1);
    });
});

// pdx-bottom-sheet honours `backdrop`.
//
// The prop is declared ("Show backdrop", default true) and published in custom-elements.json, on the
// site and in the skill, so the component must read it. With `backdrop="false"` the sheet shows no
// backdrop, so nothing behind it is dimmed and no backdrop click can close it; the rest of the
// overlay holds — it opens, Escape closes it.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/bottom-sheet/pdx-bottom-sheet';

type Sheet = HTMLElement & { open: boolean };

async function mountOpen(attrs = ''): Promise<Sheet> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-bottom-sheet open ${attrs}><p>Body</p></pdx-bottom-sheet>`;
    document.body.appendChild(host);
    await tick(100);
    return host.querySelector('pdx-bottom-sheet') as Sheet;
}

const backdropOf = (el: Sheet) => el.querySelector('.pdx-bottom-sheet-backdrop') as HTMLElement | null;
const shown = (el: HTMLElement | null) => !!el && !el.hidden;

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-bottom-sheet backdrop', () => {
    it('backdrop="false" shows no backdrop, and the sheet still opens', async () => {
        const el = await mountOpen('backdrop="false"');
        expect(shown(backdropOf(el)), 'a backdrop is shown although backdrop="false"').toBe(false);
        expect(el.querySelector('.pdx-bottom-sheet')!.hasAttribute('data-open')).toBe(true);
    });

    it('and Escape still closes it', async () => {
        const el = await mountOpen('backdrop="false"');
        let closed = false;
        el.addEventListener('pdx-close', () => { closed = true; });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);
        expect(closed).toBe(true);
    });

    it('the control: by default the backdrop is shown, and a click on it closes the sheet', async () => {
        const el = await mountOpen();
        expect(shown(backdropOf(el))).toBe(true);
        let closed = false;
        el.addEventListener('pdx-close', () => { closed = true; });
        backdropOf(el)!.click();
        await tick(50);
        expect(closed).toBe(true);
    });
});

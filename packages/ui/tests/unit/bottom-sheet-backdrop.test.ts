// pdx-bottom-sheet honours `backdrop`.
//
// The prop is declared ("Show backdrop", default true) and published in custom-elements.json, on the
// site and in the skill, so the component must read it. With `backdrop="false"` the sheet shows no
// backdrop, so nothing behind it is dimmed and no backdrop click can close it; the rest of the
// overlay holds — it opens, Escape closes it.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/bottom-sheet/pdx-bottom-sheet';

type Sheet = HTMLElement & { open: boolean; isOpen: boolean };

/** Whether the sheet announced a close: `open-change` `{ value: false }` since #288. */
function closes(el: Sheet): { value: boolean } {
    const state = { value: false };
    el.addEventListener('open-change', (e: Event) => { if ((e as CustomEvent).detail?.value === false) state.value = true; });
    return state;
}

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
        // Its drawn state is the host's :state(open), measured in Chromium (bottom-sheet-beta-contract.spec.ts).
        expect(el.isOpen).toBe(true);
    });

    it('and Escape still closes it', async () => {
        const el = await mountOpen('backdrop="false"');
        const closed = closes(el);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);
        expect(closed.value).toBe(true);
    });

    it('the control: by default the backdrop is shown, and a click on it closes the sheet', async () => {
        const el = await mountOpen();
        expect(shown(backdropOf(el))).toBe(true);
        const closed = closes(el);
        backdropOf(el)!.click();
        await tick(50);
        expect(closed.value).toBe(true);
    });
});

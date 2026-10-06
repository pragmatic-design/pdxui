// pdx-image's zoom and lightbox from the keyboard, and a lightbox that is a dialog.
//
// An <img> trigger — tabindex -1, no role — with a click handler on its wrapper gives nothing to
// focus, and Enter does nothing. The lightbox is a modal dialog with a name and a close button,
// keeps focus inside, and gives it back to the image on Escape. Zoom tells a screen reader its
// state, not only a class.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/image/pdx-image';

const SRC = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/%3E';

async function mount(attrs: string): Promise<{ el: HTMLElement; trigger: HTMLElement; zooms: boolean[] }> {
    document.body.innerHTML = `<pdx-image lazy="false" placeholder="none" alt="Mountain" src="${SRC}" ${attrs}></pdx-image>`;
    await tick(20);
    const el = document.body.querySelector('pdx-image') as HTMLElement;
    const zooms: boolean[] = [];
    el.addEventListener('pdx-zoom', (e) => zooms.push((e as CustomEvent).detail.zoomed));
    // happy-dom loads no image: say it loaded, as a browser would.
    el.querySelector('img.pdx-img')!.dispatchEvent(new Event('load'));
    return { el, trigger: el.querySelector('.pdx-img-wrapper') as HTMLElement, zooms };
}

const key = (target: Element, k: string) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
};
const lightbox = () => document.querySelector('.pdx-img-lightbox') as HTMLElement | null;

beforeEach(cleanup);
afterEach(() => lightbox()?.remove());

describe('the lightbox', () => {
    it('the image is a button named "View {alt}"', async () => {
        const { trigger } = await mount('lightbox');
        expect(trigger.getAttribute('role')).toBe('button');
        expect(trigger.tabIndex).toBe(0);
        expect(trigger.getAttribute('aria-label')).toBe('View Mountain');
    });

    it('Enter opens a modal dialog named after the image, with a close button that has focus', async () => {
        const { trigger } = await mount('lightbox');
        trigger.focus();
        const ev = key(trigger, 'Enter');
        await tick();
        expect(ev.defaultPrevented).toBe(true);
        const dlg = lightbox()!;
        expect(dlg.getAttribute('role')).toBe('dialog');
        expect(dlg.getAttribute('aria-modal')).toBe('true');
        expect(dlg.getAttribute('aria-label')).toBe('Mountain');
        const close = dlg.querySelector('button.pdx-img-lightbox-close') as HTMLButtonElement;
        expect(close.getAttribute('aria-label')).toBe('Close');
        expect(document.activeElement).toBe(close);
    });

    it('the caption names the dialog when there is one', async () => {
        const { trigger } = await mount('lightbox caption="Alps at dawn"');
        trigger.click();
        await tick();
        expect(lightbox()!.getAttribute('aria-label')).toBe('Alps at dawn');
    });

    it('Escape closes it and returns focus to the image button', async () => {
        const { trigger } = await mount('lightbox');
        trigger.focus();
        key(trigger, 'Enter');
        await tick();
        key(document.activeElement!, 'Escape');
        await tick();
        expect(lightbox()).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('the close button closes it, focus back on the image button', async () => {
        const { trigger } = await mount('lightbox');
        trigger.focus();
        key(trigger, ' ');
        await tick();
        (lightbox()!.querySelector('button.pdx-img-lightbox-close') as HTMLButtonElement).click();
        await tick();
        expect(lightbox()).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('Tab stays inside the dialog', async () => {
        const { trigger } = await mount('lightbox');
        trigger.focus();
        key(trigger, 'Enter');
        await tick();
        const close = lightbox()!.querySelector('button.pdx-img-lightbox-close') as HTMLButtonElement;
        const ev = key(close, 'Tab');
        expect(ev.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(close);
    });
});

describe('zoom', () => {
    it('a zoomable image is a toggle button: Enter zooms, aria-pressed follows, pdx-zoom fires', async () => {
        const { trigger, zooms } = await mount('zoomable');
        expect(trigger.getAttribute('role')).toBe('button');
        expect(trigger.getAttribute('aria-label')).toBe('Zoom Mountain');
        expect(trigger.getAttribute('aria-pressed')).toBe('false');
        key(trigger, 'Enter');
        expect(trigger.getAttribute('aria-pressed')).toBe('true');
        key(trigger, ' ');
        expect(trigger.getAttribute('aria-pressed')).toBe('false');
        expect(zooms).toEqual([true, false]);
    });

    it('a plain image is not a button', async () => {
        const { trigger } = await mount('');
        expect(trigger.hasAttribute('role')).toBe(false);
        expect(trigger.hasAttribute('tabindex')).toBe(false);
    });
});

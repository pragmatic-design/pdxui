// A clickable pdx-card can be pressed from the keyboard, and says what state it is in.
//
// role="button" and tabindex="0" are on the host, so the keydown listener is too: focus sits on the
// host, and a key event bubbles up from there, never reaching an inner div. Enter and Space press a
// card that announces itself as a button. `disabled` and `loading` expose their state.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/card/pdx-card';

async function mount(attrs: string, inner = '<div class="pdx-card-body">Card</div>'): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-card ${attrs}>${inner}</pdx-card>`;
    document.body.appendChild(host);
    await tick(50);
    return host.querySelector('pdx-card') as HTMLElement;
}

function clicks(el: HTMLElement): { n: number } {
    const c = { n: 0 };
    el.addEventListener('pdx-click', () => { c.n++; });
    return c;
}

const press = (target: HTMLElement, key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-card keyboard', () => {
    it('a focused clickable card emits pdx-click on Enter', async () => {
        const el = await mount('clickable');
        const c = clicks(el);
        el.focus();
        const e = press(el, 'Enter');
        expect(c.n).toBe(1);
        expect(e.defaultPrevented).toBe(true);
    });

    it('and on Space', async () => {
        const el = await mount('clickable');
        const c = clicks(el);
        el.focus();
        press(el, ' ');
        expect(c.n).toBe(1);
    });

    it('a key pressed on a control inside the card is left to that control', async () => {
        const el = await mount('clickable', '<div class="pdx-card-body"><button id="inner">Edit</button></div>');
        const c = clicks(el);
        const inner = el.querySelector<HTMLButtonElement>('#inner')!;
        inner.focus();
        const e = press(inner, 'Enter');
        expect(c.n).toBe(0);
        expect(e.defaultPrevented).toBe(false);
    });

    it('a card that is not clickable ignores Enter', async () => {
        const el = await mount('');
        const c = clicks(el);
        press(el, 'Enter');
        expect(c.n).toBe(0);
        expect(el.hasAttribute('role')).toBe(false);
    });
});

describe('pdx-card state', () => {
    it('disabled: aria-disabled="true", out of the tab order, and Enter emits nothing', async () => {
        const el = await mount('clickable disabled');
        const c = clicks(el);
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('aria-disabled')).toBe('true');
        expect(el.hasAttribute('tabindex')).toBe(false);
        press(el, 'Enter');
        expect(c.n).toBe(0);
    });

    it('loading: aria-busy="true", and not while loaded', async () => {
        const el = await mount('loading');
        expect(el.getAttribute('aria-busy')).toBe('true');
        (el as HTMLElement & { loading: boolean }).loading = false;
        await tick(50);
        expect(el.hasAttribute('aria-busy')).toBe(false);
    });

    it('a selected clickable card is announced pressed', async () => {
        const el = await mount('clickable selected');
        expect(el.getAttribute('aria-pressed')).toBe('true');
        (el as HTMLElement & { selected: boolean }).selected = false;
        await tick(50);
        expect(el.hasAttribute('aria-pressed')).toBe(false);
    });

    it('an href card is a link, in the tab order', async () => {
        const el = await mount('href="/docs"');
        expect(el.getAttribute('role')).toBe('link');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.hasAttribute('aria-pressed')).toBe(false);
    });
});

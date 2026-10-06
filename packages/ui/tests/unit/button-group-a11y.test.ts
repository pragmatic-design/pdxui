// pdx-button-group applies one ARIA pattern per mode, in full.
//
// - mode="single": a radiogroup whose buttons are radios, not aria-pressed toggle buttons — a
//   radiogroup must contain radios (axe aria-required-children), or a screen reader announces
//   "radio group" and then toggle buttons. The arrows move the selection, not only focus.
// - mode="multiple" and no mode: role="group"; multiple keeps its aria-pressed toggle buttons.
// - `label` names the group. `aria-label` on the host does too, the host being the element
//   with the role; `label` is the prop the other groups have.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/button/pdx-button';
import '../../src/button-group/pdx-button-group';

type Group = HTMLElement & { value: string; mode: string };

async function mount(html: string): Promise<Group> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(50);
    return host.querySelector('pdx-button-group') as Group;
}

const ALIGN = `
    <pdx-button-group mode="single" value="center">
        <pdx-button value="left">Left</pdx-button>
        <pdx-button value="center">Center</pdx-button>
        <pdx-button value="right">Right</pdx-button>
    </pdx-button-group>`;

const items = (g: HTMLElement) => Array.from(g.querySelectorAll<HTMLButtonElement>('button'));
const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-button-group mode="single" is a radio group', () => {
    it('gives every button role="radio", exactly one checked, and no aria-pressed', async () => {
        const g = await mount(ALIGN);
        expect(g.getAttribute('role')).toBe('radiogroup');
        const btns = items(g);
        expect(btns.map(b => b.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
        expect(btns.map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
        expect(btns.some(b => b.hasAttribute('aria-pressed'))).toBe(false);
    });

    it('does the same for native <button> children', async () => {
        const g = await mount('<pdx-button-group mode="single" value="y"><button value="x">X</button><button value="y">Y</button></pdx-button-group>');
        expect(items(g).map(b => [b.getAttribute('role'), b.getAttribute('aria-checked')]))
            .toEqual([['radio', 'false'], ['radio', 'true']]);
    });

    it('puts the tab stop on the checked radio', async () => {
        const g = await mount(ALIGN);
        expect(items(g).map(b => b.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('ArrowRight moves focus AND the selection, and emits pdx-change', async () => {
        const g = await mount(ALIGN);
        const changes: string[] = [];
        g.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        const [, center, right] = items(g);
        center.focus();
        key(center, 'ArrowRight');
        await tick(50);
        expect(document.activeElement).toBe(right);
        expect(g.value).toBe('right');
        expect(changes).toEqual(['right']);
        expect(items(g).map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
        expect(items(g).map(b => b.tabIndex)).toEqual([-1, -1, 0]);
    });

    it('ArrowLeft from the first wraps to the last and selects it', async () => {
        const g = await mount(ALIGN.replace('value="center"', 'value="left"'));
        const [left] = items(g);
        left.focus();
        key(left, 'ArrowLeft');
        await tick(50);
        expect(g.value).toBe('right');
    });

    it('a click selects once: one pdx-change per click', async () => {
        const g = await mount(ALIGN);
        const changes: string[] = [];
        g.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        items(g)[0].click();
        await tick(50);
        expect(changes).toEqual(['left']);
    });
});

describe('pdx-button-group other modes', () => {
    it('mode="multiple" is a group of aria-pressed toggle buttons, with no radio', async () => {
        const g = await mount('<pdx-button-group mode="multiple" value="bold,italic"><pdx-button value="bold">B</pdx-button><pdx-button value="italic">I</pdx-button><pdx-button value="underline">U</pdx-button></pdx-button-group>');
        expect(g.getAttribute('role')).toBe('group');
        expect(items(g).map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
        expect(items(g).some(b => b.hasAttribute('role') || b.hasAttribute('aria-checked'))).toBe(false);
    });

    it('switching single → multiple takes the radio semantics away', async () => {
        const g = await mount(ALIGN);
        g.mode = 'multiple';
        await tick(50);
        expect(g.getAttribute('role')).toBe('group');
        expect(items(g).some(b => b.hasAttribute('role') || b.hasAttribute('aria-checked'))).toBe(false);
        expect(items(g).map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    });

    it('no mode: an action group, with no selection state on its buttons', async () => {
        const g = await mount('<pdx-button-group><pdx-button>Cut</pdx-button><pdx-button>Copy</pdx-button></pdx-button-group>');
        expect(g.getAttribute('role')).toBe('group');
        expect(items(g).some(b => b.hasAttribute('aria-pressed') || b.hasAttribute('aria-checked') || b.hasAttribute('role'))).toBe(false);
    });
});

describe('pdx-button-group name', () => {
    it('label="Alignment" names the element with the role', async () => {
        const g = await mount(ALIGN.replace('mode="single"', 'mode="single" label="Alignment"'));
        expect(g.getAttribute('aria-label')).toBe('Alignment');
    });

    it('without label, an author aria-label is left as it is', async () => {
        const g = await mount(ALIGN.replace('mode="single"', 'mode="single" aria-label="Text alignment"'));
        expect(g.getAttribute('aria-label')).toBe('Text alignment');
    });
});

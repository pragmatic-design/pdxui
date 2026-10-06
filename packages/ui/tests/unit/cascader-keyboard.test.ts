// pdx-cascader can be driven from the keyboard, and what it shows is visible to assistive
// technology.
//
// The keyboard does more than open it: there is an active option, aria-activedescendant points at
// it, and every column is reachable without a mouse. Disabled options say so to assistive
// technology, not only with a class; search results are options, not plain divs; the search input
// and the clear button have a name.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/cascader/pdx-cascader';

const OPTIONS = [
    { value: 'europe', label: 'Europe', children: [
        { value: 'italy', label: 'Italy', children: [{ value: 'rome', label: 'Rome' }, { value: 'milan', label: 'Milan' }] },
        { value: 'france', label: 'France', children: [{ value: 'paris', label: 'Paris' }] },
    ] },
    { value: 'antarctica', label: 'Antarctica', disabled: true },
    { value: 'asia', label: 'Asia', children: [{ value: 'japan', label: 'Japan', children: [{ value: 'tokyo', label: 'Tokyo' }] }] },
];

type Cascader = HTMLElement & { options: unknown[] };

async function mount(attrs = ''): Promise<Cascader> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-cascader ${attrs}></pdx-cascader>`;
    document.body.appendChild(host);
    const el = host.querySelector('pdx-cascader') as Cascader;
    el.options = OPTIONS;
    await tick(60);
    return el;
}

const trigger = (el: HTMLElement) => el.querySelector('[role="combobox"]') as HTMLElement;
const key = (t: HTMLElement, k: string) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/** The option the combobox (or the focused search input) points at, by its text. */
function active(owner: HTMLElement): string | null {
    const id = owner.getAttribute('aria-activedescendant');
    const opt = id ? document.getElementById(id) : null;
    return opt ? (opt.querySelector('.pdx-cascader-item-label')?.textContent ?? opt.textContent) : null;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-cascader keyboard', () => {
    it('ArrowDown on the trigger opens it on the first option', async () => {
        const el = await mount();
        const t = trigger(el);
        t.focus();
        key(t, 'ArrowDown');
        await tick(20);
        expect(t.getAttribute('aria-expanded')).toBe('true');
        expect(active(t)).toBe('Europe');
        expect(el.querySelector('.pdx-cascader-item.focus')?.textContent).toContain('Europe');
    });

    it('opened with a click, no option carries the keyboard ring', async () => {
        const el = await mount();
        trigger(el).click();
        await tick(20);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
        expect(el.querySelector('.pdx-cascader-item.focus')).toBeNull();
    });

    it('Space opens it too', async () => {
        const el = await mount();
        key(trigger(el), ' ');
        await tick(20);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
    });

    it('walks down, right and down to a leaf, and Enter selects the path', async () => {
        const el = await mount();
        const t = trigger(el);
        const changes: string[][] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));
        const steps: [string, string | null][] = [
            ['ArrowDown', 'Europe'], ['ArrowRight', 'Italy'], ['ArrowDown', 'France'], ['ArrowUp', 'Italy'],
            ['ArrowRight', 'Rome'], ['ArrowDown', 'Milan'], ['ArrowLeft', 'Italy'], ['ArrowRight', 'Rome'], ['End', 'Milan'],
        ];
        for (const [k, expected] of steps) {
            key(t, k);
            await tick(20);
            expect(active(t), `after ${k}`).toBe(expected);
        }
        key(t, 'Enter');
        await tick(20);
        expect(changes).toEqual([['europe', 'italy', 'milan']]);
        expect(t.getAttribute('aria-expanded')).toBe('false');
    });

    it('a disabled option says so, and the arrows skip it', async () => {
        const el = await mount();
        const t = trigger(el);
        key(t, 'ArrowDown');
        await tick(20);
        const antarctica = Array.from(el.querySelectorAll('[role="option"]')).find(o => o.textContent?.includes('Antarctica'))!;
        expect(antarctica.getAttribute('aria-disabled')).toBe('true');
        key(t, 'ArrowDown');
        await tick(20);
        expect(active(t)).toBe('Asia');
        key(t, 'ArrowUp');
        await tick(20);
        expect(active(t)).toBe('Europe');
    });

    it('Escape closes it', async () => {
        const el = await mount();
        const t = trigger(el);
        key(t, 'ArrowDown');
        await tick(20);
        key(t, 'Escape');
        await tick(20);
        expect(t.getAttribute('aria-expanded')).toBe('false');
        expect(t.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('with change-on-select, Enter on a branch selects it', async () => {
        const el = await mount('change-on-select');
        const t = trigger(el);
        const changes: string[][] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));
        key(t, 'ArrowDown');
        await tick(20);
        key(t, 'ArrowRight');
        await tick(20);
        key(t, 'Enter');
        await tick(20);
        expect(changes).toEqual([['europe', 'italy']]);
    });
});

describe('pdx-cascader search', () => {
    it('results are options in a listbox, reached with the arrows from the search input', async () => {
        const el = await mount('searchable');
        key(trigger(el), 'Enter');
        await tick(20);
        const input = el.querySelector('.pdx-cascader-search input') as HTMLInputElement;
        expect(input.getAttribute('aria-label')).toBe('Search options');
        input.value = 'rom';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(20);
        const results = el.querySelectorAll('[role="listbox"] [role="option"]');
        expect(results.length).toBe(1);
        const changes: string[][] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));
        key(input, 'ArrowDown');
        await tick(20);
        expect(active(input)).toBe('Europe / Italy / Rome');
        key(input, 'Enter');
        await tick(20);
        expect(changes).toEqual([['europe', 'italy', 'rome']]);
    });
});

describe('pdx-cascader names', () => {
    it('the clear button is named', async () => {
        const el = await mount('');
        (el as Cascader & { value: string[] }).value = ['europe', 'italy', 'rome'];
        await tick(20);
        expect(el.querySelector('.pdx-input-clear')?.getAttribute('aria-label')).toBe('Clear');
    });
});

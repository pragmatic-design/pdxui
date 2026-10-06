// A group heading that folds its entries.
//
// The reference's `sidemenu/grouping`: an uppercase heading with a chevron, and the group's entries
// fold under it. A `type: 'header'` without children is a plain `div` and the entries after it are
// its siblings, so nothing folds. A header with `children` is a collapsible group: a button heading
// with `aria-expanded` and `aria-controls`, open unless the item says `collapsed: true`.
// Toggling it — or an entry's own group — emits `pdx-toggle`, so an app can keep the state; the
// component keeps nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

const items = (collapsed = false) => [
    { key: 'work', type: 'header', label: 'Work', collapsed, children: [
        { key: 'dashboard', label: 'Dashboard', href: '/' },
        { key: 'board', label: 'Board', href: '/board' },
    ] },
    { key: 'you', type: 'header', label: 'You' },
    { key: 'account', label: 'Account', href: '/account' },
];

async function mount(list: unknown[], attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = list;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const heading = (el: HTMLElement) => el.querySelector('[data-nav-key="work"]') as HTMLElement;
const entry = (el: HTMLElement, key: string) => el.querySelector(`.pdx-nav-item[data-nav-key="${key}"]`);

describe('a header with children', () => {
    beforeEach(cleanup);

    it('is a button heading that says it is open, and says what it opens', async () => {
        const el = await mount(items());
        const h = heading(el);
        expect(h?.localName).toBe('button');
        expect(h.getAttribute('aria-expanded')).toBe('true');
        const group = document.getElementById(h.getAttribute('aria-controls') ?? '');
        expect(group?.getAttribute('role')).toBe('group');
        expect(group?.contains(entry(el, 'dashboard'))).toBe(true);
    });

    it('folds its entries, and opens them again', async () => {
        const el = await mount(items());
        heading(el).click();
        await tick(30);
        expect(heading(el).getAttribute('aria-expanded')).toBe('false');
        expect(entry(el, 'dashboard'), 'the entries are still there').toBeNull();
        expect(entry(el, 'account'), 'folding one group folded another').not.toBeNull();

        heading(el).click();
        await tick(30);
        expect(entry(el, 'dashboard')).not.toBeNull();
    });

    it('emits pdx-toggle with the key and the state, so the app can keep it', async () => {
        const el = await mount(items());
        const seen: unknown[] = [];
        el.addEventListener('pdx-toggle', (e) => seen.push((e as CustomEvent).detail));
        heading(el).click();
        await tick(30);
        heading(el).click();
        await tick(30);
        expect(seen).toEqual([{ key: 'work', expanded: false }, { key: 'work', expanded: true }]);
    });

    it('starts folded when the item says collapsed: true', async () => {
        const el = await mount(items(true));
        expect(heading(el).getAttribute('aria-expanded')).toBe('false');
        expect(entry(el, 'dashboard')).toBeNull();
    });

    it('an entry\'s own group emits pdx-toggle too', async () => {
        const el = await mount([{ key: 'tickets', label: 'Tickets', children: [{ key: 'all', label: 'All' }] }]);
        let detail: unknown = null;
        el.addEventListener('pdx-toggle', (e) => { detail = (e as CustomEvent).detail; });
        (el.querySelector('[data-nav-key="tickets"]') as HTMLElement).click();
        await tick(30);
        expect(detail).toEqual({ key: 'tickets', expanded: true });
    });

    it('is reached by the keyboard like an entry, and ArrowLeft folds it', async () => {
        const el = await mount(items());
        heading(el).focus();
        heading(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
        await tick(30);
        expect(heading(el).getAttribute('aria-expanded')).toBe('false');
        expect((document.activeElement as HTMLElement).getAttribute('data-nav-key')).toBe('work');
    });

    it('with the menu collapsed to icons, its entries stay (only the heading is text)', async () => {
        const el = await mount(items(), { collapsed: '' });
        expect(entry(el, 'dashboard'), 'the icons of a header group vanished').not.toBeNull();
    });

    it('control — a header without children is still a plain, non-interactive heading', async () => {
        const el = await mount(items());
        const plain = [...el.querySelectorAll('.pdx-nav-heading')].find(h => h.textContent === 'You')!;
        expect(plain.localName).toBe('div');
        expect(plain.hasAttribute('aria-expanded')).toBe(false);
    });
});

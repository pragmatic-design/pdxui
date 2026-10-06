// The looks two app shells reached through pdx-nav-menu's internal classes are its API.
//
// An app shell that cannot ask the menu for a compact size, a left-bar active indicator, the chevron
// at the end, actions laid over the row, or a type per level restyles `.pdx-nav-item`,
// `.pdx-nav-chevron`, `.pdx-nav-actions` and `.pdx-nav-row` instead. An internal class is renamed
// without notice, and every app that reached it breaks in silence (CD-C2).
//
// happy-dom loads no stylesheet, so this is the DOM contract the design system's rules hang on: the
// host's classes and each entry's level and indent. The geometry they produce is measured in every
// theme by the nav-menu manifest (pnpm certify).

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

const ITEMS = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'components', label: 'Components', expanded: true, children: [
        { key: 'button', label: 'Button', href: '/button' },
        { key: 'forms', label: 'Forms', expanded: true, children: [
            { key: 'input', label: 'Input', href: '/input' },
            { key: 'deep', label: 'Deep', expanded: true, children: [{ key: 'deeper', label: 'Deeper', href: '/deeper' }] },
        ] },
    ] },
];

async function mount(props: Record<string, unknown> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = ITEMS;
    for (const [k, v] of Object.entries(props)) (el as any)[k] = v;
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const entry = (el: HTMLElement, key: string) => el.querySelector<HTMLElement>(`[data-nav-key="${key}"]`)!;

describe('pdx-nav-menu looks', () => {
    beforeEach(cleanup);

    it('size, indicator, chevron and actions each put one class on the host', async () => {
        const el = await mount({ size: 'sm', indicator: 'border', chevron: 'end', actions: 'overlay' });
        for (const cls of ['pdx-nav-size-sm', 'pdx-nav-indicator-border', 'pdx-nav-chevron-end', 'pdx-nav-actions-overlay']) {
            expect(el.classList.contains(cls), `no ${cls} on the host`).toBe(true);
        }
    });

    it('control — the defaults put none of them, and an unknown value falls back to the default', async () => {
        const plain = await mount();
        const odd = await mount({ size: 'huge', indicator: 'glow', chevron: 'middle', actions: 'floating' });
        for (const el of [plain, odd]) {
            expect([...el.classList].filter(c => /^pdx-nav-(size|indicator|chevron|actions)-/.test(c)), el.outerHTML.slice(0, 80)).toEqual([]);
        }
    });

    it('a change of look after mount moves the class', async () => {
        const el = await mount({ indicator: 'border' });
        (el as any).indicator = 'fill';
        (el as any).size = 'sm';
        await tick(50);
        expect(el.classList.contains('pdx-nav-indicator-border'), 'the border indicator stayed').toBe(false);
        expect(el.classList.contains('pdx-nav-size-sm'), 'the size did not arrive').toBe(true);
    });

    it('each entry says its level, 1-based and 3 at most, which the per-level properties select', async () => {
        const el = await mount();
        expect(entry(el, 'home').dataset.level).toBe('1');
        expect(entry(el, 'components').dataset.level).toBe('1');
        expect(entry(el, 'button').dataset.level).toBe('2');
        expect(entry(el, 'forms').dataset.level).toBe('2');
        expect(entry(el, 'input').dataset.level).toBe('3');
        expect(entry(el, 'deeper').dataset.level, 'a fourth level takes the third one\'s look').toBe('3');
    });

    it('the indent is a custom property the level can override, not an inline padding', async () => {
        const el = await mount({ indent: 24 });
        expect(entry(el, 'home').style.getPropertyValue('--pdx-nav-pad')).toBe('8px');
        expect(entry(el, 'button').style.getPropertyValue('--pdx-nav-pad')).toBe('32px');
        expect(entry(el, 'input').style.getPropertyValue('--pdx-nav-pad')).toBe('56px');
        expect(entry(el, 'input').style.paddingLeft, 'an inline padding wins over every stylesheet rule').toBe('');
    });
});

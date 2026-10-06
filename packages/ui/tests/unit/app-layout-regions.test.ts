// `pdx-app-layout` places children by `data-region`, and it knows exactly four names. A child
// carrying any other one would vanish from the layout without a word, so the component warns.
//
// It is not one of the four, so none of them claims it; and it HAS the attribute, so the `<main>`
// wrap — which takes everything unmarked — skips it too. It stays where it was with no class and
// no `grid-area`:
//
//     header  : class "my-variant pdx-app-header"  grid-area header
//     content : class ""                           grid-area auto     ← silently out of the layout
//
// `content` is the name a reader tries first. It is not a region — the left sidebar is `navbar`,
// and the main area is whatever carries no `data-region` at all.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/app-layout/pdx-app-layout';

/** Mount an app-layout carrying the given children, and collect what it warned about. */
async function mountWith(html: string): Promise<{ el: HTMLElement; warnings: string[] }> {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
    });
    const el = document.createElement('pdx-app-layout');
    el.innerHTML = html;
    document.body.appendChild(el);
    await tick(20);
    spy.mockRestore();
    return { el, warnings };
}

const REGION_WARNINGS = (w: string[]): string[] => w.filter(m => /data-region/.test(m));

describe('pdx-app-layout and its four regions', () => {
    beforeEach(cleanup);
    afterEach(() => vi.restoreAllMocks());

    it('says nothing about the four it knows', async () => {
        const { warnings } = await mountWith(`
            <header data-region="header">h</header>
            <nav data-region="navbar">n</nav>
            <aside data-region="aside">a</aside>
            <footer data-region="footer">f</footer>
            <div>the page</div>
        `);
        expect(REGION_WARNINGS(warnings), 'a valid layout must be silent').toEqual([]);
    });

    it('names the offending value, and the ones it accepts', async () => {
        const { warnings } = await mountWith(`
            <header data-region="header">h</header>
            <div data-region="content">the page</div>
        `);
        const region = REGION_WARNINGS(warnings);
        expect(region.length, 'an unknown data-region must not pass in silence').toBe(1);
        // The message has to carry both halves: what is wrong, and what to write instead. A warning
        // that only says "unknown region" sends the reader back to the source to find the four names.
        expect(region[0]).toContain('content');
        for (const valid of ['header', 'navbar', 'aside', 'footer']) {
            expect(region[0], `the message must list "${valid}"`).toContain(valid);
        }
    });

    it('warns once per element, not once per render', async () => {
        // A warning that repeats gets filtered out of the console, and then it is not a warning.
        // Today this holds because the projection runs once, behind the component's `_built` guard —
        // the assertion is not proving a dedupe mechanism, it is the tripwire for the day that guard
        // moves or the projection becomes reactive.
        const { el, warnings } = await mountWith(`<div data-region="sidebar">x</div>`);
        expect(REGION_WARNINGS(warnings).length).toBe(1);

        const second: string[] = [];
        const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { second.push(a.map(String).join(' ')); });
        (el as unknown as { navbarCollapsed: boolean }).navbarCollapsed = true;
        await tick(20);
        spy.mockRestore();
        expect(REGION_WARNINGS(second), 'a re-render must not repeat it').toEqual([]);
    });

    it('still places the four correctly', async () => {
        // The warning is the point of this story, but it must not have cost the behaviour: the four
        // regions still get their class, and unmarked content still ends up inside <main>.
        const { el } = await mountWith(`
            <header data-region="header">h</header>
            <nav data-region="navbar">n</nav>
            <div id="body">the page</div>
        `);
        expect(el.querySelector('[data-region="header"]')?.className).toContain('pdx-app-header');
        expect(el.querySelector('[data-region="navbar"]')?.className).toContain('pdx-app-navbar');
        expect(el.querySelector('main.pdx-app-main #body'), 'unmarked content belongs to main').toBeTruthy();
    });
});

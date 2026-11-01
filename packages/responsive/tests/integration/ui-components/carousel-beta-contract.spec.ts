// pdx-carousel on the beta contract (#290). The slide shown is the model `index`: `next()`, the arrows,
// the keys, the dots and a swipe write it, and the write announces `index-change` `{ value }` in place of
// `pdx-change` `{ index, item }`; a parent's write moves the slide and announces nothing. `goto` and the
// read-only `index` getter are gone. `animation="fade"` is the custom state `fade`, the slide and the dot
// on show are their `aria-current` and `aria-selected`, and the inner elements are named parts. Autoplay
// does no work on a frozen page (lifecycle.md): it stops with the page and starts again with it, through
// the scope's suspend and resume (#269). Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/**
 * Put `html` in a fresh <div id="f">, give its carousel five slides, and wait for it to build. Five, so
 * that two steps forward is a jump: with three it is one step back.
 */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        (f.querySelector('pdx-carousel') as unknown as { items: unknown[] }).items = [
            { content: '<p style="height: 120px; margin: 0">One</p>' },
            { content: '<p style="height: 120px; margin: 0">Two</p>' },
            { content: '<p style="height: 120px; margin: 0">Three</p>' },
            { content: '<p style="height: 120px; margin: 0">Four</p>' },
            { content: '<p style="height: 120px; margin: 0">Five</p>' },
        ];
    }, html);
    // The dots are written by the build: wait on them, not on a visible box.
    await expect(page.locator('#f pdx-carousel [role="tab"]')).toHaveCount(5);
}

const host = (page: Page) => page.locator('#f pdx-carousel');

/** The position of the dot the carousel marks selected — read in the frozen page's fragment too. */
const selectedDot = (page: Page) => page.evaluate(() => {
    const scope = (window as unknown as { __kept?: HTMLElement }).__kept ?? document.getElementById('f')!;
    const dots = [...scope.querySelectorAll('pdx-carousel [role="tab"]')];
    return dots.findIndex((d) => d.getAttribute('aria-selected') === 'true');
});

/** The slide at the region's left edge, by the position its id carries: the one a sighted user sees. */
const shownSlide = (page: Page) => host(page).evaluate((h) => {
    const region = h.querySelector('[role="region"]')!.getBoundingClientRect();
    const slide = [...h.querySelectorAll('[aria-roledescription="slide"]')]
        .find((s) => Math.abs(s.getBoundingClientRect().left - region.left) < 1);
    return slide ? Number(slide.id.split('-slide-')[1]) : -1;
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=carousel-beta-contract'); });

test('«next» writes the model: index-change { value } once, no pdx-change, nothing bubbles; the slide on show is aria-current', async ({ page }) => {
    await mount(page, '<pdx-carousel label="Gallery"></pdx-carousel>');
    await host(page).evaluate((h) => {
        const log = { values: [] as unknown[], alpha: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('index-change', (e) => log.values.push((e as CustomEvent).detail?.value));
        h.addEventListener('pdx-change', () => { log.alpha++; });
        h.parentElement!.addEventListener('index-change', () => { log.parent++; });
    });
    await page.getByRole('button', { name: 'Next slide' }).click();
    await expect.poll(() => selectedDot(page)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ values: [1], alpha: 0, parent: 0 });
    // What `::index` reads.
    expect(await host(page).evaluate((h) => (h as unknown as { index: number }).index)).toBe(1);
    await expect.poll(() => shownSlide(page)).toBe(1);
    const current = await host(page).evaluate((h) => [...h.querySelectorAll('[aria-current="true"]')].map((s) => s.id.split('-slide-')[1]));
    expect(current).toEqual(['1']);
});

test('a parent\'s write moves the slide, two steps away too, and announces nothing', async ({ page }) => {
    await mount(page, '<pdx-carousel label="Gallery"></pdx-carousel>');
    await host(page).evaluate((h) => {
        (window as unknown as { __changes: number }).__changes = 0;
        h.addEventListener('index-change', () => { (window as unknown as { __changes: number }).__changes++; });
        (h as unknown as { index: number }).index = 2;
    });
    await expect.poll(() => selectedDot(page)).toBe(2);
    await expect.poll(() => shownSlide(page), { message: 'the dots say 2, the slide on show is another' }).toBe(2);
    expect(await page.evaluate(() => (window as unknown as { __changes: number }).__changes)).toBe(0);

    // And back one: the same model, the other way round the loop.
    await host(page).evaluate((h) => { (h as unknown as { index: number }).index = 1; });
    await expect.poll(() => shownSlide(page)).toBe(1);
    expect(await selectedDot(page)).toBe(1);
});

test('goto is gone, the fade state and the parts are declared, and the old classes are not written', async ({ page }) => {
    await mount(page, '<pdx-carousel label="Gallery" animation="fade"></pdx-carousel>');
    const facts = await host(page).evaluate((h) => ({
        goto: typeof (h as unknown as { goto?: unknown }).goto,
        fade: h.matches(':state(fade)'),
        parts: [...new Set([...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')))].sort(),
        classes: ['pdx-carousel-fade', 'pdx-carousel-slide-active', 'pdx-carousel-dot-active']
            .filter((c) => h.querySelector(`.${c}`) !== null),
    }));
    expect(facts).toEqual({
        goto: 'undefined',
        fade: true,
        parts: ['control', 'dot', 'dots', 'root', 'slide', 'track'],
        classes: [],
    });
    // In fade the slide on show is the one drawn opaque.
    const opacity = await host(page).evaluate((h) => getComputedStyle(h.querySelector('[aria-current="true"]')!).opacity);
    expect(opacity).toBe('1');
    // No fade, no state.
    await mount(page, '<pdx-carousel label="Gallery"></pdx-carousel>');
    expect(await host(page).evaluate((h) => h.matches(':state(fade)'))).toBe(false);
});

// Both animations: a fade moves nothing that a freeze can interrupt, a slide is a CSS transition that a
// detached element never finishes — it must not leave the carousel waiting for it after the page is back.
for (const animation of ['fade', 'slide']) test(`${animation}: autoplay stops while its page is frozen and starts again when the page comes back`, async ({ page }) => {
    // The page wrapper is what the router outlet freezes: marked kept-alive and moved, whole, into a
    // DocumentFragment (#268, #269). The carousel in it is disconnected by the same move.
    await mount(page, `<div id="kept"><pdx-carousel label="Gallery" autoplay interval="200" animation="${animation}"></pdx-carousel></div>`);
    // Every slide move, counted as a dot newly selected: an observer sees the frozen fragment too, and a
    // count is not fooled by a loop of three slides coming back to where it was.
    await page.evaluate(() => {
        const w = window as unknown as { __moves: number };
        w.__moves = 0;
        new MutationObserver((records) => {
            for (const r of records) if ((r.target as Element).getAttribute('aria-selected') === 'true') w.__moves++;
        }).observe(document.getElementById('kept')!, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    });
    const moves = () => page.evaluate(() => (window as unknown as { __moves: number }).__moves);
    await expect.poll(moves, { message: 'autoplay never moved a slide' }).toBeGreaterThan(0);

    await page.evaluate(() => {
        const kept = document.getElementById('kept')! as HTMLElement & { _keepAlive?: boolean };
        kept._keepAlive = true;
        const w = window as unknown as { __frozen: DocumentFragment; __kept: HTMLElement };
        w.__kept = kept;
        w.__frozen = document.createDocumentFragment();
        w.__frozen.appendChild(kept);
    });
    const atFreeze = await moves();
    // Five intervals with the page frozen: a fixed window, because what is measured is that nothing
    // happens in it.
    await page.waitForTimeout(1000);
    expect(await moves(), 'slides moved on the frozen page').toBe(atFreeze);

    await page.evaluate(() => {
        document.getElementById('f')!.appendChild((window as unknown as { __kept: HTMLElement }).__kept);
    });
    await expect.poll(moves, { message: 'autoplay did not start again with the page' }).toBeGreaterThan(atFreeze);
});

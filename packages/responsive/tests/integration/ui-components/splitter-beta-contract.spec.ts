// pdx-splitter on the beta contract (#290). It put `.pdx-splitter`, `.pdx-splitter-<orientation>` and,
// while a handle was dragged, `.pdx-splitter-dragging` on its own host, and `.pdx-splitter-handle-active`
// on the handle; the host carries no class now, and those are the custom states `horizontal`,
// `vertical` and `dragging`, the dragged handle its own `:active`. The app's children are the part
// `pane`, each handle the part `gutter`. Its resize events are declared and stay on the splitter.
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the splitter to insert its gutter. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.cssText = 'width: 400px; height: 200px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    // The gutter is written by the build: wait on it, not on a visible box.
    await expect(page.locator('#f [role="separator"]')).toHaveCount(1);
}

const host = (page: Page) => page.locator('#f pdx-splitter');
const states = (page: Page) => host(page).evaluate((h) =>
    ['horizontal', 'vertical', 'dragging'].filter((s) => h.matches(`:state(${s})`)));
const TWO = (o: string) => `<pdx-splitter orientation="${o}"><div>A</div><div>B</div></pdx-splitter>`;

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=splitter-beta-contract'); });

test('horizontal: no class on the host, a row of two pane parts around one gutter part', async ({ page }) => {
    await mount(page, TWO('horizontal'));
    const m = await host(page).evaluate((h) => ({
        cls: h.getAttribute('class'),
        direction: getComputedStyle(h).flexDirection,
        parts: [...h.children].map((c) => c.getAttribute('data-part')),
    }));
    expect(m).toEqual({ cls: null, direction: 'row', parts: ['pane', 'gutter', 'pane'] });
    expect(await states(page)).toEqual(['horizontal']);
});

test('vertical: the vertical state stacks the panes', async ({ page }) => {
    await mount(page, TWO('vertical'));
    expect(await host(page).evaluate((h) => getComputedStyle(h).flexDirection)).toBe('column');
    expect(await states(page)).toEqual(['vertical']);
});

test('a drag: the dragging state while the pointer is down, the gutter drawn active, the panes inert; none after', async ({ page }) => {
    await mount(page, TWO('horizontal'));
    const gutter = page.locator('#f [data-part="gutter"]');
    const look = () => host(page).evaluate((h) => ({
        gutter: getComputedStyle(h.querySelector('[data-part="gutter"]')!).backgroundColor,
        pane: getComputedStyle(h.querySelector('[data-part="pane"]')!).pointerEvents,
    }));
    const resting = await look();
    const box = (await gutter.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await expect.poll(() => states(page)).toEqual(['horizontal', 'dragging']);
    const dragging = await look();
    expect(dragging.pane, 'the panes take no pointer while a gutter is dragged').toBe('none');
    expect(dragging.gutter, 'the dragged gutter is drawn active').not.toBe(resting.gutter);
    await page.mouse.up();
    await expect.poll(() => states(page)).toEqual(['horizontal']);
    expect(await host(page).getAttribute('class')).toBeNull();
});

test('pdx-resize is declared and stays on the splitter', async ({ page }) => {
    await mount(page, TWO('horizontal'));
    await host(page).evaluate((h) => {
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('pdx-resize', () => { log.own++; });
        h.parentElement!.addEventListener('pdx-resize', () => { log.parent++; });
    });
    await page.locator('#f [data-part="gutter"]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ own: 1, parent: 0 });
});

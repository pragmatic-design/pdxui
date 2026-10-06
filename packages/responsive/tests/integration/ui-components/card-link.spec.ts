// A card with `href` is a real link, measured in a browser.
//
// A card that navigates from JS has no `href` in the DOM, no anchor, and `card.click()` on the host
// does nothing — the handler sits on the inner div a real pointer hits, so with a mouse and a
// keyboard it looks correct, and a script believes the card is inert.
//
// Three things need a browser and cannot be asserted in happy-dom: that a programmatic click on the
// HOST really navigates (assigning `window.location.href` there hangs the runner), that the overlay
// does not swallow a button inside the card, and which element is actually on top at the button's
// centre. The DOM shape is asserted in `packages/ui/tests/unit/card-link.test.ts`.
//
// The destination is a fragment, so the measurement never leaves the page.

import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=card-link';
type Read = { href: string | null; hash: string; buttonClicks: number };

const read = (page: Page): Promise<Read> =>
    page.evaluate(() => (window as unknown as { __gotcha: { read(): Read } }).__gotcha.read());

test.describe('pdx-card with href', () => {
    test.beforeEach(async ({ page }) => {
        await openPage(page, BASE);
        await page.waitForSelector('[data-test="linked"]');
    });

    test('the address is in the DOM, on an anchor', async ({ page }) => {
        expect((await read(page)).href, 'the card renders no anchor').toBe('#linked');
    });

    test('a programmatic click on the host navigates', async ({ page }) => {
        // The click a card that navigates from JS ignores.
        expect((await read(page)).hash).toBe('');
        await page.evaluate(() => (window as unknown as { __gotcha: { clickHost(): void } }).__gotcha.clickHost());
        await expect.poll(async () => (await read(page)).hash).toBe('#linked');
    });

    test('a real click on the card navigates too, through the anchor', async ({ page }) => {
        const box = await page.locator('[data-test="linked"] h3').boundingBox();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await expect.poll(async () => (await read(page)).hash).toBe('#linked');
    });

    test('a button inside the card is on top, and gets its own click', async ({ page }) => {
        // The cost of the overlay pattern, and the reason the CSS raises interactive children:
        // without it the anchor covers the button and the card becomes one big link.
        const top = await page.evaluate(() =>
            (window as unknown as { __gotcha: { topAtButton(): string } }).__gotcha.topAtButton());
        expect(top, 'the link overlay is covering the button').toBe('button');

        await page.locator('[data-test="inside"]').click();
        const after = await read(page);
        expect(after.buttonClicks, 'the button never received the click').toBe(1);
        expect(after.hash, 'clicking the button navigated the card').toBe('');
    });

    test('the overlay is what a pointer hits, above the content of the card', async ({ page }) => {
        // The precondition for everything below: a blanket `> * { z-index: 1 }` raises the body of
        // the card above the anchor, so no pointer reaches it — plain clicks still work, through the
        // JS fallback, and every browser affordance does not. Only the interactive children are raised.
        const top = await page.evaluate(() =>
            (window as unknown as { __gotcha: { topAtRealTitle(): string } }).__gotcha.topAtRealTitle());
        expect(top, 'the card content is covering its own link overlay').toBe('A.pdx-card-link');
    });

    test('middle-click opens it in a new tab', async ({ page, context }) => {
        // One of the two affordances a real anchor exists for. A fragment cannot show this — the
        // browser opens no tab for a same-document link — so this card points at a real URL.
        const box = await page.locator('[data-test="real-title"]').boundingBox();
        const [opened] = await Promise.all([
            context.waitForEvent('page'),
            page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: 'middle' }),
        ]);
        await opened.waitForURL(/opened=1/);
        expect(opened.url()).toContain('opened=1');
        expect(page.url(), 'the current tab navigated as well').not.toContain('opened=1');
        await opened.close();
    });

    test('ctrl+click opens it in a new tab, and leaves this one alone', async ({ page, context }) => {
        // `page.mouse.click` takes no `modifiers`: the key is held around it. Worth writing down —
        // passing `{ modifiers: ['Control'] }` there is silently ignored, and the test then measures
        // a plain click and passes for the wrong reason.
        const box = await page.locator('[data-test="real-title"]').boundingBox();
        await page.keyboard.down('Control');
        const [opened] = await Promise.all([
            context.waitForEvent('page'),
            page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2),
        ]);
        await page.keyboard.up('Control');
        await opened.waitForURL(/opened=1/);
        expect(opened.url()).toContain('opened=1');
        expect(page.url(), 'the current tab navigated as well').not.toContain('opened=1');
        await opened.close();
    });
});

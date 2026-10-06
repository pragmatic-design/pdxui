// What an application looks like on paper.
//
// Print is more than cosmetics (no backdrop blur on glass, no shadow on a card): it is the chrome,
// the scrolling regions, the tables and the page breaks. A work order gets signed on paper and an
// invoice gets filed, so "what happens when they press Ctrl+P" is a question a business
// application asks early, and the answer must not be "read the design system".
//
// Playwright emulates print media, so none of this is a matter of taste. Each assertion below
// names what a reader would otherwise discover on the third page of a bad printout.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const box = (page: Page, sel: string) => page.locator(sel).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, display: getComputedStyle(el).display };
});

async function printed(page: Page): Promise<void> {
    await openPage(page, '/print.html');
    await page.emulateMedia({ media: 'print' });
}

test('on screen, the chrome is there — the control for everything below', async ({ page }) => {
    // Without this, "hidden in print" is satisfied by a page that never rendered the chrome.
    await openPage(page, '/print.html');
    for (const part of ['navbar', 'sidebar', 'toolbar', 'fab', 'grid-actions']) {
        const b = await box(page, `[data-test="${part}"]`);
        expect(b.h, `${part} is not visible on screen`).toBeGreaterThan(0);
    }
});

test('the application chrome is not on the paper', async ({ page }) => {
    await printed(page);

    // `grid-actions`: a row's own menu is a control, and a column of them takes
    // width from the data the reader wants on the paper.
    for (const part of ['navbar', 'sidebar', 'toolbar', 'fab', 'toast', 'grid-actions']) {
        const b = await box(page, `[data-test="${part}"]`);
        expect(b.h, `${part} still takes ${b.h}px on paper`).toBe(0);
    }
});

test('the content takes the width the chrome gave back', async ({ page }) => {
    await openPage(page, '/print.html');
    const onScreen = (await box(page, '[data-test="app-main"]')).w;

    await page.emulateMedia({ media: 'print' });
    const onPaper = (await box(page, '[data-test="app-main"]')).w;

    expect(onPaper, 'the main region did not widen once the sidebar left').toBeGreaterThan(onScreen);
});

test('a scrolling region prints its content, not its viewport', async ({ page }) => {
    // On screen the box is 120px over 600px of content; on paper the 480px the reader cannot
    // scroll to are simply missing unless the clip is lifted.
    await printed(page);

    const scroller = await box(page, '[data-test="scroller"]');
    expect(scroller.h, 'the scroll area is still clipped to its screen height').toBeGreaterThan(400);
});

test('a table repeats its header and does not cut a row in half', async ({ page }) => {
    await printed(page);

    const thead = await page.locator('[data-test="thead"]').evaluate(el => getComputedStyle(el).display);
    expect(thead, 'thead must be table-header-group so the browser repeats it on each page')
        .toBe('table-header-group');

    const cut = await page.locator('[data-test="row"]').first()
        .evaluate(el => getComputedStyle(el).breakInside);
    expect(cut, 'a row may be split across two pages').toBe('avoid');
});

test('every row is on the paper: printing is not a screenshot of the viewport', async ({ page }) => {
    await printed(page);
    await expect(page.locator('[data-test="row"]')).toHaveCount(12);
});

test('a card keeps its border and loses its shadow', async ({ page }) => {
    // The three rules that already existed. They are right, and this is what keeps them.
    await printed(page);

    const card = await page.locator('[data-test="card"]').evaluate(el => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, border: s.borderTopWidth };
    });
    expect(card.shadow, 'a shadow prints as a grey smear').toBe('none');
    expect(card.border, 'without the shadow the card needs its border to stay a card').not.toBe('0px');
});

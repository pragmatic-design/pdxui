// `@for … @virtual` (#283), measured in Chromium through what it compiles to, `eachVirtual`: the
// rows that exist are the rows in view, the rows stay children of their `<ul>`, and the two spacers
// that stand for the rest are hidden from assistive technology.
//
// The harness renders 40 px items in a 400 px `<ul>`: ten in view, three of overscan on each side.
import { test, expect, type Page } from './contracts/fixture';
import AxeBuilder from '@axe-core/playwright';
import { openPage } from './contracts/measure';

/** The list's rows — its `<li>`, the spacers and the @empty row aside. */
const rows = (page: Page) => page.locator('[data-test="list"] > li:not([aria-hidden]):not([data-test="empty"])');
const spacers = (page: Page) => page.locator('[data-test="list"] > li[aria-hidden="true"]');

/** Let the observers and the window settle. */
async function frames(page: Page, n = 4): Promise<void> {
    await page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
    }), n);
}

/** Scroll the list to its end, and let it settle. */
async function scrollToEnd(page: Page): Promise<void> {
    await page.locator('[data-test="list"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await frames(page);
}

test.describe('10 000 items in a 400 px list', () => {
    test.beforeEach(async ({ page }) => {
        await openPage(page, '/virtual-list.html');
        await rows(page).first().waitFor();
        await frames(page);
    });

    test('only the visible rows and 2 × overscan are in the DOM, beside two spacers', async ({ page }) => {
        const count = await rows(page).count();
        // 10 in view + 3 of overscan below (none above at the top), and one more partly in view.
        expect(count, `${count} rows for 10 000 items`).toBeGreaterThanOrEqual(10);
        expect(count).toBeLessThanOrEqual(10 + 2 * 3 + 1);
        await expect(spacers(page)).toHaveCount(2);
    });

    test('scrolling to the end renders the last item, and the count stays bounded', async ({ page }) => {
        await scrollToEnd(page);
        await expect(rows(page).last()).toHaveText('Item 9999');
        expect(await rows(page).count()).toBeLessThanOrEqual(10 + 2 * 3 + 1);
    });

    test('the rows are the <ul>\'s own children, in order, and the spacers are aria-hidden', async ({ page }) => {
        const order = await page.locator('[data-test="list"] > li').evaluateAll((els) => els.map((el) => el.getAttribute('aria-hidden') ?? el.textContent));
        expect(order[0], 'the top spacer is not first').toBe('true');
        expect(order[order.length - 1], 'the bottom spacer is not last').toBe('true');
        expect(order.slice(1, 4)).toEqual(['Item 0', 'Item 1', 'Item 2']);
    });

    test('the scroll height still describes the whole list', async ({ page }) => {
        const height = await page.locator('[data-test="list"]').evaluate((el) => el.scrollHeight);
        expect(Math.abs(height - 10000 * 40), `scroll height ${height}`).toBeLessThanOrEqual(2);
    });
});

// #284: what a screen reader and a keyboard get from a list that renders a window. Measured with
// Playwright's role queries and the keyboard, by the role the template gives the container.
test.describe('accessible by its container\'s role', () => {
    test('a list: every rendered item says the total and its own place', async ({ page }) => {
        await openPage(page, '/virtual-list.html');
        await rows(page).first().waitFor();
        const items = page.getByRole('listitem');
        const n = await items.count();
        expect(n).toBeGreaterThan(5);
        for (let i = 0; i < n; i++) {
            await expect(items.nth(i)).toHaveAttribute('aria-setsize', '10000');
            await expect(items.nth(i)).toHaveAttribute('aria-posinset', String(i + 1));
        }
    });

    test('a listbox: End reaches the last option, rendered and focused; ArrowUp the one before', async ({ page }) => {
        await openPage(page, '/virtual-list.html?shape=listbox');
        const first = page.getByRole('option', { name: 'Item 0', exact: true });
        await first.waitFor();
        await first.focus();
        await page.keyboard.press('End');
        const last = page.getByRole('option', { name: 'Item 9999', exact: true });
        await expect(last).toBeFocused();
        await expect(last).toHaveAttribute('aria-posinset', '10000');
        await page.keyboard.press('ArrowUp');
        await expect(page.getByRole('option', { name: 'Item 9998', exact: true })).toBeFocused();
        await expect(page.locator(':focus')).toHaveAttribute('aria-posinset', '9999');
    });

    test('a listbox: ArrowDown, Home, and the roving tabindex', async ({ page }) => {
        await openPage(page, '/virtual-list.html?shape=listbox');
        const first = page.getByRole('option', { name: 'Item 0', exact: true });
        await first.waitFor();
        await expect(first, 'the first option is the one Tab reaches').toHaveAttribute('tabindex', '0');
        await expect(page.getByRole('option', { name: 'Item 1', exact: true })).toHaveAttribute('tabindex', '-1');
        await first.focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('option', { name: 'Item 1', exact: true })).toBeFocused();
        await page.keyboard.press('PageDown');
        await expect(page.locator(':focus'), 'PageDown moved by a page of items').toHaveAttribute('aria-posinset', /^(1[0-2])$/);
        await page.keyboard.press('Home');
        await expect(first).toBeFocused();
    });

    test('a table with a header row: the count and each body row\'s index include it', async ({ page }) => {
        await openPage(page, '/virtual-list.html?shape=table');
        await page.locator('[data-test="list"] tr:not([aria-hidden])').first().waitFor();
        await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '10001');
        const bodyRows = page.locator('[data-test="list"] tr:not([aria-hidden])');
        await expect(bodyRows.first()).toHaveAttribute('aria-rowindex', '2');
        await expect(bodyRows.nth(1)).toHaveAttribute('aria-rowindex', '3');
        // Its rows hold nothing focusable, so the region that scrolls is the tab stop.
        await expect(page.locator('[data-test="list"]')).toHaveAttribute('tabindex', '0');
    });

    test('a focused item scrolled out of the window stays, focused; it leaves when focus does', async ({ page }) => {
        await openPage(page, '/virtual-list.html');
        const button = page.getByRole('button', { name: 'Item 2', exact: true });
        await button.waitFor();
        await button.focus();
        await page.locator('[data-test="list"]').evaluate((el) => { el.scrollTop += 5000; });
        await frames(page);
        await expect(button, 'the focused item was removed with the window').toBeAttached();
        await expect(button).toBeFocused();
        // Still where it was: between the leading spacers, above the window.
        const place = await page.locator('[data-test="list"]').evaluate((ul) => {
            const lis = [...ul.children];
            const at = lis.findIndex((li) => li.textContent === 'Item 2');
            return { at, before: lis[at - 1]?.getAttribute('aria-hidden'), after: lis[at + 1]?.getAttribute('aria-hidden') };
        });
        expect(place, 'the focused item is not between two spacers').toMatchObject({ before: 'true', after: 'true' });
        await page.getByRole('button', { name: 'After the list' }).focus();
        await frames(page);
        await expect(button, 'the item stayed after focus left it').not.toBeAttached();
    });

    // The axe runner of `pnpm certify` measures the manifests' scenarios, not this harness: it is run
    // here, with that runner's tags, on each container and after a scroll that renders a window far
    // from the top.
    for (const shape of ['list', 'listbox', 'table']) {
        test(`axe finds nothing on a ${shape}, at the top and scrolled`, async ({ page }) => {
            await openPage(page, `/virtual-list.html?shape=${shape}`);
            const list = page.locator('[data-test="list"]');
            await list.locator('[data-virtual-index]').first().waitFor();
            const axe = async () => (await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                .include(shape === 'table' ? '[data-test="table"]' : '[data-test="list"]')
                .disableRules(['color-contrast'])
                .analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
            expect(await axe()).toEqual([]);
            await list.evaluate((el) => { el.scrollTop = 200_000; });
            await frames(page);
            expect(await axe()).toEqual([]);
        });
    }

    test('a list gets no keys: ArrowDown does not move focus', async ({ page }) => {
        await openPage(page, '/virtual-list.html');
        const button = page.getByRole('button', { name: 'Item 0', exact: true });
        await button.waitFor();
        await button.focus();
        await page.keyboard.press('ArrowDown');
        await expect(button).toBeFocused();
        await expect(page.getByRole('listitem').first(), 'a list item was made a tab stop').not.toHaveAttribute('tabindex');
        // Its rows hold buttons, so the container needs no tab stop of its own.
        await expect(page.locator('[data-test="list"]')).not.toHaveAttribute('tabindex');
    });
});

test.describe('a paged source: 3 pages of 50', () => {
    test('scrolling to the end loads once per page, and never after the last', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=paged');
        await rows(page).first().waitFor();
        for (let i = 0; i < 5; i++) {
            await scrollToEnd(page);
            await page.waitForTimeout(80); // the fake source answers after 30 ms
        }
        expect(await page.evaluate(() => (window as unknown as { __loadMoreCalls: number }).__loadMoreCalls)).toBe(2);
        await scrollToEnd(page);
        await expect(rows(page).last()).toHaveText('Item 149');
    });

    test('an empty source that is not loading renders @empty', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=empty');
        await expect(page.locator('[data-test="empty"]')).toBeVisible();
    });

    test('control — an empty source that is loading does not', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=loading');
        await frames(page);
        await expect(page.locator('[data-test="empty"]')).toHaveCount(0);
    });
});

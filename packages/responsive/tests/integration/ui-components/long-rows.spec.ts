// Long lists skip the rows below the fold (#285).
//
// `pdx-list`, `pdx-tree` and `pdx-transfer` are not virtualised: 2,000 rows are 2,000 elements, and
// without help the first render lays out every one of them, the thousands nobody can see included.
// Their rows carry `content-visibility: auto`, so Chromium skips the layout of a row until it comes
// near the viewport, and `contain-intrinsic-size: auto <h>` keeps the scrollbar honest meanwhile.
//
// Measured, not asserted from the CSS: which rows Chromium reports as skipped, how long the first
// render spent in layout against the same page with the rule forced off (`?cv=off`), that a far
// row scrolled into view is laid out at its own height, and that the rule does not reach a row
// drawn by the application (the `item` slot), whose overlays and focus rings it would clip.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const ROWS = 2_000;

/** The row selector of each of the three lists on the harness page. */
const LISTS = {
    list: '[data-test="list"] .pdx-list-item',
    tree: '[data-test="tree"] .pdx-tree-item',
    transfer: '[data-test="transfer"] .pdx-transfer-item',
} as const;

async function open(page: Page, cv: 'on' | 'off' = 'on'): Promise<void> {
    await openPage(page, `/long-rows.html?rows=${ROWS}${cv === 'off' ? '&cv=off' : ''}`);
    await page.locator(`html[data-rows="${ROWS}"]`).waitFor({ timeout: 10000 });
    for (const sel of Object.values(LISTS)) await page.locator(sel).first().waitFor({ timeout: 10000 });
}

/**
 * Whether Chromium is rendering the row's contents, or skipping them for `content-visibility: auto`.
 * The harness marks a skipped row `data-skipped` from `contentvisibilityautostatechange`: the row
 * itself never reports hidden to `checkVisibility()`, only its contents are skipped.
 */
function rendered(page: Page, sel: string, nth: 'first' | 'last'): Promise<boolean> {
    const loc = nth === 'first' ? page.locator(sel).first() : page.locator(sel).last();
    return loc.evaluate((el) => !el.hasAttribute('data-skipped'));
}

/** The border-box height of the last row, scrolled into view. */
async function lastRowHeight(page: Page, sel: string): Promise<number> {
    const last = page.locator(sel).last();
    await last.scrollIntoViewIfNeeded();
    return last.evaluate((el) => el.getBoundingClientRect().height);
}

/** `LayoutDuration` spent loading the harness, from CDP: the layout cost of the first render. */
async function firstRenderLayout(page: Page, cv: 'on' | 'off'): Promise<number> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutDuration')!.value;
    const before = await read();
    await open(page, cv);
    const after = await read();
    await cdp.detach();
    return after - before;
}

test.use({ viewport: { width: 1280, height: 600 } });

test('the harness renders every row of the three lists', async ({ page }) => {
    // Without this, "a far row is skipped" is satisfied by a list that never rendered it.
    await open(page);
    for (const [name, sel] of Object.entries(LISTS)) {
        expect(await page.locator(sel).count(), `${name} did not render ${ROWS} rows`).toBe(ROWS);
    }
});

for (const [name, sel] of Object.entries(LISTS)) {
    test(`${name}: a row far below the fold is skipped, a row in view is rendered`, async ({ page }) => {
        await open(page);
        // The three lists are stacked: the tree's and the transfer's first rows start below the list.
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        await expect.poll(() => rendered(page, sel, 'first'), { message: `${name}: the first row is not rendered in view` }).toBe(true);
        expect(await rendered(page, sel, 'last'), `${name}: the last row is laid out with the first in view`).toBe(false);
    });

    test(`${name}: a far row scrolled into view is laid out at its own height`, async ({ page }) => {
        // Its own height is what the same row measures with the rule off, laid out from the start.
        await open(page, 'off');
        const own = await lastRowHeight(page, sel);

        await open(page);
        expect(await rendered(page, sel, 'last'), `${name}: the far row was not skipped to begin with`).toBe(false);
        const far = await page.locator(sel).last().evaluate((el) => el.getBoundingClientRect().height);
        await lastRowHeight(page, sel);
        await expect.poll(() => rendered(page, sel, 'last'), { message: `${name}: the far row stayed skipped in view` }).toBe(true);
        const laidOut = await page.locator(sel).last().evaluate((el) => el.getBoundingClientRect().height);
        expect(laidOut, `${name}: the far row is ${laidOut}px in view, ${own}px with the rule off`).toBeCloseTo(own, 1);
        // The placeholder the row stood on before it was laid out: the estimate is the row's height,
        // so the page does not change length under the reader as rows come into view.
        expect(far, `${name}: the skipped row stood ${far}px tall, the row is ${own}px`).toBeCloseTo(own, 0);
    });
}

test('the control: with the rule forced off, the far rows are laid out on the first render', async ({ page }) => {
    // The two checks above mean nothing unless the page can tell the difference.
    await open(page, 'off');
    for (const [name, sel] of Object.entries(LISTS)) {
        expect(await rendered(page, sel, 'last'), `${name}: a row was skipped with content-visibility forced visible`).toBe(true);
    }
});

test('the first render spends less time in layout than the same page with the rule off', async ({ page }) => {
    // Two loads of each, alternated, the best of each: one load is at the mercy of whatever else the
    // machine is doing, and the claim is about the work, not the noise.
    const off: number[] = [];
    const on: number[] = [];
    for (let i = 0; i < 2; i++) {
        off.push(await firstRenderLayout(page, 'off'));
        on.push(await firstRenderLayout(page, 'on'));
    }
    const best = (xs: number[]) => Math.min(...xs);
    // Measured: 7.5 ms with the rule, 30 ms without (best of two, 6,000 rows). Half is the bound:
    // two loads of the SAME page differ by less, so a rule that stopped applying cannot pass it.
    expect(best(on), `layout ${best(on).toFixed(4)}s with the rule, ${best(off).toFixed(4)}s without`).toBeLessThan(best(off) / 2);
});

for (const [name, sel] of Object.entries(LISTS)) {
    test(`${name}: a focused row draws its focus ring inside itself`, async ({ page }) => {
        // `content-visibility: auto` contains a row's paint: whatever it draws beyond its border box
        // is clipped, the ring of the global `:focus-visible` (offset outward) included. The ring the
        // keyboard user follows has to sit inside the row.
        await open(page);
        const row = page.locator(sel).first();
        await page.keyboard.press('Shift');
        await row.evaluate((el: HTMLElement) => el.focus());
        const ring = await row.evaluate((el) => {
            const s = getComputedStyle(el);
            return { visible: el.matches(':focus-visible'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
        });
        expect(ring.visible, `${name}: the row did not match :focus-visible`).toBe(true);
        expect(ring.style, `${name}: the focused row draws no outline`).not.toBe('none');
        expect(ring.width + ring.offset, `${name}: the ring reaches ${ring.width + ring.offset}px outside the row`).toBeLessThanOrEqual(0);
    });
}

test('a pdx-list row drawn by the item slot carries no content-visibility', async ({ page }) => {
    await open(page);
    const row = page.locator('[data-test="slotted"] .pdx-list-item').first();
    await expect(row.locator('.mine')).toHaveText('Slot row 1');
    expect(await row.evaluate((el) => el.classList.contains('pdx-list-item-text'))).toBe(false);
    expect(await row.evaluate((el) => getComputedStyle(el).contentVisibility)).toBe('visible');
});

// What "it can render a long list" is worth, as a number.
//
// `createVirtualizer` exists and the grid has a virtualisation of its own; a reader who finds them
// only in the generated reference concludes the framework cannot do it.
//
// A page about performance with no number in it is an opinion, so this is where the number in
// `components.md` comes from: render the same grid over 200, 5 000 and 50 000 rows and count the
// row elements that actually exist in the DOM. The claim being measured is not "it is fast" — it
// is that **the DOM stops growing with the data**, which is the only thing virtualisation
// promises and the only one worth writing down.
//
// The control matters as much as the measurement: the same grid with virtualisation OFF renders
// every row, so a change that quietly disabled windowing would show up as the counts converging.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** The row elements the grid has actually put in the DOM (the header is not one of them). */
async function renderedRows(page: Page, rows: number, virtual = true): Promise<number> {
    await openPage(page, `/virtual-rows.html?rows=${rows}${virtual ? '' : '&virtual=off'}`);
    await page.locator(`html[data-rows="${rows}"]`).waitFor({ timeout: 10000 });
    await page.locator('[data-test="grid"] .pdx-dg-row').first().waitFor({ timeout: 10000 });
    return page.locator('[data-test="grid"] .pdx-dg-row').count();
}

test('the harness renders a grid at all', async ({ page }) => {
    // Without this, every bound below is satisfied by a page that rendered nothing.
    expect(await renderedRows(page, 200)).toBeGreaterThan(0);
});

test('the DOM does not grow with the data: 200, 5 000 and 50 000 rows cost the same', async ({ page }) => {
    const small = await renderedRows(page, 200);
    const large = await renderedRows(page, 5_000);
    const huge = await renderedRows(page, 50_000);

    // Measured: **15 row elements at every one of the three sizes** — a 400px viewport
    // over 40px rows is ten visible, plus the overscan the grid keeps on each side. The bound is
    // deliberately looser than the measurement: this asserts the SHAPE (constant, not linear),
    // not a particular implementation's arithmetic. `components.md` quotes the 15.
    for (const [n, count] of [[200, small], [5_000, large], [50_000, huge]] as const) {
        expect(count, `${n} rows put ${count} row elements in the DOM`).toBeLessThan(40);
    }
    // 250× the data, the same DOM. That is the sentence the documentation is allowed to make.
    expect(huge, 'the count grew with the row count: the window is not holding')
        .toBeLessThanOrEqual(small + 2);
});

test('the control: without virtual-scroll the same grid renders every row', async ({ page }) => {
    // The measurement above means nothing unless this one shows the difference.
    const plain = await renderedRows(page, 200, false);
    expect(plain, 'a plain grid rendered a windowed number of rows — is virtualisation on by default now?')
        .toBe(200);
});

test('the scrollable height still describes the whole set', async ({ page }) => {
    // The other half of windowing: the scrollbar has to lie about the DOM and tell the truth about
    // the data, or the user cannot reach row 49 000.
    await openPage(page, '/virtual-rows.html?rows=50000');
    await page.locator('html[data-rows="50000"]').waitFor({ timeout: 10000 });

    const scrollHeight = await page.locator('[data-test="grid"] .pdx-dg-body').evaluate(el => el.scrollHeight);
    // 50 000 rows at 40px is 2 000 000px of content. Anything near the viewport height would mean
    // the spacer is missing and the set is unreachable.
    expect(scrollHeight, 'the body is not tall enough to hold 50 000 rows').toBeGreaterThan(1_000_000);
});

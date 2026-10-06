import { test, expect, type Page } from '@playwright/test';

// The data-grid's header funnel takes room only when it is shown.
//
// `opacity: 0` would hide it and keep its 18px, so a 100px column would spend them on an icon
// nobody can see and truncate its own header ("Code" → "C…"). It collapses to 0 and expands on
// hover, on focus inside the header, and while the column is filtered.
//
// Two of those three cannot be driven from a manifest scenario: a `hover` state rule hovers the
// element it measures, and a 0px-wide button is not hoverable; `.active` is set by the filter
// popover (`gc.popoverFilters`, grid-filter-popover.ts:21), which a scenario's setup cannot reach.
// Static markup here measures the CSS itself, in the header's own flex context. The resting state
// and the focus state are also measured on the real component, in data-grid.manifest.ts
// (`data-grid-narrow-column`).

const HARNESS = '/demo/test-harness.html';

/** A header cell as grid-header.ts builds it: the sort button, then the funnel. */
async function mount(page: Page, iconClass = 'pdx-dg-filter-icon'): Promise<void> {
    await page.goto(HARNESS);
    await page.evaluate((cls) => {
        const host = document.createElement('div');
        host.id = 'dg-host';
        host.innerHTML = `
            <div class="pdx-dg-header" role="row" style="width: 200px">
                <div class="pdx-dg-th" role="columnheader" data-field="code" style="width: 100px">
                    <button class="pdx-dg-sort-btn" type="button">
                        <span class="pdx-dg-th-label">Code</span>
                        <span class="pdx-dg-sort">
                            <span class="pdx-dg-sort-caret pdx-dg-sort-caret-up"></span>
                            <span class="pdx-dg-sort-caret pdx-dg-sort-caret-down"></span>
                        </span>
                    </button>
                    <button class="${cls}" type="button" aria-label="Filter Code">
                        <svg width="14" height="14" viewBox="0 0 24 24"></svg>
                    </button>
                </div>
            </div>`;
        document.body.prepend(host);
    }, iconClass);
}

const iconWidth = (page: Page) =>
    page.locator('#dg-host .pdx-dg-filter-icon').evaluate((el) => el.getBoundingClientRect().width);

test('at rest the funnel is invisible and takes no room', async ({ page }) => {
    await mount(page);
    expect(await iconWidth(page)).toBeLessThanOrEqual(0.5);
    await expect(page.locator('#dg-host .pdx-dg-filter-icon')).toHaveCSS('opacity', '0');
});

test('the room it gives back is the room the label gets: nothing is truncated', async ({ page }) => {
    await mount(page);
    const cut = await page.locator('#dg-host .pdx-dg-th-label')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(cut, 'the header label is cut in a 100px column').toBeLessThanOrEqual(0.5);
});

test('hovering the header shows the funnel and gives it its room', async ({ page }) => {
    await mount(page);
    await page.locator('#dg-host .pdx-dg-th').hover();
    expect(await iconWidth(page), 'the funnel stayed collapsed under the pointer').toBeGreaterThanOrEqual(14);
    // The opacity is transitioned (0.15s), the width is not: poll rather than catch it mid-fade.
    await expect.poll(() => page.locator('#dg-host .pdx-dg-filter-icon')
        .evaluate((el) => parseFloat(getComputedStyle(el).opacity))).toBeGreaterThanOrEqual(0.6);
});

test('a filtered column shows its funnel with nothing hovered or focused', async ({ page }) => {
    await mount(page, 'pdx-dg-filter-icon active');
    expect(await iconWidth(page)).toBeGreaterThanOrEqual(14);
    await expect(page.locator('#dg-host .pdx-dg-filter-icon')).toHaveCSS('opacity', '1');
});

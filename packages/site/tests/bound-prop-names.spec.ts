/**
 * A prop bound in lowercase reaches the component.
 *
 * Bound as `:withborder="${false}"` and emitted under the attribute-form name, core would bind what it
 * read — `el.withborder`, an expando — and the layout would keep `withBorder`'s default: a border under
 * the header and beside the navbar, under a heading that says there is none. The compiler resolves a
 * bound name against the component's declared props; the gallery is also written with the prop's name.
 */
import { test, expect } from '@playwright/test';

/** The pdx-app-layout under the gallery heading `name` — its section is the heading's parent. */
function layoutUnder(page: import('@playwright/test').Page, name: string) {
    return page.locator('.cmp-gallery').getByRole('heading', { name, exact: true }).locator('xpath=..').locator('pdx-app-layout');
}

const navbarBorder = (layout: ReturnType<typeof layoutUnder>) =>
    layout.locator('.pdx-app-navbar').evaluate((el) => getComputedStyle(el).borderRightWidth);

test('"Without Border" has no border beside its navbar; the bordered demo above it does', async ({ page }) => {
    await page.goto('/components/pdx-app-layout', { waitUntil: 'networkidle' });

    const without = layoutUnder(page, 'Without Border');
    await expect(without).toHaveCount(1);
    await expect.poll(() => without.evaluate((el) => (el as HTMLElement & { withBorder: boolean }).withBorder)).toBe(false);
    await expect(without).not.toHaveClass(/pdx-app-with-border/);
    expect(await navbarBorder(without)).toBe('0px');

    // The control: a demo that keeps the default draws the border, so the measure can see one.
    const bordered = page.locator('.cmp-gallery pdx-app-layout.pdx-app-with-border').first();
    await expect(bordered).toHaveCount(1);
    expect(await navbarBorder(bordered)).toBe('1px');
});

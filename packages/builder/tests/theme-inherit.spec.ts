/**
 * A theme that leaves a token to the base still renders — the value falls through to tokens.css and
 * the page is valid. So the gap is invisible by construction, and this panel is what answers the
 * first question a theme author asks: which tokens does this theme not set?
 *
 * The panel reports. It does not judge: whether `glass` leaving `--pdx-font-mono` alone is right is
 * a design decision per theme, and the source cannot tell a choice from a hole.
 *
 * THE COUNTS BELOW ARE MEASUREMENTS against the running builder, and they move when a theme gains
 * or loses a token. If one of these numbers fails, MEASURE the theme before changing the number:
 * the count is the assertion, and moving it to match today is how the panel would stop reporting
 * anything. The named tokens below are the reason for the count, which is why they are asserted
 * beside it rather than instead of it.
 *
 * `glass` has a table header of its own, so the six table-header tokens are not on its list. It
 * does inherit the two control heights: six themes declare them to compensate their density
 * factor, which puts those tokens over the majority and into the set a theme is expected to have a
 * position on. glass carries no density factor and inherits 40px correctly. Both are asserted by
 * name below.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/packages/builder/index.html';

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page, theme: string): Promise<void> {
    await page.goto(`${APP}?theme=${theme}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

test('it reports the count for the selected theme, and the count differs per theme', async ({ page }) => {
    await open(page, 'glass');
    await expect(page.locator('[data-test="inherit-count"]')).toHaveText('8 tokens');

    await open(page, 'cupertino');
    await expect(page.locator('[data-test="inherit-count"]')).toHaveText('1 token');
});

test('it names the tokens, not just how many', async ({ page }) => {
    // A count alone would leave the author exactly where they started.
    await open(page, 'cupertino');
    await expect(page.locator('[data-test="inherit-list"]')).toHaveText('--pdx-button-hover-shadow');

    await open(page, 'glass');
    const listed = await page.locator('[data-test="inherit-list"] .viol-rule').allTextContents();
    expect(listed).toContain('--pdx-font-mono');
    expect(listed).toContain('--pdx-breadcrumb-separator');
    // The two control heights: they are in the contract because the themes with a density factor
    // declare them.
    expect(listed).toContain('--pdx-button-min-height');
    expect(listed).toContain('--pdx-input-min-height');
    // The six absent from this list are the table-header tokens glass sets itself. Asserting
    // their absence pins the reason for the count, so a number that drifts back says which change
    // moved it rather than only that something did.
    // The exact six the contract tracks (THEME_CONTRACT in packages/design/src/engine/
    // theme-contract.ts). Names copied from there, not typed from memory: a token that does not
    // exist can never appear in the list, so a misspelling would make this loop assert nothing.
    for (const gone of [
        '--pdx-table-header-border-color', '--pdx-table-header-border-width',
        '--pdx-table-header-color', '--pdx-table-header-letter-spacing',
        '--pdx-table-header-transform', '--pdx-table-header-weight',
    ]) {
        expect(listed, `${gone} is inherited again — glass lost its own table header`)
            .not.toContain(gone);
    }
    expect(listed).toHaveLength(8);
});

test('the base theme reports zero, and shows no list', async ({ page }) => {
    // neutral IS the base: what it leaves alone is what tokens.css carries, not a hole.
    await open(page, 'neutral');
    await expect(page.locator('[data-test="inherit-count"]')).toHaveText('0 tokens');
    await expect(page.locator('[data-test="inherit-list"]')).toHaveCount(0);
});

test('it follows the theme picker, not only the URL', async ({ page }) => {
    await open(page, 'neutral');
    await page.locator('[data-test="theme"]').selectOption('glass');
    await expect(page.locator('[data-test="inherit-count"]')).toHaveText('8 tokens');
});

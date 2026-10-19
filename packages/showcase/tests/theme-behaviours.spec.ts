/**
 * A theme's behaviours through style queries (#156), in Chromium, on the default target
 * (baseline-2026): the pdx() plugin rewrites the design CSS's `[pdx-input-style="filled"] …` rules
 * into `@container style(--pdx-input-style: filled) { … }`, so the token a theme declares is all it
 * takes — on a subtree with a theme of its own, and in the frame the theme changes.
 *
 * Before, core copied the tokens into attributes on <html> a frame after `setTheme`: a nested
 * `pdx-theme` kept the page's behaviours, and the first frame after a switch showed the old ones.
 *
 * The showcase loads one theme, `pragmatic` (outlined inputs). The theme with other behaviours is
 * declared here, in the layer the themes live in, against the real stylesheet the build (or the dev
 * server, `playwright.dev.config.ts` matches this file too) serves.
 */
import { test, expect, type Page } from './fixture';

const PROBE = '@layer pdx.themes { [pdx-theme="probe-filled"] { --pdx-input-style: filled; } }';

/** Two fields: one in the page's theme, one in a `probe-filled` subtree. */
async function mountFields(page: Page): Promise<void> {
    await page.addStyleTag({ content: PROBE });
    await page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML = '<div class="pdx-input-wrap" data-test="tb-outer"><input class="pdx-input" aria-label="outer"></div>'
            + '<section pdx-theme="probe-filled"><div class="pdx-input-wrap" data-test="tb-inner"><input class="pdx-input" aria-label="inner"></div></section>';
        document.body.appendChild(host);
    });
}

test.beforeEach(async ({ page }) => {
    await page.goto('/account');
    await expect(page.locator('[data-test="pref-density"]')).toBeVisible();
    await mountFields(page);
});

test('a subtree with its own theme gets its own input style; the page keeps its own', async ({ page }) => {
    // filled: `border: none` and a bottom border alone (inputs.css); outlined: a border all round.
    await expect(page.locator('[data-test="tb-inner"]'), 'the nested theme kept the page\'s outlined input').toHaveCSS('border-top-style', 'none');
    await expect(page.locator('[data-test="tb-inner"]')).toHaveCSS('border-bottom-style', 'solid');
    await expect(page.locator('[data-test="tb-outer"]'), 'control: the page\'s own input is outlined').toHaveCSS('border-top-style', 'solid');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('pdx-input-style')),
        'a behaviour attribute is still written on <html>').toBe(false);
});

test('a nested theme that declares no behaviour gets the default, not its parent\'s', async ({ page }) => {
    // tokens.css declares every behaviour token on `:root, [pdx-theme]`: a theme that leaves one out
    // gets the default inside a parent that set it, as it would on a page of its own.
    const focus = await page.evaluate(() => {
        const outer = document.createElement('div');
        outer.style.setProperty('--pdx-input-focus', 'bottom');
        outer.innerHTML = '<section pdx-theme="probe-plain"></section>';
        document.body.appendChild(outer);
        return getComputedStyle(outer.firstElementChild!).getPropertyValue('--pdx-input-focus').trim();
    });
    expect(focus).toBe('ring');
});

test('a theme switch applies in the same frame, with no attribute to wait for', async ({ page }) => {
    const styles = await page.evaluate(() => {
        const root = document.documentElement;
        const outer = document.querySelector('[data-test="tb-outer"]')!;
        const previous = root.getAttribute('pdx-theme');
        const before = getComputedStyle(outer).borderTopStyle;
        root.setAttribute('pdx-theme', 'probe-filled');
        const after = getComputedStyle(outer).borderTopStyle; // same task: no frame has passed
        if (previous) root.setAttribute('pdx-theme', previous);
        return { before, after, restored: getComputedStyle(outer).borderTopStyle };
    });
    expect(styles).toEqual({ before: 'solid', after: 'none', restored: 'solid' });
});

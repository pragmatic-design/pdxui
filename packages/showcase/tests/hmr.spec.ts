/**
 * Edit to screen in development (#246), on the dev server (`playwright.hmr.config.ts`).
 *
 * The spec saves `src/pages/sites.pdx` while `/sites` is open and measures what reaches the page:
 *   · a template edit is in the DOM within 300 ms of the save. The time is taken in Node before
 *     `writeFile`, and the change is seen by a MutationObserver in the page with `Date.now()`, on
 *     the same machine and clock;
 *   · a `<style scoped>` edit changes the computed style while the elements stay the same nodes: a
 *     property set on the section before the edit is still there after, and a value typed into an
 *     unbound input is still in it. A re-render would rebuild both.
 *
 * The file is restored to its original bytes after each test, and the spec refuses to start when
 * the file still carries the marker of a run that was interrupted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from './fixture';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pages', 'sites.pdx');
const MARKER = 'data-test="hmr-probe"';
const ORIGINAL = readFileSync(FILE);

/** The page's opening tag, after which the probe markup goes. */
const SECTION = '<section class="page" data-test="sites">';
/** The rule the style edit changes. */
const GAP = 'gap: var(--pdx-space-md);';

/** The source with the probe added: a line of text and an input no signal is bound to. */
const withProbe = (source: string): string =>
    source.replace(SECTION, `${SECTION}\n    <p ${MARKER}>probe</p>\n    <input data-test="hmr-input" />`);

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
    expect(ORIGINAL.toString('utf8'), 'sites.pdx carries the probe of an interrupted run: restore it from git')
        .not.toContain(MARKER);
    expect(ORIGINAL.toString('utf8')).toContain(SECTION);
    expect(ORIGINAL.toString('utf8')).toContain(GAP);
});

test.afterEach(() => writeFileSync(FILE, ORIGINAL));

/** Open `/sites` and wait for it, so the module is in the dev server's graph. */
async function openSites(page: Page): Promise<void> {
    await page.goto('/sites');
    await expect(page.locator('[data-test="sites"]')).toBeVisible();
    // Let the HMR client connect: an update sent before it does is not received.
    await page.waitForFunction(() => document.querySelector('[data-test="grid"]') !== null);
}

test('a template edit reaches the page within 300 ms of the save', async ({ page }) => {
    await openSites(page);
    await page.evaluate((marker) => {
        const w = window as unknown as { __probeAt?: number };
        new MutationObserver(() => {
            if (w.__probeAt === undefined && document.querySelector(`[${marker}]`)) w.__probeAt = Date.now();
        }).observe(document.body, { childList: true, subtree: true });
    }, MARKER);

    const savedAt = Date.now();
    writeFileSync(FILE, withProbe(ORIGINAL.toString('utf8')));
    await expect(page.locator('[data-test="hmr-probe"]')).toBeVisible({ timeout: 10_000 });
    const shownAt = await page.evaluate(() => (window as unknown as { __probeAt?: number }).__probeAt ?? 0);
    const elapsed = shownAt - savedAt;
    test.info().annotations.push({ type: 'edit to screen', description: `${elapsed} ms` });
    expect(shownAt, 'the observer saw the probe arrive').toBeGreaterThan(0);
    expect(elapsed, 'from the save to the DOM').toBeLessThan(300);
});

test('a style edit swaps the style: the same nodes, and what was typed stays', async ({ page }) => {
    // The probe first, as a full update: it is the unbound input the style edit must not reset.
    const probed = withProbe(ORIGINAL.toString('utf8'));
    writeFileSync(FILE, probed);
    await openSites(page);
    await expect(page.locator('[data-test="hmr-input"]')).toBeVisible();

    await page.locator('[data-test="hmr-input"]').fill('typed before the edit');
    await page.evaluate(() => {
        (document.querySelector('[data-test="sites"]') as HTMLElement & { __hmrMark?: number }).__hmrMark = 246;
    });
    const gapBefore = await page.locator('[data-test="sites"]').evaluate((el) => getComputedStyle(el).rowGap);
    expect(gapBefore).not.toBe('37px');

    writeFileSync(FILE, probed.replace(GAP, 'gap: 37px;'));
    await expect.poll(() => page.locator('[data-test="sites"]').evaluate((el) => getComputedStyle(el).rowGap), {
        message: 'the new style reached the page',
        timeout: 10_000,
    }).toBe('37px');

    const after = await page.evaluate(() => ({
        mark: (document.querySelector('[data-test="sites"]') as HTMLElement & { __hmrMark?: number }).__hmrMark,
        value: (document.querySelector('[data-test="hmr-input"]') as HTMLInputElement).value,
    }));
    expect(after.mark, 'the section is the node it was: nothing re-rendered').toBe(246);
    expect(after.value, 'the unbound input kept what was typed').toBe('typed before the edit');
});

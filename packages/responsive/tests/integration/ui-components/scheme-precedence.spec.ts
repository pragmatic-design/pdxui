// What the author writes in the document survives the OS preference.
//
// Precedence: the user's saved choice, then what the author declared, then the OS. Without the
// middle one, `<html pdx-scheme="light">` is overwritten at import time on any machine set to dark,
// before anything renders, with no warning.
//
// ⚠️ This suite runs with `colorScheme: 'dark'` on the context, and that is the point: a Playwright
// context is born in `light`, so in every other suite the branch that overwrites the author never
// runs.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './contracts/fixture';
import { openPage, waitForReady } from './contracts/measure';

// The scenario page ships `<html … pdx-scheme="light">` in its markup.
const PAGE = '/gotchas.html?case=select-value';

/** Core's entry as the scenario server serves it (`/@fs/` + the absolute path), resolved here
 *  rather than written out: a Windows path, `/@fs/C:/…`, exists on one machine and not in Linux CI. */
const coreAbs = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../core/src/index.ts').replace(/\\/g, '/');
const CORE_ENTRY = `/@fs${coreAbs.startsWith('/') ? '' : '/'}${coreAbs}`;

test.use({ colorScheme: 'dark' });

test.describe('with the OS asking for dark', () => {
    test('a scheme written in the document is kept', async ({ page }) => {
        await openPage(page, PAGE);
        const scheme = await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'));
        expect(scheme, 'the author said light and core overwrote it').toBe('light');
    });

    test('and the API agrees with what is on screen', async ({ page }) => {
        // Adopting the attribute is not enough if `getScheme()` still reports the OS: the first
        // `toggleDarkMode()` would then flip to the value already displayed and appear to do nothing.
        await openPage(page, PAGE);
        const reported = await page.evaluate(async (entry) => {
            const core = await import(entry);
            return (core as { getScheme(): string }).getScheme();
        }, CORE_ENTRY);
        expect(reported, 'getScheme() must match the attribute the page is rendering with').toBe('light');
    });

    test('a saved choice still wins over both', async ({ page }) => {
        await openPage(page, PAGE);
        await page.evaluate(() => localStorage.setItem('pdx-scheme', 'dark'));
        await waitForReady(page, `${PAGE}, reloaded`, () => page.reload());
        const scheme = await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'));
        expect(scheme, 'the user chose, and that outranks the document').toBe('dark');
        await page.evaluate(() => localStorage.removeItem('pdx-scheme'));
    });
});

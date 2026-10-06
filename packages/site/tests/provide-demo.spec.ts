/**
 * The Provide page's "Multiple Values" demo prints every value it provides, `false` included.
 *
 * The provided object is `{ theme: 'dark', locale: 'en', debug: false }`. In DEV the template path
 * renders `false` as empty text, by design (`core/src/renderer/template.ts`), so the box would read
 * `theme: dark, locale: en, debug:`; the demo prints `String(...)`.
 *
 * This suite runs the BUILT site, where the inline render path writes the word `false` either way:
 * it guards the build, not the dev reading.
 */
import { test, expect } from '@playwright/test';

test('pdx-provide: the Multiple Values box names the value of debug', async ({ page }) => {
    await page.goto('/components/pdx-provide', { waitUntil: 'networkidle' });
    const box = page.locator('pdx-demo-comp-provide-multiple .demo-child');
    await expect(box).toHaveCount(1);
    await expect(box).toHaveText(/theme:\s*dark,\s*locale:\s*en,\s*debug:\s*false/);
});

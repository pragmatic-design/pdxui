/**
 * A self-closing component in a gallery does not swallow what follows it.
 *
 * The autocomplete gallery writes `<pdx-autocomplete … />` and then a result line. The HTML parser
 * does not honour `/>` on a non-void element: left as is, it opens the autocomplete, the line becomes
 * its child, and the component — rendering its own content — drops it. The compiler expands the form
 * to an open + close pair.
 */
import { test, expect } from '@playwright/test';

test('each autocomplete demo keeps the result line after the component, outside it', async ({ page }) => {
    await page.goto('/components/pdx-autocomplete', { waitUntil: 'domcontentloaded' });
    const gallery = page.locator('.cmp-gallery');
    for (const label of ['Selected:', 'City:', 'Country:', 'Color:']) {
        const line = gallery.locator('p.result', { hasText: label });
        await expect(line, `the "${label}" line is missing`).toHaveCount(1);
        expect(await line.evaluate((p) => !!p.closest('pdx-autocomplete')), `"${label}" was swallowed by the autocomplete`).toBe(false);
    }
});

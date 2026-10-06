/**
 * Icon-only buttons in the galleries have a name.
 *
 * `aria-label` on `<pdx-button>` is forwarded to the inner `<button>`; left on the host, the icon-only
 * buttons of the button, button-group and badge galleries are announced "button". The galleries give
 * a name, and a button with neither text nor name warns — which these pages must not do.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';

test('the button gallery\'s icon-only buttons are named', async ({ page }) => {
    await page.goto('/components/pdx-button', { waitUntil: 'domcontentloaded' });
    const gallery = page.locator('.cmp-gallery');
    for (const name of ['Settings', 'Notifications', 'Search', 'More actions']) {
        await expect(gallery.getByRole('button', { name, exact: true })).toBeVisible();
    }
});

for (const tag of ['pdx-button', 'pdx-button-group', 'pdx-badge']) {
    test(`${tag}: no gallery button is left without a name`, async ({ page }) => {
        const warnings: string[] = [];
        page.on('console', (m: ConsoleMessage) => {
            if (m.type() === 'warning' && m.text().includes('[pdx-button]')) warnings.push(m.text().slice(0, 200));
        });
        await page.goto(`/components/${tag}`, { waitUntil: 'networkidle' });
        const unnamed = await page.locator('.cmp-gallery pdx-button > button').evaluateAll((btns) =>
            btns.filter((b) => !b.textContent!.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
                .map((b) => b.outerHTML.slice(0, 120)));
        expect(unnamed, 'icon-only buttons with no name').toEqual([]);
        expect(warnings).toEqual([]);
    });
}

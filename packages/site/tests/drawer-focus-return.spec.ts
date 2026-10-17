/**
 * Closing a pdx-drawer puts focus back on the button that opened it, measured in Chromium on the
 * drawer page: after Escape in each of the four positions, after a backdrop click, and after the
 * drawer's own Cancel. Focus left on <body> or on the page host sends a keyboard user back to the top
 * of the page.
 */
import { test, expect, type Page } from '@playwright/test';

async function openWith(page: Page, name: string) {
    const opener = page.getByRole('button', { name, exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Demo drawer' });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(':focus').or(drawer.and(page.locator(':focus')))).toHaveCount(1);
    return { opener, drawer };
}

test('Escape returns focus to the opener, in all four positions', async ({ page }) => {
    await page.goto('/components/pdx-drawer', { waitUntil: 'networkidle' });
    for (const name of ['Right', 'Left', 'Top', 'Bottom']) {
        const { opener, drawer } = await openWith(page, name);
        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();
        await expect(opener, `after Escape from the ${name} drawer`).toBeFocused();
    }
});

test('the backdrop takes a click from the moment it opens (#472)', async ({ page }) => {
    // The backdrop's `visibility` was transitioned with the opacity: for the first frame of the
    // transition it is still `hidden`, so a click there went through to the page. In CI, under load,
    // that frame outlasted the 10 ms between the drawer taking focus and the click. Measured here in
    // the same task that sees `data-open` appear, before any frame can pass.
    await page.goto('/components/pdx-drawer', { waitUntil: 'networkidle' });
    const hit = await page.evaluate(() => new Promise<string>((resolve) => {
        const host = document.querySelector('pdx-drawer[label="Demo drawer"]') as HTMLElement & { open: boolean };
        const backdrop = host.querySelector('.pdx-drawer-backdrop')!;
        new MutationObserver((_, obs) => {
            if (!backdrop.hasAttribute('data-open')) return;
            obs.disconnect();
            const at = document.elementFromPoint(10, 300);
            resolve(at === backdrop ? 'backdrop' : `${at?.tagName.toLowerCase()}.${at?.className}`);
        }).observe(backdrop, { attributes: true, attributeFilter: ['data-open'] });
        host.open = true;
    }));
    expect(hit).toBe('backdrop');
});

test('a backdrop click and the Cancel button return focus to the opener', async ({ page }) => {
    await page.goto('/components/pdx-drawer', { waitUntil: 'networkidle' });
    let { opener, drawer } = await openWith(page, 'Right');
    // The backdrop's left edge: the right drawer covers the other side.
    await page.mouse.click(10, 300);
    await expect(drawer).toBeHidden();
    await expect(opener, 'after a backdrop click').toBeFocused();

    ({ opener, drawer } = await openWith(page, 'Right'));
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer).toBeHidden();
    await expect(opener, 'after Cancel').toBeFocused();
});

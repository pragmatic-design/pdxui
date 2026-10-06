/**
 * Pick a language.
 *
 * The suite runs signed in, and a signed-in person picks the language in the profile
 * menu's Settings: that is the default. The sign-in has a control of its own, a
 * `<pdx-dropdown-menu>` of radios — pass it as `control` (`[data-test="login-locale"]`).
 *
 * The entry is found by its `lang`, not its text: «Italiano · IT» is what a person reads,
 * `lang="it"` is what the entry IS.
 */
import { expect, type Page } from '@playwright/test';

export async function pickLocale(page: Page, value: 'en' | 'it', control?: string): Promise<void> {
    if (control) {
        await page.locator(`${control} button[aria-haspopup="menu"]`).click();
        const entry = page.locator(`.pdx-dropdown-menu-panel [role="menuitemradio"][lang="${value}"]`);
        await entry.click();
        // Closed once picked: the panel leaves the document.
        await expect(page.locator('.pdx-dropdown-menu-panel')).toHaveCount(0);
        return;
    }
    // The profile menu: Settings opens a submenu whose radios are the languages.
    const trigger = page.locator('[data-test="session"] [data-test="profile"]');
    await trigger.click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: /^(Settings|Impostazioni)$/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.locator(`[data-submenu-key="settings"] [role="menuitemradio"][lang="${value}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', value);
}

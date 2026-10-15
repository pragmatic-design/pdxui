// Escape closes the list of a multiple pdx-select after an option has been picked with the mouse.
//
// A multiple select stays open when an option is picked, so the user closes it with Escape. The
// select closes on Escape only from the keydown of its trigger. Focus and the order of mousedown and
// click are measured here with a real mouse in Chromium: happy-dom does not move focus on a click.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

async function mountMultiple(page: Page): Promise<void> {
    await goToScenario(page, 'select-closed', 'neutral', { page: scenarioPage['select-closed'] });
    await settle(page);
    await page.evaluate(() => {
        const el = document.createElement('pdx-select') as HTMLElement & { options: string[] };
        el.setAttribute('multiple', '');
        el.setAttribute('data-test', 'multiple');
        el.style.cssText = 'display:block;width:240px;margin:24px';
        document.body.prepend(el);
        el.options = ['Hardware', 'Security', 'On site'];
    });
    await page.locator('[data-test="multiple"] [role="combobox"]').waitFor();
}

const isOpen = (page: Page): Promise<boolean> =>
    page.evaluate(() => !!document.querySelector('[data-test="multiple"] .pdx-select-dropdown')?.classList.contains('open'));

const focusInSelect = (page: Page): Promise<string> =>
    page.evaluate(() => {
        const a = document.activeElement;
        const inside = !!a && !!document.querySelector('[data-test="multiple"]')?.contains(a);
        return `${a?.tagName.toLowerCase()}.${a?.className} inside=${inside}`;
    });

test.describe('pdx-select multiple — Escape after a pick', () => {
    test('Escape closes the list after an option is clicked', async ({ page }) => {
        await mountMultiple(page);
        await page.locator('[data-test="multiple"] [role="combobox"]').click();
        await expect.poll(() => isOpen(page)).toBe(true);
        await page.getByRole('option', { name: /^Security/ }).click();
        expect(await isOpen(page), 'a multiple select stays open after a pick').toBe(true);
        expect(await focusInSelect(page), 'focus left the select when the option was clicked').toMatch(/inside=true$/);
        await page.keyboard.press('Escape');
        await expect.poll(() => isOpen(page), { message: 'the list is still open after Escape' }).toBe(false);
    });
});

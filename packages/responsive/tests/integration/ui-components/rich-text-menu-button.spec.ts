// pdx-rich-text's heading and list items are WAI-ARIA menu buttons (#417), measured with a real
// keyboard and mouse in Chromium: focus moves, and happy-dom does not move it as a browser does.
//
// Enter or ArrowDown on the trigger opens the menu on its first item; the arrows move between the
// items; Escape closes it and gives the focus back to the trigger; choosing an item runs its command
// and leaves the focus in the editor, where the user goes on typing.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

async function mountEditor(page: Page): Promise<void> {
    await goToScenario(page, 'rich-text-basic', 'neutral', { page: scenarioPage['rich-text-basic'] });
    await settle(page);
    await page.evaluate(() => {
        const el = document.createElement('pdx-rich-text');
        el.setAttribute('toolbar', 'heading list');
        el.setAttribute('data-test', 'menus');
        el.setAttribute('aria-label', 'Body');
        el.style.cssText = 'display:block;width:480px;margin:24px';
        document.body.prepend(el);
    });
    await page.locator('[data-test="menus"] .pdx-rt-toolbar-btn[data-menu="heading"]').waitFor();
}

const trigger = (page: Page, name: 'heading' | 'list') => page.locator(`[data-test="menus"] .pdx-rt-toolbar-btn[data-menu="${name}"]`);
const menu = (page: Page) => page.getByRole('menu');
const focusedName = (page: Page): Promise<string> =>
    page.evaluate(() => (document.activeElement?.textContent ?? '').trim() || document.activeElement?.getAttribute('aria-label') || '');

test.describe('pdx-rich-text — the toolbar\'s menu buttons', () => {
    test('Enter opens on the first item, the arrows move, Escape closes and returns the focus to the trigger', async ({ page }) => {
        await mountEditor(page);
        await trigger(page, 'heading').focus();
        await page.keyboard.press('Enter');
        await expect(menu(page)).toBeVisible();
        await expect(trigger(page, 'heading')).toHaveAttribute('aria-expanded', 'true');
        expect(await focusedName(page)).toBe('Heading 1');

        await page.keyboard.press('ArrowDown');
        expect(await focusedName(page)).toBe('Heading 2');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        expect(await focusedName(page), 'ArrowUp from the first item wraps to the last').toBe('Heading 3');

        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await expect(trigger(page, 'heading')).toHaveAttribute('aria-expanded', 'false');
        await expect(trigger(page, 'heading')).toBeFocused();
    });

    test('ArrowDown on the trigger opens the menu too', async ({ page }) => {
        await mountEditor(page);
        await trigger(page, 'list').focus();
        await page.keyboard.press('ArrowDown');
        await expect(menu(page)).toBeVisible();
        expect(await focusedName(page)).toBe('Bullet list');
    });

    test('choosing an item with the mouse runs it and leaves the focus in the editor', async ({ page }) => {
        await mountEditor(page);
        await page.locator('[data-test="menus"] .pdx-rt-content').click();
        await page.keyboard.type('Title');
        await trigger(page, 'heading').click();
        await menu(page).getByRole('menuitem', { name: 'Heading 2' }).click();
        await expect(menu(page)).toHaveCount(0);
        await expect(page.locator('[data-test="menus"] .pdx-rt-content h2')).toHaveText('Title');
        expect(await page.evaluate(() => !!document.activeElement?.closest('[data-test="menus"] .pdx-rt-content')),
            'the focus left the editor').toBe(true);
    });

    test('a click outside closes the menu', async ({ page }) => {
        await mountEditor(page);
        await trigger(page, 'heading').click();
        await expect(menu(page)).toBeVisible();
        await page.mouse.click(5, 600);
        await expect(menu(page)).toHaveCount(0);
    });
});

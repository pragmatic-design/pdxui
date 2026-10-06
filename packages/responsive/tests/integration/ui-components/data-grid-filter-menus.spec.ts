// pdx-data-grid's two small menus — the inline filter's operators and the toolbar's "+ Add Filter"
// columns — work from the keyboard, and axe finds nothing on them open.
//
// A div item with a click handler has no role, no tab stop, no keys, and an operator button named by
// its symbol ("⊃") says nothing. The unit tests click the buttons (a native button's Enter is its
// click) and dispatch the keys; this presses real keys in Chromium, where the grid's own keyboard
// handling could take them first, and runs axe on the menus, which are appended to the body.
import { test, expect, type Page } from './contracts/fixture';
import AxeBuilder from '@axe-core/playwright';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const DG = 'section:not([hidden]) [data-test="dg"]';
const THEME = THEMES[0];

async function open(page: Page, scenario: string): Promise<void> {
    await goToScenario(page, scenario, THEME, { page: scenarioPage[scenario], scheme: schemeFor(THEME) });
}

/** axe on one element outside the scenario's section, with the axe runner's tags. */
async function axeOn(page: Page, selector: string): Promise<string[]> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include(selector)
        .disableRules(['color-contrast'])
        .analyze();
    return results.violations.map(v => `${v.id} (${v.nodes.length})`);
}

const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');

test.describe('pdx-data-grid filter menus from the keyboard', () => {
    test('operator menu: Enter opens it on the checked operator; ArrowDown, Enter pick the next; Escape returns', async ({ page }) => {
        await open(page, 'data-grid-select-filter');
        const btn = page.locator(`${DG} .pdx-dg-filter-row .pdx-dg-filter-op-btn`).first();
        await expect(btn).toHaveAccessibleName('Name filter: Contains');
        await expect(btn).toHaveAttribute('aria-expanded', 'false');

        await btn.focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu', { name: 'Name filter operator' });
        await expect(menu).toBeVisible();
        await expect(btn).toHaveAttribute('aria-expanded', 'true');
        await expect(menu.getByRole('menuitemradio', { name: 'Contains', checked: true })).toBeFocused();
        expect(await axeOn(page, '.pdx-dg-filter-op-dropdown'), 'axe violations on the open operator menu').toEqual([]);

        await page.keyboard.press('ArrowDown');
        const next = await focusedText(page);
        expect(next, 'ArrowDown did not move to another operator').not.toBe('Contains');
        await page.keyboard.press('Enter');
        await expect(menu).toHaveCount(0);
        await expect(btn).toBeFocused();
        await expect(btn).toHaveAccessibleName(`Name filter: ${next}`);

        await page.keyboard.press('Enter');
        await expect(menu).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(btn).toBeFocused();
        await expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    test('Add Filter menu: Enter opens it on the first column; ArrowDown, Enter open that column\'s filter', async ({ page }) => {
        await open(page, 'data-grid-grouped-toolbar');
        const btn = page.locator(`${DG} .pdx-dg-toolbar`).getByRole('button', { name: '+ Add Filter' });
        await expect(btn).toHaveAttribute('aria-haspopup', 'menu');

        await btn.focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu', { name: 'Add a filter on' });
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem')).toHaveText(['Name', 'City', 'Category']);
        await expect(menu.getByRole('menuitem', { name: 'Name' })).toBeFocused();
        expect(await axeOn(page, '.pdx-dg-col-menu[role="menu"]'), 'axe violations on the open Add Filter menu').toEqual([]);

        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(btn).toBeFocused();

        await page.keyboard.press('Enter');
        await expect(menu).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await expect(menu.getByRole('menuitem', { name: 'City' })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(menu).toHaveCount(0);
        await expect(page.locator('.pdx-dg-filter-popover')).toContainText('City');
    });
});

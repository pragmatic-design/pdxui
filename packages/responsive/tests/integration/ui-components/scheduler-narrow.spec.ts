// pdx-scheduler's bar on a narrow screen (#1020, part 11a), in Chromium. The owner's decision
// (2026-11-16): under a width (a container query on the scheduler, not the viewport) the views are a
// menu, a button named by the view on screen, and the bar takes at most two rows; wide, the view
// buttons are as they were. The view chosen stays the view: nothing switches it by itself.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page, width: number): Promise<Locator> {
    await page.setViewportSize({ width, height: 844 });
    await goToScenario(page, 'scheduler-week', THEME, { page: scenarioPage['scheduler-week'], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}
/** How many rows the bar's items sit on: a new row starts below the bottom of the one before. */
const barRows = (s: Locator) => s.locator('[data-part="toolbar"]').evaluate((bar) => {
    const boxes = [...bar.querySelectorAll<HTMLElement>(':scope > *')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getBoundingClientRect())
        .sort((a, b) => a.top - b.top);
    let rows = 0;
    let bottom = -Infinity;
    for (const b of boxes) {
        if (b.top >= bottom - 1) { rows++; bottom = b.bottom; } else bottom = Math.max(bottom, b.bottom);
    }
    return rows;
});

test.describe('the bar on a phone (390px)', () => {
    test('the views are a menu named by the view on screen, and the bar takes two rows at most', async ({ page }) => {
        const s = await open(page, 390);
        await expect(s.locator('[data-part="viewSwitcher"]')).toBeHidden();
        const menu = s.getByRole('button', { name: 'View: Week' });
        await expect(menu).toBeVisible();
        expect(await barRows(s)).toBeLessThanOrEqual(2);
        await menu.click();
        await expect(page.getByRole('menuitem')).toHaveText(['Day', 'Week', '3 days', 'Month', 'Year', 'Agenda', 'Timeline']);
        await page.getByRole('menuitem', { name: 'Month' }).click();
        await expect(s.getByRole('button', { name: 'View: Month' })).toBeVisible();
        expect(await s.evaluate((el) => (el as unknown as { view: string }).view)).toBe('month');
    });

    test('the view chosen stays the view: a narrow week is still a week', async ({ page }) => {
        const s = await open(page, 390);
        expect(await s.evaluate((el) => (el as unknown as { view: string }).view)).toBe('week');
        await expect(s.locator('[role="columnheader"]').filter({ hasText: 'Sun 27' })).toHaveCount(1);
    });
});

test('wide (1280px), the view buttons are there and the menu is not', async ({ page }) => {
    const s = await open(page, 1280);
    await expect(s.locator('[data-part="viewSwitcher"]')).toBeVisible();
    await expect(s.getByRole('button', { name: 'View: Week' })).toBeHidden();
    expect(await barRows(s)).toBe(1);
});

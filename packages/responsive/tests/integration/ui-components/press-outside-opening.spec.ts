// The press that opens a floating component does not close it, and the next press outside does (#427).
//
// Eight components added their outside-press listener from a timer, so that the opening press would
// not reach it. Now the listener is added when the component opens, and the opening press is told
// apart by its `timeStamp`. A real mouse in Chromium is what makes that measurable: the event's time
// is the browser's, and the order of mousedown, mouseup, click and contextmenu is the real one.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

async function open(page: Page, scenario: string): Promise<void> {
    await goToScenario(page, scenario, 'neutral', { page: scenarioPage[scenario] });
    await settle(page);
}

/** A click on the page, away from every component. */
const clickOutside = (page: Page) => page.mouse.click(1200, 700);

/** Two frames: what an opening schedules has run, and a close it triggered would have happened. */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

for (const [scenario, host] of [
    ['dd-closed', '[data-test="dd"]'],
    ['cascader-closed', '[data-test="casc"]'],
    ['tree-select-closed', '[data-test="ts"]'],
    ['menubar-closed', 'pdx-menubar'],
] as const) {
    test(`${scenario}: a mouse click opens it and it stays open; a click outside closes it`, async ({ page }) => {
        await open(page, scenario);
        const trigger = page.locator(`section:not([hidden]) ${host} [aria-expanded]`).first();
        // Near its start: a narrow cascader's clear button sits at the trigger's centre.
        await trigger.click({ position: { x: 6, y: 6 } });
        await frames(page);
        await expect(trigger, 'the click that opened it closed it').toHaveAttribute('aria-expanded', 'true');
        await clickOutside(page);
        await expect(trigger, 'a click outside left it open').toHaveAttribute('aria-expanded', 'false');
    });
}

test('ctxmenu-closed: a right click opens the menu and it stays open; a click outside closes it', async ({ page }) => {
    await open(page, 'ctxmenu-closed');
    await page.locator('section:not([hidden]) pdx-context-menu').first().click({ button: 'right' });
    await frames(page);
    const menu = page.getByRole('menu');
    await expect(menu, 'the right click that opened it closed it').toBeVisible();
    await clickOutside(page);
    await expect(menu).toBeHidden();
});

test('inline-edit-display: a click starts editing and it stays in edit; a click outside confirms', async ({ page }) => {
    await open(page, 'inline-edit-display');
    const host = page.locator('section:not([hidden]) pdx-inline-edit').first();
    await host.click();
    await frames(page);
    const input = host.locator('input, textarea').first();
    await expect(input, 'the click that started editing ended it').toBeVisible();
    await clickOutside(page);
    await expect(input).toBeHidden();
});

// Typed digits set pdx-time-picker's value, with real keys in Chromium.
//
// Applying the digits is half of it: the segments can show 02 and 15 and pdx-change carry 02:15
// while `el.value` stays at its initial 14:30, if the component never writes it — and a reader of
// the property sees the digits ignored. This spec keeps both halves: the segments (were the digits
// applied?) and the value (can anyone see it?).
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const TP = 'section:not([hidden]) [data-test="tp"]';

async function open(page: Page): Promise<void> {
    await goToScenario(page, 'time-picker-default', 'neutral', { page: scenarioPage['time-picker-default'] });
    await settle(page);
}

const value = (page: Page): Promise<string> =>
    page.evaluate((sel) => (document.querySelector(sel) as HTMLElement & { value: string }).value, TP);

test.describe('pdx-time-picker typed digits', () => {
    test('0 2 on the hour, then 1 5 on the minute, gives 02:15 on the element', async ({ page }) => {
        await open(page);
        await page.locator(`${TP} .pdx-time-value`).first().focus();
        await page.keyboard.type('0215');
        // The segments first: they say whether the digits were applied at all;
        // the element's value then says whether anyone reading it could see them. The segments are
        // repainted in the next frame, so this waits for them rather than reading them at once.
        await expect(page.locator(`${TP} .pdx-time-value`), 'the typed digits were ignored').toHaveText(['02', '15']);
        expect(await value(page), 'the digits were applied but el.value was never written').toBe('02:15');
    });

    test('ArrowUp on the hour of 14:30 gives 15:30 on the element too', async ({ page }) => {
        await open(page);
        await page.locator(`${TP} .pdx-time-value`).first().focus();
        await page.keyboard.press('ArrowUp');
        expect(await value(page)).toBe('15:30');
    });
});

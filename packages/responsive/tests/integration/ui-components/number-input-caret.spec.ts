// pdx-number-input step-mode="caret" with real keys, in Chromium.
//
// The unit tests place the caret with setSelectionRange; here a person's keys place it: Tab into
// the field, End to its end, ArrowLeft onto the tens, ArrowUp. 99 becomes 109 and the caret is
// still after the tens — not put back at the same OFFSET, which would be on another digit.
// The behaviour is the component's, not a theme's: one theme.
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

test('caret mode: the keys step the digit before the caret, and the caret stays on it', async ({ page }) => {
    await goToScenario(page, 'number-input-caret', 'neutral', { page: scenarioPage['number-input-caret'] });
    await settle(page);
    const input = page.locator('section:not([hidden]) [data-test="number-caret"] input');
    await input.focus();
    await page.keyboard.press('End');                 // no max: End moves the caret, 99|
    await page.keyboard.press('ArrowLeft');           // 9|9: the tens
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('109');
    await expect(input).toHaveAttribute('aria-valuenow', '109');
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart), 'the caret left the tens').toBe(2);

    await page.keyboard.press('ArrowUp');             // the tens again
    await expect(input).toHaveValue('119');
    await expect(input).toHaveAttribute('aria-description', 'The arrow keys change the digit before the cursor');
});

test('control — a field with steppers and no step-mode steps by `step` wherever the caret is', async ({ page }) => {
    await goToScenario(page, 'number-input-range', 'neutral', { page: scenarioPage['number-input-range'] });
    await settle(page);
    const input = page.locator('section:not([hidden]) [data-test="number-range"] input');
    await input.focus();
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));   // 4|2: the tens, were it read
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveAttribute('aria-valuenow', '43');
});

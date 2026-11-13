// A pdx-avatar beside the person's name written out is decoration (#1054). `alt` draws the initials,
// picks the colour and names the avatar; with `decorative` it still draws and colours, but leaves the
// accessibility tree, so a screen reader does not read the name twice — once as an image, once as
// the text beside it. Without `decorative`, an `alt` is still a named img.
//
// Read off the browser's accessibility tree with getByRole, which is the measurement.

import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const SCENARIO = 'avatar-decorative';
const THEME = THEMES[0];

test.describe('a decorative pdx-avatar', () => {
    test.beforeEach(async ({ page }) => {
        await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
    });

    test('draws the initials and the colour of its name', async ({ page }) => {
        const decorative = page.locator('section:not([hidden]) [data-test="av-decorative"]');
        const named = page.locator('section:not([hidden]) [data-test="av-named"]');
        await expect(decorative.locator('[data-part="fallback"]')).toHaveText('AJ');
        // The same name gives the same colour: decorative changes what is announced, not what is drawn.
        const bg = (el: Element) => getComputedStyle(el.querySelector('[data-part="root"]')!).backgroundColor;
        expect(await decorative.evaluate(bg)).toBe(await named.evaluate(bg));
    });

    test('is not in the accessibility tree', async ({ page }) => {
        const decorative = page.locator('section:not([hidden]) [data-test="av-decorative"]');
        await expect(decorative.getByRole('img'), 'a decorative avatar is still an img').toHaveCount(0);
        await expect(page.getByRole('img', { name: 'Alice Johnson' }), 'the control: one named img, not two')
            .toHaveCount(1);
    });

    test('is named again when decorative is removed', async ({ page }) => {
        const decorative = page.locator('section:not([hidden]) [data-test="av-decorative"]');
        await decorative.evaluate((el) => el.removeAttribute('decorative'));
        await expect(decorative.getByRole('img', { name: 'Alice Johnson' })).toHaveCount(1);
    });
});

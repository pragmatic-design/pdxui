// A checked checkbox shows its check, and an indeterminate one its dash, at 3:1 against the fill
// (WCAG 1.4.11), in every theme and in BOTH schemes.
//
// The manifest's `mark` rules run in each theme's canonical scheme only. A theme may declare the
// label colour per scheme — editorial's --pdx-color-primary-text is a light-dark() — so the other
// scheme is measured here. A theme's `background` shorthand can reset the image and draw no check
// at all, and a white mark measures 1.71:1 on Pragmatic Gold's light gold.
import { test, expect } from './contracts/fixture';
import { goToScenario, measureMark } from './contracts/measure';
import { settle, freezeAnimations } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES } from '../../manifests/_themes';

const MARKS = [
    { scenario: 'checkbox-basic', selector: 'section:not([hidden]) [data-test="checkbox-on"]', what: 'check' },
    { scenario: 'checkbox-mixed', selector: 'section:not([hidden]) [data-test="checkbox-mixed"] input', what: 'dash' },
];

for (const theme of THEMES) {
    for (const scheme of ['light', 'dark'] as const) {
        test(`checkbox marks: ${theme} ${scheme}`, async ({ page }) => {
            for (const m of MARKS) {
                await goToScenario(page, m.scenario, theme, { page: scenarioPage[m.scenario], scheme });
                await freezeAnimations(page);
                await settle(page);
                expect(await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme')), 'the scheme was applied').toBe(scheme);
                const r = await measureMark(page, m.selector);
                expect(r, `${m.what}: element not found`).not.toBeNull();
                const detail = `${m.what}: mark ${r!.mark} on fill ${r!.fill}, ${r!.pixels} px`;
                expect(r!.pixels, `no ${detail}`).toBeGreaterThanOrEqual(4);
                expect(Number(r!.contrast.toFixed(2)), detail).toBeGreaterThanOrEqual(3);
            }
        });
    }
}

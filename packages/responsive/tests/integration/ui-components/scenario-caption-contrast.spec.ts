// The caption of a scenario page reads at AA in every theme and in both schemes (#213).
//
// The generator wrote it `color: #666`: a grey for a white page, 3.53:1 on material's dark ground. The
// builder's oracle measures every text on the page it previews, so a fixed caption failed
// `button-variants` there although the button passed. The caption is page chrome, and the page's
// muted text token is the colour the themes guarantee at AA on `bg`.
import { test, expect } from './contracts/fixture';
import { goToScenario, measureTextContrast } from './contracts/measure';
import { settle, freezeAnimations } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES } from '../../manifests/_themes';

const SCENARIO = 'button-variants';
const CAPTION = 'section:not([hidden]) > h3';

for (const theme of THEMES) {
    for (const scheme of ['light', 'dark'] as const) {
        test(`scenario caption: ${theme} ${scheme}`, async ({ page }) => {
            await goToScenario(page, SCENARIO, theme, { page: scenarioPage[SCENARIO], scheme });
            await freezeAnimations(page);
            await settle(page);
            expect(await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme')), 'the scheme was applied').toBe(scheme);
            const c = await measureTextContrast(page, CAPTION);
            expect(c, 'the caption was not found').not.toBeNull();
            expect(Number(c!.ratio.toFixed(2)), `caption ${c!.text} on ${c!.ground}`).toBeGreaterThanOrEqual(4.5);
        });
    }
}

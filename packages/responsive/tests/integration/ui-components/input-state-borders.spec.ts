// An input's state colours reach its border in every theme, and fluent's focused field shows its
// bottom accent (#519).
//
// A theme that restyles the resting border with a rule of its own — fluent wrote
// `.pdx-input-wrap { border-color: … }` — wins over every state rule of the component, because the
// themes' layer comes after the components': an invalid field kept the resting grey, and the focus
// accent, turned on, came out grey too. The resting colour is a token now, `--pdx-input-border-color`,
// which the component's own resting rule reads and its state rules replace.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle, freezeAnimations } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES } from '../../manifests/_themes';

/** A token resolved to a computed colour, on an element inside the scenario. */
async function resolveColour(page: Page, token: string): Promise<string> {
    return page.evaluate((t) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${t})`;
        document.querySelector('section:not([hidden])')!.appendChild(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
    }, token);
}

for (const theme of THEMES) {
    test(`an invalid input's border is the danger colour: ${theme}`, async ({ page }) => {
        await goToScenario(page, 'input-error', theme, { page: scenarioPage['input-error'] });
        await freezeAnimations(page);
        await settle(page);
        const wrap = page.locator('section:not([hidden]) [data-test="input"] .pdx-input-wrap');
        const danger = await resolveColour(page, '--pdx-color-danger');
        // The left side: an input style that keeps only a bottom border (filled, underlined) draws
        // its state on the bottom.
        const side = await wrap.evaluate((el) => {
            const s = getComputedStyle(el);
            return s.borderLeftStyle === 'none' ? s.borderBottomColor : s.borderLeftColor;
        });
        expect(side).toBe(danger);
    });
}

// A theme that restyles the FOCUSED field with a rule of its own beat the component's focused state
// rules the same way (#521): an invalid field turned the theme's primary when it took focus.
for (const theme of THEMES) {
    test(`a focused invalid input keeps the danger colour: ${theme}`, async ({ page }) => {
        await goToScenario(page, 'input-error', theme, { page: scenarioPage['input-error'] });
        await freezeAnimations(page);
        await settle(page);
        await page.locator('section:not([hidden]) [data-test="input"] input').focus();
        const wrap = page.locator('section:not([hidden]) [data-test="input"] .pdx-input-wrap');
        const danger = await resolveColour(page, '--pdx-color-danger');
        const primary = await resolveColour(page, '--pdx-color-primary');
        const { side, shadow } = await wrap.evaluate((el) => {
            const s = getComputedStyle(el);
            return { side: s.borderLeftStyle === 'none' ? s.borderBottomColor : s.borderLeftColor, shadow: s.boxShadow };
        });
        expect(side, 'the border took another colour').toBe(danger);
        // The ring, if any, is not the primary's: `oklch(L C H / a)` starts as the primary does.
        expect(shadow, 'the focus ring is the primary\'s').not.toContain(primary.replace(/\)$/, ''));
    });
}

test('fluent: a focused field shows the bottom accent in the primary colour', async ({ page }) => {
    await goToScenario(page, 'input-basic', 'fluent', { page: scenarioPage['input-basic'] });
    await freezeAnimations(page);
    await settle(page);
    await page.locator('section:not([hidden]) [data-test="input"] input').focus();
    const wrap = page.locator('section:not([hidden]) [data-test="input"] .pdx-input-wrap');
    const primary = await resolveColour(page, '--pdx-color-primary');
    const focusWidth = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.borderTop = 'var(--pdx-border-width-focus) solid';
        document.querySelector('section:not([hidden])')!.appendChild(probe);
        const w = getComputedStyle(probe).borderTopWidth;
        probe.remove();
        return w;
    });
    await expect(wrap).toHaveCSS('border-bottom-color', primary);
    await expect(wrap).toHaveCSS('border-bottom-width', focusWidth);
});

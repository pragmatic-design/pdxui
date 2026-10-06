/**
 * The typefaces the screenshots are taken IN — asserted, because a wrong one is wrong silently.
 *
 * `--pdx-font-heading` is `'Manrope', system-ui, sans-serif`. Without Manrope installed in the
 * certification image, `system-ui` and `sans-serif` both resolve to WenQuanYi Zen Hei, a CJK face
 * that happens to ship in the Playwright base image. Every heading in every baseline is then
 * rendered in a Chinese typeface: heavier, taller line boxes, and a glyph coverage wide enough that
 * arrows appear where a Latin font draws nothing. The comparisons that fail are unattributable,
 * which is worse than a red gate — it is a gate nobody can read.
 *
 * A screenshot suite cannot check this: when EVERY baseline is taken in the wrong font, they all
 * agree with each other. The check has to ask what the family actually resolved to, which is what
 * this file does — through the browser, in the image, on a real element.
 *
 * Runs in the same Docker config as the visual runner, because the answer is a property of the
 * image and means nothing on a developer's machine.
 */
import { test, expect } from '@playwright/test';

/** Every family the design tokens name, with the token that names it. */
const DECLARED = [
    { token: '--pdx-font-sans', family: 'Inter' },
    { token: '--pdx-font-heading', family: 'Manrope' },
    { token: '--pdx-font-mono', family: 'JetBrains Mono' },
] as const;

/**
 * Does the browser have this family, rather than silently substituting?
 *
 * NOT `document.fonts.check`. Its first version here used exactly that, and it passed for Manrope
 * in the very image where Manrope is absent — Chromium answers "can this text be rendered", which
 * is true of any family name once a fallback exists. A check that cannot fail is worse than none.
 *
 * The measuring idiom instead: render the same string with the family in front of TWO different
 * fallbacks. If it is present it wins both times and the widths agree; if it is absent, the two
 * fallbacks show through and disagree.
 */
async function hasFamily(page: import('@playwright/test').Page, family: string): Promise<boolean> {
    return page.evaluate((f) => {
        const measure = (stack: string) => {
            const el = document.createElement('span');
            el.textContent = 'Handgloves Ag 123 mmmiiil';
            el.style.cssText = `position:absolute;white-space:pre;font-size:64px;font-family:${stack}`;
            document.body.appendChild(el);
            const w = el.getBoundingClientRect().width;
            el.remove();
            return w;
        };
        // TWO different fallbacks, not one against a bogus name. The single-fallback version broke
        // the moment fontconfig aliased `monospace` to JetBrains Mono: the family under test and
        // the fallback became the same face, the widths matched, and the probe reported the font
        // as missing. Asking serif and monospace instead: a family that is present wins in both
        // and the widths agree; a family that is absent leaves two different fallbacks showing.
        return measure(`"${f}", serif`) === measure(`"${f}", monospace`);
    }, family);
}

test.describe('the certification image renders in the fonts the tokens name', () => {
    test.beforeEach(async ({ page }) => {
        await page.setContent('<!doctype html><meta charset="utf-8"><p>Ag</p>');
    });

    test('the probe can fail — a family nothing installs is reported absent', async ({ page }) => {
        // The control, kept in the file rather than run once. The first version of hasFamily used
        // document.fonts.check and returned true for EVERY name, so the three cases below passed in
        // an image with no Manrope in it. A detector that cannot say "no" measures nothing.
        expect(await hasFamily(page, 'pdx-no-such-family-9f3a')).toBe(false);
    });

    for (const { token, family } of DECLARED) {
        test(`${token} resolves to ${family}`, async ({ page }) => {
            expect(
                await hasFamily(page, family),
                `${family} is not available in the image, so ${token} falls through to whatever `
                + 'fontconfig picks — which is how every heading came to be rendered in a CJK face. '
                + 'Install it in packages/responsive/tests/docker/Dockerfile.',
            ).toBe(true);
        });
    }

    test('system-ui is Inter, the second link of the heading chain', async ({ page }) => {
        // `--pdx-font-heading` is `'Manrope', system-ui, sans-serif`. The case above covers the
        // first link; this is the second — if system-ui resolves to WenQuanYi Zen Hei, a missing
        // Manrope does not fall back to a Latin face, it falls into another script entirely.
        const widths = await page.evaluate(() => {
            const measure = (stack: string) => {
                const el = document.createElement('span');
                el.textContent = 'Handgloves Ag 123 mmmiiil';
                el.style.cssText = `position:absolute;white-space:pre;font-size:64px;font-family:${stack}`;
                document.body.appendChild(el);
                const w = el.getBoundingClientRect().width;
                el.remove();
                return w;
            };
            return { inter: measure('Inter'), systemUi: measure('system-ui') };
        });

        expect(widths.systemUi, 'system-ui does not resolve to the same face as Inter')
            .toBeCloseTo(widths.inter, 1);
    });

    // `sans-serif` is deliberately NOT asserted. Chromium resolves the generic families itself and
    // does not read fontconfig's <alias> for them: in this image it lands on Liberation Sans
    // (measured, 789.69px against Inter's 830.375 for the same string at 64px). That is a Latin
    // sans, so the defect this file exists for is absent there — and pinning it to Inter would be
    // asserting something the browser never promised, which is how a test starts lying.
});

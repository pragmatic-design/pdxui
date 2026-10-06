// pdx-block-ui keeps its spinner and message in the visible part of the block.
//
// A spinner group centred on the whole block (overlay: flex, align-items: center, inset: 0) puts the
// message, on a 2,250px form scrolled to its "Send" button, at y −199: the user sees a veiled page
// and nothing else. The manifest's scenario is a 360×240 box, where centring on the block is
// centring on the screen, so it cannot measure this. Here: a tall block scrolled to its end, and the
// short block as the control — it must still look centred — in every theme.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES } from '../../manifests/_themes';

function frames(page: Page, n: number): Promise<void> {
    return page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => { if (--left <= 0) resolve(); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }), n);
}

for (const theme of THEMES) {
    test.describe(`pdx-block-ui — ${theme}`, () => {
        test('a tall block scrolled to its end shows the message inside the viewport', async ({ page }) => {
            await goToScenario(page, 'block-ui-tall', theme, { page: scenarioPage['block-ui-tall'] });
            await settle(page);
            const block = page.locator('section:not([hidden]) [data-test="tall"]');
            await block.evaluate((el) => el.scrollIntoView({ block: 'end' }));
            await frames(page, 3);
            const r = await page.evaluate(() => {
                const m = document.querySelector('section:not([hidden]) [data-test="tall"] .pdx-block-ui-message')!;
                const b = m.getBoundingClientRect();
                return { top: b.top, bottom: b.bottom, h: window.innerHeight, text: m.textContent };
            });
            expect(r.text, 'the message was never written').toBe('Sending the prescription…');
            expect(r.top, `the message is above the viewport (top ${r.top})`).toBeGreaterThanOrEqual(0);
            expect(r.bottom, `the message is below the viewport (bottom ${r.bottom})`).toBeLessThanOrEqual(r.h);
        });

        test('the control: on a short block the spinner group stays centred on the block', async ({ page }) => {
            await goToScenario(page, 'block-ui-blocked', theme, { page: scenarioPage['block-ui-blocked'] });
            await settle(page);
            await frames(page, 3);
            const d = await page.evaluate(() => {
                const host = document.querySelector('section:not([hidden]) [data-test="block"]')!.getBoundingClientRect();
                const spinner = document.querySelector('section:not([hidden]) [data-test="block"] .pdx-block-ui-spinner')!;
                // The visible group: the spinner and the message, not the box that holds them.
                const parts = Array.from(spinner.children).map(c => c.getBoundingClientRect()).filter(r => r.height > 0);
                const top = Math.min(...parts.map(p => p.top));
                const bottom = Math.max(...parts.map(p => p.bottom));
                return Math.abs((top + bottom) / 2 - (host.top + host.bottom) / 2);
            });
            expect(d, `the spinner group is ${d}px off the block's vertical centre`).toBeLessThanOrEqual(10);
        });
    });
}

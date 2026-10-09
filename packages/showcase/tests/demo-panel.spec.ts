// The demo's knobs are in the Demo panel, not in the screens.
//
// «Make the next archive fail» sat beside «Archive», drawn the same way, and a reader could not
// tell the product's action from the demo's. The owner's decision: one Demo panel in the service
// bar, holding the current screen's knobs and nothing else. Whether each knob still DOES what it
// did is asserted where it always was — the specs that press them reach them through `demo()`.
import { test, expect } from './fixture';
import { pickLocale } from './locale';

const SCREENS = [
    { path: '/tickets', ready: '[data-test="grid"]',
      knobs: ['go-offline', 'push-close', 'push-retitle', 'push-raise', 'push-withdraw', 'refuse-next', 'refuse-one-bulk'] },
    { path: '/customers', ready: '[data-test="grid"]', knobs: ['refuse-next'] },
    { path: '/board', ready: '[data-test="board"]', knobs: ['refuse-next'] },
    { path: '/intake', ready: '[data-test="intake"]', knobs: ['refuse-next'] },
];

for (const screen of SCREENS) {
    test(`${screen.path}: no demo knob in the screen, every one in the Demo panel`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(screen.path);
        await expect(page.locator(screen.ready)).toBeVisible();

        for (const knob of screen.knobs) {
            await expect(page.locator(`main [data-test="${knob}"]`), `«${knob}» is still in the screen`)
                .toHaveCount(0);
        }

        const panel = page.locator('[data-test="demo-panel"]');
        await expect(panel, 'the panel is open before anyone asked').toBeHidden();
        await page.locator('[data-test="demo-open"]').click();
        await expect(panel).toBeVisible();
        for (const knob of screen.knobs) {
            await expect(panel.locator(`[data-test="${knob}"]`), `«${knob}» is not in the Demo panel`)
                .toBeVisible();
        }
        await expect(panel.locator('[data-test="demo-empty"]')).toBeHidden();
    });
}

test('the panel holds the CURRENT screen\'s knobs: they leave with it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets');
    await expect(page.locator('[data-test="grid"]')).toBeVisible();
    await page.locator('[data-test="to-board"]').click();
    await expect(page.locator('[data-test="board"]')).toBeVisible();

    await page.locator('[data-test="demo-open"]').click();
    const panel = page.locator('[data-test="demo-panel"]');
    await expect(panel.locator('[data-test="refuse-next"]')).toHaveCount(1);
    await expect(panel.locator('[data-test="push-close"]'), 'the tickets\' knobs followed to the board')
        .toHaveCount(0);
});

test('a knob\'s label stays inside its button, in the longer language too', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets');
    await pickLocale(page, 'it');
    await page.locator('[data-test="demo-open"]').click();
    const knobs = page.locator('[data-test="demo-panel"] .knob:visible');
    await expect(knobs.first()).toBeVisible();
    // The TEXT against the button's content box: a nowrap label runs into the right padding and up
    // to the border first, where `scrollWidth` does not see it yet.
    const overflowing = await knobs.evaluateAll((els) => els.flatMap((b) => {
        const range = document.createRange();
        range.selectNodeContents(b);
        const text = range.getBoundingClientRect();
        const box = b.getBoundingClientRect();
        const s = getComputedStyle(b);
        const limit = box.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
        return text.right > limit + 0.5 ? [`${b.textContent?.trim()} (text ends ${Math.round(text.right)}, box ${Math.round(limit)})`] : [];
    }));
    expect(overflowing, 'a label runs past its button').toEqual([]);
});

test('a screen with no knobs: the panel says so', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/employees');
    await page.locator('[data-test="demo-open"]').click();
    const panel = page.locator('[data-test="demo-panel"]');
    await expect(panel.locator('[data-test="demo-empty"]')).toBeVisible();
    await expect(panel.locator('button:not([data-test="demo-close"])')).toHaveCount(0);
});

test('Escape puts the panel away and the focus back on its opener', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/customers');
    const opener = page.locator('[data-test="demo-open"]');
    await opener.click();
    const panel = page.locator('[data-test="demo-panel"]');
    await expect(panel).toBeVisible();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
});

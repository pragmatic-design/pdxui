/**
 * Every control in the stage's toolbar can be clicked, in a window where the stage is narrow.
 *
 * The shell is three columns, 320px | 1fr | 320px: in a 1100px window the middle one is 460px. The
 * toolbar is a single flex row; what does not fit spills past the column, under the verdict panel,
 * which comes later in the document and paints over it. A control there is drawn and unreachable.
 * How much spills depends on the fonts: on Linux it reached the "1280" viewport button.
 */
import { test, expect } from '@playwright/test';

test('in a narrow window every toolbar control is the element under its own centre', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/packages/builder/index.html');
    await expect(page.locator('[data-test="preview"]')).toBeVisible();

    const covered = await page.evaluate(() => {
        const controls = [...document.querySelectorAll<HTMLElement>('.bar button, .bar select')];
        return controls.flatMap((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit && el.contains(hit) ? [] : [`${el.textContent?.trim() || el.dataset.test} under ${hit?.className ?? 'nothing'}`];
        });
    });

    expect(covered, 'toolbar controls drawn under another element').toEqual([]);
});

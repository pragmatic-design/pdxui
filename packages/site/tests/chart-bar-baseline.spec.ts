/**
 * The Stacked Bar demo shows every series, measured on the canvas in Chromium.
 *
 * A stacked axis starts at 0, not at the lowest TOTAL minus padding (≈8600 here): there, Desktop,
 * drawn from 0 to 4500, sits entirely below the axis and is clipped away, and so does Mobile — the
 * Q1 bar shows Tablet only.
 * This counts the distinct saturated colours stacked in one column of pixels through the Q1 bar.
 */
import { test, expect } from '@playwright/test';

test('the stacked Q1 bar shows its three segments', async ({ page }) => {
    await page.goto('/components/pdx-chart', { waitUntil: 'networkidle' });
    const canvas = page.locator('pdx-chart[stacked] canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!;
        let best = 0;
        // Q1 is the first of four categories: somewhere in the left third of the canvas.
        for (let fx = 0.05; fx <= 0.35; fx += 0.01) {
            const col = ctx.getImageData(Math.round(c.width * fx), 0, 1, c.height).data;
            const colours = new Set<string>();
            let run = 0, prev = '';
            for (let y = 0; y < c.height; y++) {
                const [r, g, b, a] = [col[y * 4], col[y * 4 + 1], col[y * 4 + 2], col[y * 4 + 3]];
                // A segment: opaque, saturated (not the grid's grey), and taller than a gridline.
                const key = a > 200 && Math.max(r, g, b) - Math.min(r, g, b) > 40 ? `${r >> 4},${g >> 4},${b >> 4}` : '';
                run = key && key === prev ? run + 1 : key ? 1 : 0;
                if (run === 6) colours.add(key);
                prev = key;
            }
            best = Math.max(best, colours.size);
        }
        return best;
    }), { message: 'distinct series colours in one column through the Q1 bar' }).toBe(3);
});

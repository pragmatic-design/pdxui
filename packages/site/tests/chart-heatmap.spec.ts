/**
 * The heatmap on the chart gallery's Specialized tab paints real colours in both schemes, and its
 * row labels fit, measured on the canvas in Chromium.
 *
 * The ramp parses more than hex: read as hex only, the theme's oklch() primary becomes
 * rgb(NaN,NaN,NaN), the canvas ignores it, and every cell keeps the previous fill — white or black.
 * The row labels are not clipped to their last letter.
 */
import { test, expect, type Page } from '@playwright/test';

/** Samples each of the 9 × 7 cells a quarter of the way down (clear of its value text). */
async function sampleCells(page: Page) {
    const canvas = page.locator('pdx-chart[type="heatmap"] canvas');
    await canvas.scrollIntoViewIfNeeded();
    return canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!;
        const px = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
        const surface = px(2, 2).join();
        // The cells are long uniform runs that are not the surface: find them on the middle row and column.
        const runs = (len: number, at: (i: number) => number[]) => {
            const out: [number, number][] = [];
            let start = -1, prev = '';
            for (let i = 0; i <= len; i++) {
                const key = i < len ? at(i).join() : '';
                if (key !== prev || key === surface) {
                    if (start >= 0 && i - start >= 12 && prev !== surface) out.push([start, i - 1]);
                    start = key === surface ? -1 : i;
                    prev = key;
                }
            }
            return out;
        };
        const hRuns = runs(c.width, x => px(x, c.height * 0.45));
        const vRuns = runs(c.height, y => px(hRuns[0] ? (hRuns[0][0] + hRuns[0][1]) / 2 : c.width / 2, y));
        if (hRuns.length < 2 || vRuns.length < 2) return { cells: [] as number[][], labelTouchesEdge: true, found: [hRuns.length, vRuns.length] };
        const [x0, x1] = [hRuns[0][0], hRuns[hRuns.length - 1][1]];
        const [y0, y1] = [vRuns[0][0], vRuns[vRuns.length - 1][1]];
        const colW = (x1 - x0) / 9, rowH = (y1 - y0) / 7;
        const cells: number[][] = [];
        for (let yi = 0; yi < 7; yi++) for (let xi = 0; xi < 9; xi++) cells.push(px(x0 + colW * (xi + 0.5), y0 + rowH * (yi + 0.25)));
        // The "Mon" label must not run off the left edge: the first columns of the first row stay surface.
        let labelTouchesEdge = false;
        for (let y = Math.round(y0); y < y0 + rowH; y++) for (let x = 0; x < 2; x++) if (px(x, y).join() !== surface) labelTouchesEdge = true;
        return { cells, labelTouchesEdge, found: [hRuns.length, vRuns.length] };
    });
}

for (const scheme of ['light', 'dark'] as const) {
    test(`heatmap cells are real colours, not white or black (${scheme})`, async ({ page }) => {
        await page.goto('/components/chart', { waitUntil: 'networkidle' });
        await page.getByRole('tab', { name: 'Specialized' }).click();
        await expect(page.locator('pdx-chart[type="heatmap"] canvas')).toBeVisible();
        await page.evaluate((s) => document.documentElement.setAttribute('pdx-scheme', s), scheme);

        await expect.poll(async () => (await sampleCells(page)).cells.length, { message: 'cells found' }).toBe(63);
        const { cells, labelTouchesEdge } = await sampleCells(page);
        const white = cells.filter(([r, g, b]) => r >= 250 && g >= 250 && b >= 250).length;
        const black = cells.filter(([r, g, b]) => r <= 5 && g <= 5 && b <= 5).length;
        expect(white, 'pure white cells').toBe(0);
        expect(black, 'pure black cells').toBe(0);
        expect(new Set(cells.map(c => c.join())).size, 'a ramp, not two colours').toBeGreaterThan(10);
        expect(labelTouchesEdge, 'a row label runs off the canvas').toBe(false);
    });
}

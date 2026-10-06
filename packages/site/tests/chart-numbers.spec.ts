/**
 * The chart gallery's Specialized tab prints numbers in the page's language, not the browser's, and
 * every funnel value can be read on what it is drawn over, measured in Chromium.
 *
 * The browser here is Italian and the site English: in the browser's language the Revenue gauge
 * reads "24.500" and the funnel "10.000 (100%)". A funnel value is not written in the background
 * colour over the slice fill, and a slice narrower than 60 px still shows one.
 */
import { test, expect, type Page } from '@playwright/test';

interface TextRecord { text: string; x: number; y: number; w: number; align: string; fill: string }
declare global {
    interface Window { __chartTexts?: WeakMap<HTMLCanvasElement, TextRecord[]> }
}

test.use({ locale: 'it-IT' });

/** Records every fillText on every canvas, in device pixels; a full clear starts a new frame. */
async function recordCanvasText(page: Page) {
    await page.addInitScript(() => {
        const log = new WeakMap<HTMLCanvasElement, TextRecord[]>();
        window.__chartTexts = log;
        const proto = CanvasRenderingContext2D.prototype;
        const clearRect = proto.clearRect;
        const fillText = proto.fillText;
        proto.clearRect = function (x: number, y: number, w: number, h: number) {
            if (x === 0 && y === 0) log.set(this.canvas, []);
            return clearRect.call(this, x, y, w, h);
        };
        proto.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
            const m = this.getTransform();
            const list = log.get(this.canvas) ?? [];
            list.push({
                text: String(text), x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f,
                w: this.measureText(String(text)).width * m.a, align: this.textAlign, fill: String(this.fillStyle),
            });
            log.set(this.canvas, list);
            return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
        };
    });
}

/**
 * Each funnel value of the last frame with its contrast against what lies under it: the slice
 * pixel just beside the text (inside), or the surface behind the canvas (outside).
 */
async function funnelValues(page: Page) {
    return page.locator('pdx-chart[type="funnel"] canvas').evaluate((c: HTMLCanvasElement) => {
        const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const rgb = (css: string): number[] => {
            probe.clearRect(0, 0, 1, 1);
            probe.fillStyle = css;
            probe.fillRect(0, 0, 1, 1);
            return Array.from(probe.getImageData(0, 0, 1, 1).data);
        };
        const lum = (v: number[]) => {
            const lin = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
        };
        const ratio = (a: number[], b: number[]) => {
            const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
        };
        let surface = [255, 255, 255, 255];
        for (let el: Element | null = c; el; el = el.parentElement) {
            const bg = rgb(getComputedStyle(el).backgroundColor);
            if (bg[3] === 255) { surface = bg; break; }
        }
        const dpr = c.width / c.clientWidth;
        const ctx = c.getContext('2d')!;
        const values = (window.__chartTexts?.get(c) ?? []).filter(t => /\(\d+\s?%\)$/.test(t.text));
        return values.map(t => {
            // Beside the text, clear of its glyphs: 4 px left of it.
            const left = t.align === 'center' ? t.x - t.w / 2 : t.align === 'left' ? t.x : t.x - t.w;
            const px = Array.from(ctx.getImageData(Math.round(left - 4 * dpr), Math.round(t.y), 1, 1).data);
            const a = px[3] / 255;
            const under = [0, 1, 2].map(i => Math.round(px[i] * a + surface[i] * (1 - a)));
            return { text: t.text, inside: t.align === 'center', ratio: ratio(rgb(t.fill), under) };
        });
    });
}

async function openSpecialized(page: Page) {
    await page.goto('/components/chart', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Specialized' }).click();
}

test('a gauge reads its value in the page language, not the browser\'s', async ({ page }) => {
    await openSpecialized(page);
    expect(await page.evaluate(() => navigator.language)).toBe('it-IT');
    await expect(page.getByRole('figure', { name: /^Revenue:/ })).toHaveAttribute('aria-label', 'Revenue: 24,500 of 0–50,000');
});

for (const scheme of ['light', 'dark'] as const) {
    test(`every funnel slice shows its value, readable on what it is drawn over (${scheme})`, async ({ page }) => {
        await recordCanvasText(page);
        await openSpecialized(page);
        const canvas = page.locator('pdx-chart[type="funnel"] canvas');
        await canvas.scrollIntoViewIfNeeded();
        await expect(canvas).toBeVisible();
        await page.evaluate((s) => {
            const c = document.querySelector<HTMLCanvasElement>('pdx-chart[type="funnel"] canvas')!;
            window.__chartTexts?.delete(c);     // only frames drawn in this scheme
            document.documentElement.setAttribute('pdx-scheme', s);
        }, scheme);

        // The poll KEEPS the reading that satisfied it. Reading a second time afterwards is a
        // race: a redraw clears the recorded list on clearRect, so a read landing between that
        // and the frame's fillText calls finds it empty, and `values[0]` is undefined.
        let values: Awaited<ReturnType<typeof funnelValues>> = [];
        await expect.poll(async () => (values = await funnelValues(page)).length, { message: 'values drawn' }).toBe(5);
        expect(values[0].text).toBe('10,000 (100%)');
        for (const v of values) expect(v.ratio, `${v.text} (${v.inside ? 'inside' : 'outside'})`).toBeGreaterThanOrEqual(4.5);
    });
}

/**
 * Coloured and muted text on the site's galleries reaches WCAG AA.
 *
 * Tinted badges, outline and tonal chips, banners and their action links, form error and success
 * messages, danger menu items and the `pdx-ink-*` utilities — muted included — written in a fill
 * colour tuned for a white label measure 1.3–4.4:1 across the themes. This sweeps the pages that
 * show them, in both schemes of three themes: the site's own, and the two that measure worst in that
 * case (cyberpunk light, material dark).
 *
 * The ground is composited the way the browser paints it: the element's background and its
 * ancestors', down to the first opaque one. Colours are read back from a canvas, so relative
 * colours and light-dark() arrive as the sRGB on screen.
 */
import { test, expect, type Page } from '@playwright/test';

const PAGES = [
    '/components/pdx-badge', '/components/pdx-chip', '/components/pdx-banner',
    '/design/banner', '/design/feedback', '/design/forms', '/design/menu', '/design/typography',
    '/design/progress', '/design/layout',
];
const THEMES = ['pragmatic-gold', 'cyberpunk', 'material'];
// `pdx-ink-subtle` (2.5–2.9:1) is left out on purpose: whether the tertiary colour may carry text at
// all is an open question, not a defect this check decides.
const TEXT = [
    '.pdx-badge', '.pdx-chip', '.pdx-banner', '.pdx-banner-action', '.pdx-field-error', '.pdx-field-success',
    '.pdx-form-field.has-error > .pdx-field-label', '.pdx-menu-danger', '[class*="pdx-ink-"]:not(.pdx-ink-subtle)',
].join(', ');

interface SweepOptions {
    selector: string;
    /** Only inside the gallery section this h2 heads. */
    section?: string;
    /**
     * Controls: the text is a label inside the element (a button's span), not a text node of its
     * own; and a fill painted as a gradient is not a colour this can read, so it is left out.
     */
    controls?: boolean;
}

/** Every matched element that shows text, with its ratio on its composited ground. */
async function sweep(page: Page, opts: SweepOptions = { selector: TEXT }): Promise<{ count: number; failures: string[] }> {
    return page.evaluate(({ selector, section, controls }) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        const rgba = (css: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000';
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
        };
        const over = (t: number[], b: number[]) => [0, 1, 2].map((i) => t[3] * t[i] + (1 - t[3]) * b[i]).concat(1);
        const lum = (c: number[]) => {
            const l = c.slice(0, 3).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
            return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        };
        const outlet = document.querySelector('pdx-router-outlet') ?? document.body;
        const heading = section
            ? [...outlet.querySelectorAll('h2')].find((h) => h.textContent!.trim() === section)
            : null;
        const root = heading?.parentElement ?? (section ? null : outlet);
        if (!root) return { count: 0, failures: [] };
        const failures: string[] = [];
        let count = 0;
        for (const el of root.querySelectorAll<HTMLElement>(selector)) {
            // Code samples show markup, disabled controls are exempt from 1.4.3.
            if (el.closest('pre, code, .source-block, [disabled], .disabled, [aria-disabled="true"]')) continue;
            const own = controls
                ? Boolean(el.textContent!.trim())
                : [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
            const r = el.getBoundingClientRect();
            if (!own || r.width === 0 || r.height === 0) continue;
            if (controls && getComputedStyle(el).backgroundImage !== 'none') continue;
            const layers: number[][] = [];
            for (let n: HTMLElement | null = el; n; n = n.parentElement) {
                const c = rgba(getComputedStyle(n).backgroundColor);
                if (c[3] > 0) layers.push(c);
                if (c[3] >= 1) break;
            }
            let ground = document.documentElement.getAttribute('pdx-scheme') === 'dark' ? [18 / 255, 18 / 255, 18 / 255, 1] : [1, 1, 1, 1];
            for (const l of layers.reverse()) ground = over(l, ground);
            const text = over(rgba(getComputedStyle(el).color), ground);
            const [a, b] = [lum(text), lum(ground)];
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            count++;
            if (ratio < 4.5) failures.push(`${ratio.toFixed(2)} ${el.className} "${el.textContent!.trim().slice(0, 30)}"`);
        }
        return { count, failures };
    }, opts);
}

for (const theme of THEMES) {
    for (const scheme of ['light', 'dark'] as const) {
        test(`${theme} · ${scheme}: coloured and muted text reaches AA`, async ({ page }) => {
            await page.addInitScript((t) => localStorage.setItem('pdx-theme', t), theme);
            const all: string[] = [];
            let measured = 0;
            for (const path of PAGES) {
                await page.goto(path, { waitUntil: 'networkidle' });
                await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
                await page.evaluate((s) => document.documentElement.setAttribute('pdx-scheme', s), scheme);
                await expect(page.locator('html')).toHaveAttribute('pdx-theme', theme);
                await expect.poll(async () => (await sweep(page)).count, `${path}: nothing to measure`).toBeGreaterThan(0);
                const { count, failures } = await sweep(page);
                measured += count;
                all.push(...failures.map((f) => `${path}: ${f}`));
            }
            expect(measured).toBeGreaterThan(50);
            expect(all, `text under 4.5:1 in ${theme}/${scheme}`).toEqual([]);
        });
    }
}

/**
 * Every button variant's label on the fill the theme really paints. The theme gate checks token
 * pairs, and a button need not paint those: info fills with each theme's accent (1.88 in cyberpunk
 * light if the label ignores it), secondary can lighten in dark under a white label (3.25), and a
 * link in the charcoal primary on the dark page measures 1.78. A gradient primary is left out: its
 * fill is an image, not a colour.
 */
const ALL_THEMES = [
    'neutral', 'material', 'fluent', 'cupertino', 'metro', 'corporate', 'playful', 'editorial',
    'cyberpunk', 'glass', 'neumorphic', 'pragmatic', 'pragmatic-gold',
];
const BUTTONS = ':is(button, a, [role="button"]):is(.pdx-primary, .pdx-secondary, .pdx-outline, .pdx-ghost, .pdx-link, .pdx-danger, .pdx-success, .pdx-warning, .pdx-info)';

for (const theme of ALL_THEMES) {
    test(`${theme}: every button variant's label reaches AA, light and dark`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('pdx-theme', t), theme);
        await page.goto('/components/pdx-button', { waitUntil: 'networkidle' });
        await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
        await expect(page.locator('html')).toHaveAttribute('pdx-theme', theme);
        const all: string[] = [];
        for (const scheme of ['light', 'dark'] as const) {
            await page.evaluate((s) => document.documentElement.setAttribute('pdx-scheme', s), scheme);
            const opts = { selector: BUTTONS, section: 'Variants', controls: true };
            await expect.poll(async () => (await sweep(page, opts)).count, 'no button measured').toBeGreaterThan(5);
            all.push(...(await sweep(page, opts)).failures.map((f) => `${scheme}: ${f}`));
        }
        expect(all, `button labels under 4.5:1 in ${theme}`).toEqual([]);
    });
}

/**
 * The landing's eyebrow — the site's own chrome, which no sweep above reaches: its colours live in
 * `site.css` and the landing route. In the light scheme a bronze text on its bronze tint can fall to
 * 4.24:1.
 */
test('the landing eyebrow reaches AA, light and dark', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const all: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
        await page.evaluate((s) => document.documentElement.setAttribute('pdx-scheme', s), scheme);
        await expect.poll(async () => (await sweep(page, { selector: '.eyebrow' })).count, 'no eyebrow measured').toBeGreaterThan(0);
        all.push(...(await sweep(page, { selector: '.eyebrow' })).failures.map((f) => `${scheme}: ${f}`));
    }
    expect(all, 'the eyebrow under 4.5:1').toEqual([]);
});

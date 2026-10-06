// CSS-system contracts — invariants of the Pragmatic CSS layer across all themes × schemes:
//  • text/ink contrast on every surface (catches dark-on-dark and low-contrast panels),
//  • monotonic type scale and spacing scale.
// Isolated from the component contract tree (ui-components/). Measurement-only, no PNG baselines.
//
// Colors are resolved via a 1×1 canvas (format-agnostic — handles rgb()/oklch()/etc.). The whole
// computation is self-contained inside one page.evaluate (no injected globals) for headless reliability.

import { test, expect, type Page } from '@playwright/test';

const BASE = '/css-contracts.html';
const THEMES = ['neutral', 'material', 'fluent', 'cupertino', 'corporate', 'playful', 'cyberpunk', 'editorial'];
const SCHEMES = ['light', 'dark'] as const;

// data-test → minimum WCAG contrast. Body/primary text must be AA (4.5); bold buttons, large
// headings and intentionally-soft muted/disabled text → AA-large (3.0). Below 3.0 is a real bug.
const CONTRAST: Record<string, number> = {
    'txt-caption': 4.5, 'txt-small': 4.5, 'txt-body': 4.5, 'txt-subheading': 4.5,
    'txt-heading': 3.0, 'txt-title': 3.0,
    'ink-text-on-card': 4.5, 'ink-text-on-inset': 4.5,
    'ink-muted-on-card': 3.0, 'ink-muted-on-inset': 3.0,
    'menu-item': 4.5, 'menu-item-2': 4.5,
    // Real component dropdown panels (autocomplete/tree-select/color/date) — the dark-on-dark case.
    'ac-text': 4.5, 'ac-muted': 3.0, 'ts-text': 4.5, 'cp-text': 4.5, 'dp-text': 4.5,
    'input': 4.5, 'btn-primary': 3.0, 'btn-secondary': 3.0,
};

const SCALE_TYPO = ['txt-caption', 'txt-small', 'txt-body', 'txt-subheading', 'txt-heading', 'txt-title'];
const SCALE_SPACE = ['space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl'];

async function load(page: Page, theme: string, scheme: string, scenario: string) {
    await page.goto(`${BASE}?theme=${theme}&scheme=${scheme}&scenario=${scenario}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
}

/** WCAG contrast ratio of an element's text vs its effective background (self-contained in-page). */
function contrastOf(page: Page, sel: string): Promise<number | null> {
    return page.evaluate((s) => {
        const el = document.querySelector(s) as HTMLElement | null;
        if (!el) return null;
        const rgb = (str: string): number[] => {
            const c = document.createElement('canvas'); c.width = c.height = 1;
            const x = c.getContext('2d')!; x.fillStyle = '#000'; x.fillStyle = str; x.fillRect(0, 0, 1, 1);
            const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
        };
        const effBg = (e: HTMLElement): number[] => {
            let n: HTMLElement | null = e;
            while (n) { const r = rgb(getComputedStyle(n).backgroundColor); if (r[3] > 0.05) return r; n = n.parentElement; }
            return rgb(getComputedStyle(document.body).backgroundColor);
        };
        const lum = ([r, g, b]: number[]): number => {
            const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const L1 = lum(rgb(getComputedStyle(el).color)), L2 = lum(effBg(el));
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    }, sel);
}

function metric(page: Page, sel: string, prop: 'fontSize' | 'width'): Promise<number | null> {
    return page.evaluate(([s, p]) => {
        const el = document.querySelector(s);
        if (!el) return null;
        return p === 'width' ? el.getBoundingClientRect().width : parseFloat(getComputedStyle(el).fontSize);
    }, [sel, prop] as const);
}

for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
        test(`[${theme}/${scheme}] text contrast (typography · surfaces · panel · controls)`, async ({ page }) => {
            const failures: string[] = [];
            for (const scenario of ['typography', 'surfaces', 'panel', 'controls']) {
                await load(page, theme, scheme, scenario);
                for (const [dt, min] of Object.entries(CONTRAST)) {
                    const ratio = await contrastOf(page, `section:not([hidden]) [data-test="${dt}"]`);
                    if (ratio == null) continue; // not in this scenario
                    if (ratio < min) failures.push(`${dt}: ${ratio.toFixed(2)} < ${min}`);
                }
            }
            expect(failures, `low-contrast in ${theme}/${scheme}:\n  ${failures.join('\n  ')}`).toEqual([]);
        });
    }
}

// ── Hover-state contrast: a button's text must stay readable against its :hover background. Catches
//    outline/ghost hovers that go dark-on-dark in some theme×scheme. ──────────────────────────────
const HOVER_BTNS = ['btn-primary', 'btn-secondary', 'btn-outline', 'btn-ghost'];

async function hoverContrast(page: Page, sel: string): Promise<number | null> {
    const loc = page.locator(sel);
    if (await loc.count() === 0) return null;
    await loc.hover({ force: true });
    await page.waitForTimeout(80);
    return contrastOf(page, sel);
}

for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
        test(`[${theme}/${scheme}] button hover-state contrast`, async ({ page }) => {
            await load(page, theme, scheme, 'controls');
            const failures: string[] = [];
            for (const dt of HOVER_BTNS) {
                const ratio = await hoverContrast(page, `section:not([hidden]) [data-test="${dt}"]`);
                if (ratio != null && ratio < 3.0) failures.push(`${dt}:hover ${ratio.toFixed(2)} < 3.0`);
            }
            expect(failures, `low hover contrast in ${theme}/${scheme}:\n  ${failures.join('\n  ')}`).toEqual([]);
        });
    }
}

test('type scale is monotonic (caption < … < title)', async ({ page }) => {
    await load(page, 'neutral', 'light', 'typography');
    const sizes: number[] = [];
    for (const dt of SCALE_TYPO) sizes.push((await metric(page, `[data-test="${dt}"]`, 'fontSize'))!);
    for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i], `${SCALE_TYPO[i]} (${sizes[i]}px) > ${SCALE_TYPO[i - 1]} (${sizes[i - 1]}px)`).toBeGreaterThan(sizes[i - 1]);
    }
});

test('spacing scale is monotonic (xs < … < xl)', async ({ page }) => {
    await load(page, 'neutral', 'light', 'spacing');
    const widths: number[] = [];
    for (const dt of SCALE_SPACE) widths.push((await metric(page, `[data-test="${dt}"]`, 'width'))!);
    for (let i = 1; i < widths.length; i++) {
        expect(widths[i], `${SCALE_SPACE[i]} (${widths[i]}px) > ${SCALE_SPACE[i - 1]} (${widths[i - 1]}px)`).toBeGreaterThan(widths[i - 1]);
    }
});

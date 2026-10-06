// Touch targets: every command INSIDE a component, where a finger acts on it.
//
// The theme's control heights (--pdx-button-min-height, --pdx-input-min-height) size the host's own
// control and stop there: on their own they leave menu items, options, the ✕ of a dialog, the arrows
// of a calendar at 16-39px on a phone, and an app would need dozens of global rules on internal
// classes to reach 44. The token
// --pdx-target-min is the one lever: 24px (WCAG 2.5.8) with a fine pointer, 44px under a coarse one.
//
// What is measured is the TARGET, not the glyph: from the command's centre, how far a point still
// lands on it (elementFromPoint), up/down and left/right. A command whose visual box stays small but
// whose hit area reaches the token through a pseudo-element passes, as the rule allows.
import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { THEMES } from '../../manifests/_themes';

type Kind = 'icon' | 'text';
interface Measured { sel: string; kind: Kind; w: number; h: number; hitW: number; hitH: number }

const CASES = [
    'dropdown-menu', 'split-button', 'select', 'autocomplete', 'cascader', 'mention',
    'dialog', 'drawer', 'alert-dialog', 'date-picker', 'time-picker', 'inline-edit',
    'input', 'toast', 'otp-input', 'data-grid', 'data-grid-virtual', 'fieldset', 'field-group',
] as const;

async function openCase(page: Page, c: string, theme = 'neutral'): Promise<void> {
    await openPage(page, `/touch-targets.html?c=${c}&theme=${theme}`);
    await page.evaluate(() => (window as unknown as { __touch: { open(): Promise<void> } }).__touch.open());
    // An option list filtered after a debounce appears a moment later: wait for the first command.
    const first = await page.evaluate(() => (window as unknown as { __touch: { targets: { sel: string }[] } }).__touch.targets[0].sel);
    await page.locator(first).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
}

/** Every visible command the case names, with its box and its hit extent through the centre. */
function measure(page: Page): Promise<Measured[]> {
    return page.evaluate(() => {
        const api = (window as unknown as { __touch: { targets: { sel: string; kind: Kind }[] } }).__touch;
        const out: Measured[] = [];
        for (const t of api.targets) {
            // A command clipped by a scrolling ancestor (the rows a virtual grid renders above and
            // below the viewport) cannot be reached: it is not a target, so it is not measured.
            const clipped = (e: HTMLElement): boolean => {
                const r = e.getBoundingClientRect();
                for (let a = e.parentElement; a; a = a.parentElement) {
                    const o = getComputedStyle(a);
                    if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
                    const ar = a.getBoundingClientRect();
                    if (r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) return true;
                }
                return false;
            };
            const els = [...document.querySelectorAll<HTMLElement>(t.sel)].filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && !clipped(e);
            });
            for (const el of els) {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const hits = (x: number, y: number): boolean => {
                    const h = document.elementFromPoint(x, y);
                    return !!h && (h === el || el.contains(h));
                };
                const reach = (dx: number, dy: number): number => {
                    let n = 0;
                    while (n < 80 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
                    return n;
                };
                const hitH = hits(cx, cy) ? reach(0, -1) + reach(0, 1) + 1 : 0;
                const hitW = hits(cx, cy) ? reach(-1, 0) + reach(1, 0) + 1 : 0;
                out.push({ sel: t.sel, kind: t.kind, w: r.width, h: r.height, hitW, hitH });
            }
        }
        return out;
    });
}

/**
 * Desktop boxes under a fine pointer (1280x800, neutral), smallest per selector: the token must not
 * move them. Half a pixel, not one: a rule that replaces the select option's own min-height can lower
 * it from 32 to 31, and a 1px tolerance lets that through.
 * The one intended change: the time-picker arrows are 24 tall, not 16 — a hit area extended
 * with a pseudo-element would cover the value between them, which is a target too.
 */
const DESKTOP_BOX: Record<string, Record<string, { w?: number; h: number }>> = {
    'dropdown-menu': { '.pdx-menu-item': { h: 32 } },
    'split-button': { '.pdx-menu-item': { h: 32 } },
    select: { '.pdx-select-option': { h: 32 } },
    autocomplete: { '.pdx-autocomplete-option': { h: 37 } },
    cascader: { '.pdx-cascader-item': { h: 40 } },
    mention: { '.pdx-mention-item': { h: 40 } },
    dialog: { 'pdx-dialog .pdx-dialog-close': { w: 32, h: 32 } },
    drawer: { '.pdx-drawer-close': { w: 32, h: 32 } },
    'alert-dialog': { '.pdx-alert-cancel': { h: 34 }, '.pdx-alert-confirm': { h: 34 } },
    'date-picker': {
        '.pdx-cal-nav-btn': { w: 32, h: 32 },
        '.pdx-cal-title': { h: 40 },
        '.pdx-date-picker-footer button': { h: 34 },
    },
    'time-picker': {
        'pdx-time-picker .pdx-time-value': { w: 30, h: 28 },
        'pdx-time-picker .pdx-time-arrow': { w: 28, h: 24 }, // 24, not 16: the one intended change
    },
    'inline-edit': { '.pdx-inline-edit-save': { w: 26, h: 26 }, '.pdx-inline-edit-cancel': { w: 26, h: 26 } },
    input: { 'pdx-input .pdx-input-clear': { w: 20, h: 20 } },
    toast: { '.pdx-toast-close': { w: 11, h: 16 } },
    'otp-input': { 'pdx-otp-input .pdx-otp-cell': { w: 40, h: 40 } },
    'data-grid': { 'pdx-data-grid .pdx-dg-row': { h: 44 } },
    'data-grid-virtual': { 'pdx-data-grid .pdx-dg-row': { h: 42 } },
    fieldset: { 'pdx-fieldset .pdx-fieldset-toggle': { w: 20, h: 20 } },
    // Heights only: the unlabelled toggle's width is its ▾ glyph, which the font decides — 21px on
    // Windows, 15 in the Linux image.
    'field-group': {
        'pdx-field-group[label] .pdx-field-group-toggle': { h: 24 },
        'pdx-field-group:not([label]) .pdx-field-group-toggle': { h: 24 },
    },
};

function boxDrift(c: string, found: Measured[]): string[] {
    const drift: string[] = [];
    for (const [sel, want] of Object.entries(DESKTOP_BOX[c] ?? {})) {
        const mine = found.filter((m) => m.sel === sel);
        if (mine.length === 0) { drift.push(`${sel}: not found`); continue; }
        const h = Math.min(...mine.map((m) => m.h));
        const w = Math.min(...mine.map((m) => m.w));
        if (Math.abs(h - want.h) > 0.5) drift.push(`${sel}: height ${h.toFixed(1)}, was ${want.h}`);
        if (want.w !== undefined && Math.abs(w - want.w) > 0.5) drift.push(`${sel}: width ${w.toFixed(1)}, was ${want.w}`);
    }
    return drift;
}

function failures(found: Measured[], min: number): string[] {
    const bad: string[] = [];
    for (const m of found) {
        // A pixel of tolerance, which is what this measure can resolve. Hit testing snaps a
        // fractional layout to whole pixels, so a 44 CSS px target covers 43 or 45 of the points
        // counted, depending on where it sits: a data-grid row whose box is 44.0 tall at y=60.67 has
        // 43 hittable pixels — its last one answers the row below — and in the Linux image the
        // toast's ✕, 8.5px wide, reads 43 for the same reason. 0.5 is finer than the instrument:
        // it holds on Windows by alignment alone, and a 44 read on an integer-aligned box is one
        // pixel too generous already.
        const shortH = m.hitH < min - 1;
        const shortW = m.kind === 'icon' && m.hitW < min - 1;
        if (shortH || shortW) bad.push(`${m.sel}: ${m.hitW}x${m.hitH} hit (box ${m.w.toFixed(1)}x${m.h.toFixed(1)})`);
    }
    return bad;
}

test.describe('touch: a coarse pointer at 390x844, every command at least 44px', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the context is a coarse pointer', async ({ page }) => {
        await openCase(page, 'input');
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    });

    // Every theme: a theme's rules sit in a later layer than the token's, and could shrink a command.
    for (const theme of THEMES) {
        for (const c of CASES) {
            test(`${c} [${theme}]`, async ({ page }, testInfo) => {
                await openCase(page, c, theme);
                const found = await measure(page);
                writeFileSync(testInfo.outputPath('measured.json'), JSON.stringify(found, null, 1));
                expect(found.length, `${c}: no command found to measure`).toBeGreaterThan(0);
                expect(failures(found, 44), `${c} [${theme}]: commands under 44px`).toEqual([]);
            });
        }
    }
});

test.describe('desktop: a fine pointer at 1280x800, every command at least 24px', () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

    test('the context is a fine pointer', async ({ page }) => {
        await openCase(page, 'input');
        expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
    });

    // The drawing is pinned on neutral; every theme must still reach 24.
    for (const theme of THEMES) {
        for (const c of CASES) {
            test(`${c} [${theme}]`, async ({ page }, testInfo) => {
                await openCase(page, c, theme);
                const found = await measure(page);
                writeFileSync(testInfo.outputPath('measured.json'), JSON.stringify(found, null, 1));
                expect(found.length, `${c}: no command found to measure`).toBeGreaterThan(0);
                expect(failures(found, 24), `${c} [${theme}]: commands under 24px`).toEqual([]);
                if (theme === 'neutral') expect(boxDrift(c, found), `${c}: the desktop drawing moved`).toEqual([]);
            });
        }
    }
});

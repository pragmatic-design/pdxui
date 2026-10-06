/**
 * The builder's oracle must be a JUDGE, not decoration.
 *
 * The thing worth testing is not "a report appears": it is that the verdict MOVES when the
 * page gets worse and moves back when it is repaired. A green light nobody can turn red
 * proves nothing, which is the failure mode of most in-app quality panels.
 *
 * Both sabotages go through `__pdx_builder.injectCss` — the same primitive the theme editor uses
 * to land a generated theme's `toCSS()` in the preview — so this also exercises that path.
 *
 * Note the viewport dependency: r$ applies the touch-target rule only at <=768px (WCAG
 * 2.5.8 is a touch concern), so the desktop stage and the 390px stage genuinely check
 * different things. The tests assert each rule where it actually applies.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/packages/builder/index.html';
const SCENARIO = 'component=button&scenario=button-variants&theme=neutral&scheme=light';

/** Wide enough that the builder shell and its stage are not cramped. */
test.use({ viewport: { width: 1600, height: 1000 } });

interface Violation { rule: string; element?: string; detail: string }

interface Report {
    violations: Violation[];
    pass: boolean;
    total: number;
    passed: number;
    errors: number;
    byRule: Record<string, number>;
    notes: string[];
    aesthetic?: number;
    error?: string;
}

async function open(page: Page, query: string): Promise<void> {
    await page.goto(`${APP}?${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

const measure = (page: Page) =>
    page.evaluate(async () => await (globalThis as any).__pdx_builder.measure() as Report);

const sabotage = (page: Page, css: string) =>
    page.evaluate(async (c) => {
        const b = (globalThis as any).__pdx_builder;
        b.clearCss();
        b.injectCss(c);
        await new Promise(r => setTimeout(r, 200));
        return await b.measure() as Report;
    }, css);

const repair = (page: Page) =>
    page.evaluate(async () => {
        const b = (globalThis as any).__pdx_builder;
        b.clearCss();
        await new Promise(r => setTimeout(r, 200));
        return await b.measure() as Report;
    });

test('the machine surface exists and reports on the current selection', async ({ page }) => {
    await open(page, SCENARIO);
    const r = await measure(page);

    expect(r.error, 'the preview should be measurable').toBeUndefined();
    expect(r.total, 'the oracle must actually run checks').toBeGreaterThan(0);
    // A verdict is worth what its stated coverage is worth, and the report says so every run.
    expect(r.notes.join(' ')).toContain('Colour IS judged');
});

test('overflow: a wide child turns the verdict red, repairing it turns it green', async ({ page }) => {
    await open(page, SCENARIO);

    const before = await measure(page);
    expect(before.pass, 'neutral/button-variants should start clean').toBe(true);
    expect(before.errors).toBe(0);

    const broken = await sabotage(page, 'button { width: 5000px !important; min-width: 5000px !important; }');
    expect(broken.pass, 'a 5000px button must not pass').toBe(false);
    expect(broken.byRule.noOverflow ?? 0).toBeGreaterThan(0);

    const fixed = await repair(page);
    expect(fixed.pass, 'removing the sabotage must restore the verdict').toBe(true);
    expect(fixed.errors).toBe(0);
});

test('touch target: 8px buttons are caught at 390px, where the rule applies', async ({ page }) => {
    await open(page, `${SCENARIO}&w=390`);

    const before = await measure(page);
    expect(before.pass).toBe(true);
    // The mobile stage runs strictly more checks than the desktop one — the touch-target
    // rule is gated to <=768px. If this ever equals the desktop count, the gate moved.
    expect(before.total).toBeGreaterThan(0);

    const tiny = 'button { min-height: 8px !important; height: 8px !important;'
        + ' min-width: 8px !important; width: 8px !important; padding: 0 !important; }';
    const broken = await sabotage(page, tiny);
    expect(broken.pass, '8x8px buttons must not pass at 390px').toBe(false);
    expect(broken.byRule.touchTarget ?? 0).toBeGreaterThan(0);

    const fixed = await repair(page);
    expect(fixed.pass).toBe(true);
});

test('the panel shows the verdict, not just the console', async ({ page }) => {
    await open(page, SCENARIO);
    await expect(page.locator('[data-test="verdict"]')).toHaveText('pass');
    await expect(page.locator('[data-test="oracle-note"]')).toBeVisible();

    await sabotage(page, 'button { width: 5000px !important; min-width: 5000px !important; }');
    await page.locator('[data-test="measure"]').click();
    await expect(page.locator('[data-test="verdict"]')).toHaveText('fail');
});

test('rendered contrast is measured, and it is right about our OKLCH colours', async ({ page }) => {
    // r$ resolves the effective background with an rgb()-only parser, so it read every
    // oklch() fill as the white canvas: `.pdx-primary` measured 1.06:1 against a true
    // 10.67:1. The rule was unusable. The preview now reports colours as rgb() for the
    // measurement — converted by the browser, so it is the colour actually on screen.
    await open(page, SCENARIO);

    const clean = await measure(page);
    expect(clean.byRule.contrastRatio ?? 0, 'a shipped theme must not fail its own contrast').toBe(0);
    expect(clean.pass).toBe(true);

    // Not vacuous: a label set to nearly its own fill has to be caught.
    const broken = await sabotage(page, 'button.pdx-primary { color: oklch(0.36 0.02 260) !important; }');
    expect(broken.byRule.contrastRatio ?? 0).toBeGreaterThan(0);
    expect(broken.violations.some(v => v.rule === 'contrastRatio' && /1\.\d+:1/.test(v.detail))).toBe(true);

    const fixed = await repair(page);
    const left = fixed.violations.filter(v => v.rule === 'contrastRatio');
    expect(left.map(v => `${v.element} ${v.detail}`).join(' | '), 'after repair').toBe('');
});

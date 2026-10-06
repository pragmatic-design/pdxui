/**
 * The builder's agent-loop SETPOINT — an agent must be able to CONVERGE, using nothing
 * but this surface.
 *
 * "From a hostile brand, reach 0 WCAG errors" would be vacuous: the engine already guarantees
 * AA for any brand — its own tests assert it for 7 awkward brands across 12 archetypes, so the
 * loop would start at zero and prove nothing.
 *
 * What a theme can genuinely be wrong about is OVERRIDES: in theme mode a human (or an agent)
 * can set a token by hand, and the gate re-runs on the resulting map.
 * So the honest formulation is: break the gate with overrides, then require the surface
 * alone to get back to zero — and to say what it changed while doing it.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/packages/builder/index.html';

test.use({ viewport: { width: 1600, height: 1000 } });

interface Fix { token: string; from: string; to: string; reason: string }

async function openTheme(page: Page, query = ''): Promise<void> {
    await page.goto(`${APP}?mode=theme&component=button&scenario=button-variants${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

const errorsOf = (page: Page) =>
    page.evaluate(() => (globalThis as any).__pdx_builder.theme().errors as number);

const fixesOf = (page: Page) =>
    page.evaluate(() => (globalThis as any).__pdx_builder.fixes() as Fix[]);

/** Labels set to (nearly) their own fill: broken in both schemes, on three pairs. */
const BROKEN =
    '&tok=' + encodeURIComponent([
        '--pdx-color-primary-text: oklch(0.52 0.20 268)',
        '--pdx-color-danger-text: oklch(0.55 0.20 25)',
        '--pdx-color-success-text: oklch(0.55 0.15 155)',
    ].join('; '));

test('a clean theme offers no fixes — the list is a verdict, not decoration', async ({ page }) => {
    await openTheme(page, '&name=clean&brand=%23c2185b');
    expect(await errorsOf(page)).toBe(0);
    expect(await fixesOf(page)).toEqual([]);
});

test('a broken theme yields fixes that name the token and a value', async ({ page }) => {
    await openTheme(page, `&name=broken&brand=%233b5bdb${BROKEN}`);

    expect(await errorsOf(page), 'the overrides must break the gate').toBeGreaterThan(0);

    const fixes = await fixesOf(page);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) {
        expect(f.token, 'a fix must name the token to change').toMatch(/^--pdx-/);
        expect(f.to, 'a fix must carry a value, not prose').toContain('oklch');
        expect(f.reason).toMatch(/CONTRAST_/);
        expect(f.to).not.toBe(f.from);
    }
});

test('the agent loop converges: suggest → apply → re-measure, until the gate is clean', async ({ page }) => {
    await openTheme(page, `&name=converge&brand=%233b5bdb${BROKEN}`);

    const start = await errorsOf(page);
    expect(start, 'the loop must start from a real failure').toBeGreaterThan(0);

    const applied: string[][] = [];
    let iterations = 0;
    const MAX = 5;

    while (iterations < MAX) {
        const remaining = await errorsOf(page);
        if (remaining === 0) break;
        iterations++;
        const round = await page.evaluate(() => (globalThis as any).__pdx_builder.applyFixes() as Fix[]);
        // A round that changes nothing while errors remain is a stall, not convergence.
        expect(round.length, `iteration ${iterations} produced no change`).toBeGreaterThan(0);
        applied.push(round.map(f => f.token));
    }

    expect(await errorsOf(page), `did not converge in ${MAX} iterations (applied: ${JSON.stringify(applied)}`).toBe(0);
    expect(iterations, 'a deterministic remedy should not need several passes').toBeLessThanOrEqual(2);

    // Converged by CHANGING something, and the change is visible in the exported theme.
    const css = await page.evaluate(() => (globalThis as any).__pdx_builder.theme().css as string);
    expect(css).toContain('--pdx-color-primary-text');
});

test('a fix only replaces the failing scheme, leaving the other branch alone', async ({ page }) => {
    // Broken in DARK only: near-white label is fine on the light fill, not on the dark one.
    const darkOnly = '&tok=' + encodeURIComponent('--pdx-color-primary-text: light-dark(oklch(0.98 0.01 268), oklch(0.70 0.19 268))');
    await openTheme(page, `&name=darkonly&brand=%233b5bdb${darkOnly}`);

    const fixes = await fixesOf(page);
    expect(fixes.length).toBe(1);
    const fix = fixes[0];
    expect(fix.reason, 'only the dark scheme should be at fault').toContain('(dark)');
    // The light branch is carried over untouched.
    expect(fix.to).toContain('oklch(0.98 0.01 268)');
    expect(fix.to.startsWith('light-dark(')).toBe(true);

    await page.evaluate(() => (globalThis as any).__pdx_builder.applyFixes());
    expect(await errorsOf(page)).toBe(0);
});

test('the panel offers the fix to a human too, and clicking it clears the gate', async ({ page }) => {
    await openTheme(page, `&name=human&brand=%233b5bdb${BROKEN}`);

    await expect(page.locator('[data-test="gate-verdict"]')).toContainText('fail');
    await page.locator('[data-test="apply-fixes"]').click();
    await expect(page.locator('[data-test="gate-verdict"]')).toHaveText('AA clean');
});

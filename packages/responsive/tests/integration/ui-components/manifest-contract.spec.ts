/**
 * DIMENSION 1 — The mathematical contract, data-driven from the Component Test Manifests.
 *
 * Every contract rule lives in a manifest; there is no separate file of universal or theme rules.
 *
 * One test() per (scenario, theme). Deterministic waits (data-pdx-ready + freeze).
 */
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario, applyTheme, measureElement } from './contracts/measure';
import {
    assertStandaloneRule, assertContrast, assertMark, assertColorVar, assertComposition, assertState,
    assertPositioning, assertOverlay, freezeAnimations, assertNumeric,
} from './contracts/assertions';
import { buildContractUnits } from './contracts/from-manifests';

// ─── Reuse the page where it is safe, navigate where it is not ──────────────────────────────────
//
// A scenario is visited once per theme, and the only difference between those 13 visits is two
// attributes on <html>. Reusing the page instead of reloading it takes axe-runner from 2.7 min to
// 55s, and this runner is nearly twice the size.
//
// But NOT for every scenario, and the manifests already say which. A contract carrying a
// `positioning`, `overlay` or `state` rule CLICKS, HOVERS or navigates — so it would hand the next
// theme a component that is already open, and a measurement taken on that is not the measurement
// the rule describes. Measured: 158 of the 188 contract scenarios only measure; 30 interact. The
// 158 share a page, the 30 keep a fresh one each.
//
// A scenario counts as interacting if ANY of its themes does: theme overrides can add rules, and a
// scenario that is static in twelve themes and interactive in the thirteenth would otherwise reuse
// a dirtied page in exactly one of them — the hardest kind of failure to attribute.
const UNITS = buildContractUnits();

/** Does this block touch the page, rather than only measure it? */
const interacts = (b: (typeof UNITS)[number]['block']) =>
    Boolean(b.positioning?.length || b.overlay?.length || b.states?.length);

const groups = new Map<string, typeof UNITS>();
for (const u of UNITS) {
    const key = `${u.page}::${u.scenario}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(u);
}

/** True when the rule asserts nothing but the count, and so measures no element. */
function countOnly(rule: { selector: string; description: string; count?: unknown }): boolean {
    return Object.keys(rule).every((k) => k === 'selector' || k === 'description' || k === 'count');
}

async function runUnit(page: Page, unit: (typeof UNITS)[number]): Promise<void> {
        const b = unit.block;

        for (const r of b.standalone ?? []) {
            // `count` is about the SET the selector matches, so it is asserted BEFORE anything is
            // looked up — it is the one rule here that is meaningful at zero, and a rule that only
            // counts must not fail on «Element not found».
            if (r.count) {
                const n = await page.locator(r.selector).count();
                // tolerance 0, and not by accident: `assertNumeric` defaults it to 1 because every
                // other rule here measures PIXELS. On a count that default makes `== 2` accept 1, 2
                // or 3 — measured, a rule written `== 3` against a tree that renders 2 nodes passed.
                assertNumeric(
                    n,
                    { ...r.count, tolerance: r.count.tolerance ?? 0 },
                    `${r.description} — elements matching ${r.selector}`,
                );
                if (countOnly(r)) continue;
            }
            const m = await measureElement(page, r.selector);
            expect(m, `Element not found: ${r.selector} (${r.description})`).not.toBeNull();
            assertStandaloneRule(m!, r);
            await assertContrast(page, r);
            await assertMark(page, r);
            await assertColorVar(page, r);
        }
        for (const r of b.composition ?? []) await assertComposition(page, r);
        for (const r of b.positioning ?? []) await assertPositioning(page, r);
        for (const r of b.overlay ?? []) await assertOverlay(page, r);
        // States last: they interact, and can navigate
        for (const r of b.states ?? []) await assertState(page, r);
}

for (const [, units] of groups) {
    const { scenario, page: pageSlug } = units[0];
    const label = (u: (typeof UNITS)[number]) =>
        u.theme === 'neutral' ? u.scenario : `${u.scenario} [${u.theme}]`;

    if (units.some((u) => interacts(u.block))) {
        // Interactive: one fresh page per test.
        for (const unit of units) {
            test(`contract: ${label(unit)}`, async ({ page }) => {
                await goToScenario(page, unit.scenario, unit.theme, { page: unit.page });
                await freezeAnimations(page);
                await runUnit(page, unit);
            });
        }
        continue;
    }

    // Measure-only: one page for the group, re-themed per test. Not `describe.serial` — measured at
    // 54.9s serial versus 54.7s without, so the saving comes from the shared page and
    // not from the ordering, and serial mode would skip a scenario's remaining themes after the
    // first failure. This suite exists to tell "broken everywhere" from "broken in cyberpunk".
    test.describe(`contract: ${scenario}`, () => {
        let shared: Page;

        test.beforeAll(async ({ sharedContext }) => {
            shared = await sharedContext.newPage();
            await goToScenario(shared, scenario, units[0].theme, { page: pageSlug });
            await freezeAnimations(shared);
        });
        test.afterAll(async () => { await shared?.close(); });

        for (const unit of units) {
            test(`contract: ${label(unit)}`, async () => {
                await applyTheme(shared, unit.theme);

                // The page is REUSED, so nothing else proves the theme changed. Without this a
                // broken applyTheme would silently collapse 13 themes into 13 runs of one — and
                // most standalone rules (heights, radii, opacity) would pass either way.
                await expect(shared.locator('html')).toHaveAttribute('pdx-theme', unit.theme);

                await runUnit(shared, unit);
            });
        }
    });
}

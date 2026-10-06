/**
 * DIMENSION 3 — Style isolation (immunity to somebody else's style), data-driven from the manifests.
 *
 * It measures the targets BEFORE, injects hostile global CSS, and measures again AFTER. The
 * component (Light DOM, .pdx-* classes) must keep its critical geometry within tolerance.
 * A failure is a real vulnerability of the design system, not of the test.
 *
 * Theme-independent → run on 'neutral'.
 */
import { test, expect } from './contracts/fixture';
import { goToScenario, measureElement } from './contracts/measure';
import { freezeAnimations, settle } from './contracts/assertions';
import { manifests, scenarioPage } from './contracts/generated/manifests';
import { HOSTILE_CSS } from '../../tooling/hostile-css';
import type { MeasuredElement } from './contracts/types';

for (const m of manifests) {
    if (!m.isolation) continue;
    const { scenario, targets } = m.isolation;
    const pageSlug = scenarioPage[scenario];

    test(`isolation: ${m.name}`, async ({ page }) => {
        await goToScenario(page, scenario, 'neutral', { page: pageSlug });
        await freezeAnimations(page);

        // Snapshot "before"
        const before: Record<string, MeasuredElement> = {};
        for (const t of targets) {
            const m0 = await measureElement(page, t.selector);
            expect(m0, `target not found before: ${t.selector}`).not.toBeNull();
            before[t.selector] = m0!;
        }

        // Inietta lo stile ostile
        await page.addStyleTag({ content: HOSTILE_CSS });
        await settle(page);

        // Snapshot "after" + assert drift
        for (const t of targets) {
            const after = await measureElement(page, t.selector);
            expect(after, `target not found after: ${t.selector}`).not.toBeNull();
            const b = before[t.selector];
            const tol = t.tolerancePx ?? 1;
            const drift = (k: keyof MeasuredElement) => Math.abs((after![k] as number) - (b[k] as number));

            // STRUCTURAL invariants: height (vertical rhythm through min-height) and shape (radius).
            // The width is content/font-driven → not asserted universally (it would be noise;
            // a host may legitimately change the font). Opt in through a dedicated target if needed.
            // INVESTIGATE: the host's font-size leaks into the button (the width varies) → a possible
            // hardening: fix font-size on the button's .pdx-* class.
            // Height: a structural invariant, EXCEPT for scaled/content-driven elements (skipHeight).
            if (!t.skipHeight) {
                expect(drift('height'), `${t.selector} height drift`).toBeLessThanOrEqual(tol);
            }
            expect(drift('borderTopLeftRadius'), `${t.selector} radius TL drift`).toBeLessThanOrEqual(tol);
            expect(drift('borderTopRightRadius'), `${t.selector} radius TR drift`).toBeLessThanOrEqual(tol);
            expect(drift('borderBottomLeftRadius'), `${t.selector} radius BL drift`).toBeLessThanOrEqual(tol);
            expect(drift('borderBottomRightRadius'), `${t.selector} radius BR drift`).toBeLessThanOrEqual(tol);
        }
    });
}

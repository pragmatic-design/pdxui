/**
 * DIMENSION 2 — Accessibility (axe-core / WCAG), data-driven from the manifests.
 *
 * For every component with an a11y block: scenario × theme (in the theme's canonical scheme).
 * It limits the scan to the visible section, to avoid noise from the others.
 */
import { test, expect, type Page } from './contracts/fixture';
import AxeBuilder from '@axe-core/playwright';
import { goToScenario, applyTheme } from './contracts/measure';
import { manifests, scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * `color-contrast` is excluded from the axe gate by default: the design system's themes use
 * gradients and translucent surfaces (cyberpunk, glass, material state-layer, pragmatic)
 * that axe cannot sample → systematic false positives. Contrast is to be verified with
 * a DETERMINISTIC contract based on OKLCH lightness (the tokens already expose L/C/H).
 * INVESTIGATE: add a dedicated "contrast" dimension. A manifest can re-enable
 * color-contrast through a11y.wcagTags/override when the component has solid backgrounds.
 */
const DEFAULT_DISABLE = ['color-contrast'];

/**
 * Rules whose failures axe files under `incomplete` («needs review») instead of `violations`,
 * which is all this gate reads. `duplicate-id-aria` is one (`reviewOnFail: true` in axe 4.11):
 * two accordions on one page that both generate `pdx-acc-content-0` point their triggers'
 * aria-controls into the first one, and Dim 2 would pass. On a page this runner builds itself there
 * is no one to review it, so a failure of these rules is a violation here.
 */
const REVIEW_ON_FAIL_AS_VIOLATION = ['duplicate-id-aria'];

for (const m of manifests) {
    if (!m.a11y) continue;
    const themes = m.themes ?? THEMES;

    for (const scenarioId of m.a11y.scenarios) {
        const pageSlug = scenarioPage[scenarioId];
        // One serial group per scenario, sharing one page across its themes. Groups still run in
        // parallel under fullyParallel, each group's tests in order.
        test.describe(`a11y: ${scenarioId}`, () => {
            let shared: Page;
            test.beforeAll(async ({ sharedContext }) => {
                shared = await sharedContext.newPage();
                await goToScenario(shared, scenarioId, themes[0], { page: pageSlug, scheme: schemeFor(themes[0]) });
            });
            test.afterAll(async () => { await shared?.close(); });

        for (const theme of themes) {
            const scheme = schemeFor(theme);
            const label = theme === 'neutral' ? scenarioId : `${scenarioId} [${theme}]`;

            test(`a11y: ${label}`, async () => {
                const page = shared;
                await applyTheme(page, theme, scheme);

                // The page is REUSED across the themes of this scenario, so nothing else proves the
                // theme actually changed — and axe is nearly blind to themes (color-contrast is
                // disabled by default here), so 13 runs of the same theme would pass exactly like
                // 13 runs of 13. Without this line the reuse could silently turn the theme
                // dimension into a no-op.
                await expect(page.locator('html')).toHaveAttribute('pdx-theme', theme);

                const disable = [
                    ...DEFAULT_DISABLE,
                    ...(m.a11y!.disableRules ?? []),
                    ...(m.a11y!.themeDisableRules?.[theme] ?? []),
                ];
                let builder = new AxeBuilder({ page })
                    .withTags(m.a11y!.wcagTags ?? DEFAULT_TAGS)
                    .include('section:not([hidden])');
                if (disable.length) builder = builder.disableRules(disable);

                const results = await builder.analyze();
                const violations = [
                    ...results.violations,
                    ...results.incomplete.filter((r) => REVIEW_ON_FAIL_AS_VIOLATION.includes(r.id)),
                ];
                const summary = violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ');
                expect(violations, `axe violations: ${summary}`).toEqual([]);
            });
        }
        });
    }
}

/**
 * Score demo — runs aesthetic scoring on Pragmatic Design CSS docs pages.
 * This is NOT a pass/fail test — it's a measurement tool.
 * Run with: npx playwright test tests/integration/score-demo.spec.ts
 */

import { test } from '@playwright/test';
import { r$ } from '@responsivejs/design';

const BASE = 'http://localhost:3333/demo/docs';

const PAGES = [
    { name: 'Homepage', url: `${BASE}/index.html` },
    { name: 'Layout', url: `${BASE}/layout.html` },
    { name: 'Buttons', url: `${BASE}/buttons.html` },
    { name: 'Forms', url: `${BASE}/forms.html` },
    { name: 'Typography', url: `${BASE}/typography.html` },
    { name: 'Feedback', url: `${BASE}/feedback.html` },
    { name: 'Data Display', url: `${BASE}/data.html` },
    { name: 'Navigation', url: `${BASE}/navigation.html` },
    { name: 'Surfaces', url: `${BASE}/surfaces.html` },
];

const SELECTORS = [
    'h1', 'h2', 'h3', 'p', 'a',
    'button', 'input', 'select', 'textarea',
    '.pdx-surface-card', '.pdx-alert', '.pdx-badge',
    '.pdx-tabs', '.pdx-tab', '.pdx-table',
    '.pdx-breadcrumb', '.pdx-pagination',
    '.pdx-txt-display', '.pdx-txt-title', '.pdx-txt-heading',
    '.pdx-primary', '.pdx-secondary', '.pdx-ghost',
    '.doc-preview', '.doc-sidebar', '.doc-topbar',
    'main', 'nav', 'pdx-stack', 'pdx-row', 'pdx-grid', 'pdx-center',
];

for (const pageInfo of PAGES) {
    test(`Score: ${pageInfo.name}`, async ({ page }) => {
        const v = r$(page);
        await v.sweep({
            url: pageInfo.url,
            selectors: SELECTORS,
            widths: [375, 768, 1280, 1920],
        });

        // Run constraint checks
        v.assert
            .noOverflow()
            .childrenContained('main')
            .noZeroHeight('pdx-stack');

        const report = v.report();

        // Get aesthetic score
        const scoreResult = v.score();

        // Print results
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 ${pageInfo.name}`);
        console.log(`${'='.repeat(60)}`);

        // Constraints
        console.log(`\nConstraints: ${report.passed}/${report.total} passed`);
        if (report.violations.length > 0) {
            for (const v of report.violations.slice(0, 5)) {
                console.log(`  ❌ [${v.width}px] ${v.rule}: ${v.detail}`);
            }
            if (report.violations.length > 5) {
                console.log(`  ... and ${report.violations.length - 5} more`);
            }
        }

        // Score at each width
        console.log(`\nAesthetic Scores:`);
        for (const [width, s] of scoreResult.perWidth) {
            console.log(`  ${width}px — overall: ${s.overall.toFixed(2)} | balance: ${s.balance.toFixed(2)} | rhythm: ${s.rhythm.toFixed(2)} | proportion: ${s.proportion.toFixed(2)} | regularity: ${s.regularity.toFixed(2)}`);
        }

        // Average
        const avg = scoreResult.average;
        console.log(`\n  AVERAGE — overall: ${avg.overall.toFixed(2)}`);
        console.log(`    balance:${avg.balance.toFixed(2)} equilibrium:${avg.equilibrium.toFixed(2)} symmetry:${avg.symmetry.toFixed(2)} proportion:${avg.proportion.toFixed(2)}`);
        console.log(`    rhythm:${avg.rhythm.toFixed(2)} density:${avg.density.toFixed(2)} regularity:${avg.regularity.toFixed(2)} simplicity:${avg.simplicity.toFixed(2)}`);
        console.log(`    unity:${avg.unity.toFixed(2)} homogeneity:${avg.homogeneity.toFixed(2)} sequence:${avg.sequence.toFixed(2)} cohesion:${avg.cohesion.toFixed(2)}`);
        console.log(`    economy:${avg.economy.toFixed(2)} colorHarmony:${avg.colorHarmony.toFixed(2)} typographyHarmony:${avg.typographyHarmony.toFixed(2)} birkhoff:${avg.birkhoff.toFixed(2)}`);

        // Suggestions
        if (scoreResult.suggestions.length > 0) {
            console.log(`\n  Suggestions:`);
            for (const s of scoreResult.suggestions) {
                console.log(`    💡 ${s}`);
            }
        }
    });
}

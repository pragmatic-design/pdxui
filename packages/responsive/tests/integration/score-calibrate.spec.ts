/**
 * Score calibration — test with layout-block selectors vs all-elements selectors.
 * Goal: understand which selector strategy gives meaningful scores.
 */

import { test } from '@playwright/test';
import { r$ } from '@responsivejs/design';

const BASE = 'http://localhost:3333/demo/docs';

// Strategy A: Layout blocks only (what you SEE as visual structure)
const LAYOUT_SELECTORS = [
    '.doc-sidebar', '.doc-topbar', 'main',
    '.doc-preview', '.doc-example', '.doc-source',
    '.pdx-surface-card', '.pdx-alert',
    'pdx-stack', 'pdx-row', 'pdx-grid', 'pdx-center', 'pdx-split',
    '.pdx-tabs', '.pdx-table', '.pdx-pagination', '.pdx-stepper',
    '.pdx-breadcrumb', '.pdx-nav',
    '.pdx-progress', '.pdx-skeleton',
];

// Strategy B: Everything (current — too noisy)
const ALL_SELECTORS = [
    'h1', 'h2', 'h3', 'p', 'a', 'button', 'input', 'select',
    '.pdx-surface-card', '.pdx-alert', '.pdx-badge',
    '.pdx-tabs', '.pdx-tab', '.pdx-table',
    '.pdx-primary', '.pdx-secondary', '.pdx-ghost',
    '.doc-preview', '.doc-sidebar', '.doc-topbar',
    'main', 'nav', 'pdx-stack', 'pdx-row', 'pdx-grid', 'pdx-center',
];

const PAGES = [
    { name: 'Homepage', url: `${BASE}/index.html` },
    { name: 'Buttons', url: `${BASE}/buttons.html` },
    { name: 'Navigation', url: `${BASE}/navigation.html` },
];

function printScore(label: string, v: ReturnType<typeof r$>, strategy: string) {
    const s = v.score();
    const a = s.average;
    console.log(`\n  [${strategy}] ${label}`);
    console.log(`    overall:${a.overall.toFixed(2)} balance:${a.balance.toFixed(2)} equilibrium:${a.equilibrium.toFixed(2)} symmetry:${a.symmetry.toFixed(2)}`);
    console.log(`    proportion:${a.proportion.toFixed(2)} rhythm:${a.rhythm.toFixed(2)} density:${a.density.toFixed(2)} regularity:${a.regularity.toFixed(2)}`);
    console.log(`    simplicity:${a.simplicity.toFixed(2)} unity:${a.unity.toFixed(2)} homogeneity:${a.homogeneity.toFixed(2)} sequence:${a.sequence.toFixed(2)}`);
    console.log(`    cohesion:${a.cohesion.toFixed(2)} economy:${a.economy.toFixed(2)} colorH:${a.colorHarmony.toFixed(2)} typoH:${a.typographyHarmony.toFixed(2)} birkhoff:${a.birkhoff.toFixed(2)}`);
    if (s.suggestions.length > 0) {
        console.log(`    suggestions: ${s.suggestions.length}`);
    }
}

for (const pageInfo of PAGES) {
    test(`Calibrate: ${pageInfo.name}`, async ({ page }) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  ${pageInfo.name}`);
        console.log(`${'='.repeat(60)}`);

        // Strategy A: Layout blocks
        const vA = r$(page);
        await vA.sweep({ url: pageInfo.url, selectors: LAYOUT_SELECTORS, widths: [1280] });
        printScore(pageInfo.name, vA, 'LAYOUT BLOCKS');

        // Strategy B: All elements
        const vB = r$(page);
        await vB.sweep({ url: pageInfo.url, selectors: ALL_SELECTORS, widths: [1280] });
        printScore(pageInfo.name, vB, 'ALL ELEMENTS');
    });
}

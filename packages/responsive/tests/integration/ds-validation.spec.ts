/**
 * Design System Validation — an LLM-like agent validates our docs page
 * against the Material Design 3 design system rules.
 *
 * This simulates the agentic flow:
 * 1. Read the DS JSON
 * 2. Translate rules into r$ constraints
 * 3. Sweep the page
 * 4. Report violations with fix suggestions
 */

import { test, expect } from '@playwright/test';
import { r$ } from '@responsivejs/design';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DS = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../design-systems/material-design-3.json'), 'utf-8')
);

const PAGE = 'http://localhost:3333/demo/docs/buttons.html?theme=material&scheme=dark';

// Selectors for Material theme validation — components we expect on a buttons page
const COMPONENT_SELECTORS = [
    'button', 'a[role="button"]',
    '.pdx-primary', '.pdx-secondary', '.pdx-ghost', '.pdx-danger',
    '.pdx-input', 'input', 'select',
    '.pdx-surface-card', '.pdx-alert',
    '.pdx-tabs', '.pdx-tab',
    '.pdx-badge',
    '.doc-preview', '.doc-sidebar',
];

const LAYOUT_SELECTORS = [
    'main', 'nav', '.doc-topbar',
    'pdx-stack', 'pdx-row', 'pdx-grid', 'pdx-center', 'pdx-split',
    'h1', 'h2',
];

// `test(title, fn, timeout)` is Vitest's signature, not Playwright's: the third argument lands on
// the `(title, details, body)` overload, so the body is passed as `details` and the 30000 as the
// body, and the deadline is never applied. Playwright's options object carries `tag` and
// `annotation` and no timeout at all — `test.setTimeout()` inside the body is the way.
test('Material Design 3: validate buttons page', async ({ page }) => {
    test.setTimeout(30_000);
    // Theme is set via query string — persists across sweep navigation
    const allSelectors = [...COMPONENT_SELECTORS, ...LAYOUT_SELECTORS];
    const v = r$(page);
    await v.sweep({
        url: PAGE,
        selectors: allSelectors,
        widths: [375, 768, 1280],
        height: 900,
    });

    console.log('\n' + '='.repeat(70));
    console.log('  MATERIAL DESIGN 3 — VALIDATION REPORT');
    console.log('  Page: buttons.html with pdx-theme="material"');
    console.log('='.repeat(70));

    // ── 1. ACCESSIBILITY (from DS.accessibility) ──
    console.log('\n📋 ACCESSIBILITY');

    // Touch target: M3 requires 48px min
    v.assert.touchTarget('button');
    v.assert.touchTarget('.pdx-primary');
    v.assert.touchTarget('.pdx-secondary');
    v.assert.touchTarget('.pdx-ghost');
    v.assert.touchTarget('input');

    // Focus visibility
    v.assert.focusVisible('button');
    v.assert.focusVisible('input');

    // Text readability
    v.assert.textReadable('h1');
    v.assert.textReadable('h2');
    v.assert.textReadable('p');

    // Contrast — check all text elements
    v.assert.contrastRatio('button');
    v.assert.contrastRatio('h1');
    v.assert.contrastRatio('h2');

    // ── 2. SPACING (from DS.spacing) ──
    console.log('📋 SPACING');

    // M3 spacing tokens: 0,4,8,12,16,24,32,48,64
    v.assert.spacingTokens('.doc-preview', DS.spacing.tokens);
    v.assert.spacingTokens('pdx-stack', DS.spacing.tokens);

    // Gap uniformity in grids
    v.assert.gapUniform('pdx-row');

    // ── 3. SHAPE (from DS.shape) ──
    console.log('📋 SHAPE');

    // M3 border radius should not exceed element dimensions
    v.assert.borderRadiusValid('button');
    v.assert.borderRadiusValid('.pdx-surface-card');
    v.assert.borderRadiusValid('.pdx-input');

    // ── 4. TYPOGRAPHY (from DS.typography) ──
    console.log('📋 TYPOGRAPHY');

    // Check that heading sizes follow a scale
    v.assert.typographyScale('h1, h2');

    // ── 5. LAYOUT (from DS.components) ──
    console.log('📋 LAYOUT');

    // No overflow at any width
    v.assert.noOverflow();

    // Main content contained
    v.assert.childrenContained('main');

    // Buttons should have M3 min height (40px from DS.components.button.height)
    const m3ButtonHeight = DS.components.button.height; // 40
    v.assert.minSize('.pdx-primary', { height: m3ButtonHeight });
    v.assert.minSize('.pdx-secondary', { height: m3ButtonHeight });

    // No zero-height elements
    v.assert.noZeroHeight('pdx-stack');
    v.assert.noZeroHeight('pdx-row');

    // ── 6. COMPONENT SPECIFICS ──
    console.log('📋 COMPONENT SPECIFICS');

    // M3 input min height (56px from DS.components.input.height)
    v.assert.minSize('.pdx-input', { height: DS.components.input.height });
    v.assert.minSize('input', { height: DS.components.input.height });

    // Interactive spacing between buttons
    v.assert.interactiveSpacing('.pdx-primary');

    // ── REPORT ──
    const report = v.report();

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  RESULTS: ${report.passed}/${report.total} checks passed`);
    console.log(`  Violations: ${report.failed}`);
    console.log(`${'─'.repeat(70)}`);

    if (report.violations.length > 0) {
        // Group by rule
        const byRule = new Map<string, typeof report.violations>();
        for (const v of report.violations) {
            const list = byRule.get(v.rule) || [];
            list.push(v);
            byRule.set(v.rule, list);
        }

        for (const [rule, violations] of byRule) {
            const severity = violations[0].severity || 'warning';
            const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`\n${icon} ${rule} (${violations.length} violations)`);

            // Show unique violations (deduplicate across widths)
            const seen = new Set<string>();
            for (const v of violations) {
                const key = `${v.element || v.elements?.join(',')}|${v.detail}`;
                if (seen.has(key)) continue;
                seen.add(key);
                console.log(`    [${v.width}px] ${v.element || ''} — ${v.detail}`);
                if (v.fix) {
                    console.log(`    🔧 Fix: ${v.fix.selector} { ${v.fix.property}: ${v.fix.value} } — ${v.fix.reason}`);
                }
                if (v.suggestion && !v.fix) {
                    console.log(`    💡 ${v.suggestion}`);
                }
            }
        }
    }

    // Score the page aesthetically too
    const scoreResult = v.score();
    const avg = scoreResult.average;
    console.log(`\n📊 AESTHETIC SCORE: ${avg.overall.toFixed(2)}`);
    console.log(`    balance:${avg.balance.toFixed(2)} symmetry:${avg.symmetry.toFixed(2)} regularity:${avg.regularity.toFixed(2)} proportion:${avg.proportion.toFixed(2)}`);

    if (scoreResult.suggestions.length > 0) {
        console.log(`\n  Design suggestions:`);
        for (const s of scoreResult.suggestions) {
            console.log(`    💡 ${s}`);
        }
    }

    console.log('\n' + '='.repeat(70));
});

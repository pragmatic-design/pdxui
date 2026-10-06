// Which tokens a theme leaves inheriting from the base.
//
// A theme that does not set a token still renders — the value falls through to tokens.css — so the
// gap produces a valid page and never surfaces as a defect. It only shows when someone puts two
// themes side by side and wonders why one reads flatter. Nothing in the repo reported this: not the
// builder's token editor, not the five certification dimensions, not the WCAG gate.
//
// The assertions below name tokens rather than counting them, deliberately: a script that computed
// nothing would satisfy a count check and satisfies none of these.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeCoverage, contractModuleSource, BASE_THEME } from '../../design/scripts/theme-coverage.mjs';

const THEMES_DIR = join(__dirname, '..', '..', 'design', 'src', 'themes');
const GENERATED = join(__dirname, '..', '..', 'design', 'src', 'engine', 'theme-contract.ts');

const coverage = themeCoverage(THEMES_DIR);
const gaps: Map<string, string[]> = coverage.gaps;

describe('the theme contract', () => {
    it('is a majority of the thirteen themes, not an arbitrary list', () => {
        expect(coverage.themes).toHaveLength(13);
        expect(coverage.majority).toBe(7);
        expect(coverage.contract).toContain('--pdx-color-primary');
        expect(coverage.contract).toContain('--pdx-button-radius');
        // Every theme declares --pdx-color-accent-text, the info button's label.
        expect(coverage.contract).toContain('--pdx-color-accent-text');
        // The two control heights are past the majority: eight themes declare them, so they are
        // part of what a theme is expected to have a position on — which they should be, since a
        // control height is a design decision and not an implementation detail.
        expect(coverage.contract).toContain('--pdx-button-min-height');
        expect(coverage.contract).toContain('--pdx-input-min-height');
        expect(coverage.contract.length).toBe(49);
    });

    it('excludes the base theme from the report, and only the base', () => {
        // neutral leaves 39 of the contract to tokens.css and that is correct — it IS the base,
        // matched by `:root:not([pdx-theme])`. Reporting it would bury the twelve real rows.
        expect(gaps.has(BASE_THEME)).toBe(false);
        expect(gaps.size).toBe(12);
    });
});

describe('what each theme inherits', () => {
    it('names cupertino’s single gap exactly', () => {
        expect(gaps.get('cupertino')).toEqual(['--pdx-button-hover-shadow']);
    });

    it('names tokens in glass, the widest case', () => {
        // Glass declares its own table header: inheriting the six header tokens would make its
        // header indistinguishable from the base. This number falls as themes take positions; a
        // RISE means a theme lost one it had, OR that the contract grew under it.
        //
        // Two of the eight are the control heights, which glass does not declare — it inherits
        // 40px from tokens.css, correctly, since it carries no density factor.
        // A gap is a question ("has this theme taken a position?"), not a defect.
        const glass = gaps.get('glass')!;
        expect(glass).toContain('--pdx-font-mono');
        expect(glass).toContain('--pdx-breadcrumb-separator');
        expect(glass).toContain('--pdx-button-min-height');
        expect(glass).toHaveLength(8);
    });

    it('names the colour gaps that are a design question, not a typo', () => {
        // cyberpunk not defining bg/surface/border is either a choice or a hole. The script says
        // where; it does not say which, and neither does this test.
        const cyberpunk = gaps.get('cyberpunk')!;
        expect(cyberpunk).toContain('--pdx-color-bg');
        expect(cyberpunk).toContain('--pdx-color-surface');
        expect(cyberpunk).toContain('--pdx-color-border');
    });

    it('reproduces every row', () => {
        const counts = Object.fromEntries([...gaps.entries()].map(([t, m]) => [t, m.length]));
        // Four of these — glass, playful, pragmatic, pragmatic-gold — include the 2 control
        // heights, which they do not declare; the eight that declare them do not count them.
        expect(counts).toEqual({
            material: 4, fluent: 3, cupertino: 1, metro: 2,
            pragmatic: 4, 'pragmatic-gold': 4, editorial: 5, corporate: 9,
            playful: 11, cyberpunk: 8, neumorphic: 9, glass: 8,
        });
    });
});

describe('the generated module the builder imports', () => {
    it('is exactly what the script produces now', () => {
        // A browser cannot read thirteen CSS files off disk, so the data is generated into a module.
        // Generated data that nothing checks is data that lies after the next theme edit.
        expect(
            readFileSync(GENERATED, 'utf-8').replace(/\r\n/g, '\n'),
            'stale — run: node packages/design/scripts/theme-coverage.mjs --emit',
        ).toBe(contractModuleSource(coverage));
    });
});

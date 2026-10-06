// Engine hygiene + DTCG.
// Lives in the CLI tests because the CLI is the engine's consumer and already
// has vitest; @pdxui/design has no unit-test harness of its own.

import { describe, it, expect } from 'vitest';
import { createTheme, toDTCG, fromDTCG, combineThemeScore, parseColorToken, wcagContrast } from '@pdxui/design/engine';

const base = { name: 'test', brandColor: '#6442d6', language: 'material' as const };

// ── cssOverrides: declared on the input, and emitted ──
describe('cssOverrides escape-hatch', () => {
    it('input.cssOverrides is emitted inside the theme block', () => {
        const css = createTheme({ ...base, cssOverrides: '& .pdx-button:hover { color: red; }' }).toCSS();
        expect(css).toContain('.pdx-button:hover');
        expect(css).toContain('color: red;');
        expect(css.trim().endsWith('}')).toBe(true); // still a single block
    });

    it('with no cssOverrides the block is unchanged (no override comment)', () => {
        const css = createTheme({ ...base }).toCSS();
        expect(css).not.toContain('cssOverrides');
        expect(css).toContain('[pdx-theme="test"]');
    });
});

// ── export/import DTCG (W3C Design Tokens 2025.10) ──
describe('DTCG round-trip', () => {
    it('fromDTCG(toDTCG(tokens)) === tokens (lossless)', () => {
        const theme = createTheme({ ...base });
        expect(fromDTCG(toDTCG(theme))).toEqual(theme.tokens);
    });

    it('the colour tokens carry $type:color and the OKLCH value stays verbatim', () => {
        const theme = createTheme({ ...base });
        const dtcg = toDTCG(theme) as any;
        expect(dtcg.color.primary.$type).toBe('color');
        expect(dtcg.color.primary.$value).toBe(theme.tokens['--pdx-color-primary']);
    });

    it('a wrap with a single-key root round-trips all the same', () => {
        const theme = createTheme({ ...base });
        expect(fromDTCG(toDTCG(theme, { root: 'pdx' }))).toEqual(theme.tokens);
    });

    // `--pdx-breadcrumb-separator: '/'` must not export as "'/'" — the CSS string's quotes inside
    // the value a design tool reads. A CSS string exports as its text; the quote it had travels in
    // `$extensions.pdx.quote`, and the import puts it back, so the round-trip stays lossless.
    it('a CSS string token exports its text, and comes back quoted', () => {
        const tokens = {
            '--pdx-breadcrumb-separator': "'/'",
            '--pdx-accordion-icon': '"›"',
            '--pdx-quote-mark': "'it\\'s'",
            '--pdx-metro-separator': "'\\\\'",
        };
        const dtcg = toDTCG(tokens) as any;
        expect(dtcg.breadcrumb.separator.$value).toBe('/');
        expect(dtcg.breadcrumb.separator.$extensions).toEqual({ pdx: { quote: "'" } });
        expect(dtcg.accordion.icon.$value).toBe('›');
        expect(dtcg.quote.mark.$value).toBe("it's");
        expect(dtcg.metro.separator.$value).toBe('\\');
        expect(fromDTCG(dtcg)).toEqual(tokens);
    });

    it('only a value that is one CSS string is unquoted', () => {
        const tokens = { '--pdx-font-sans': "'Inter', system-ui, sans-serif", '--pdx-radius-md': '0.5rem' };
        const dtcg = toDTCG(tokens) as any;
        expect(dtcg.font.sans.$value).toBe("'Inter', system-ui, sans-serif");
        expect(dtcg.font.sans.$extensions).toBeUndefined();
        expect(fromDTCG(dtcg)).toEqual(tokens);
    });
});

// ── the theme oracle — combineThemeScore (a pure merge of the engine WCAG gate + the rendered r$) ──
describe('combineThemeScore (theme oracle merge)', () => {
    // Minimal UnifiedReport fixture (r$). `any` to skip the full 17-field score shape.
    const rep = (pass: boolean, overall?: number): any => ({
        pass, total: 1, passed: pass ? 1 : 0, failed: pass ? 0 : 1, violations: [],
        clean: pass, fixes: [], widths: [1280],
        sources: { measurement: 'browser', a11y: 'skipped' },
        summary: { errors: pass ? 0 : 1, warnings: 0, info: 0, byRule: {}, byWidth: {} },
        durationMs: 0,
        ...(overall !== undefined ? { scores: { perWidth: new Map(), average: { overall }, suggestions: [] } } : {}),
    });

    it('a pass requires zero WCAG token errors AND a passing rendered report', () => {
        expect(combineThemeScore([], rep(true, 0.8)).pass).toBe(true);
        expect(combineThemeScore([{ level: 'error', code: 'C', message: 'm' }], rep(true, 0.8)).pass).toBe(false);
        expect(combineThemeScore([], rep(false)).pass).toBe(false);
        expect(combineThemeScore([{ level: 'warning', code: 'W', message: 'm' }], rep(true)).pass).toBe(true);
    });

    it('exposes the overall aesthetic score (or undefined when scoring is off)', () => {
        expect(combineThemeScore([], rep(true, 0.8)).aesthetic).toBe(0.8);
        expect(combineThemeScore([], rep(true)).aesthetic).toBeUndefined();
    });
});

// ─── parseColorToken and the colours the token system actually uses ───────────
//
// `--pdx-color-danger-text`, `-info-text`, `-success-text` and `-primary-text` are the literal
// keyword `white` in tokens.css — the design system's own default for a label on a coloured fill.
// `parseColorToken` reads it alongside oklch(), light-dark() and #hex: a null for it makes every
// consumer silently skip the five pairs the label rule is ABOUT. The contrast gate's
// `if (!bg || !fg) continue` turns "cannot read" into "did not check", which is the shape of a
// check that cannot fail.
describe('parseColorToken reads the colours the tokens are written in', () => {
    it('reads the keyword the label tokens actually use', () => {
        const white = parseColorToken('white', 'light');
        expect(white, 'the label token of four semantic fills does not parse').not.toBeNull();
        expect(white!.l, 'white is not full lightness').toBeCloseTo(1, 2);
        expect(white!.c, 'white is not achromatic').toBeCloseTo(0, 3);

        const black = parseColorToken('black', 'light');
        expect(black, 'black does not parse').not.toBeNull();
        expect(black!.l).toBeCloseTo(0, 2);
    });

    it('measures white on a fill the same way it measures an oklch label', () => {
        // The point of parsing it: the ratio must be real, not a placeholder.
        const fill = parseColorToken('oklch(0.55 0.2 25)', 'light')!;
        const asKeyword = wcagContrast(parseColorToken('white', 'light')!, fill);
        const asOklch = wcagContrast(parseColorToken('oklch(1 0 0)', 'light')!, fill);
        expect(asKeyword).toBeCloseTo(asOklch, 5);
        expect(asKeyword, 'white on a mid danger red should clear AA').toBeGreaterThan(4.5);
    });

    it('still returns null for a value that is not a colour', () => {
        // Without this the fix could become "parse anything", and the gate's skip would start
        // hiding real unreadable tokens instead of a known keyword.
        expect(parseColorToken('transparent', 'light'), 'transparent is not a contrast subject').toBeNull();
        expect(parseColorToken('var(--pdx-color-primary)', 'light')).toBeNull();
        expect(parseColorToken('', 'light')).toBeNull();
    });
});

/**
 * A colour as text, and what the gates need to measure it.
 *
 * Tinted badges, outline chips, links and error messages cannot be written in the FILL colour,
 * which the label rule tunes for a white label: too light for text on the light page, too dark on
 * the dark one. The `*-ink` / `*-soft` tokens derive a text colour from each theme's own colour with
 * relative colour syntax, and the gates read that syntax, follow a `var()` nested in a value, and
 * composite a translucent surface — or they would measure something the browser does not render.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    createTheme, getLanguageIds, parseColorToken, resolveColorToken, compositeOver, wcagContrast,
    validateTokenContrast, derivedTextTokens, TEXT_HUES,
} from '@pdxui/design/engine';
import type { LanguageId } from '@pdxui/design/engine';

const TOKENS_CSS = readFileSync(join(__dirname, '..', '..', 'design', 'src', 'tokens.css'), 'utf8');

describe('the engine reads what the tokens are written in', () => {
    it('reads a relative colour: the origin\'s own channels, and min()/max() of them', () => {
        const c = parseColorToken('oklch(from oklch(0.6 0.2 25) min(l, 0.46) min(c, 0.15) h)', 'light')!;
        expect(c.l).toBeCloseTo(0.46);
        expect(c.c).toBeCloseTo(0.15);
        expect(c.h).toBeCloseTo(25);
        const d = parseColorToken('oklch(from oklch(0.8 0.05 85) max(l, 0.72) min(c, 0.12) h)', 'dark')!;
        expect(d.l).toBeCloseTo(0.8);
        expect(d.c).toBeCloseTo(0.05);
    });

    it('takes the origin of a relative colour in the scheme asked for', () => {
        const css = 'oklch(from light-dark(oklch(0.5 0.1 20), oklch(0.7 0.1 200)) l c h)';
        expect(parseColorToken(css, 'light')!.h).toBeCloseTo(20);
        expect(parseColorToken(css, 'dark')!.h).toBeCloseTo(200);
    });

    it('keeps alpha, top-level only — a slash inside the origin is the origin\'s', () => {
        expect(parseColorToken('oklch(1 0 0 / 0.55)', 'light')!.alpha).toBeCloseTo(0.55);
        expect(parseColorToken('oklch(from oklch(1 0 0 / 0.5) l c h)', 'light')!.alpha).toBeCloseTo(0.5);
        expect(parseColorToken('oklch(from oklch(1 0 0 / 0.5) l c h / 1)', 'light')!.alpha).toBeUndefined();
        expect(parseColorToken('oklch(0.5 0.1 20)', 'light')!.alpha).toBeUndefined();
    });

    it('reads what it cannot evaluate as unreadable, not as a guess', () => {
        expect(parseColorToken('oklch(from oklch(0.5 0.1 20) calc(l + 0.1) c h)', 'light')).toBeNull();
        expect(parseColorToken('oklch(from var(--x) l c h)', 'light')).toBeNull();
    });

    it('follows var() nested inside a value, and returns null for a missing one', () => {
        const tokens = new Map([
            ['--a', 'light-dark(white, var(--b))'],
            ['--b', 'oklch(0.13 0 0)'],
            ['--c', 'oklch(from var(--a) min(l, 0.5) c h)'],
            ['--d', 'var(--missing)'],
        ]);
        expect(resolveColorToken(tokens, '--a', 'dark')!.l).toBeCloseTo(0.13);
        expect(resolveColorToken(tokens, '--c', 'light')!.l).toBeCloseTo(0.5);
        expect(resolveColorToken(tokens, '--d', 'light')).toBeNull();
    });

    it('composites a translucent colour over the ground, as the browser does', () => {
        const white = parseColorToken('white', 'light')!;
        const black = parseColorToken('black', 'light')!;
        const half = compositeOver({ ...white, alpha: 0.5 }, black);
        // 50% white over black in gamma-encoded sRGB is #808080: L≈0.60 in OKLab.
        expect(half.l).toBeCloseTo(0.5999, 2);
        expect(compositeOver(black, white).l).toBeCloseTo(0);
        expect(wcagContrast(half, black)).toBeGreaterThan(5);
    });
});

describe('tokens.css declares the derived text tokens the engine measures', () => {
    for (const [name, value] of Object.entries(derivedTextTokens())) {
        it(name, () => {
            const declared = TOKENS_CSS.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))?.[1].trim();
            expect(declared, `${name} is not declared in tokens.css`).toBeDefined();
            expect(declared).toBe(value);
        });
    }
});

describe('every generated theme keeps coloured and muted text legible', () => {
    const LANGUAGES = getLanguageIds().filter((id) => id !== 'custom') as LanguageId[];
    const BRANDS = ['#6442d6', '#E8590C', '#00A86B', '#ffee00', '#111111'];
    const TEXT_CODES = /^CONTRAST_(MUTED|(PRIMARY|ACCENT|DANGER|SUCCESS|WARNING|INFO)_INK)_/;

    for (const language of LANGUAGES) {
        it(language, () => {
            const found: string[] = [];
            for (const brandColor of BRANDS) {
                const issues = createTheme({ name: 'probe', brandColor, language }).validate();
                for (const i of issues) if (TEXT_CODES.test(i.code)) found.push(`${brandColor} ${i.code}: ${i.message}`);
            }
            expect(found).toEqual([]);
        });
    }

    it('catches a theme that writes text in its fill colour', () => {
        // The control: the pairs are really checked. Writing warning text in the warning fill
        // is a light amber on a light page.
        const tokens = { ...createTheme({ name: 'x', brandColor: '#6442d6', language: 'neutral' as LanguageId }).tokens };
        expect(validateTokenContrast(tokens).map((i) => i.code).filter((c) => c.startsWith('CONTRAST_WARNING_INK'))).toEqual([]);
        tokens['--pdx-color-warning-ink'] = tokens['--pdx-color-warning'];
        const codes = validateTokenContrast(tokens).map((i) => i.code);
        expect(codes).toContain('CONTRAST_WARNING_INK_ON_BG');
        expect(codes).toContain('CONTRAST_WARNING_INK_ON_WARNING_SOFT');
    });

    it('labels the accent fill it paints the info button with', () => {
        // The info button is filled with the ACCENT. A generated theme emits a label for it;
        // without one, the button would take info-text — the label of a different fill.
        const failures: string[] = [];
        for (const language of LANGUAGES) {
            for (const accentColor of [undefined, '#7fffd4', '#1a3c8f']) {
                const t = createTheme({ name: 'p', brandColor: '#6442d6', language, accentColor }).tokens;
                const label = parseColorToken(t['--pdx-color-accent-text'] ?? '', 'light');
                const fill = parseColorToken(t['--pdx-color-accent'] ?? '', 'light');
                if (!label || !fill) { failures.push(`${language}/${accentColor}: no accent label`); continue; }
                const ratio = wcagContrast(label, fill);
                if (ratio < 4.5) failures.push(`${language}/${accentColor}: ${ratio.toFixed(2)}`);
            }
        }
        expect(failures).toEqual([]);
    });

    it('reports an accent label that does not hold on its fill', () => {
        const tokens = { ...createTheme({ name: 'x', brandColor: '#6442d6', language: 'neutral' as LanguageId, accentColor: '#7fffd4' }).tokens };
        expect(validateTokenContrast(tokens).map((i) => i.code)).not.toContain('CONTRAST_ACCENT_LABEL');
        tokens['--pdx-color-accent-text'] = 'white';
        expect(validateTokenContrast(tokens).map((i) => i.code)).toContain('CONTRAST_ACCENT_LABEL');
    });

    it('checks every text hue', () => {
        expect([...TEXT_HUES]).toEqual(['primary', 'accent', 'danger', 'success', 'warning', 'info']);
    });
});

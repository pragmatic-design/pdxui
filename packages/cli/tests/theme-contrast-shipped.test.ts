/**
 * The label on every coloured fill, in every SHIPPED theme, in both schemes.
 *
 * `createTheme().validate()` checks what the engine GENERATES. The 13 files in
 * `packages/design/src/themes/` are hand-written, and without this test nothing measures them.
 *
 * The rule is a white label on every coloured fill; where it does not hold, the FILL is darkened.
 * A white label caps a fill at L≈0.52–0.58, and ten themes sit at 4.51–4.81 — tuned to the edge on
 * purpose. Raising their dark fill by 0.15 ("in dark mode the lightness of the primaries rises")
 * would take white-on-primary to 2.4–3.2:1, which this test fails.
 *
 * It relies on `parseColorToken` reading `white`, which is what four label tokens are written as:
 * a gate that cannot read a token silently skips it.
 *
 * Reading the CSS rather than a browser is deliberate and has one assumption, asserted below: no
 * theme declares tokens in a scheme-specific selector — dark mode is entirely `light-dark()` — so
 * the last declaration of a token in a file is the one that wins, and the scheme is chosen when
 * the value is parsed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseColorToken, wcagContrast, resolveColorToken, compositeOver } from '@pdxui/design/engine';

const DESIGN = join(__dirname, '..', '..', 'design', 'src');
const THEMES = join(DESIGN, 'themes');

/** WCAG AA for normal text. The fills carry button labels, which are normal text. */
const AA = 4.5;

/**
 * The fills that carry a label, with the token that colours that label. Secondary and accent are
 * among them: a secondary button can lighten in dark under a white label (3.25), and the info
 * button — and every `.pdx-info` chip and badge — is filled with the ACCENT, not with
 * `--pdx-color-info`, so a gate without it passes on a pair nothing paints (cyberpunk: 1.88).
 */
const PAIRS: [fill: string, label: string][] = [
    ['--pdx-color-primary', '--pdx-color-primary-text'],
    ['--pdx-color-secondary', '--pdx-color-secondary-text'],
    ['--pdx-color-accent', '--pdx-color-accent-text'],
    ['--pdx-color-danger', '--pdx-color-danger-text'],
    ['--pdx-color-success', '--pdx-color-success-text'],
    ['--pdx-color-info', '--pdx-color-info-text'],
    ['--pdx-color-warning', '--pdx-color-warning-text'],
];

/** Every `--pdx-*` declaration in a file, LAST one winning as the cascade does. */
function declarations(file: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(--pdx-[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
        out.set(m[1], m[2].trim());
    }
    return out;
}

/** Follow `var(--x)` / `var(--x, fallback)` to a literal, then read it as a colour. */
function resolve(tokens: Map<string, string>, name: string, scheme: 'light' | 'dark') {
    let value = tokens.get(name);
    for (let hop = 0; hop < 8 && value; hop++) {
        const ref = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/);
        if (!ref) break;
        value = tokens.get(ref[1]) ?? ref[2]?.trim();
    }
    return value ? parseColorToken(value, scheme) : null;
}

const themeFiles = readdirSync(THEMES).filter(f => f.endsWith('.css'));
const base = declarations(join(DESIGN, 'tokens.css'));

describe('every shipped theme keeps its own label legible on its own fills', () => {
    it('finds the themes and the base tokens', () => {
        // A wrong path would make every assertion below pass by iterating nothing.
        expect(themeFiles.length, 'no theme files found').toBeGreaterThanOrEqual(13);
        expect(base.size, 'tokens.css yielded no declarations').toBeGreaterThan(100);
    });

    it('has no theme that declares tokens per scheme, which is what makes this readable', () => {
        // The whole file-reading approach rests on this. If a theme ever adds a
        // `[pdx-theme=x][pdx-scheme=dark]` block, the last-declaration rule stops being the
        // cascade and this test would quietly measure the wrong values.
        const withSchemeBlocks = themeFiles.filter((f) => {
            // Comments stripped first: `neutral.css` MENTIONS pdx-scheme in prose, and a pattern
            // that spans to the next `{` would match that sentence. A detector that fires on a
            // comment would take this whole file out of service for the wrong reason.
            const css = readFileSync(join(THEMES, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
            // A SELECTOR, not a word: `[pdx-scheme="dark"] { … }`.
            return /\[pdx-scheme[^\]]*\][^{;]*\{/.test(css);
        });
        expect(withSchemeBlocks, 'a theme now varies tokens by scheme — this test must move to the browser')
            .toEqual([]);
    });

    for (const file of themeFiles) {
        const theme = file.replace('.css', '');
        const tokens = new Map([...base, ...declarations(join(THEMES, file))]);

        for (const scheme of ['light', 'dark'] as const) {
            it(`${theme} · ${scheme}`, () => {
                const failures: string[] = [];
                const unreadable: string[] = [];

                for (const [fillTok, labelTok] of PAIRS) {
                    const fill = resolve(tokens, fillTok, scheme);
                    const label = resolve(tokens, labelTok, scheme);
                    if (!fill || !label) {
                        unreadable.push(`${fillTok} / ${labelTok}`);
                        continue;
                    }
                    const ratio = wcagContrast(label, fill);
                    if (ratio < AA) failures.push(`${fillTok}: ${ratio.toFixed(2)}:1`);
                }

                // Reported separately and asserted separately. A pair this cannot read is a pair
                // it did not check, and "did not check" must never read as "passed" — that is
                // exactly the hole the engine's own gate has (`if (!bg || !fg) continue`).
                expect(unreadable, `${theme}/${scheme}: these pairs could not be resolved, so they were not checked`)
                    .toEqual([]);
                expect(failures, `${theme}/${scheme}: label below WCAG AA (${AA}:1)`).toEqual([]);
            });
        }
    }
});

/**
 * Colour as TEXT, not as a fill. The pairs above are a label on a coloured fill. These
 * are the other way round: a feedback colour written on the page — a tinted badge, an outline chip,
 * an error message, a link — and the muted text of every description. Written in the fill colour,
 * they fail in 26 of 26 theme×scheme combinations in Chromium: a fill tuned for a white label is
 * too light for text on the light page and too dark for text on the dark one.
 *
 * Grounds are composited as the browser does: glass's surface and inset are translucent, and a
 * colour read as solid there measures a background nobody sees.
 */
const HUES = ['primary', 'accent', 'danger', 'success', 'warning', 'info'] as const;

describe('every shipped theme keeps its coloured and muted text legible on its own surfaces', () => {
    for (const file of themeFiles) {
        const theme = file.replace('.css', '');
        const tokens = new Map([...base, ...declarations(join(THEMES, file))]);

        for (const scheme of ['light', 'dark'] as const) {
            it(`${theme} · ${scheme}`, () => {
                const unreadable: string[] = [];
                const read = (name: string) => {
                    const c = resolveColorToken(tokens, name, scheme);
                    if (!c) unreadable.push(name);
                    return c;
                };
                const canvas = parseColorToken(scheme === 'light' ? 'white' : 'oklch(0.2 0 0)', scheme)!;
                const bgTok = read('--pdx-color-bg'), surfaceTok = read('--pdx-color-surface'), insetTok = read('--pdx-color-inset');
                expect(unreadable, `${theme}/${scheme}: grounds not resolved`).toEqual([]);
                const bg = compositeOver(bgTok!, canvas);
                const surface = compositeOver(surfaceTok!, bg);
                // Inset sits on the page and inside cards: both are grounds it really has.
                const grounds = {
                    bg, surface,
                    'inset on bg': compositeOver(insetTok!, bg),
                    'inset on surface': compositeOver(insetTok!, surface),
                };

                const failures: string[] = [];
                const measure = (fgName: string, fg: ReturnType<typeof read>, on: Record<string, ReturnType<typeof read>>) => {
                    if (!fg) return;
                    for (const [where, ground] of Object.entries(on)) {
                        const ratio = wcagContrast(fg, ground!);
                        if (ratio < AA) failures.push(`${fgName} on ${where}: ${ratio.toFixed(2)}`);
                    }
                };

                measure('--pdx-color-muted', read('--pdx-color-muted'), grounds);
                for (const hue of HUES) {
                    const ink = read(`--pdx-color-${hue}-ink`);
                    const soft = read(`--pdx-color-${hue}-soft`);
                    measure(`--pdx-color-${hue}-ink`, ink, grounds);
                    // Its own tint: a tonal chip or badge sits on the page or in a card.
                    if (soft) {
                        measure(`--pdx-color-${hue}-ink`, ink, {
                            [`${hue}-soft on bg`]: compositeOver(soft, bg),
                            [`${hue}-soft on surface`]: compositeOver(soft, surface),
                        });
                    }
                }

                expect(unreadable, `${theme}/${scheme}: these tokens could not be resolved, so they were not checked`).toEqual([]);
                expect(failures, `${theme}/${scheme}: text below WCAG AA (${AA}:1)`).toEqual([]);
            });
        }
    }
});

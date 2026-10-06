/**
 * ENGINE ↔ SHIPPED-THEME FIDELITY GUARD.
 *
 * The four "famous" themes stay hand-written on purpose: their value IS exact fidelity to
 * the vendor spec. But `pdx theme --language=material` must still produce a theme that
 * looks like Material 3 — otherwise the archetype ("your brand in the Material style") is
 * a lie. Without a guard the engine drifts silently: an option declared but unread, every
 * semantic pinned to one lightness so `warning` comes out brown, the brand's own lightness
 * discarded.
 *
 * This test feeds the engine each vendor's own brand + accent + neutral hue and asserts the
 * generated tokens stay within a measured distance of the shipped CSS. It is a DRIFT alarm,
 * not a pixel contract: thresholds sit just above the measured deltas, so any
 * regression in the colour math or in a language preset fails here first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTheme } from '@pdxui/design/engine';
import type { LanguageId } from '@pdxui/design/engine';

const THEMES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'src', 'themes');

interface Spec {
    brand: string;
    accent: string;
    neutralHue: number;
    language: LanguageId;
    /** Only for themes whose focus ring is not brand-derived (they declare their own). */
    focus?: string;
    /** Documented, intentional departures from the engine's ramp (see DEVIATIONS). */
    tolerance?: Record<string, { dL?: number; dC?: number; dH?: number }>;
}

/**
 * Where a shipped theme deliberately leaves the engine's semantic ramp. Each entry is a
 * DESIGN choice, not drift — recorded here (with the reason) instead of loosening the
 * global tolerance, which would blind the guard for every other theme.
 */
const DEVIATIONS = {
    // playful drives its semantics at high chroma on purpose — that IS the personality.
    playfulSuccess: { dC: 0.09 },
    playfulWarning: { dC: 0.06 },
    // glass borders are a translucent WHITE luminous edge (oklch(1 0 0 / 0.25)), a
    // different concept from the engine's tinted gray border — not a shifted value.
    glassBorder: { dL: 0.13 },
    // pragmatic pulls warning to hue 55 so it harmonises with the gold accent (75)
    // instead of sitting at the canonical 85.
    pragmaticWarning: { dH: 32 },
} as const;

/** Brand/accent/neutral read off each shipped theme's own token block. OKLCH (not hex) so
 *  wide-gamut blues are not clipped on the way in — hex loses dC 0.05 / dH 13° on those. */
const SPECS: Record<string, Spec> = {
    // Famous (fidelity to the vendor spec is their value)
    material:   { brand: 'oklch(0.50 0.20 280)',  accent: 'oklch(0.60 0.12 155)', neutralHue: 70,  language: 'material' },
    fluent:     { brand: 'oklch(0.52 0.16 215)',  accent: 'oklch(0.60 0.12 175)', neutralHue: 210, language: 'fluent' },
    cupertino:  { brand: 'oklch(0.525 0.18 230)', accent: 'oklch(0.65 0.16 350)', neutralHue: 60,  language: 'cupertino' },
    metro:      { brand: 'oklch(0.505 0.19 207)', accent: 'oklch(0.60 0.14 170)', neutralHue: 0,   language: 'metro' },
    // Archetypes (these must be applicable to ANY brand, so the language has to
    // reproduce its own shipped theme first). Triples extracted from each theme's tokens.
    corporate:  { brand: 'oklch(0.515 0.18 220)', accent: 'oklch(0.65 0.15 200)', neutralHue: 240, language: 'corporate' },
    playful:    { brand: 'oklch(0.575 0.22 290)', accent: 'oklch(0.68 0.20 140)', neutralHue: 290, language: 'playful',
                  tolerance: { '--pdx-color-success': DEVIATIONS.playfulSuccess, '--pdx-color-warning': DEVIATIONS.playfulWarning } },
    // editorial rings in its accent hue (gold), not the brand's — hence the explicit focus.
    editorial:  { brand: 'oklch(0.30 0.08 250)',  accent: 'oklch(0.72 0.12 80)',  neutralHue: 50,  language: 'editorial',
                  focus: 'oklch(0.72 0.14 80)' },
    cyberpunk:  { brand: 'oklch(0.585 0.25 330)', accent: 'oklch(0.75 0.20 190)', neutralHue: 330, language: 'cyberpunk' },
    glass:      { brand: 'oklch(0.53 0.20 240)',  accent: 'oklch(0.72 0.14 195)', neutralHue: 230, language: 'glass',
                  tolerance: { '--pdx-color-border': DEVIATIONS.glassBorder } },
    neumorphic: { brand: 'oklch(0.555 0.10 260)', accent: 'oklch(0.68 0.08 220)', neutralHue: 260, language: 'neumorphic' },
    // Signature + canvas
    pragmatic:  { brand: 'oklch(0.525 0.20 235)', accent: 'oklch(0.78 0.15 75)',  neutralHue: 235, language: 'pragmatic',
                  tolerance: { '--pdx-color-warning': DEVIATIONS.pragmaticWarning } },
    // the canvas keeps a darker, low-chroma ring instead of the canonical 0.60 lightness.
    neutral:    { brand: 'oklch(0.35 0.02 260)',  accent: 'oklch(0.55 0.10 170)', neutralHue: 260, language: 'neutral',
                  focus: 'oklch(0.40 0.04 260)' },
};

/**
 * Tokens from a theme file: the leading `[pdx-theme="x"]` block, PLUS the component-scoped
 * vocabulary tokens declared further down (the table-header set lives inside the
 * `.pdx-table th` rule, so a first-block-only parse would silently skip it — and make the
 * assertions below pass vacuously).
 */
function shippedTokens(theme: string): Record<string, string> {
    const css = readFileSync(join(THEMES, `${theme}.css`), 'utf8');
    const out: Record<string, string> = {};
    const collect = (src: string, only?: RegExp) => {
        for (const m of src.matchAll(/(--pdx-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
            if (only && !only.test(m[1])) continue;
            out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
        }
    };
    const firstBlockEnd = css.indexOf('\n}');
    collect(css.slice(0, firstBlockEnd));
    // Component-scoped vocabulary: declared inside the rule it styles, not the theme block.
    collect(css.slice(firstBlockEnd), /^--pdx-(table-header-|card-(radius|shadow|border-color)|button-hover-)/);
    return out;
}

/**
 * The base defaults every theme inherits when it declares nothing — `tokens.css`.
 * Needed because "the shipped theme does not declare it" is not the same as "anything
 * goes": the theme still RESOLVES to a value, and the engine has to agree with it.
 */
function baseTokens(): Record<string, string> {
    const css = readFileSync(join(THEMES, '..', 'tokens.css'), 'utf8');
    const out: Record<string, string> = {};
    for (const m of css.matchAll(/(--pdx-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        if (!(m[1] in out)) out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
    }
    return out;
}

const baseDefaults = baseTokens();

/**
 * Tokens the engine MAY emit that the shipped themes mostly leave to the base. Exactly the
 * blind spot: the BEHAVIOR list only compares what a theme declares, so anything here would go
 * unchecked even when it changes how every generated theme renders.
 */
const INHERITED = [
    '--pdx-weight-medium', '--pdx-weight-semibold',
    '--pdx-text-xs', '--pdx-text-sm', '--pdx-text-base',
    '--pdx-text-lg', '--pdx-text-xl', '--pdx-text-2xl', '--pdx-text-3xl',
];

/** Light half of a colour token → OKLCH. `white`/`black` are treated as achromatic. */
function oklch(v: string): { l: number; c: number; h: number } | null {
    const light = v.startsWith('light-dark(')
        ? v.slice(11, v.lastIndexOf(')')).split(/,(?![^(]*\))/)[0].trim()
        : v;
    if (light === 'white') return { l: 1, c: 0, h: 0 };
    if (light === 'black') return { l: 0, c: 0, h: 0 };
    const m = light.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)/);
    return m ? { l: +m[1], c: +m[2], h: +m[3] } : null;
}

function hueDelta(a: number, b: number): number {
    const d = Math.abs(a - b);
    return d > 180 ? 360 - d : d;
}

/** Per-token tolerance. `hueOnly` = the engine picks its own L/C (accent), so only hue is a contract. */
const TOLERANCE: Record<string, { dL: number; dC: number; dH: number; hueOnly?: boolean }> = {
    // The brand itself must survive intact — the engine preserves the brand's lightness.
    '--pdx-color-primary': { dL: 0.02, dC: 0.02, dH: 2 },
    // Accent: hue is the contract, but L/C are checked too — leaving them unbounded hides
    // real differences between a generated theme and the shipped one.
    '--pdx-color-accent':  { dL: 0.10, dC: 0.06, dH: 2 },
    // Focus ring: derived by the engine, but it is the most a11y-visible single colour,
    // so it must not drift silently from what a theme ships.
    '--pdx-color-focus':   { dL: 0.10, dC: 0.05, dH: 12 },
    // Semantics: the engine derives L/C from its own ramp, so allow a small band.
    '--pdx-color-danger':  { dL: 0.08, dC: 0.05, dH: 12 },
    '--pdx-color-success': { dL: 0.08, dC: 0.06, dH: 12 },
    '--pdx-color-warning': { dL: 0.08, dC: 0.05, dH: 16 },
    // Neutrals/structure.
    '--pdx-color-bg':      { dL: 0.06, dC: 0.02, dH: 999 },
    '--pdx-color-border':  { dL: 0.10, dC: 0.02, dH: 999 },
};

/**
 * What a theme RESOLVES to for a token: its own declaration, or the base default it inherits.
 *
 * A colour comparison on `shipped[token]` alone, returning early when it is missing, lets 28 of 96
 * assertions (29%) pass without comparing anything — concentrated on
 * --pdx-color-danger/success/warning, which six of the twelve themes leave to the base.
 */
function effective(shipped: Record<string, string>, token: string): string {
    return expandVars(shipped[token] ?? baseDefaults[token] ?? '', shipped);
}

/**
 * Expand `var(--pdx-x)` against the theme's own tokens, falling back to the base.
 *
 * Needed because the base declares the structural colours INDIRECTLY:
 *   --pdx-color-bg:     light-dark(var(--pdx-gray-50),  var(--pdx-gray-950));
 *   --pdx-color-border: light-dark(var(--pdx-gray-200), var(--pdx-gray-700));
 * and every theme redefines its own gray ramp. So a theme that leaves --pdx-color-bg to the base
 * does not inherit the DEFAULT grey — it inherits its OWN, through the base's reference. Reading
 * the literal would give a `var()` the OKLCH parser cannot use, and the comparison would go back to
 * passing on nothing, one indirection further along.
 *
 * Bounded rather than recursive-until-fixed-point: a cycle in the token graph would otherwise hang
 * the suite instead of failing it.
 */
function expandVars(value: string, shipped: Record<string, string>, depth = 0): string {
    if (depth > 5 || !value.includes('var(')) return value;
    const expanded = value.replace(/var\(\s*(--pdx-[a-z0-9-]+)\s*(?:,[^)]*)?\)/g, (whole, name: string) => {
        const v = shipped[name] ?? baseDefaults[name];
        return v ?? whole;
    });
    return expanded === value ? value : expandVars(expanded, shipped, depth + 1);
}

/**
 * The count IS the signal. A comparison with nothing on one side passes silently and reads as
 * deliberate handling, so it is asserted rather than trusted: if a token stops resolving — renamed
 * in tokens.css, dropped from a theme — this fails instead of quietly going green.
 */
describe('the fidelity guard actually compares', () => {
    it('has a value to compare for every theme and every colour token', () => {
        const vacuous: string[] = [];
        for (const theme of Object.keys(SPECS)) {
            const shipped = shippedTokens(theme);
            for (const token of Object.keys(TOLERANCE)) {
                if (!oklch(effective(shipped, token))) vacuous.push(`${theme} ${token}`);
            }
        }
        expect(
            vacuous,
            'these comparisons would pass without comparing anything',
        ).toEqual([]);
    });

    it('is measuring the number of pairs it claims to', () => {
        // 12 themes x 8 colour tokens. A shrunken SPECS or TOLERANCE would make the check above
        // pass by checking less.
        expect(Object.keys(SPECS).length * Object.keys(TOLERANCE).length).toBe(96);
    });
});

/** The two tokens a theme's own density factor multiplies before they reach the screen. */
const DENSITY_SCALED = new Set(['--pdx-button-min-height', '--pdx-input-min-height']);

/**
 * Themes whose controls do NOT render the height their language declares, with the height they
 * render. EMPTY, and that is the point: every shipped theme renders what it states.
 *
 * A theme with its own density factor divides it out in the theme file: corporate's 0.88 would
 * turn a 2.25rem token into 31.7px, fluent and metro would render 28.8 against the 32 of Fluent
 * medium, and cupertino 48.4 — overshooting the HIG's 44pt touch target rather than missing it,
 * which is why that one has to be exact.
 *
 * Kept rather than deleted so a future divergence has a place to be pinned WITH its issue, instead
 * of being absorbed into a tolerance. An entry here is a debt, not a setting: only the theme's own
 * file can change the number, and the entry goes when the theme is fixed.
 */
const DENSITY_DIVERGENCE: Record<string, number> = {};

/**
 * A control height in px as it renders: the token, times the theme's density factor.
 * Accepts `2.25rem` and `calc(2.25rem / 0.88)` — the two forms the themes use.
 */
function renderedPx(value: string | undefined, densityFactor: string | undefined): number {
    const factor = densityFactor ? Number(densityFactor) : 1;
    const raw = (value ?? '').trim();
    const div = /^calc\(\s*([\d.]+)rem\s*\/\s*([\d.]+)\s*\)$/.exec(raw);
    const rem = div ? Number(div[1]) / Number(div[2]) : Number(/^([\d.]+)rem$/.exec(raw)?.[1]);
    if (!Number.isFinite(rem)) throw new Error(`not a control height: ${raw}`);
    return rem * 16 * (Number.isFinite(factor) ? factor : 1);
}

describe('engine ↔ shipped theme fidelity', () => {
    for (const [theme, spec] of Object.entries(SPECS)) {
        describe(theme, () => {
            const shipped = shippedTokens(theme);
            const generated = createTheme({
                name: theme, brandColor: spec.brand, accentColor: spec.accent,
                ...(spec.focus ? { focusColor: spec.focus } : {}),
                neutralHue: spec.neutralHue, language: spec.language,
            });

            // Named for what it checks. It sits under "engine ↔ shipped theme fidelity", where
            // "generates a WCAG-AA clean theme" read as a claim about the CSS that ships — it is
            // not: `generated` is the engine's output for this theme's brand triple, and the
            // shipped .css is never validated here. The shipped themes have their own gate
            // (`pdx theme --strict`, and createTheme().validate() at authoring time).
            it('the theme the ENGINE generates for this brand is WCAG-AA clean', () => {
                expect(generated.validate().filter((i) => i.level === 'error')).toEqual([]);
            });

            for (const [token, base] of Object.entries(TOLERANCE)) {
                // A documented per-theme deviation (DEVIATIONS) widens only that one axis.
                const tol = { ...base, ...(spec.tolerance?.[token] ?? {}) };
                it(`${token} stays within tolerance of the shipped value`, () => {
                    // The EFFECTIVE value, not the declared one. A theme that does not declare
                    // --pdx-color-danger does not have "no value" for it: it resolves to the base
                    // in tokens.css, which is hand-written and is NOT the engine's output. Skipping
                    // those comparisons would conflate "not applicable" with "passes", and leave the
                    // guard blindest exactly where a theme is least specified — six of twelve themes
                    // declare no semantic colours at all.
                    const s = oklch(effective(shipped, token));
                    const g = oklch(generated.tokens[token] ?? '');
                    if (!g) return; // the engine emits nothing → the base applies to both sides
                    expect(s, `no value for ${token}: neither the theme nor tokens.css declares it`).not.toBeNull();
                    expect(hueDelta(s!.h, g.h), 'hue').toBeLessThanOrEqual(tol.dH);
                    if (!tol.hueOnly) {
                        expect(Math.abs(s!.l - g.l), 'lightness').toBeLessThanOrEqual(tol.dL);
                        expect(Math.abs(s!.c - g.c), 'chroma').toBeLessThanOrEqual(tol.dC);
                    }
                });
            }

            // Behavior tokens are the language's whole job: a drifting preset means
            // `--language=X` stops looking like X. These must match EXACTLY.
            const BEHAVIOR = [
                '--pdx-button-radius', '--pdx-button-min-height', '--pdx-input-style',
                '--pdx-input-min-height', '--pdx-tab-indicator', '--pdx-tab-indicator-size',
                '--pdx-card-style', '--pdx-toggle-width', '--pdx-toggle-height',
                // Table-header vocabulary: 11 themes restyle the header, so the language
                // must be able to reproduce it — otherwise `--language=X` has a generic table.
                '--pdx-table-header-transform', '--pdx-table-header-letter-spacing',
                '--pdx-table-header-weight', '--pdx-table-header-size', '--pdx-table-header-color',
                '--pdx-table-header-bg', '--pdx-table-header-font',
                '--pdx-table-header-border-width', '--pdx-table-header-border-color',
                // Card VALUES + premium hover: both are per-theme CSS the engine
                // expresses too.
                '--pdx-card-radius', '--pdx-card-shadow', '--pdx-card-border-color',
                '--pdx-button-hover-shadow', '--pdx-button-hover-transform',
            ];
            for (const token of BEHAVIOR) {
                it(`${token} matches the shipped value exactly`, () => {
                    if (!(token in shipped)) return; // theme relies on the base default
                    if (DENSITY_SCALED.has(token)) {
                        // These two are multiplied by `--pdx-density-factor` when they are used
                        // (buttons.css, inputs.css). A shipped theme may carry its own factor —
                        // corporate's 0.88 turns a 2.25rem token into 31.7px on screen — and a
                        // generated theme never does. So the claim is the RENDERED height, not the
                        // token text: corporate declares `calc(2.25rem / 0.88)` to land on the same
                        // 36px the language means.
                        const rendered = renderedPx(shipped[token], shipped['--pdx-density-factor']);
                        const known = DENSITY_DIVERGENCE[theme];
                        if (known !== undefined) {
                            expect(rendered, `${theme} drifted from its known divergence`).toBeCloseTo(known, 1);
                            return;
                        }
                        expect(rendered,
                            `${token}: the shipped theme renders a different control height than --language does`)
                            .toBeCloseTo(renderedPx(generated.tokens[token], generated.tokens['--pdx-density-factor']), 1);
                        return;
                    }
                    expect(generated.tokens[token]).toBe(shipped[token]);
                });
            }

            // The rule above SKIPS any token the shipped theme does not declare, which is
            // the hole two real divergences slipped through: the engine emitted a static
            // type scale over `tokens.css`'s fluid one (no theme declares `--pdx-text-*`,
            // so nothing compared it — generated buttons rendered at 12.8px against the
            // shipped 15px), and three languages sat a weight step light (neutral, metro
            // and editorial inherit 500/600 and the presets said 400/500).
            //
            // So: WHATEVER the engine emits must equal what the shipped theme resolves to —
            // its own declaration, or the base default it inherits. Emitting nothing is
            // always fine, because then the base applies to both.
            for (const token of INHERITED) {
                it(`${token} does not silently diverge from the base default`, () => {
                    const emitted = generated.tokens[token];
                    if (emitted === undefined) return;   // inherits the base, like the shipped theme
                    expect(emitted).toBe(shipped[token] ?? baseDefaults[token]);
                });
            }
        });
    }
});

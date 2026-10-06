/**
 * The control height each design language brings, and that the theme skill says so.
 *
 * Picking a language also picks a density: a theme generated with a language that sets the control
 * heights to 2rem has 32px inputs, where the base default is 40. An author has to be able to read
 * that, so the skill states it.
 *
 * The rules:
 *   - `corporate` is our own language, bound to no external spec: 36px, inputs and buttons together,
 *     so a row of both stays aligned. Same in the shipped theme, `themes/corporate.css`;
 *   - `fluent` and `metro` stay at 32: they follow Fluent (medium) and Metro, and the "famous" themes
 *     keep their original specs;
 *   - the pdxui-theme skill states, per language, the height it brings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTheme, getLanguageIds } from '@pdxui/design/engine';
import type { LanguageId } from '@pdxui/design/engine';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const THEME_SKILL = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui-theme', 'SKILL.md');

const LANGUAGES = getLanguageIds().filter((id) => id !== 'custom') as LanguageId[];

function heights(language: LanguageId): { input: string; button: string } {
    const tokens = createTheme({ name: 'probe', brandColor: '#3366cc', language }).tokens;
    return { input: tokens['--pdx-input-min-height'], button: tokens['--pdx-button-min-height'] };
}

/** `2.25rem` → 36. The engine speaks rem; a reader thinks in px. */
function px(rem: string): number {
    const match = /^([\d.]+)rem$/.exec(rem);
    if (!match) throw new Error(`not a rem length: ${rem}`);
    return Number(match[1]) * 16;
}

describe('the corporate language', () => {
    it('brings 36px controls, inputs and buttons alike', () => {
        expect(heights('corporate')).toEqual({ input: '2.25rem', button: '2.25rem' });
    });

    // The shipped theme also carries `--pdx-density-factor: 0.88`, and the height is used as
    // `min-height × factor` (buttons.css, inputs.css): a plain 2.25rem would render 31.7px, not 36.
    // It declares the compensated value, so what lands on screen is the 36 the
    // language means. A generated theme has no factor and keeps the plain 2.25rem.
    it('and so does the shipped corporate theme, at its own density', () => {
        expectsRenderedHeight('corporate', 0.88, 36);
    });
});

/**
 * Every shipped theme that carries a density factor renders the height its language STATES, with
 * the number written here rather than derived — so this still fails if the engine's idea of the
 * language ever drifts, which a comparison against a generated theme cannot catch.
 *
 * Uncompensated, fluent and metro would render 28.8 against the 32 of Fluent medium, and
 * cupertino 48.4 against the HIG's 44. Cupertino is the one that has to be exact rather than close:
 * 44px is an accessibility target (WCAG 2.5.8, and the HIG), and overshooting it is still missing it.
 */
describe('a shipped theme renders the height its language states, density and all', () => {
    const COMPENSATED: [theme: string, factor: number, px: number][] = [
        ['corporate', 0.88, 36],
        ['fluent', 0.9, 32],
        ['metro', 0.9, 32],
        ['cupertino', 1.1, 44],
        // Declaring NO control height, these three would render the 2.5rem default scaled by their
        // factor — 34, 48 and 46px, numbers nobody chose. The rule is general rather than judged
        // one theme at a time: the factor governs SPACING, and a theme that wants different
        // controls declares them.
        ['cyberpunk', 0.85, 40],
        ['editorial', 1.2, 40],
        ['neumorphic', 1.15, 40],
    ];

    for (const [theme, factor, px] of COMPENSATED) {
        it(`${theme}: ${px}px on screen, at its own density`, () => {
            expectsRenderedHeight(theme, factor, px);
        });
    }

    /**
     * Themes whose factor is allowed to reach the controls. EMPTY: the rule is that it does not.
     *
     * A theme that declares no control height renders the 2.5rem default scaled — 34, 48 and 46px
     * for cyberpunk, editorial and neumorphic — and the completeness check below catches it. It is
     * a rule rather than per-theme judgements: the factor governs SPACING, and a theme that wants
     * different controls declares them, which makes it a choice instead of a product.
     *
     * Kept so a theme that one day SHOULD scale its controls can say so here, with its reason,
     * instead of doing it by omission.
     */
    const SCALES_CONTROLS: [theme: string, factor: number, px: number][] = [];

    it('names every theme that carries a factor, so none is checked by nobody', () => {
        // A theme that grows a density factor and appears in neither list would be unmeasured.
        const themesDir = join(REPO, 'packages', 'design', 'src', 'themes');
        const withFactor = readdirSync(themesDir)
            .filter(f => f.endsWith('.css'))
            .filter(f => /--pdx-density-factor:\s*(?!1;)[\d.]+;/.test(readFileSync(join(themesDir, f), 'utf-8')))
            .map(f => f.replace(/\.css$/, ''));
        const accounted = [...COMPENSATED, ...SCALES_CONTROLS].map(([t]) => t);
        expect(withFactor.sort(), 'these carry a density factor and no rendered-height check')
            .toEqual(accounted.sort());
    });
});

/** Asserts the theme declares both heights as a density-compensated calc() landing on `px`. */
function expectsRenderedHeight(theme: string, factor: number, px: number): void {
    const css = readFileSync(join(REPO, 'packages', 'design', 'src', 'themes', `${theme}.css`), 'utf-8');
    const declared = Number(/--pdx-density-factor:\s*([\d.]+);/.exec(css)?.[1]);
    expect(declared, `${theme} declares no density factor any more — the compensation is stale`).toBe(factor);

    for (const token of ['--pdx-input-min-height', '--pdx-button-min-height']) {
        const match = new RegExp(`${token}:\\s*calc\\(([\\d.]+)rem\\s*/\\s*([\\d.]+)\\)`).exec(css);
        expect(match, `${theme}: ${token} is not declared as a density-compensated calc()`).not.toBeNull();
        const renderedPx = (Number(match![1]) / Number(match![2])) * 16 * declared;
        expect(renderedPx, `${theme}: ${token} renders ${renderedPx}px, not ${px}`).toBeCloseTo(px, 1);
    }
}

describe('the languages that follow an external spec keep it', () => {
    // Control: the rule raises corporate alone. Fluent medium and Metro are 32px by spec.
    for (const language of ['fluent', 'metro'] as LanguageId[]) {
        it(`${language} stays at 32px`, () => {
            expect(heights(language)).toEqual({ input: '2rem', button: '2rem' });
        });
    }
});

describe('the pdxui-theme skill states the height each language brings', () => {
    const skill = readFileSync(THEME_SKILL, 'utf-8').replace(/\r\n/g, '\n');

    for (const language of LANGUAGES) {
        it(`${language}: the skill says what the engine emits`, () => {
            // One row per language in the control-height table: `| \`id\` | 40px |`, or
            // `| \`id\` | 56px / 40px |` when inputs and buttons differ (input first).
            const row = new RegExp(`^\\|\\s*\`${language}\`\\s*\\|\\s*(\\d+)px(?:\\s*/\\s*(\\d+)px)?\\s*\\|`, 'm').exec(skill);
            expect(row, `no control-height row for \`${language}\` in pdxui-theme/SKILL.md`).not.toBeNull();
            const { input, button } = heights(language);
            const stated = { input: Number(row![1]), button: Number(row![2] ?? row![1]) };
            expect(stated, `the skill's height for ${language} drifted from the engine`).toEqual({ input: px(input), button: px(button) });
        });
    }

    it('and names every shipped theme that scales it with its own density factor', () => {
        // The rendered height is the token × --pdx-density-factor. A generated theme leaves the factor
        // at 1; a shipped one may not, and then the table alone would mislead.
        const themesDir = join(REPO, 'packages', 'design', 'src', 'themes');
        const shipped = LANGUAGES
            .filter((id) => existsSync(join(themesDir, `${id}.css`)))   // a language may have no shipped theme
            .map((id) => {
                const css = readFileSync(join(themesDir, `${id}.css`), 'utf-8');
                const factor = /--pdx-density-factor:\s*([\d.]+);/.exec(css)?.[1];
                return factor && Number(factor) !== 1 ? { id, factor } : null;
            })
            .filter((t): t is { id: LanguageId; factor: string } => t !== null);
        expect(shipped.length, 'control: some shipped theme sets a factor').toBeGreaterThan(0);
        for (const { id, factor } of shipped) {
            expect(skill, `pdxui-theme/SKILL.md does not say that the shipped ${id} scales by ${factor}`)
                .toMatch(new RegExp(`\`${id}\` ${factor.replace('.', '\\.')}\\b`));
        }
    });

    it('and does not still say the factor reaches the control heights', () => {
        // Naming the factors is not enough. A skill can list all seven and then draw the wrong
        // conclusion from them — "the shipped `corporate` renders 36 × 0.88 ≈ 32px", false for a
        // compensated theme — and a test that only checks that the numbers appear somewhere passes.
        //
        // An agent reads this file to answer "how tall is a button in cupertino". A list of
        // factors with a wrong worked example is worse than no example.
        expect(skill, 'the skill still multiplies a control height by a density factor')
            .not.toMatch(/renders\s+\d+(\.\d+)?\s*×\s*\d*\.\d+/);
        expect(skill, 'the skill does not say that a shipped theme divides its factor back out')
            .toMatch(/divides that factor back out/);
    });
});

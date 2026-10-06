/**
 * scoreTheme — the theme oracle.
 *
 * Combines the engine's TOKEN-level WCAG gate (`GeneratedTheme.validate()` — the
 * theme's declared color pairs, static, no DOM) with the r$ RENDERED oracle
 * (`@responsivejs/design/browser · analyzeDOM` — geometry constraints + on-page
 * WCAG contrast + aesthetic score + fixes, measured on the live gallery).
 *
 * Browser-only: `analyzeDOM` measures the live DOM. Call AFTER the theme is
 * applied and a representative component gallery is in the page. The pure merge
 * (`combineThemeScore`) is node-testable.
 */

import type { GeneratedTheme, ThemeInput, ThemeIssue } from './types.js';
import { generateTheme } from './generate.js';
import { analyzeDOM, type UnifiedReport, type AnalyzeStoreOptions } from '@responsivejs/design/browser';

export interface ThemeScore {
    /** Token-level WCAG gate (engine): the theme's declared color pairs, light + dark. */
    wcag: ThemeIssue[];
    /** Rendered oracle (r$): geometry + on-page contrast + aesthetic, over the gallery. */
    rendered: UnifiedReport;
    /** true = no error-level WCAG token issue AND the rendered report passes. */
    pass: boolean;
    /** Aesthetic overall (0..1); undefined when scoring is disabled. */
    aesthetic?: number;
}

export interface ScoreThemeOptions {
    /** Gallery selectors to measure. Default: r$'s landmark selectors. */
    selectors?: string[];
    /** Passed through to the r$ oracle (constraints, score scope, design-system…). */
    analyze?: AnalyzeStoreOptions;
}

function isGenerated(t: GeneratedTheme | ThemeInput): t is GeneratedTheme {
    return typeof (t as GeneratedTheme).validate === 'function';
}

/** Pure merge of the two verdicts. Node-testable (no DOM). */
export function combineThemeScore(wcag: ThemeIssue[], rendered: UnifiedReport): ThemeScore {
    const wcagPass = !wcag.some((i) => i.level === 'error');
    return {
        wcag,
        rendered,
        pass: wcagPass && rendered.pass,
        aesthetic: rendered.scores?.average.overall,
    };
}

/**
 * Score a theme rendered live in the page. Accepts a `ThemeInput` (generates it)
 * or an already-`GeneratedTheme`. Browser-only.
 */
export function scoreTheme(theme: GeneratedTheme | ThemeInput, opts: ScoreThemeOptions = {}): ThemeScore {
    const gen = isGenerated(theme) ? theme : generateTheme(theme);
    return combineThemeScore(gen.validate(), analyzeDOM(opts.selectors, opts.analyze));
}

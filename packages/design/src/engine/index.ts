/**
 * @pdxui/design Theme Engine
 *
 * Math-based theme generation from minimal input parameters.
 * Zero dependencies, deterministic output.
 *
 * @example
 * ```ts
 * import { createTheme } from '@pdxui/design/engine';
 *
 * const theme = createTheme({
 *     name: 'my-brand',
 *     brandColor: '#ff6b00',
 *     language: 'material',
 * });
 *
 * // Apply to document (sets CSS vars + behavior attributes)
 * theme.apply();
 *
 * // Or export as CSS
 * console.log(theme.toCSS());
 *
 * // Validate
 * const issues = theme.validate();
 * ```
 */

export type { ThemeInput, GeneratedTheme, ThemeIssue, DesignLanguage, LanguageId, BehaviorTokens } from './types.js';
export { generateTheme as createTheme, validateTokenContrast } from './generate.js';
export { getLanguage, getLanguageIds } from './languages.js';
// `wcagContrast` and `parseColorToken` are exported so a CONSUMER can show the same number the
// gate computes. A page that prints a contrast ratio it derived some other way is a second
// implementation of the rule, and the two would drift.
export { hexToOklch, oklchToHex, deltaE, wcagContrast, parseColorToken, resolveColorToken, compositeOver } from './color.js';
export { TEXT_HUES, derivedTextTokens } from './text-colors.js';
export type { OKLCH } from './types.js';
export { toDTCG, fromDTCG, toDTCGJson, inferDTCGType } from './dtcg.js';
export type { DTCGToken, DTCGGroup } from './dtcg.js';
export { THEME_CONTRACT, THEME_INHERITED, inheritedFromBase } from './theme-contract.js';
export { scoreTheme, combineThemeScore } from './score-theme.js';
export type { ThemeScore, ScoreThemeOptions } from './score-theme.js';

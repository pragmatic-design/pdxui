// `navigation` from `@pdxui/router`, auto-imported in a .pdx that reads it (#149).
//
// The router's navigation state — `@if (navigation.pending()) { <progress bar> }` — is read by an
// app shell that declares no route of its own, so no declaration implies it the way `@loader`
// implies `loaderSource`: the READ is what asks for it. And the name is also a browser global,
// the Navigation API's `window.navigation`, so an unimported read would reach the wrong object.

import type { TemplateNode } from '../parser/template';
import type { ScriptAnalysis } from './script-analyzer';
import { collectTemplateIdentifiers } from './validate';
import { declaredNames } from './validate-refs';
import { maskNonCode } from './tokenizer';

/** Whether `navigation` is the router's here: the component neither declares nor imports the name. */
export function navigationIsRouter(analysis: ScriptAnalysis): boolean {
    return !declaredNames(analysis).has('navigation');
}

/**
 * The template reads `navigation` in an expression — prose that mentions the word does not. The walk
 * runs only when the word is in the template at all, so a component that never names it pays nothing.
 */
export function templateReadsNavigation(ast: TemplateNode[], templateSource: string): boolean {
    return templateSource.includes('navigation') && collectTemplateIdentifiers(ast).has('navigation');
}

/** The generated setup reads `navigation` as a free name — not `x.navigation`, not in a string. */
export function setupReadsNavigation(setupCode: string): boolean {
    // Match: `navigation` standing alone — no member access before it, no longer name around it.
    return /(?<![\w$.])navigation(?![\w$])/.test(maskNonCode(setupCode));
}

// Code Generator — orchestrates SFC compilation into JavaScript modules.
// Detects the compilation mode and delegates:
//   codegen-new.ts      — new mode (@prop + $signal) and @store mode
//   codegen-legacy.ts   — legacy mode (defineProps + return)
//   codegen-shared.ts   — module assembly, tag derivation, production optimizations
// Lower-level helpers:
//   codegen-setup.ts    — setup() body generation
//   codegen-template.ts — AST → html`` template code
//   codegen-styles.ts   — CSS scoping and injection

import type { TemplateNode } from '../parser/template';
import type { SFCDescriptor } from '../parser/sfc';
import { analyzeScript } from './script-analyzer';
import type { PluginRunner } from '../plugin-system';
import { createCompileContext } from './compile-context';
import { compileNewMode, compileStoreMode } from './codegen-new';
import { compileLegacyMode } from './codegen-legacy';
import { eraseTypes } from './erase-types';

// Re-exported for external callers (e.g. plugin-utils imports deriveTag from here).
export { extractTag, deriveTag } from './codegen-shared';

// ─── Public API ────────────────────────────────────────────────────

/**
 * Compile a parsed SFC into a JavaScript module string.
 * Detects mode from script content:
 * - **new mode**: @prop / $signal decorators+runes → auto-expose, auto-import
 * - **legacy mode**: defineProps / explicit return → backward compatible
 *
 * @param runner - Optional PluginRunner for compiler plugin hooks
 */
export function compileSFC(
    descriptor: SFCDescriptor,
    ast: TemplateNode[],
    filename: string,
    runner?: PluginRunner | null,
    options?: {
        production?: boolean;
        inlineBindings?: boolean;
        scriptOnly?: boolean;
        /**
         * Sink for diagnostics raised during CODE GENERATION, which validate() never runs and so
         * never sees. The caller owns the array and reads it after this returns — the return type
         * stays `string`, and no module-level collector is reintroduced.
         */
        warnings?: import('./validate').ValidationWarning[];
        /** Declared props of known components, so bound names reach them. */
        propsOf?: import('./compile-context').PropsLookup;
        /** Where a `<pdx-…>` tag's module lives — `@defer` imports what it renders. */
        importPathOf?: (tag: string) => string | null;
        /** The caller reads origin marks into a source map and removes them. */
        mapOrigins?: boolean;
        /** Where the template content starts in the .pdx, to mark the template's code. */
        templateOrigin?: number | null;
        /** The .pdx relative to the app root, for `component()`'s `file` — dev builds. */
        sourceFile?: string | null;
    },
    precomputedAnalysis?: ReturnType<typeof analyzeScript> | null,
): string {
    const production = options?.production ?? false;
    // Default ON, the same default the plugin applies: a caller that compiles
    // for production without saying anything gets what a production build gets.
    const inlineBindings = options?.inlineBindings ?? true;

    // Build per-invocation compile context — replaces all module-level mutable state
    let customDirectiveHandlers: Map<string, import('../plugin-system').TemplateDirectiveHandler> | undefined;
    const customDirectives = new Set<string>();
    if (runner) {
        const directives = runner.getTemplateDirectives();
        if (directives.size > 0) {
            customDirectiveHandlers = directives;
            for (const name of directives.keys()) customDirectives.add(name);
        }
    }
    const ctx = createCompileContext({ production, customDirectiveHandlers, customDirectives, warnings: options?.warnings, propsOf: options?.propsOf, importPathOf: options?.importPathOf, mapOrigins: options?.mapOrigins, templateOrigin: options?.templateOrigin, sourceFile: production ? null : options?.sourceFile });

    if (descriptor.script) {
        // Reuse pre-computed analysis from compile() validation pass if available
        const analysis = precomputedAnalysis ?? analyzeScript(descriptor.script.content, filename, { setup: descriptor.script.setup });

        // Run plugin analyzeScript hooks
        if (runner) runner.runAnalyzeScript(analysis);

        // The script is TypeScript unless it says otherwise: its types are erased from the module the
        // runes were lowered into, positions kept. A `lang="js"` script is left as written.
        const erase = (code: string) => descriptor.script!.lang === 'js' ? code : eraseTypes(code, filename);
        if (analysis.mode === 'new') {
            // @store rune: compile as store module (not component)
            if (analysis.globalStore) {
                return erase(compileStoreMode(descriptor, filename, analysis, runner));
            }
            return erase(compileNewMode(descriptor, ast, filename, analysis, runner, ctx, inlineBindings, options?.scriptOnly));
        }
        return erase(compileLegacyMode(descriptor, ast, filename, runner, ctx));
    }
    return compileLegacyMode(descriptor, ast, filename, runner, ctx);
}

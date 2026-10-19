// Code Generator — orchestrates SFC compilation into JavaScript modules.
// One script grammar (#158), so one code generator:
//   codegen-new.ts      — a component (@prop + $signal), and the @store module
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
import { eraseTypes } from './erase-types';
import { insertModuleHoists } from './codegen-shared';
import { styleBlocks, hash } from './codegen-styles';
import { markSlotted } from './slotted-marks';

// Re-exported for external callers (e.g. plugin-utils imports deriveTag from here).
export { extractTag, deriveTag } from './codegen-shared';

// ─── Public API ────────────────────────────────────────────────────

/**
 * Compile a parsed SFC into a JavaScript module string.
 * A file without a script is compiled as one with an empty script: there is one code generator.
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
        scriptOnly?: boolean;
        /**
         * Sink for diagnostics raised during CODE GENERATION, which validate() never runs and so
         * never sees. The caller owns the array and reads it after this returns — the return type
         * stays `string`, and no module-level collector is reintroduced.
         */
        warnings?: import('./validate').ValidationWarning[];
        /** Declared props of known components, so bound names reach them. */
        propsOf?: import('./compile-context').PropsLookup;
        /** The event of a component's first model, for the form binding (#478). */
        modelEventOf?: import('./compile-context').ModelEventLookup;
        /** Where a `<pdx-…>` tag's module lives — `@defer` imports what it renders. */
        importPathOf?: (tag: string) => string | null;
        /** The caller reads origin marks into a source map and removes them. */
        mapOrigins?: boolean;
        /** Where the template content starts in the .pdx, to mark the template's code. */
        templateOrigin?: number | null;
        /** The .pdx relative to the app root, for `component()`'s `file` — dev builds. */
        sourceFile?: string | null;
        /** A block's static markup as HTML where the parser keeps it (#369); default true. */
        staticMarkup?: boolean;
        /** The browser target the output relies on (#121); default 'baseline-2026'. */
        target?: import('./compile-context').BrowserTarget;
        /** The app's component tag prefix (#136); default 'app'. */
        tagPrefix?: string;
    },
    precomputedAnalysis?: ReturnType<typeof analyzeScript> | null,
): string {
    const production = options?.production ?? false;

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
    const ctx = createCompileContext({ production, customDirectiveHandlers, customDirectives, warnings: options?.warnings, propsOf: options?.propsOf, modelEventOf: options?.modelEventOf, importPathOf: options?.importPathOf, mapOrigins: options?.mapOrigins, templateOrigin: options?.templateOrigin, sourceFile: production ? null : options?.sourceFile, staticMarkup: options?.staticMarkup, target: options?.target, tagPrefix: options?.tagPrefix });

    // A scoped block under baseline-2026 stops at nested components (#152): what the template writes
    // inside a child's tag is marked as this component's, so the donut scope still reaches it.
    if (ctx.target !== 'baseline-2024' && !descriptor.template?.shadow && styleBlocks(descriptor).some((b) => b.scoped)) {
        ast = markSlotted(ast, `data-pdx-${hash(filename)}-in`);
    }

    // A file without a script compiles as one with an empty `<script>` (#158): one code generator.
    const withScript: SFCDescriptor = descriptor.script ? descriptor
        : { ...descriptor, script: { content: '', start: 0, end: 0, src: null, setup: false, lang: 'ts' } };
    const script = withScript.script!;
    // Reuse pre-computed analysis from compile() validation pass if available
    const analysis = precomputedAnalysis ?? analyzeScript(script.content, filename);

    // Run plugin analyzeScript hooks
    if (runner) runner.runAnalyzeScript(analysis);

    // The script is TypeScript unless it says otherwise: its types are erased from the module the
    // runes were lowered into, positions kept. A `lang="js"` script is left as written.
    const erase = (code: string) => script.lang === 'js' ? code : eraseTypes(code, filename);
    // @store rune: compile as store module (not component)
    if (analysis.globalStore) {
        return erase(compileStoreMode(withScript, filename, analysis, runner));
    }
    // The render's block declarations go in after the erasure: generated, with no types (#109).
    return insertModuleHoists(erase(compileNewMode(withScript, ast, filename, analysis, runner, ctx, options?.scriptOnly)), ctx.moduleHoists);
}

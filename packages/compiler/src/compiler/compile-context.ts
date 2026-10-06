// CompileContext — per-invocation state for a single .pdx compilation.
// Replaces all module-level mutable state in codegen-prefix, codegen-template, parser/template.
// Every function in the codegen pipeline receives this context instead of relying on globals.

import type { TemplateDirectiveHandler } from '../plugin-system';
import type { ValidationWarning } from './validate';

export interface CompileContext {
    /** Production mode flag — enables constant folding, loop invariant hoisting, dead code elimination. */
    readonly production: boolean;

    /** Scope variable stack — tracks @for loop vars, @try catch vars. Not prefixed with ctx. */
    readonly scopeVars: Set<string>;

    /**
     * The @for item/index names that are row GETTERS (eachRow): a reference compiles to `name()`,
     * so a row reused for the same key reads its current item. A subset of scopeVars.
     */
    readonly rowVars: Set<string>;

    /** Names that are NOT signals — form refs, resources, functions. callSignals() skips adding (). */
    nonSignalNames: Set<string> | null;

    /** Names declared in the setup (signal/derived/prop/export): a declared name that
     *  collides with a common loop variable (item, error, e…) is prefixed all the same. */
    declaredNames: Set<string> | null;

    /**
     * Names the script IMPORTS: module-scope bindings the template reaches as they are, without
     * `ctx.`. A name the component also declares is its own and keeps the prefix.
     */
    importedNames: Set<string> | null;

    /** Hoisted slot functions — generated as variables before the html`` template.
     * Each entry: [varName, code]. Emitted by codegen before the render return. */
    hoistedSlots: [string, string][];

    /** Plugin-provided custom directive handlers. Keyed by directive name. */
    customDirectiveHandlers: Map<string, TemplateDirectiveHandler> | null;

    /** Registered custom directive names — parser uses this to recognize @custom directives. */
    readonly customDirectives: Set<string>;

    /**
     * Diagnostics raised during CODE GENERATION, which `validate()` never sees.
     *
     * validate() runs before codegen and is what the LSP and `pdx check` call, so anything the
     * generator discovers would have nowhere to go but console.warn — PDX_REWRITE_FALLBACK in
     * particular, which reports a rewrite that was skipped and therefore generated code that reads a
     * signal without calling it.
     *
     * It lives on the context rather than in a module-level collector on purpose: this file exists
     * to remove module-level mutable state from the codegen, and one diagnostic is not a reason to
     * put it back. The caller owns the array and reads it after compileSFC returns.
     */
    readonly warnings: ValidationWarning[];

    /**
     * The props a binding can set on a known component, by declared name, or null for a tag the
     * caller knows nothing about. Absent in a compile without a component registry: bound names are
     * then emitted as written.
     */
    readonly propsOf: PropsLookup | null;

    /** Where a `<pdx-…>` tag's module lives — used by `@defer` to import what it renders. */
    readonly importPathOf: ((tag: string) => string | null) | null;

    /**
     * The caller builds a source map from origin marks and removes them (`compile()` does): the
     * module frame marks its lines too. Off for every other caller, whose output is the
     * module as it is.
     */
    readonly mapOrigins: boolean;

    /**
     * Where the template's content starts in the .pdx, when the template's code is marked too;
     * null when it is not — no map, a minified template, one read from another file.
     */
    readonly templateOrigin: number | null;

    /**
     * The .pdx as the app knows it (relative to the Vite root), emitted as `component()`'s `file` so
     * a runtime error names it. Development builds only; null otherwise.
     */
    readonly sourceFile: string | null;
}

/** tag → the props a binding can set on it, or null when the tag is unknown. */
export type PropsLookup = (tag: string) => ReadonlySet<string> | null | undefined;

/** Create a fresh CompileContext for a single compilation. */
export function createCompileContext(options?: {
    production?: boolean;
    customDirectiveHandlers?: Map<string, TemplateDirectiveHandler>;
    customDirectives?: Set<string>;
    /** Sink the caller owns; codegen diagnostics are appended to it. A fresh array if omitted. */
    warnings?: ValidationWarning[];
    propsOf?: PropsLookup;
    importPathOf?: (tag: string) => string | null;
    mapOrigins?: boolean;
    templateOrigin?: number | null;
    sourceFile?: string | null;
}): CompileContext {
    return {
        production: options?.production ?? false,
        scopeVars: new Set(),
        rowVars: new Set(),
        nonSignalNames: null,
        declaredNames: null,
        importedNames: null,
        hoistedSlots: [],
        customDirectiveHandlers: options?.customDirectiveHandlers ?? null,
        customDirectives: options?.customDirectives ?? new Set(),
        warnings: options?.warnings ?? [],
        propsOf: options?.propsOf ?? null,
        importPathOf: options?.importPathOf ?? null,
        mapOrigins: options?.mapOrigins ?? false,
        templateOrigin: options?.templateOrigin ?? null,
        sourceFile: options?.sourceFile ?? null,
    };
}

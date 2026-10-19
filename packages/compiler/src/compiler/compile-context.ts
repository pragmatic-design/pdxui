// CompileContext — per-invocation state for a single .pdx compilation.
// Replaces all module-level mutable state in codegen-prefix, codegen-template, parser/template.
// Every function in the codegen pipeline receives this context instead of relying on globals.

import type { TemplateDirectiveHandler } from '../plugin-system';
import type { ValidationWarning } from './validate';
import { DEFAULT_TAG_PREFIX } from './tag-prefix';

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

    /**
     * The track expressions of the `@for` loops around the code being generated, whitespace removed: a
     * binding that is exactly one of them cannot change in its row (#110). See codegen-constant-bindings.
     */
    readonly rowKeys: string[];

    /** The script's top-level `const`s whose value is literals only: constant in the template (#110). */
    literalConsts: Set<string>;

    /** The event types this component delegates to one listener each (#113; inline-event-delegation). */
    delegatedEvents: Set<string>;

    /**
     * Inside a @for: the declarations of its rows' delegated handlers, written once before the
     * outermost @for instead of once per row (#375). Null outside every @for.
     */
    rowHandlers: string[] | null;

    /** The parts the script declares with `@part` (#134): a literal `data-part` naming one binds it as a ref. */
    parts: Set<string>;

    /** The signals a keyed selector is declared for at the top of the render (#117; inline-keyed-selector). */
    readonly selectors: Set<string>;

    /** Names that are NOT signals — form refs, resources, functions. callSignals() skips adding (). */
    nonSignalNames: Set<string> | null;

    /**
     * The names declared with `$signal` — state, not deriveds or props. Such a name in callee position
     * is read, then called (`ctx.x()(args)`), and its `peek`/`setRaw` reach the signal itself (#187).
     */
    stateSignalNames: Set<string> | null;

    /** Names declared in the setup (signal/derived/prop/export): a declared name that
     *  collides with a common loop variable (item, error, e…) is prefixed all the same. */
    declaredNames: Set<string> | null;

    /**
     * Names the script IMPORTS: module-scope bindings the template reaches as they are, without
     * `ctx.`. A name the component also declares is its own and keeps the prefix.
     */
    importedNames: Set<string> | null;

    /**
     * Module-level declarations of the inline render, one per line: each block's static markup builder
     * and its walk (#109). Generated code with no TypeScript in it, so `compileSFC` puts them into the
     * module after the script's types are erased — not through a TypeScript parse of their own.
     */
    readonly moduleHoists: string[];

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

    /**
     * The event of a component's first model (#478): a form control that lists models is bound to it.
     * Null in a compile without a component registry: the form binding keeps its hand-written events.
     */
    readonly modelEventOf: ModelEventLookup | null;

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

    /**
     * Write a block's static markup as HTML where the parser keeps it exactly (#369). On by default;
     * off keeps one DOM call per node — what the test that proves the two equal compares it with.
     */
    readonly staticMarkup: boolean;

    /**
     * The browser target the output relies on, `pdx({ target })` (#121): which platform features a
     * code generator may emit. `'baseline-2026'` unless the app says otherwise.
     */
    readonly target: BrowserTarget;
    /** The app's component tag prefix, `pdx({ prefix })` (#136): `app` unless the app says otherwise. */
    readonly tagPrefix: string;
}

/**
 * What the compiled output may rely on in the browser (`docs/language/beta/file.md` → «Browser
 * targets»). `'baseline-2024'` emits today's mechanisms where the beta's output needs a 2026 feature;
 * it is maintained frozen and retired when `@scope` is Baseline widely available.
 */
export type BrowserTarget = 'baseline-2026' | 'baseline-2024';

/** tag → the props a binding can set on it, or null when the tag is unknown. */
export type PropsLookup = (tag: string) => ReadonlySet<string> | null | undefined;

/** tag → its first model and that model's event (`checked`, `checked-change`), or null when it lists none. */
export type ModelEventLookup = (tag: string) => { model: string; event: string } | null;

/** Create a fresh CompileContext for a single compilation. */
export function createCompileContext(options?: {
    production?: boolean;
    customDirectiveHandlers?: Map<string, TemplateDirectiveHandler>;
    customDirectives?: Set<string>;
    /** Sink the caller owns; codegen diagnostics are appended to it. A fresh array if omitted. */
    warnings?: ValidationWarning[];
    propsOf?: PropsLookup;
    modelEventOf?: ModelEventLookup;
    importPathOf?: (tag: string) => string | null;
    mapOrigins?: boolean;
    templateOrigin?: number | null;
    sourceFile?: string | null;
    staticMarkup?: boolean;
    target?: BrowserTarget;
    tagPrefix?: string;
}): CompileContext {
    return {
        production: options?.production ?? false,
        scopeVars: new Set(),
        rowVars: new Set(),
        rowKeys: [],
        literalConsts: new Set(),
        delegatedEvents: new Set(),
        rowHandlers: null,
        parts: new Set(),
        selectors: new Set(),
        nonSignalNames: null,
        stateSignalNames: null,
        declaredNames: null,
        importedNames: null,
        moduleHoists: [],
        hoistedSlots: [],
        customDirectiveHandlers: options?.customDirectiveHandlers ?? null,
        customDirectives: options?.customDirectives ?? new Set(),
        warnings: options?.warnings ?? [],
        propsOf: options?.propsOf ?? null,
        modelEventOf: options?.modelEventOf ?? null,
        importPathOf: options?.importPathOf ?? null,
        mapOrigins: options?.mapOrigins ?? false,
        templateOrigin: options?.templateOrigin ?? null,
        sourceFile: options?.sourceFile ?? null,
        staticMarkup: options?.staticMarkup ?? true,
        target: options?.target ?? 'baseline-2026',
        tagPrefix: options?.tagPrefix ?? DEFAULT_TAG_PREFIX,
    };
}

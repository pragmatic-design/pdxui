// Script Analyzer — Type definitions for script analysis results.
// Extracted from script-analyzer.ts for modularity.

import type { ValidationWarning } from './validate';
import type { VariantAxis } from './variants';

// ─── Types ─────────────────────────────────────────────────────────

export interface PropInfo {
    name: string;
    tsType: string;       // 'string', 'number', 'boolean', 'Item[]', etc.
    runtimeType: string;  // 'String', 'Number', 'Boolean', 'Array', 'Object'
    default?: string;     // default value expression as string
    /** `@model` (#124): a prop the component may write, which dispatches `<name>-change`. */
    model?: true;
    /** `@prop name: T;` with no default and no `?` (#130): a parent must set it. */
    required?: true;
}

export interface EventInfo {
    name: string;
    payloadType: string;  // '{ value: number }', 'void', etc.
    /** `@event(bubbles) name`: the event bubbles and is composed; absent, it stays on the host (#138). */
    bubbles?: true;
}

/** `@state name = expression;` — a visual state of the host, a custom state (#132). */
export interface StateDecl {
    name: string;
    /** The boolean expression, as written. */
    expr: string;
}

/**
 * One attribute of `@host { … }` (#133), as written: `role` (static), `:aria-expanded` (bound),
 * `@keydown.enter` (a listener). `value` is absent for a bare attribute (`hidden`).
 */
export interface HostAttr {
    name: string;
    value?: string;
}

export interface SlotInfo {
    name: string;
    /** Scope type for scoped slots: '{ row: Item, column: string }' or undefined. */
    scopeType?: string;
    /** A typed snippet's signature as written, `(item: T, index: number)` (#489). */
    signature?: string;
    /** A typed snippet the parent must provide: declared without `?` (#489). */
    required?: boolean;
}

/**
 * A script `@snippet name(params) { … }` whose body is a template (#489, decision 9): compiled like
 * the component's template, and rendered with `@render name(args)`.
 */
export interface ScriptSnippet {
    name: string;
    /** The parameters' names, without their types. */
    params: string[];
    /** The body as written, between the braces. */
    body: string;
    /** The 0-based line of the script the declaration starts on. */
    line: number;
}

export interface SignalDecl {
    name: string;
    initialExpr: string;
    /** Where the declaration was written in the .pdx, when a source map was asked for. */
    origin?: number;
}

export interface DerivedDecl {
    name: string;
    expr: string;
    /** Where the declaration was written in the .pdx, when a source map was asked for. */
    origin?: number;
}

export interface ExportDecl {
    name: string;
    kind: 'signal' | 'derived' | 'function' | 'const' | 'let';
}

export interface StoreDecl {
    name: string;
    initialExpr: string;
    /** The keyword that declared it: a `let` store may be assigned again (#202). */
    keyword?: 'let' | 'const' | 'var';
    /** Where the declaration was written in the .pdx, when a source map was asked for. */
    origin?: number;
}

/** Global store directive from @store rune.
 *  @store cart; or @store cart { persist: 'local' }; */
export interface GlobalStoreDirective {
    name: string;
    persist?: 'local' | 'session';
}

/** Head info from @title/@meta runes. */
export interface HeadInfo {
    title?: { value: string; isDynamic: boolean };
    meta: { name?: string; property?: string; content: string }[];
}

export interface WatchDecl {
    source: string;
    callback: string;
    options?: string;
}

/** Declarative provide from @provide rune. */
export interface ProvideDecl {
    /** The context token the value is provided under, an identifier the script imports (#496). */
    token: string;
    /** The value expression: `theme`, `authService`. */
    expr: string;
}

/** Declarative inject from @inject rune: `@inject name from Token = fallback;` (#496). */
export interface InjectDecl {
    /** The local name the value is read under. */
    name: string;
    /** The context token, an identifier the script imports. */
    token: string;
    /** The value when nothing provides the token, as written; absent: inject throws instead. */
    fallback?: string;
}

/** Data fetch declaration from @fetch rune. */
export interface FetchDecl {
    /** Variable name: 'users', 'user'. */
    name: string;
    /** HTTP method: 'GET', 'POST', etc. */
    method: string;
    /** URL path (may contain ${} template interpolations). */
    url: string;
    /** TypeScript type annotation: 'User[]', 'User'. */
    type?: string;
    /** Inline options block: '{ staleTime: 60000, tags: ["users"] }'. */
    options?: string;
    /** Whether URL contains reactive ${} interpolations. */
    hasReactiveParams: boolean;
}

/** Form field declaration from inline @form schema. */
export interface FormFieldDecl {
    name: string;
    type: string;           // 'string', 'number', 'boolean'
    required: boolean;
    isArray: boolean;        // true if field is [{ ... }] array
    rules: string[];         // ['minLength: 3', 'email', 'pattern: /.../'']
    arrayFields?: FormFieldDecl[];  // sub-fields for array items
    /**
     * Sub-fields of a nested OBJECT — `address: { street: string, city: string }`.
     *
     * Separate from `arrayFields` because the two produce different code: an array starts empty
     * and its rows are registered as they are added, an object's fields exist from the first
     * render and become the dotted paths `address.street`, `address.city`.
     */
    objectFields?: FormFieldDecl[];
}

/** Form declaration from @form rune. */
export interface FormDecl {
    /** Variable name: 'user', 'contact'. */
    name: string;
    /** 'inline' = schema declared in @form, 'external' = imported schema ref. */
    kind: 'inline' | 'external';
    /** For inline: parsed field declarations. */
    fields?: FormFieldDecl[];
    /** For external: the schema expression (e.g. 'UserSchema'). */
    schemaExpr?: string;
    /** Save mode: 'onSubmit' | 'onChange' | 'onBlur' | 'immediate'. */
    saveMode?: string;
    /** DataSource variable name for auto-binding. */
    source?: string;
    /** Parent form variable name for nesting. */
    parent?: string;
    /** Whether to warn on unsaved changes. */
    warnUnsaved?: boolean;
    /** Per-field config overrides. */
    fieldConfig?: Record<string, { saveMode?: string; saveDebounce?: number }>;
    /**
     * The cross-field rule, as the expression it was written as: `createForm`'s `validate`,
     * which reads every value and returns messages by field.
     */
    validate?: string;
}

/** i18n configuration from @i18n { ... } block. */
export interface I18nInfo {
    locales: string[];
    default: string;
    translationsPath: string;
    detect?: boolean;
    persist?: boolean | 'session' | string;
}

/** Single search param declaration from @search schema. */
export interface SearchParamDecl {
    name: string;
    type: 'string' | 'number' | 'boolean';
    default?: string;
    optional: boolean;
}

/** Named outlet mapping from @outlet rune. */
export interface OutletDecl {
    name: string;  // outlet name: 'sidebar'
    tag: string;   // component tag: 'pdx-sidebar-nav'
}

/** Typed route parameter from @params rune. */
export interface RouteParamDecl {
    name: string;         // 'id'
    type: string;         // 'number', 'string'
}

/** Route metadata extracted from @page (its paths and options)/@guard/@loader/@search/@layout/@scroll/@redirect/@outlet/@params. */
export interface RouteInfo {
    page?: string;        // '/users/:id(number)'
    guard?: string;       // 'admin.users.view'
    loader?: string;      // function name
    search?: string;      // raw string (backward compat)
    searchParams?: SearchParamDecl[];  // parsed schema
    prefetch?: string;    // 'hover', 'viewport', 'eager'
    transition?: string;  // 'slide-right', 'fade'
    layout?: string;      // 'dashboard'
    scroll?: string;      // 'preserve', 'top'
    keepAlive?: boolean | number;
    preload?: boolean;
    label?: string;       // @page '/tickets' { label: 'Tickets' } — the breadcrumb crumb
    labelFn?: string;     // @page '/tickets/:id' { label: ticketLabel } — the name of a function the
                          // page declares, hoisted and registered by reference
    labelKey?: string;    // @page '/customers' { label: $t('customers.title') } — a dictionary key,
                          // carried as data in every route table and translated by the router
    title?: string;       // @title 'Board' — the page's title, when it is a string literal (#389)
    titleKey?: string;    // @title $t('intake.title') — the page's title as a dictionary key (#389)
    redirectTo?: string;  // @redirect '/target'; (page-level)
    redirects?: { from: string; to: string }[];  // @redirect '/from' -> '/to';
    aliases?: string[];   // @page '/users', '/people'; — the paths after the first
    meta?: Record<string, unknown>;  // @page '/x' { meta: { permissions: [...], breadcrumb: '...' } };
    outlets?: OutletDecl[];  // @outlet 'sidebar' -> 'pdx-nav';
    params?: RouteParamDecl[];  // @params { id: number };
}

export interface ScriptAnalysis {
    props: PropInfo[];
    events: EventInfo[];
    slots: SlotInfo[];
    /** The script's `@snippet`s whose body is a template (#489): the render compiles them. */
    snippets: ScriptSnippet[];
    /** The type parameters `@generic` declares, each as written: `T extends { id: string }` (#490). */
    generics: string[];
    signals: SignalDecl[];
    deriveds: DerivedDecl[];
    stores: StoreDecl[];
    watches: WatchDecl[];
    fetches: FetchDecl[];    // @fetch declarations
    forms: FormDecl[];       // @form declarations
    exposes: string[];       // names declared via @expose
    states: StateDecl[];     // @state name = expr;
    host?: HostAttr[];       // @host { role="x" :aria-expanded="open" @keydown="onKey" }
    variants?: VariantAxis[]; // @variants { variant: { primary, ghost } = primary; } (#153)
    parts: string[];         // @part trigger, popup;
    route: RouteInfo;       // route metadata from @page/@guard/etc.
    globalStore?: GlobalStoreDirective;  // @store rune (file = store module)
    customTag?: string;      // @tag 'app-custom-name' — overrides file-derived tag
    i18n?: I18nInfo;         // @i18n configuration block
    head: HeadInfo;          // @title/@meta head management
    provides: ProvideDecl[];  // @provide Token = expr;
    injects: InjectDecl[];   // @inject name from Token;
    effects: string[];
    emits: string[];         // $emit() call expressions
    lifecycle: { onMount: string[]; onDestroy: string[] };
    exports: ExportDecl[];
    body: string;            // remaining script body (functions, plain lets, etc.)
    /**
     * Where each line of `body` was written in the .pdx (null: no single place), present only when
     * the analyser was given `originBase` — the compile that builds a source map.
     */
    bodyOrigins?: (number | null)[];
    /** The same, line by line, for the call bodies the analyser extracts, in their own order. */
    origins?: {
        effects: (number | null)[][];
        watches: (number | null)[][];
        onMount: (number | null)[][];
        onDestroy: (number | null)[][];
    };
    /**
     * The .pdx line of each `$effect` and `$watch`, in their order — present only when the analyser
     * was given `lineBase`. A development build names the effect after it.
     */
    runeLines?: { effects: (number | null)[]; watches: (number | null)[] };
    userImports: string[];   // non-framework imports
    coreImportNames: string[]; // framework imports to merge
    /** Every local name the script's value imports bind — the template reaches them as they are. */
    importedNames?: string[];
    usedFeatures: Set<string>; // for auto-import generation
    warnings: ValidationWarning[]; // structural warnings detected during analysis
}

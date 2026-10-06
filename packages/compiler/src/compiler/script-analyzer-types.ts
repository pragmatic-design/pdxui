// Script Analyzer — Type definitions for script analysis results.
// Extracted from script-analyzer.ts for modularity.

import type { ValidationWarning } from './validate';

// ─── Types ─────────────────────────────────────────────────────────

export interface PropInfo {
    name: string;
    tsType: string;       // 'string', 'number', 'boolean', 'Item[]', etc.
    runtimeType: string;  // 'String', 'Number', 'Boolean', 'Array', 'Object'
    default?: string;     // default value expression as string
}

export interface EventInfo {
    name: string;
    payloadType: string;  // '{ value: number }', 'void', etc.
}

export interface SlotInfo {
    name: string;
    /** Scope type for scoped slots: '{ row: Item, column: string }' or undefined. */
    scopeType?: string;
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
    key: string;        // context key: 'theme'
    expr: string;       // value expression: '$signal({ mode: "dark" })' or 'authService'
}

/** Declarative inject from @inject rune. */
export interface InjectDecl {
    key: string;        // context key: 'theme'
    alias?: string;     // optional local variable name (default = key)
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

/** Route metadata extracted from @page/@guard/@loader/@search/@prefetch/@transition/@layout/@scroll/@redirect/@alias/@outlet/@params. */
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
    redirectTo?: string;  // @redirect '/target'; (page-level)
    redirects?: { from: string; to: string }[];  // @redirect '/from' -> '/to';
    aliases?: string[];   // @alias '/people'; or @page '/users', '/people';
    meta?: Record<string, unknown>;  // @meta { permissions: [...], breadcrumb: '...' };
    outlets?: OutletDecl[];  // @outlet 'sidebar' -> 'pdx-nav';
    params?: RouteParamDecl[];  // @params { id: number };
}

export interface ScriptAnalysis {
    mode: 'new' | 'legacy';
    props: PropInfo[];
    events: EventInfo[];
    slots: SlotInfo[];
    signals: SignalDecl[];
    deriveds: DerivedDecl[];
    stores: StoreDecl[];
    watches: WatchDecl[];
    fetches: FetchDecl[];    // @fetch declarations
    forms: FormDecl[];       // @form declarations
    exposes: string[];       // names declared via @expose
    route: RouteInfo;        // route metadata from @page/@guard/etc.
    globalStore?: GlobalStoreDirective;  // @store rune (file = store module)
    customTag?: string;      // @tag 'pdx-custom-name' — overrides file-derived tag
    i18n?: I18nInfo;         // @i18n configuration block
    head: HeadInfo;          // @title/@meta head management
    provides: ProvideDecl[];  // @provide key = expr;
    injects: InjectDecl[];   // @inject key;
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
    inlineBlocks?: string[]; // $inline {} blocks for render path
    userImports: string[];   // non-framework imports
    coreImportNames: string[]; // framework imports to merge
    /** Every local name the script's value imports bind — the template reaches them as they are. */
    importedNames?: string[];
    usedFeatures: Set<string>; // for auto-import generation
    warnings: ValidationWarning[]; // structural warnings detected during analysis
}

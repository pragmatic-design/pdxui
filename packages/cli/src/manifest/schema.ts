// Manifest types — output of pdx analyze.
// Machine-readable component metadata for agent tooling, code generation, and documentation.

export interface PdxManifest {
    version: string;
    generatedAt: string;
    components: ComponentManifest[];
    /** The app's route table: every component with `@page`, sorted by path. */
    routes: RouteManifest[];
}

export interface ComponentManifest {
    /** Web Component tag: 'pdx-counter'. */
    tag: string;
    /** Relative file path. */
    file: string;
    /** Declared props with types and defaults. */
    props: { name: string; type: string; default?: string; required: boolean }[];
    /** Declared events with payload types. */
    events: { name: string; payloadType: string }[];
    /** Declared slots, with scoped data type if applicable. */
    slots: { name: string; scoped: boolean; scopeType?: string }[];
    /** Exposed imperative API methods. */
    exposes: string[];
    /** Reactive signal names. */
    signals: string[];
    /** Deep reactive store names. */
    stores: string[];
    /** Other .pdx component dependencies. */
    dependencies: string[];
    /** Used framework features: 'signal', 'store', 'watch', 'effect', 'defer', etc. */
    features: string[];
    /** Route metadata if @page is declared. */
    route?: RouteManifest;
    /** Data fetching endpoints used by this component. */
    fetches?: FetchManifest[];
    /** Form declarations with field schemas. */
    forms?: FormManifest[];
    /** Component metadata for documentation and tooling. */
    metadata?: ComponentMetadata;
}

export interface RouteManifest {
    /** Route path: '/users/:id'. */
    path: string;
    /** Source file. */
    file: string;
    /** The page component's tag: 'pdx-users'. */
    tag: string;
    /** Permission guard. */
    guard?: string;
    /** Data loader function name. */
    loader?: string;
    /** Search/query params type. */
    search?: string;
    /** Prefetch strategy: 'hover', 'viewport', 'eager'. */
    prefetch?: string;
    /** Layout name. */
    layout?: string;
    /** Whether the route is lazy-loaded. */
    lazy: boolean;
}

export interface FetchManifest {
    /** Variable name: 'users'. */
    name: string;
    /** HTTP method: 'GET', 'POST'. */
    method: string;
    /** URL path: '/api/users'. */
    url: string;
    /** Response type annotation: 'User[]'. */
    type?: string;
    /** Whether URL has reactive ${} params. */
    reactive: boolean;
}

export interface FormManifest {
    /** Variable name: 'contact'. */
    name: string;
    /** 'inline' or 'external' schema. */
    kind: 'inline' | 'external';
    /** Schema reference for external: 'UserSchema'. */
    schemaRef?: string;
    /** Field declarations for inline schemas. */
    fields?: FormFieldManifest[];
}

export interface FormFieldManifest {
    name: string;
    type: string;
    required: boolean;
    rules: string[];
}

export interface ComponentMetadata {
    /** Component category for organization. */
    category?: 'page' | 'layout' | 'feature' | 'ui' | 'utility';
    /** Brief description (from first comment in script). */
    description?: string;
    /** Estimated DOM complexity (element count in template). */
    domNodes?: number;
    /** Number of reactive signals. */
    signalCount?: number;
    /** Number of effects/watchers. */
    effectCount?: number;
}

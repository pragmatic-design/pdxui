// The runes — every `@declaration` and `$function` a .pdx script can use — in ONE list.
//
// The analyzer reads it for its declaration shapes, and every other reader derives from it: the
// language server's completion and hover, the projection that blanks declarations before TypeScript
// sees the script, and the editor grammar (`packages/vscode-pdx/scripts/gen-grammar.mjs`). Copies
// outside the compiler drift from it and from each other: a rune missing from one has no
// highlighting, no completion, or reaches TypeScript as text.

/** One rune: a statement-leading `@declaration`, or a `$function` the compiler rewrites or imports. */
export interface RuneInfo {
    /** Without its sigil: `prop`, `signal`. */
    name: string;
    /** `decorator` = `@name …` at the start of a statement; `function` = `$name(…)`. */
    kind: 'decorator' | 'function';
    /** One line: what it declares or does. */
    doc: string;
    /** The form it is written in, as the analyzer's "Use:" hint shows it. */
    shape: string;
    /** An LSP snippet that writes it. */
    snippet: string;
}

const d = (name: string, doc: string, shape: string, snippet: string): RuneInfo => ({ name, kind: 'decorator', doc, shape, snippet });
const f = (name: string, doc: string, shape: string, snippet: string): RuneInfo => ({ name, kind: 'function', doc, shape, snippet });

/** Every rune, declarations first. */
export const RUNES: readonly RuneInfo[] = [
    d('prop', 'Declare a component prop: a signal synced with its attribute.', '@prop name: Type = default;', "@prop ${1:name}: ${2:string} = ${3:'default'};"),
    d('event', 'Declare an event; `name(payload)` dispatches it from the host.', '@event name: PayloadType;', '@event ${1:name}: ${2:void};'),
    d('slot', 'Declare a named slot, with an optional scope type.', '@slot name: { row: Item };', '@slot ${1:name};'),
    d('expose', 'Expose methods on the host element.', '@expose methodA, methodB;', '@expose ${1:method};'),
    d('form', 'Declare a form with its fields and validation.', '@form name: { field: string { required } };   // the colon is not optional', '@form ${1:name}: { ${2:field}: ${3:string} };'),
    d('fetch', 'Declare a data fetch, a reactive resource().', "@fetch name: 'GET /api/path' as Type;   // the method is part of the string", "@fetch ${1:data}: 'GET ${2:/api/path}' as ${3:Type[]};"),
    d('store', 'Declare a global reactive store module.', '@store name = { count: 0 };', '@store ${1:name} = { $2 };'),
    d('page', 'Register the component as a route page, lazy-loaded.', "@page '/users/:id';", "@page '${1:/path}';"),
    d('guard', 'Require a permission for the route.', "@guard 'users.read';", "@guard '${1:permission}';"),
    d('loader', 'Name the function that loads the route data before the page renders.', '@loader loadUsers;', '@loader ${1:load};'),
    d('layout', 'Render the page inside a layout; \'none\' opts out.', "@layout 'admin';", "@layout '${1:name}';"),
    d('title', 'Set document.title, static or reactive.', "@title 'Dashboard';   // or a backtick template for a reactive one", "@title '${1:Page Title}';"),
    d('meta', 'Add a meta tag to the document head.', "@meta description: 'text';   // or @meta property og:title: 'text';", "@meta ${1:description}: '${2:content}';"),
    d('scroll', 'The page\'s scroll behaviour on navigation.', "@scroll 'top';", "@scroll '${1|preserve,top|}';"),
    d('head', 'Set the document head: title and meta tags.', "@head { title: 'Products', meta: [{ name: 'description', content: '…' }] }", "@head { title: '${1:Title}' }"),
    d('provide', 'Provide a value to the components below this one.', '@provide key = value;', '@provide ${1:key} = ${2:value};'),
    d('inject', 'Read a value a component above provides.', '@inject key;', '@inject ${1:key};'),
    d('tag', 'Register the component under another tag than its file name.', "@tag 'pdx-other-name';", "@tag '${1:pdx-name}';"),
    d('route', 'Route options for the page.', "@route { path: '/users', keepAlive: true }", "@route { path: '${1:/path}' }"),
    d('params', 'Declare and type the route params.', "@params { id: 'number' }", "@params { ${1:id}: '${2:number}' }"),
    d('redirect', 'Redirect another path to this page.', "@redirect '/new-path';", "@redirect '${1:/path}';"),
    d('alias', 'Another path that renders this page.', "@alias '/old-path';", "@alias '${1:/path}';"),
    d('outlet', 'Render the page into a named outlet.', "@outlet 'sidebar';", "@outlet '${1:name}';"),
    d('search', 'Declare and type the query-string params.', "@search { q: 'string' }", "@search { ${1:q}: '${2:string}' }"),
    d('prefetch', 'When the page\'s chunk is fetched ahead of a click.', "@prefetch 'hover';", "@prefetch '${1|hover,eager,never|}';"),
    d('snippet', 'Declare a reusable template fragment.', '@snippet name(arg) { <div>…</div> }', '@snippet ${1:name}(${2:arg}) {\n  $3\n}'),
    d('i18n', 'Configure internationalization for the app.', "@i18n { locales: ['en', 'it'], default: 'en' }", "@i18n {\n  locales: ['${1:en}', '${2:it}'],\n  default: '${3:en}',\n  translations: '${4:./translations}',\n}"),
    d('mixin', 'Use a composable under a name.', '@mixin useThing as thing;', '@mixin ${1:useThing} as ${2:thing};'),
    d('transition', 'The page transition animation.', "@transition 'fade';", "@transition '${1|fade,slide-left,slide-right,slide-up,slide-down,scale|}';"),

    f('signal', 'A reactive value; `count++` and `count = x` are rewritten into updates.', 'let count = $signal(0);', '\\$signal(${1:initial})'),
    f('derived', 'A value computed from others; recomputed when they change.', 'const total = $derived(price * quantity);', '\\$derived(${1:expression})'),
    f('effect', 'A side effect that re-runs when what it reads changes.', '$effect(() => { … });', '\\$effect(() => {\n  $1\n})'),
    f('store', 'A deep reactive object, through a Proxy.', 'let state = $store({ items: [] });', '\\$store(${1:{}})'),
    f('watch', 'Run a callback when one source changes.', '$watch(source, (value, previous) => { … });', '\\$watch(${1:source}, (${2:value}) => {\n  $3\n})'),
    f('emit', 'Dispatch an event by name, untyped; prefer the function `@event` declares.', "$emit('name', payload);", "\\$emit('${1:name}', ${2:payload})"),
    f('t', 'Translate a key; reactive to the locale.', "$t('key', params?)", "\\$t('${1:key}')"),
    f('n', 'Format a number for the locale.', '$n(value, options?)', '\\$n(${1:value})'),
    f('d', 'Format a date for the locale.', '$d(value, options?)', '\\$d(${1:value})'),
    f('r', 'Format a relative time for the locale.', "$r(value, 'day')", "\\$r(${1:value}, '${2:day}')"),
];

/** The declaration runes, by name. */
export const DECORATOR_RUNES: ReadonlyMap<string, RuneInfo> = new Map(RUNES.filter(r => r.kind === 'decorator').map(r => [r.name, r]));

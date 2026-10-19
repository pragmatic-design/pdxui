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
    d('model', 'Declare a prop the component writes: assigning it dispatches `<name>-change` with `{ value }`, and the parent binds it with `::name`.', '@model name: Type = default;', "@model ${1:value}: ${2:string} = ${3:''};"),
    d('event', 'Declare an event; `name(payload)` dispatches it from the host, where it stays unless declared `@event(bubbles)`.', '@event name: PayloadType;   // @event(bubbles) name: … to bubble', '@event ${1:name}: ${2:void};'),
    d('slot', 'Declare a named slot, with an optional scope type.', '@slot name: { row: Item };', '@slot ${1:name};'),
    d('expose', 'Expose methods on the host element.', '@expose methodA, methodB;', '@expose ${1:method};'),
    d('part', 'Declare named, public parts: `data-part="name"` on one element each, and `name` is its ref.', '@part trigger, popup;', '@part ${1:name};'),
    d('host',"Attributes, bindings and listeners on the component's own element, with the template's attribute grammar.", '@host { role="combobox" :aria-expanded="open" @keydown="onKey" }', '@host { ${1:role}="${2:value}" }'),
    d('variants', 'Declare the component\'s variants: each axis is a prop typed with its values, reflected on the host, and styled with `@variant axis(value) { … }`.', '@variants { variant: { primary, ghost } = primary; }', '@variants {\n  ${1:variant}: { ${2:primary}, ${3:ghost} } = ${2:primary};\n}'),
    d('state','A visual state of the host, kept in sync with a boolean; CSS matches it with `:state(name)`.', '@state name = booleanExpression;', '@state ${1:name} = ${2:condition};'),
    d('form', 'Declare a form with its fields and validation.', '@form name: { field: string { required } };   // the colon is not optional', '@form ${1:name}: { ${2:field}: ${3:string} };'),
    d('fetch', 'Declare a data fetch, a reactive resource().', "@fetch name: 'GET /api/path' as Type;   // the method is part of the string", "@fetch ${1:data}: 'GET ${2:/api/path}' as ${3:Type[]};"),
    // The file IS the store: `@store name;` names it, `$store({…})` holds its state. `@store name = {…}`
    // is not a form the compiler reads — it is PDX_UNKNOWN_DECLARATION — and completion offered it (#58).
    d('store', 'Make this file a global reactive store module, its state in $store({ … }).', "@store name;   // or @store name { persist: 'local' };", '@store ${1:name};'),
    // The one home of every route field (#277): further paths, and the options keepAlive, preload,
    // prefetch, label, transition and meta. `@route`, `@alias`, `@prefetch`, the script's `@transition`
    // and `@head` are removed forms, and not offered.
    d('page', 'Register the component as a route page, lazy-loaded: further paths are aliases, and the options carry every route field.', "@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };", "@page '${1:/path}';"),
    d('guard', 'Require a permission for the route.', "@guard 'users.read';", "@guard '${1:permission}';"),
    d('loader', 'Name the function that loads the route data before the page renders.', '@loader loadUsers;', '@loader ${1:load};'),
    d('layout', 'Render the page inside a layout; \'none\' opts out.', "@layout 'admin';", "@layout '${1:name}';"),
    d('title', 'Set document.title, static or reactive.', "@title 'Dashboard';   // or a backtick template for a reactive one", "@title '${1:Page Title}';"),
    d('meta', 'Add a meta tag to the document head.', "@meta description: 'text';   // or @meta property og:title: 'text';", "@meta ${1:description}: '${2:content}';"),
    d('scroll', 'The page\'s scroll behaviour on navigation.', "@scroll 'top';", "@scroll '${1|preserve,top|}';"),
    d('provide', 'Provide a value to the components below this one.', '@provide key = value;', '@provide ${1:key} = ${2:value};'),
    d('inject', 'Read a value a component above provides.', '@inject key;', '@inject ${1:key};'),
    d('tag', 'Register the component under another tag than its file name. An application tag starts with its prefix, `app-` by default: `pdx-` is reserved for the @pdxui packages.', "@tag 'app-other-name';", "@tag '${1:app-name}';"),
    d('params', 'Declare and type the route params.', '@params { id: number }', '@params { ${1:id}: ${2:number} }'),
    d('redirect', "Send this page's route to another path; `'/from' -> '/to'` redirects any path.", "@redirect '/new-path';", "@redirect '${1:/path}';"),
    d('outlet', 'Render a component into a named outlet beside this page.', "@outlet 'sidebar' -> 'pdx-nav';", "@outlet '${1:name}' -> '${2:pdx-component}';"),
    d('search', 'Declare and type the query-string params.', '@search { q?: string, page: number = 1 }', '@search { ${1:q}?: ${2:string} }'),
    d('snippet', 'Declare a reusable template fragment.', '@snippet name(arg) { <div>…</div> }', '@snippet ${1:name}(${2:arg}) {\n  $3\n}'),
    d('i18n', 'Configure internationalization for the app.', "@i18n { locales: ['en', 'it'], default: 'en' }", "@i18n {\n  locales: ['${1:en}', '${2:it}'],\n  default: '${3:en}',\n  translations: '${4:./translations}',\n}"),
    d('use', 'Use a Web Component from another package: imports the package that registers the tag.', "@use 'sl-button' from '@shoelace-style/shoelace';", "@use '${1:tag-name}' from '${2:package}';"),
    d('raw', 'Kept as written. In the script, no signal is rewritten inside the block; in the template, no binding, interpolation or directive is read inside it.', '@raw { … }', '@raw {\n  $1\n}'),

    f('signal', 'A reactive value; `count++` and `count = x` are rewritten into updates.', 'let count = $signal(0);', '\\$signal(${1:initial})'),
    f('derived', 'A value computed from others; recomputed when they change.', 'const total = $derived(price * quantity);', '\\$derived(${1:expression})'),
    f('effect', 'A side effect that re-runs when what it reads changes.', '$effect(() => { … });', '\\$effect(() => {\n  $1\n})'),
    f('store', 'A deep reactive object, through a Proxy.', 'let state = $store({ items: [] });', '\\$store(${1:{}})'),
    f('watch', 'Run a callback when one source changes.', '$watch(source, (value, previous) => { … });', '\\$watch(${1:source}, (${2:value}) => {\n  $3\n})'),
    f('t', 'Translate a key; reactive to the locale.', "$t('key', params?)", "\\$t('${1:key}')"),
    f('n', 'Format a number for the locale.', '$n(value, options?)', '\\$n(${1:value})'),
    f('d', 'Format a date for the locale.', '$d(value, options?)', '\\$d(${1:value})'),
    f('r', 'Format a relative time for the locale.', "$r(value, 'day')", "\\$r(${1:value}, '${2:day}')"),
];

/** The declaration runes, by name. */
export const DECORATOR_RUNES: ReadonlyMap<string, RuneInfo> = new Map(RUNES.filter(r => r.kind === 'decorator').map(r => [r.name, r]));

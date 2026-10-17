# The script

The `<script setup>` of a component: TypeScript statements, some of which are **declarations** — a
line that starts with `@` — and some of which call a **`$` rune**. The compiler reads the
declarations line by line, rewrites every read and write of a `$signal`, and wraps what is left in
the component's `setup(ctx)`. This page defines the declarations of a component and the `$` runes;
the route declarations are in [routing.md](routing.md), `@fetch`, `@form`, `@store` and `$store` in
[data.md](data.md).

## The script and its rewrite

```ebnf
Script               ::= ( S? ScriptItem )* S?
ScriptItem           ::= Declaration | Statement
Declaration          ::= ComponentDeclaration | RouteDeclaration | DataDeclaration
ComponentDeclaration ::= PropDecl | EventDecl | SlotDecl | ExposeDecl | ProvideDecl | InjectDecl
                       | TagDecl | MixinDecl | UseDecl | SnippetDecl | I18nDecl | RawBlock
Statement            ::= /* a TypeScript statement, the $ runes included */
```

`RouteDeclaration` is any declaration of [routing.md](routing.md), `DataDeclaration` any of
[data.md](data.md); the others are defined below.

- **A declaration is a line.** The analyzer first splits the script at every `;` outside brackets,
  strings and comments, then reads it line by line: a declaration is recognised where a line starts
  with `@keyword` in code (not in a comment or a string). A declaration of a known keyword that matches
  none of its forms is dropped and raises `PDX_UNKNOWN_DECLARATION`, whose hint is the form below.
  Only `@i18n`, `@raw` and `@snippet` may span lines (a balanced `{ … }` block).
- **The mode.** A `<script setup>` is the new mode unless it carries a legacy marker
  ([overview.md](overview.md#the-two-script-modes)); a plain `<script>` is the new mode only when one of
  its lines starts with a declaration other than `@mixin`, `@use`, `@raw` and `@transition`, or calls
  `$signal(`, `$derived(`, `$effect(`, `$store(`, `$watch(` or `linkedSignal(`.
- **What the template sees.** Every top-level `const`, `let`, `function`, rune and declared name is
  returned from `setup` to the template, except a name that starts with `_`.
- **The rest is TypeScript**, type-erased (overview.md). A syntax error raises
  `PDX_SCRIPT_SYNTAX_ERROR`; two top-level declarations of one name (runes, `@prop`, functions,
  classes, variables) raise `PDX_DUP_DECLARATION`.

**The signal rewrite.** One pass over the TypeScript AST (`signal-rewrite-ast.ts`) rewrites the setup
body, the bodies of `$effect`, `$watch`, `onMount` and `onDestroy`, every `$derived` expression and
every `@provide` value. A `$signal` named `count` lives in the module as `__count`; a prop or a
`$derived` named `total` is a callable `total`:

| Written | Generated |
|---|---|
| `count` (a read) | `__count()` |
| `count++`, `++count` / `count--`, `--count` | `__count.set(__v => __v + 1)` / `__count.set(__v => __v - 1)` |
| `count += x` (and `-=` `*=` `/=` `%=` `**=` `&=` `\|=` `^=` `<<=` `>>=` `>>>=`) | `__count.set(__v => __v + x)` |
| `count \|\|= x`, `count &&= x`, `count ??= x` | `(__count() \|\| __count.setRaw(x))`, likewise — the short circuit stays, and `x` is stored as it is |
| `count = x` | `__count.setRaw(x)` — `x` is stored even when it is a function |
| `count = f(count)` (the right side reads `count`) | `__count.setRaw(f(__count.peek()))` — the read on the right side is untracked, so inside an effect the assignment does not make the effect depend on what it writes |
| `count.peek()`, `count.setRaw(v)` | `__count.peek()`, `__count.setRaw(v)` — the signal's own methods |
| `handler(a)` (a `$signal` called) | `__handler()(a)` — the value is read, then called |
| `{ count }` (shorthand property) | `{ count: __count() }` |
| `total` (a prop or a `$derived`, read) | `total()` |

An assignment stores its value; an update (`++`, `--` and the arithmetic and bitwise compound
operators) computes the new value from the old one. So a `$signal` holds a function as it holds any
other value: `onSave = () => save()` stores the arrow, and `onSave()` calls it.

A parameter or a local of the same name shadows the signal and is not rewritten; nor is a property
name (`row.count`) or a declared name. A prop or a `$derived` in callee position (`total(…)`) is left
as written.

## Component declarations

### @prop

#### Syntax

```ebnf
PropDecl ::= "@prop" S Identifier S? ":" S? Type ( S? "=" S? Expression )? S? ";"?
```

The analyzer's form: `@prop name: Type = default;`

#### Semantics

Declares a prop: an attribute-synced signal on the element. It becomes an entry of the component's
`props` object, `name: { type: T, default: d }`, where `T` is `String`, `Number` or `Boolean` for
`string`, `number`, `boolean`, `Array` for a type ending in `[]`, and `Object` for every other type
(unions included); the default is emitted as written. Where the setup reads the name, it declares
`const name = ctx.name;` and the rewrite turns each read into `name()`; in a `$signal` or `$store`
initialiser the read is `ctx.name.peek()`, the value at setup time. The `.d.ts` gets `name?: Type`.

#### Rules

- The type annotation is required: `@prop name;` raises `PDX_PROP_NO_TYPE` and nothing is generated.
- A type with unbalanced brackets or a trailing `|`, `&`, `,` raises `PDX_PROP_INVALID_TYPE`.
- A default that does not look like its type (`@prop n: number = 'x'`) raises `PDX_PROP_TYPE_MISMATCH`.
- Two `@prop` of one name raise `PDX_DUP_PROP`; a prop and another top-level declaration of the same
  name raise `PDX_DUP_DECLARATION`.
- A component that assigns its own prop raises `PDX_PROP_WRITE`.
- The declaration is one line: a type written across lines is not read — not checked today.

#### Examples

```pdx
<template>
  <button :disabled="disabled">{{ label }} · {{ clicks }}</button>
</template>

<script setup>
@prop label: string = 'Save';
@prop disabled: boolean = false;
@prop start: number = 0;
@prop tags: string[] = [];
@prop size: 'sm' | 'md' | 'lg' = 'md';
let clicks = $signal(start);
</script>
```

#### Since

alpha

### @model

#### Syntax

```ebnf
ModelDecl ::= "@model" S Identifier S? ":" S? Type ( S? "=" S? Expression )? S? ";"?
```

The analyzer's form: `@model name: Type = default;`

#### Semantics

Declares a prop the component writes, which a parent binds both ways with `::name`
([template.md](template.md)). It is a prop — the same attribute, property, coercion and `.d.ts`
entry — declared in the descriptor's `models` instead of `props`: `models: { name: { type: T,
default: d } }`. In the script the name is a signal: the setup declares `const __name = ctx.name;`,
a read is `__name()` and an assignment `__name.set(…)`. Core's model signal writes the prop and
dispatches `<kebab-name>-change` with `detail: { value }`, not bubbling — `selectedId` dispatches
`selected-id-change`. A write that does not change the value dispatches nothing, and the parent
setting the property dispatches nothing either, so a value is never echoed back. The `.d.ts`
`Events` interface gets `'<kebab-name>-change': { value: Type }`, and the project manifest lists the
component's `models`.

#### Rules

- The rules of `@prop` apply: `PDX_PROP_NO_TYPE`, `PDX_PROP_INVALID_TYPE`, `PDX_PROP_TYPE_MISMATCH`,
  `PDX_DUP_PROP`, `PDX_DUP_DECLARATION`.
- Assigning a model is the point of it: it never raises `PDX_PROP_WRITE`.
- `{ form }` (form association, #135) is not read yet.

#### Examples

```pdx
<template>
  <input ::value="value" />
  <button @click="clear()">Clear</button>
</template>

<script setup>
@model value: string = '';
function clear() { value = ''; }
</script>
```

#### Since

beta (#124)

### @event

#### Syntax

```ebnf
EventDecl ::= "@event" S Identifier ( S? ":" S? Type )? S? ";"?
```

The analyzer's form: `@event name: PayloadType;`

#### Semantics

Declares an event the component dispatches, and a function of the same name that dispatches it:
`const name = (detail) => ctx.emit('name', detail);`, declared before the rest of the setup so any
statement can call it, and returned to the template. `ctx.emit` dispatches a `CustomEvent` on the
host with `detail`, `bubbles: true` and `composed: true`. Without a type the payload is `void`. The
`.d.ts` gets an `Events` interface; a parent listens with `@name="…"` ([template.md](template.md)).

#### Rules

- A line `@event …` that is not this form raises `PDX_MALFORMED_EVENT`. That includes a name that is
  not an `Identifier`: `@event pdx-change: T` is an error, since the name is the emitter function too.
  A hyphenated event is dispatched with `$emit('pdx-change', value)`.
- Two `@event` of one name raise `PDX_DUP_EVENT`.
- A name with an uppercase letter raises `PDX_EVENT_NAME_CASE`: HTML lowercases the parent's listener
  attribute, which then never matches.
- A function the script declares under the same name replaces the generated one.

#### Examples

```pdx
<template>
  <button @click="save">Save</button>
</template>

<script setup>
@event saved: { id: string };
@event closed;

function save() {
  saved({ id: 'a1' });
  closed();
}
</script>
```

#### Since

alpha

### @slot

#### Syntax

```ebnf
SlotDecl ::= "@slot" S Identifier ( S? ":" S? Type )? S? ";"?
```

The analyzer's form: `@slot name: { row: Item };`

#### Semantics

Declares a named slot and, after the colon, the type of the scope the slot hands to its content. It
generates nothing in the module: the slot itself is the `<slot>` element of the template
([template.md](template.md)). The `.d.ts` gets a `Slots` interface with `name: ScopeType`, or `{}`
without a type.

#### Rules

- `@slot` with no name raises `PDX_UNKNOWN_DECLARATION`.
- That the template has a `<slot>` of the declared name, and passes the declared scope, is not checked
  today.
- The name is an `Identifier`; a hyphenated slot name cannot be declared — not checked today.

#### Examples

```pdx
<template>
  <section>
    <header><slot name="header"></slot></header>
    <slot></slot>
  </section>
</template>

<script setup>
@slot header;
@slot row: { item: string; index: number };
</script>
```

#### Since

alpha

### @expose

#### Syntax

```ebnf
ExposeDecl ::= "@expose" S Identifier ( S? "," S? Identifier )* S? ";"?
```

The analyzer's form: `@expose methodA, methodB;`

#### Semantics

Puts the named members on the host element, for a parent that holds a reference to it: the setup
ends with `ctx.expose({ methodA, methodB })`, which defines them as read-only properties of the
element. A `$signal` is exposed as its signal (`open: __open`), so the outside reads it with `open()`
and writes it with `open.set(…)`; a function or a constant as it is.

#### Rules

- A name the component does not declare raises `PDX_EXPOSE_UNDECLARED`.
- Several `@expose` lines add up.

#### Examples

```pdx
<template>
  @if (open) { <p class="panel">Details</p> }
</template>

<script setup>
let open = $signal(false);

function show() { open = true; }
function hide() { open = false; }

@expose show, hide, open;
</script>
```

#### Since

alpha

### @part

#### Syntax

```ebnf
PartDecl      ::= "@part" S Identifier ( S? "," S? Identifier )* S? ";"?
PartAttribute ::= 'data-part="' Identifier '"'
```

The analyzer's form: `@part trigger, popup;`, and `data-part="popup"` on the element.

#### Semantics

A named, public element of the component. `@part popup;` in the script, and `data-part="popup"`
written literally on one element of the template. The attribute stays in the page, so a theme or a
test reaches the element as `pdx-menu [data-part="popup"]` — with the component's `:state()` and its
tokens, the public styling surface; its internal classes are not. In the script the name is the
element: a signal that holds it while it is rendered and `null` otherwise, as a `:ref` written to a
`$signal(null)`, so `popup?.focus()` needs no `:ref`. The descriptor declares `parts: ['popup']`, and the
manifest lists them.

#### Rules

- A declared part on no element raises `PDX_PART_MISSING`; on more than one, `PDX_PART_DUPLICATE`; a
  `data-part` with no declaration, `PDX_PART_UNDECLARED`. The count is of the attribute as written: a
  `data-part` inside an `@for` counts once (whether it may sit there is an open question of the beta).
- A name the script declares itself is that declaration: the part's element is bound to it.

#### Examples

```pdx
<template>
  <button data-part="trigger" @click="open = !open">Menu</button>
  @if (open) { <div data-part="popup"><slot></slot></div> }
</template>

<script setup>
@part trigger, popup;
let open = $signal(false);
function close() { open = false; trigger?.focus(); }
</script>
```

#### Since

beta (#134)

### @host

#### Syntax

```ebnf
HostDecl ::= "@host" S? "{" ( S? Attribute )* S? "}"
```

`Attribute` is the attribute of an element in the template. The analyzer's form:
`@host { role="combobox" :aria-expanded="open" @keydown="onKey" }`, on one line or several.

#### Semantics

Attributes, bindings and listeners on the component's own element. In a web component the host is the
element, so `role`, `aria-expanded` or a `keydown` listener belong on it, written once rather than
reached through `ctx.el`. The block compiles into the descriptor's `host`, applied after setup with the
render's context:

- a static attribute (`role="combobox"`) is set at connection, unless the element already carries it —
  the page's own `role` or `tabindex` wins;
- a binding (`:aria-expanded="open"`) is read like the template's and written whenever what it reads
  changes; `null`, `undefined` and `false` remove the attribute;
- a listener (`@keydown.enter="onKey"`) is built like the template's — a reference, an inline mutation,
  a call, an arrow — with its modifiers, and removed when the component disconnects.

#### Rules

- A two-way binding (`::x`), `data-part` and a generic argument (`T="User"`) have no meaning on a host:
  each raises `PDX_HOST_INVALID_ATTRIBUTE`, whose message says which, and is not compiled.
- A `$signal` read only by `@host` counts as read.

#### Examples

```pdx
<template>
  <span>{{ label }}</span>
</template>

<script setup>
@prop label: string = 'Choose';
let open = $signal(false);
@host { role="combobox" :aria-expanded="open ? 'true' : 'false'" @keydown.enter="open = !open" }
</script>
```

#### Since

beta (#133)

### @state

#### Syntax

```ebnf
StateDecl ::= "@state" S Identifier S? "=" S? Expression S? ";"?
```

The analyzer's form: `@state name = booleanExpression;`

#### Semantics

A visual state of the host, held in the platform's custom states (`ElementInternals.states`): the
descriptor declares it (`states: ['name']`), the host attaches its internals once, and an effect sets
the state from the expression whenever what the expression reads changes
(`ctx.track(() => { ctx.state('name', …); })`). CSS matches it with `:state(name)` — a theme, a page or
the component itself — instead of a class or an attribute each component names its own way. The
manifest lists a component's states.

#### Rules

- The expression is a boolean. A non-boolean literal, a `$signal(…)` or `$store(…)`, or a `$signal`
  that starts as a non-boolean literal raises `PDX_STATE_NOT_BOOLEAN`. `@state` is not Svelte's
  `$state`: reactive data is a `$signal`.
- A `@state` without `= expression` raises `PDX_MALFORMED_STATE`.
- Inside the component's own `<style scoped>`, the host is not reachable yet (the scoping writes every
  selector under the host, #152); `:state()` is written from outside it — a theme or the page.
- Under `target: 'baseline-2024'` the state will also be mirrored as a `data-state-<name>` attribute;
  that comes with the target option (#121).

#### Examples

```pdx
<template>
  <button @click="open = !open">Menu</button>
</template>

<script setup>
let open = $signal(false);
@state expanded = open;
</script>
```

```css
/* A theme, or the page: the menu while it is open. */
x-menu:state(expanded) button { font-weight: 600; }
```

#### Since

beta (#132)

### @provide, @inject

#### Syntax

```ebnf
ProvideDecl ::= "@provide" S Identifier S? "=" S? Expression S? ";"?
InjectDecl  ::= "@inject" S Identifier ( S "as" S Identifier )? S? ";"?
```

The analyzer's forms: `@provide key = value;` and `@inject key;`.

#### Semantics

`@provide key = value;` publishes a value to the elements below this one under the string key
`'key'`: after the setup body, `provide('key', value, ctx.el)`. The value is an expression of the
setup, rewritten like the body, and evaluated once: `@provide count = count;` provides the signal's
value at setup time, `@provide count = () => count;` a getter that reads it when called.
`@inject key;` reads the value the nearest ancestor provides: before the setup body,
`const key = inject('key', ctx.el);`; with `as alias` the local name is `alias`. The name is returned
to the template like any other.

#### Rules

- `@provide` without `=` and `@inject` with a quoted key raise `PDX_UNKNOWN_DECLARATION`.
- An `@inject` with no provider above throws `No provider found for "key"` when the component is set
  up — not checked at compile time. `tryInject` from `@pdxui/core` is the optional form.
- The `@provide` value is one line.

#### Examples

```pdx
<template>
  <div class="invoice"><slot></slot></div>
</template>

<script setup>
let density = $signal('compact');

@provide theme = 'invoice';
@provide rowDensity = () => density;

function toggle() { density = density === 'compact' ? 'comfortable' : 'compact'; }
</script>
```

```pdx
<template>
  <p :class="theme">{{ label }}</p>
</template>

<script setup>
@inject theme;
@inject rowDensity as density;

const label = 'Total';
</script>
```

#### Since

alpha

### @tag

#### Syntax

```ebnf
TagDecl ::= "@tag" S StringLiteral S? ";"?
```

The analyzer's form: `@tag 'pdx-other-name';`

#### Semantics

Registers the component under the given tag instead of the one derived from its file name
([overview.md](overview.md#the-tag)): `component('pdx-other-name', …)`. The component resolver reads
the same line, so the tag is auto-imported where a template uses it.

#### Rules

- An unquoted tag raises `PDX_UNKNOWN_DECLARATION`.
- Two files that end up with one tag raise `PDX_TAG_COLLISION`.
- That the string is a valid custom-element name (lowercase, with a hyphen) is not checked today:
  `customElements.define` rejects it when the module loads.

#### Examples

```pdx
<template>
  <p>Legacy card</p>
</template>

<script setup>
@tag 'pdx-legacy-card';
</script>
```

#### Since

alpha

### @mixin

#### Syntax

```ebnf
MixinDecl ::= "@mixin" S "'" [^']+ "'" S "as" S Identifier S? ";"?
```

The analyzer's form: `@mixin './use-thing.ts' as thing;`

#### Semantics

Runs another module's `setup` inside this one, under a name: the module gets
`import { setup as __mixin_thing } from './use-thing.ts';` and the setup body
`const thing = __mixin_thing(ctx);`. `thing` is whatever that `setup` returns, and is returned to the
template.

#### Rules

- The path is single-quoted; a double-quoted path raises `PDX_UNKNOWN_DECLARATION`.
- The module must export a function `setup(ctx)`. A compiled `.pdx` exports none — its setup is inside
  `component(…)` — so a `.pdx` path fails when the module loads; a `.ts` or `.js` module that exports
  `setup` works. Not checked today.

#### Examples

```pdx
<template>
  <p>{{ clock.now }}</p>
</template>

<script setup>
@mixin './use-clock.ts' as clock;
</script>
```

#### Since

alpha

### @use

#### Syntax

```ebnf
UseDecl ::= "@use" S "'" [^']+ "'" S "from" S "'" [^']+ "'" S? ";"?
```

The analyzer's form: `@use 'sl-button' from '@shoelace-style/shoelace';`

#### Semantics

Imports the package that registers a Web Component from outside the PDX resolver: the module gets the
side-effect import `import '@shoelace-style/shoelace';`. The tag is not read: only the package is.

#### Rules

- Both strings are single-quoted; any other form raises `PDX_UNKNOWN_DECLARATION`.
- That the package registers the tag is not checked today.

#### Examples

```pdx
<template>
  <pdx-button>Save</pdx-button>
</template>

<script setup>
@use 'pdx-button' from '@pdxui/ui/button';
</script>
```

#### Since

alpha

### @snippet

#### Syntax

```ebnf
SnippetDecl ::= "@snippet" S Identifier S? "(" [^)]* ")" S? "{" SnippetBody "}"
SnippetBody ::= /* markup, kept as the text of a tagged template */
```

The analyzer's form: `@snippet name(arg) { <div>…</div> }`

#### Semantics

Declares a function that returns a fragment of markup: `function name(arg) { return html\`…\`; }`,
returned to the template, where `{{ name(value) }}` renders the fragment. The body is copied into the
tagged template as written: it is not compiled as a template, so a value goes in as `${arg}`, and
`{{ }}`, `:attr` bindings and block directives are not read.

#### Rules

- The body is not checked: `{{ arg }}` inside it renders as literal text — not checked today.
- The body ends at the `}` that balances the opening `{`, counted line by line; a `}` in the markup
  ends it early.

#### Examples

```pdx
<template>
  <ul>{{ row('Ada') }}</ul>
</template>

<script setup>
@snippet row(name) {
  <li class="row">${name}</li>
}
</script>
```

#### Since

alpha

### @i18n

#### Syntax

```ebnf
I18nDecl    ::= "@i18n" S? "{" S? I18nOption ( S? ( "," | ";" ) S? I18nOption )* S? ( "," | ";" )? S? "}"
I18nOption  ::= "locales" S? ":" S? "[" StringLiteral ( S? "," S? StringLiteral )* S? "]"
              | "default" S? ":" S? StringLiteral
              | "translations" S? ":" S? StringLiteral
              | "detect" S? ":" S? ( "true" | "false" )
              | "persist" S? ":" S? ( "true" | "false" | "'session'" )
```

The analyzer's form: `@i18n { locales: ['en', 'it'], default: 'en' }`

#### Semantics

Configures internationalisation for the app. The setup starts with
`initI18n({ locales: […], default: '…', detect?, persist? })` and
`createI18nLoader({ mode: 'static', basePath: translations })`, which loads a locale's dictionary when
it becomes active. Without `default` it is `'en'`; without `translations` it is `'./translations'`.

#### Rules

- Each option is read by its own pattern; an unknown option, or a value not in the grammar, is ignored
  — not checked today.
- It belongs in one component that is set up before the others read a translation (the app's root) —
  not checked today.

#### Examples

```pdx
<template>
  <p>{{ $t('app.title') }}</p>
</template>

<script setup>
@i18n {
  locales: ['en', 'it'],
  default: 'en',
  translations: './locales',
}
</script>
```

#### Since

alpha

### @raw

#### Syntax

```ebnf
RawBlock ::= "@raw" S? "{" RawBody "}"
RawBody  ::= /* TypeScript statements, kept as written */
```

The analyzer's form: `@raw { … }`

#### Semantics

In the script, a block whose statements reach the module as written: no signal, prop or `$derived`
read or write is rewritten inside it. It may stand at the top of the script or inside a function.
Inside it a `$signal`'s name refers to nothing the setup declares (the signal is `__name`), so the
block is for code that must not be rewritten. The template meaning of `@raw` is in
[template.md](template.md).

#### Rules

- The block ends at the `}` that balances the opening `{`, counted line by line, strings and comments
  included.
- The editor's type check does not see inside the block.
- A `$signal` read inside the block is a `ReferenceError` at run time — not checked today.

#### Examples

```pdx
<template>
  <p>{{ count }}</p>
</template>

<script setup>
let count = $signal(0);

@raw {
  console.info('setup ran');
}
</script>
```

#### Since

alpha

## The `$` runes

### $signal

#### Syntax

```ebnf
SignalDecl  ::= ( "let" | "const" | "var" ) S RuneBinding ( S? "," S? ( RuneBinding | Binding ) )* S? ";"?
RuneBinding ::= Identifier S? ( ":" S? Type S? )? "=" S? Rune S? ( "<" Type ">" )? "(" Expression ")"
Rune        ::= "$signal" | "$derived" | "$store"
Binding     ::= Identifier ( S? "=" S? Expression )?
```

The analyzer's form: `let count = $signal(0);`

#### Semantics

Declares a reactive value. The declaration becomes
`const __count = signal(0, { name: 'file:count' })` (the debug name is dropped in a production build),
emitted before the setup body — or, when the initialiser reads a variable the body declares, right
after that declaration. A prop read in the initialiser is `ctx.prop.peek()`. Every other use of the
name is rewritten as the table in [The script and its rewrite](#the-script-and-its-rewrite) shows,
and the template receives the signal itself. `count++` and `count = x` are statements: the value of
the rewritten expression is `undefined`.

#### Rules

- `$signal` is read only as the whole initialiser of a named declarator, in a `let`/`const`/`var` at
  the start of a line, with or without a type argument — whatever the type holds: `Record<string,
  string>`, `(A & B)[]`, `() => void` (#275). Elsewhere in such a statement — an argument
  (`wrap($signal(1))`), a destructuring pattern, a statement that does not parse — it is
  `PDX_UNKNOWN_DECLARATION` (error), and nothing is generated for it. Inside a function the call is
  left as written, and `$signal` is not defined at run time — not checked today.
- A destructuring assignment to a signal (`[count] = pair`) is not rewritten, and `count` is not
  defined at run time — not checked today.
- A plain `let` the template reads and the script changes raises `PDX_NON_REACTIVE`.
- Changing the value in place — a mutating method (`items.push(x)`, `splice`, `sort`, a `Map`'s or
  `Set`'s `set`, `add`, `delete`, `clear`) or a write to a member (`user.name = v`, `items[0] = v`,
  `user.age++`) — sets nothing, so nothing that reads the signal updates: `PDX_SIGNAL_MUTATED_IN_PLACE`
  (warning), with a fix for `push` (`items = [...items, x]`) and a one-level field
  (`user = { ...user, name: v }`). It is reported in the script and in a template event handler
  (`@click="items.push(x)"`), where a name the template binds — a `@for` item or index, a `@let`, a
  slot's `let:`, an arrow parameter — is not the signal. A `:ref` target and a `$store` are not
  reported: setting an element's properties, and mutating a store in place, is what they are for.
- A signal nothing reads raises `PDX_UNUSED_REACTIVE` (info); a leading `_` silences it.
- A signal only ever incremented and read to be discarded raises `PDX_VERSION_COUNTER`.
- A fragment the rewriter cannot parse raises `PDX_REWRITE_FALLBACK`, and the signal is not called there.

#### Examples

```pdx
<template>
  <button @click="add">{{ count }}</button>
  <p>{{ name }}</p>
</template>

<script setup>
@prop start: number = 0;
let count = $signal(start);
let name = $signal<string>('Ada');

function add() {
  count++;
  count += 2;
  name = name + '!';
}
</script>
```

#### Since

alpha

### $derived

#### Syntax

```ebnf
DerivedDecl ::= SignalDecl /* with Rune = "$derived" */
```

The analyzer's form: `const total = $derived(price * quantity);`

#### Semantics

Declares a value computed from others: `const total = computed(() => __price() * __quantity(), { name })`.
The expression is rewritten like the body; an object literal is wrapped, `computed(() => ({ … }))`, and
an expression that is already an arrow function is passed as it is. The value is lazy and recomputed
when what it reads changes; a reader runs again only when the new value differs (`Object.is`). Reads
of it are `total()`. It is declared before the body when the body reads it, after the declaration it
reads when it reads a body variable.

#### Rules

- `$derived` values that read each other in a cycle raise `PDX_CIRCULAR_DERIVED`.
- Writing into the object a `$derived` returned raises `PDX_DERIVED_WRITE`.
- A `$derived` nothing reads raises `PDX_UNUSED_REACTIVE` (info).
- A trailing comma, `$derived(a * 2,)`, is JavaScript's and is dropped, as in `$signal` and `$store`.
- An expression the compiler cannot parse is left as written and raises `PDX_REWRITE_FALLBACK`
  (warning): the signals it names are not rewritten, so it does not update.
- The expression should only compute: a side effect is an `$effect` — not checked today.

#### Examples

```pdx
<template>
  <p>{{ quantity }} × {{ price }} = {{ total }}</p>
  <p>{{ line.label }}</p>
</template>

<script setup>
let price = $signal(10);
let quantity = $signal(2);
const total = $derived(price * quantity);
const line = $derived({ label: `${quantity} items` });
</script>
```

#### Since

alpha

### $effect

#### Syntax

```ebnf
EffectCall ::= "$effect" S? "(" S? Expression S? ")" S? ";"?
```

The analyzer's form: `$effect(() => { … });`

#### Semantics

A side effect that runs once at setup and again whenever a signal it read changes. The call becomes
`ctx.track(fn, { name: 'file.pdx:line' })` after the setup body (the name is dropped in production);
in a script-only file, `effect(fn, …)`. `ctx.track` disposes it when the component is disconnected.
A function the callback returns is its cleanup, run before each re-run and on dispose.

#### Rules

- `$effect(` is read only where a line starts with it at the top of the script. Inside a function, or
  as a value (`const stop = $effect(…)`), the call is left as written and `$effect` is not defined at
  run time — not checked today; `effect()` from `@pdxui/core` is the form for those places.
- An effect that writes state computed from what it reads raises `PDX_EFFECT_STATE`: that state is a
  `$derived`.

#### Examples

```pdx
<template>
  <p>{{ unread }} unread</p>
</template>

<script setup>
let unread = $signal(3);

$effect(() => {
  document.title = `${unread} unread`;
});
</script>
```

#### Since

alpha

### $watch

#### Syntax

```ebnf
WatchCall ::= "$watch" S? "(" S? Expression S? "," S? Expression ( S? "," S? Expression )? S? ")" S? ";"?
```

The analyzer's form: `$watch(source, (value, previous) => { … });`

#### Semantics

Runs a callback when one source changes, with the new and the previous value:
`watch(source, callback, options)` after the setup body. A source the rewrite changes (a signal, a
prop, an expression reading one) is passed as a getter, `() => __count()`; a function stays a
function; an array literal is a list of sources, each one a getter, and the callback receives arrays.
The options (`immediate`, `once`) are an expression rewritten like the body; a development build adds
`name: 'file.pdx:line'`.

#### Rules

- `$watch(` is read only where a line starts with it at the top of the script, like `$effect` — not
  checked today.
- The callback does not run at setup unless `{ immediate: true }`.
- A callback that writes a signal from what the watch reads (`$watch(query, () => { page = 1; })`)
  raises `PDX_EFFECT_STATE`, as an `$effect` does.

#### Examples

```pdx
<template>
  <input :value="query" @input="query = $event.target.value" />
</template>

<script setup>
let query = $signal('');
let page = $signal(1);

$watch(query, (value, previous) => {
  console.log(previous, '→', value);
});
$watch([query, page], ([q, p]) => console.log(q, p));
</script>
```

#### Since

alpha

### $emit

#### Syntax

```ebnf
EmitCall ::= "$emit" S? "(" S? Expression ( S? "," S? Expression )? S? ")"
```

The analyzer's form: `$emit('name', payload);`

#### Semantics

Dispatches an event by name, untyped. When the script or the template contains `$emit(`, the setup
declares `const $emit = (event, detail) => ctx.emit(event, detail);` and returns it to the template.
The event is the same `CustomEvent` an `@event` function dispatches; `@event` is the typed form and the
one to prefer.

#### Rules

- The event name is not checked against the `@event` declarations, and the payload is not typed.

#### Examples

```pdx
<template>
  <button @click="$emit('picked', 1)">Pick</button>
</template>

<script setup>
const label = 'Pick';
</script>
```

#### Since

alpha

### $t, $n, $d, $r

#### Syntax

```ebnf
I18nCall ::= ( "$t" | "$n" | "$d" | "$r" ) S? "(" S? Expression ( S? "," S? Expression )? S? ")"
```

The forms: `$t('key', params?)`, `$n(value, options?)`, `$d(value, options?)`, `$r(value, 'day')`.

#### Semantics

The locale functions of `@pdxui/core`, imported into the module when the script or the template calls
them. `$t(key, params?)` translates a key from the active locale's dictionary; `$n(value, options?)`
formats a number with `Intl.NumberFormat`; `$d(value, options?)` a `Date`, a timestamp or a date
string with `Intl.DateTimeFormat`; `$r(value, unit)` a number of `unit`s (`'day'`, `'hour'`, …) relative
to now with `Intl.RelativeTimeFormat`. Each reads the locale signal, so a template interpolation or a
`$derived` that calls one updates when the locale changes; a call at the top of the setup is evaluated
once.

#### Rules

- A key present in one locale's dictionary and missing in another raises `PDX_I18N_MISSING_KEY`
  (`pdx check --i18n`).
- `$r` takes a number and a unit, not a date.

#### Examples

```pdx
<template>
  <p>{{ $t('cart.total') }}: {{ $n(total, { style: 'currency', currency: 'EUR' }) }}</p>
  <p>{{ $d(created, { dateStyle: 'medium' }) }} · {{ $r(-3, 'day') }}</p>
</template>

<script setup>
let total = $signal(1234.5);
const created = new Date(2026, 0, 5);
</script>
```

#### Since

alpha

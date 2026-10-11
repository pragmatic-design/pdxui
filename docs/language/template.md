# The template

The `<template>` block is HTML with three additions: interpolation (`{{ }}`), bound attributes (`:`,
`::`, `@` in front of an attribute name) and block directives (`@if`, `@for`, …). This page defines the
`Template` production that [overview.md](overview.md) leaves open. The parser is
`packages/compiler/src/parser/template.ts`; attributes are rewritten by
`codegen-template-rewrite.ts` and bound at runtime by core's `renderer/template.ts`.

A template compiles along one of two **render paths**. The dev server, and a production build with
`pdx({ inlineBindings: false })`, use the **template path**: the template becomes an `html\`…\``
tagged template that core parses and binds at runtime (`codegen-template.ts`). A production build uses
the **inline path** by default: imperative `createElement` code (`codegen-template-inline.ts`). Where
a construct behaves differently on the two, its Rules say so.

```ebnf
Template       ::= ( Text | Comment | AtEscape | Element | Interpolation | Directive )*
Text           ::= /* any character run that starts none of the others */
Comment        ::= "<!--" /* any text */ "-->"
AtEscape       ::= "@@"
Element        ::= "<" ElementName ( S Attribute )* S? ( "/>" | ">" Template "</" ElementName S? ">" )
                 | DynamicComponent | SlotOutlet | SlotFill
ElementName    ::= [A-Za-z] [A-Za-z0-9-]*
Attribute      ::= AttrName ( "=" ( AttrValue | [^"'=<>`#x20#x9#xA]+ ) )?
                 | PropBinding | ClassBinding | StyleBinding | TwoWayBinding | EventBinding
                 | ShowBinding | RefBinding | GestureBinding
AttrName       ::= [A-Za-z_:] [A-Za-z0-9_:.-]*
AttrValue      ::= '"' [^"]* '"' | "'" [^']* "'"
Directive      ::= IfBlock | ForBlock | SwitchBlock | RequireBlock | ShowBlock | PortalBlock
                 | DeferBlock | AwaitBlock | TryBlock | LetDecl | SlotBlock | RawBlock
Paren          ::= "(" Expression ")"
Block          ::= S? "{" Template "}"
```

- **A comment is opaque.** Nothing inside `<!-- … -->` is read: `{{ x }}` or `@if` in a comment stays
  text, and the comment reaches the DOM as written.
- **`@@` writes one `@`.** A directive is `@` followed by one of the names in the parser's `DIRECTIVES`
  and then a blank, `(`, `{` or the end. Any other `@word` is text, unless it is followed by `(` or `{`
  and is within two edits of `if`, `for`, `switch`, `require`, `show`, `portal`, `defer`, `try`,
  `await` or `slot`: then the compile stops with `Unknown directive @fro … Did you mean @for?`.
  `@media (…)` inside a template stays text.
- **A block's braces are counted.** `Block` ends at the `}` that balances its `{`; a `{` or `}` in
  text inside a block — `<p>a { b</p>` — throws `Unclosed block`. Write `&#123;` and `&#125;`. Quotes
  count as string delimiters only after `=` and inside `{{ }}`.
- A parse error has no `PDX_*` code: the compile stops with the message and the line.

## Text

### `{{ }}` interpolation

#### Syntax

```ebnf
Interpolation  ::= "{{" S? Expression ( S? Pipe )* S? "}}"
```

`Pipe` is defined under `|` pipes, below.

#### Semantics

The expression is read in the component's scope: a free name becomes `ctx.name`, a signal read is
called. A bare name is passed as it is (`${ctx.count}`): the template binds the signal and updates
the text node when it changes. Any other expression becomes a getter, `${() => ctx.count() * 2}`,
which core runs in an `effect`. On the inline path every interpolation is a text node and
`effect(() => { t.data = interpolationText(…) })`. `null`, `undefined` and `false` render as empty
text, anything else as `String(value)` — `interpolationText` in core, used by both paths. A `Node` or
`DocumentFragment` value is inserted as nodes.

#### Rules

- A name the script does not declare is `PDX_UNDECLARED_REF` (error). Loop, slot and `@catch`/`@await`
  names, arrow parameters and `$event` are the template's own.
- `${…}` in text is `PDX_RAW_INTERPOLATION` (warning): it is evaluated once, when the template is
  built, and never updates.
- The end is the first `}}` outside a string and outside braces, so `{{ { a: 1 }.a }}` is read whole.
  An expression that starts with `{` compiles to `() => { … }` on the template path — a block, not an
  object — and the module does not parse. Not checked today.
- `{{ }}` inside an attribute value — `title="{{ n }}"` — is not a binding form. The template path
  emits `title="${ctx.n}"`; the inline path sets the attribute to `''` and spills the rest of the tag
  into the text. Bind with `:title="n"`. Not checked today.
- An array value renders its items on the template path and `String(array)` (`a,b`) on the inline
  path (#100).
- An unclosed `{{` stops the compile: `Unclosed interpolation`.

#### Examples

```pdx
<template>
  <p>{{ name }} has {{ count }} {{ count === 1 ? 'message' : 'messages' }}</p>
  <p>{{ user?.email }}</p>
  <p>Contact: help@@example.com</p>
  <!-- {{ count }} here is a comment, not an interpolation -->
</template>

<script setup>
let name = $signal('Ada');
let count = $signal(3);
let user = $signal<{ email: string } | null>(null);
</script>
```

#### Since

alpha

### `|` pipes

#### Syntax

```ebnf
Pipe           ::= "|" S? Identifier ( "(" Expression ( S? "," S? Expression )* ")" )?
```

A `|` is a pipe only at depth zero, outside strings: `||`, `|=` and a `|` inside `( )`, `[ ]`, `{ }` or
quotes are part of the expression (`splitPipes` in the parser).

#### Semantics

Each pipe names a function the script declares or imports; the value goes through them left to
right, and the text follows the signals the value reads. Both render paths compile
`{{ price | money }}` to core's value chain, `templatePipe(ctx.price(), ctx.money)`, and a pipe with
arguments, `money('EUR')`, to `(v) => ctx.money(v, 'EUR')`: the value first, then the arguments. A
function the script imports is called by its own name, `fmt`, not `ctx.fmt`.

#### Rules

- A pipe name that the script neither declares nor imports raises `PDX_UNDECLARED_REF`.
- `{{ money(price) }}` is the same call written directly; a pipe chain reads left to right where nested
  calls read inside out.

#### Examples

```pdx
<template>
  <p>{{ price | money }}</p>
  <p>{{ price | money | upper }}</p>
  <p>{{ price | currency('EUR') }}</p>
</template>

<script setup>
let price = $signal(12.5);
function money(value: number) { return value.toFixed(2); }
function upper(value: string) { return value.toUpperCase(); }
function currency(value: number, code: string) { return `${value.toFixed(2)} ${code}`; }
</script>
```

#### Since

alpha

## Attributes

An attribute without a prefix is written as it is. The forms below are bindings: their value is an
`Expression` in the component's scope, written in quotes, never with `${ }`.

### `:name` property and attribute binding

#### Syntax

```ebnf
PropBinding    ::= ":" BoundName ( "=" AttrValue )?
BoundName      ::= [A-Za-z_] [A-Za-z0-9_-]*
```

The quoted value is an `Expression`. `:name` with no value is shorthand for `:name="name"`.

#### Semantics

`:title="expr"` compiles to `:title=${…}`: a bare signal name is passed as it is, any other
expression as a getter, `() => …`. Core's `bindProperty` decides where the value goes: `aria-*` and
`data-*` names, a name an SVG element can only hold as an attribute, and a name a plain element does
not have as a property (`itemprop`, `pdx-theme`) are set with `setAttribute` — removed for `null` or
`false`, `''` for `true`; anything else is assigned as a property (`tabindex` → `tabIndex`, the
mapping is `ATTR_TO_PROP`). On a custom element (a tag with `-`) a kebab-case name is its camelCase
prop. `href`, `src`, `action`, `formaction`, `xlink:href` and `poster` go through
`sanitizeBoundUrl`, so a `javascript:` value is dropped. A binding writes only when its value changes.
On the inline path the same rule is generated inline, in one `effect` per binding.

#### Rules

- `${…}` inside a bound value — `:title="${n}"` — is `PDX_RAW_INTERPOLATION_IN_BINDING` (error, the
  compile stops). A template literal inside the expression, `` :class="`btn-${size}`" ``, is fine.
- `${…}` in an unbound attribute — `title="${n}"` — is `PDX_RAW_INTERPOLATION` (warning): it is
  evaluated once and escaped as text.
- On a known library component, a bound name that is not one of its props is `PDX_UNKNOWN_PROP`
  (warning), one that matches a prop only ignoring case is `PDX_PROP_NAME_CASE` (warning), and a
  literal value outside a prop's declared values is `PDX_INVALID_ENUM_VALUE` (warning). The plugin
  passes what it knows of the components; a bare `compile()` has no list and checks none of them.
- **The shorthand `:name` without a value works only on the template path.** The inline path emits
  `const __b = ;` and the production module does not parse. Not checked today (#200).
- The template path also accepts `:name="${expr}"` and strips the `${ }` — but the check above stops
  the compile first.

#### Examples

```pdx
<template>
  <a :href="url" :title="label + ' (opens the profile)'" :aria-current="active ? 'page' : null">{{ label }}</a>
  <input :disabled="busy" :maxlength="limit" :data-row="7" />
</template>

<script setup>
let url = $signal('/users/7');
let label = $signal('Ada');
let active = $signal(true);
let busy = $signal(false);
let limit = $signal(40);
</script>
```

#### Since

alpha

### `:class`, `:class.name`

#### Syntax

```ebnf
ClassBinding   ::= ":class" "=" AttrValue
                 | ":class" "=" ( '"{' ClassPair ( "," ClassPair )* '}"' | "'{" ClassPair ( "," ClassPair )* "}'" )
                 | ":class." ClassName "=" AttrValue
ClassPair      ::= S? ( ClassName | StringLiteral ) S? ":" S? Expression S?
ClassName      ::= [A-Za-z_-] [A-Za-z0-9_-]*
```

#### Semantics

`:class="expr"` binds a string of classes. It merges with a static `class="…"`: each new value
removes the classes the binding wrote last and adds its own, and never removes a static class.
`:class.active="cond"` toggles one class, `classList.toggle('active', !!cond)`. The object form
`:class="{ active: on, big: n > 2 }"` is split by the compiler into one `:class.name` toggle per pair.

#### Rules

- **The object form works only on the template path.** The inline path binds the object as a string,
  `class="[object Object]"` (#96). Not checked today. `:class.name` works on both.
- The object form is recognised only when the whole value is one `{ … }`; a value that merely
  contains an object is the string form. Not checked today.

#### Examples

```pdx
<template>
  <li class="row" :class="tone" :class.selected="picked" :class.done="progress === 100">{{ label }}</li>
</template>

<script setup>
let tone = $signal('row-info');
let picked = $signal(false);
let progress = $signal(40);
let label = $signal('Upload');
</script>
```

#### Since

alpha

### `:style`, `:style.name`

#### Syntax

```ebnf
StyleBinding   ::= ":style" "=" AttrValue
                 | ":style" "=" ( '"{' StylePair ( "," StylePair )* '}"' | "'{" StylePair ( "," StylePair )* "}'" )
                 | ":style." CssProperty "=" AttrValue
StylePair      ::= S? ( Identifier | StringLiteral ) S? ":" S? Expression S?
CssProperty    ::= [A-Za-z-] [A-Za-z0-9-]*
```

#### Semantics

`:style="expr"` writes the string to `style.cssText`. `:style.color="c"` sets one property with
`style.setProperty('color', String(c ?? ''))`. The object form `:style="{ fontSize: size }"` is split
into one `:style.name` per pair, the key turned to kebab-case (`fontSize` → `font-size`).

#### Rules

- **The object form works only on the template path.** The inline path assigns the object to
  `el.style`, which keeps nothing (#96). Not checked today. `:style.name` works on both.
- A custom property is a `:style.name` too: `:style.--accent="c"`. Not checked today.

#### Examples

```pdx
<template>
  <div class="bar" :style.width="percent + '%'" :style.background-color="colour"></div>
</template>

<script setup>
let percent = $signal(40);
let colour = $signal('var(--pdx-color-primary)');
</script>
```

#### Since

alpha

### `::name` two-way binding

#### Syntax

```ebnf
TwoWayBinding  ::= "::" BoundName ( "." TwoWayModifier )* "=" AttrValue
TwoWayModifier ::= "trim" | "number" | "lazy"
```

The quoted value is the name of a `$signal` (or a prop).

#### Semantics

`::value="name"` compiles to `::value=${ctx.name}` — the signal itself, not its value — and core's
`bindTwoWay(el, 'value', signal)` binds it, on both paths. Signal to element: an `effect` assigns the
property. Element to signal: on an `<input>` or `<textarea>` the `input` event (`change` for
`checked`), on a `<select>` `change`, on a custom element its `pdx-input` and `pdx-change` events,
whose value is the `detail` field named like the bound property, else `detail.value`, else the
element's property. `.lazy` listens
to `change` / `pdx-change` only; `.trim` trims a string; `.number` writes `Number(value) || 0`.

#### Rules

- A value that is not a signal (no `.set`) falls back to a one-way `:name` binding. Not checked
  today.
- A modifier other than the three is ignored. Not checked today.
- On a plain element other than `input`, `textarea` and `select`, the event listened to is
  `pdx-<name>`, which nothing dispatches: the binding is one-way. Not checked today.

#### Examples

```pdx
<template>
  <input ::value.trim="name" />
  <input type="number" ::value.number="age" />
  <input type="checkbox" ::checked="subscribed" />
  <select ::value="country">
    <option value="it">Italy</option>
    <option value="fr">France</option>
  </select>
  <p>{{ name }}, {{ age }}, {{ subscribed }}, {{ country }}</p>
</template>

<script setup>
let name = $signal('');
let age = $signal(30);
let subscribed = $signal(false);
let country = $signal('it');
</script>
```

#### Since

alpha

### `@name` event listeners

#### Syntax

```ebnf
EventBinding   ::= "@" EventName ( "." EventModifier )* "=" AttrValue
EventName      ::= [A-Za-z_] [A-Za-z0-9_-]*
EventModifier  ::= "prevent" | "stop" | "self" | "once" | "capture" | "passive" | KeyFilter
KeyFilter      ::= "enter" | "escape" | "space" | "tab" | "delete" | "up" | "down" | "left" | "right"
Handler        ::= Reference | Arrow | Statement ( ";" Statement )*
Reference      ::= Identifier ( "." Identifier )*
Arrow          ::= ( Identifier | "(" /* parameters */ ")" ) S? "=>" S? ( Expression | "{" /* statements */ "}" )
Statement      ::= Identifier S? ( "++" | "--" ) | ( "++" | "--" ) S? Identifier
                 | Identifier S? ( "=" | "+=" | "-=" | "*=" | "/=" | "%=" ) S? Expression
                 | Expression
```

The quoted value is a `Handler`.

#### Semantics

The handler is built by `buildEventHandler` (both paths):

- a **reference**, `save` or `form.reset`, is passed as the listener: the event is its first argument;
- an **arrow**, `e => last = e.button`, is kept, its parameters local and its body rewritten;
- **one statement** becomes `() => …`: a signal named bare is written through `.set` — `count++` is
  `ctx.count.set(v => v + 1)`, `open = !open` is `ctx.open.set(!ctx.open())`, `n += 2` is
  `ctx.n.set(v => v + (2))` — and any other expression is called as written, `save(item)`;
- **several statements**, separated by `;`, become `($event) => { …; … }`, each rewritten the same way.

`$event` is the event: a handler that mentions it is `($event) => …`. The result is wrapped as
`safeHandler(batchHandler(handler), tag, 'click')`: every write in it lands in one `batch()`, and an
error, or the rejection of a promise it returns, goes to the global error interceptor. Core's
`bindEvent` adds the listener: `.once`, `.capture` and `.passive` are `addEventListener` options; the
others run in a wrapper, in this order — `.self` (only when `target === currentTarget`), the key
filters (`.delete` is `Delete` or `Backspace`, the arrows are `ArrowUp` …), then `.prevent` and
`.stop` — before the handler.

#### Rules

- A name the script does not declare is `PDX_UNDECLARED_REF` (error).
- `${…}` in the value is `PDX_RAW_INTERPOLATION_IN_BINDING` (error).
- Only a bare signal name is rewritten into `.set`. `user.name = x` assigns a field of the signal's
  current value, which notifies nothing. Not checked today.
- A modifier that is not in the list — `.ctrl`, `.meta` — is ignored. Not checked today.
- A key filter applies to keyboard events only on the template path; on the inline path it applies
  to every event, so `@click.enter` never fires (#100).
- A component's events: the parent listens with the name the child dispatches, lowercase — HTML
  lowercases attribute names. The child's declaration is checked (`PDX_EVENT_NAME_CASE`, see
  [script.md](script.md)); the listener is not.

#### Examples

```pdx
<template>
  <button @click="count++">+1</button>
  <button @click="open = !open">Toggle</button>
  <button @click="save" @dblclick="select($event); count += 2">Save</button>
  <input @keydown.enter.prevent="send()" @mouseup="e => last = e.button" />
  <div class="overlay" @click.self="open = false"></div>
  <p>{{ count }} {{ open }} {{ last }}</p>
</template>

<script setup>
let count = $signal(0);
let open = $signal(false);
let last = $signal(0);
function save(event: Event) { console.log(event.type); }
function select(event: Event) { console.log(event.type); }
function send() { console.log('sent'); }
</script>
```

#### Since

alpha

### `:show`

#### Syntax

```ebnf
ShowBinding    ::= ":show" "=" AttrValue
```

#### Semantics

`:show="cond"` sets `style.display` to `''` when the condition is truthy and `'none'` when not, in an
`effect` (core's `bindShow`; inline, the same `effect`). The element stays in the DOM, with its state
and its listeners. `@if` removes and recreates it instead.

#### Rules

- Showing clears the inline `display` (`''`) and hands it back to the stylesheet: an element a rule
  hides with `display: none` stays hidden. Not checked today.

#### Examples

```pdx
<template>
  <button @click="expanded = !expanded">Details</button>
  <section :show="expanded">Kept in the DOM while hidden.</section>
</template>

<script setup>
let expanded = $signal(false);
</script>
```

#### Since

alpha

### `:ref`, `ref`

#### Syntax

```ebnf
RefBinding     ::= ( ":ref" | "ref" ) "=" AttrValue
```

The quoted value names a signal.

#### Semantics

`:ref="box"` and `ref="box"` both compile to `:ref=${ctx.box}`: the signal itself. When the element
is built, core's `bindRef` calls `box.set(element)`; the inline path does the same. Read it after the
mount — in `onMount`, an `$effect` or a handler — as `box`, like any signal.

#### Rules

- A value that is not a signal (no `.set`) is ignored without a word: declare the ref as
  `let box = $signal(null);`. Not checked today.

#### Examples

```pdx
<template>
  <input :ref="field" />
  <button @click="focus()">Focus</button>
</template>

<script setup>
let field = $signal<HTMLInputElement | null>(null);
function focus() { field?.focus(); }
</script>
```

#### Since

alpha

### `@swipe`, `@longpress`, `@pinch`

#### Syntax

```ebnf
GestureBinding ::= "@swipe." ( "left" | "right" | "up" | "down" ) "=" AttrValue
                 | ( "@longpress" | "@pinch" ) "=" AttrValue
```

#### Semantics

The compiler rewrites them into `@__swipe=${['left', handler]}`, `@__longpress=${handler}` and
`@__pinch=${handler}`, meant for core's `onSwipe`, `onLongpress` and `onPinch` (`renderer/dom.ts`
`setProp`). A value with `(` becomes `() => …`; any other is used as written — a reference, or an
expression evaluated once, when the template is built (`n++` runs at render).

#### Rules

- **No gesture is wired today, on either path** (#99): the template path routes the rewritten name to
  `addEventListener('__swipe', …)`, which nothing dispatches, and the inline path listens to `swipe`
  with `.left` read as a key filter. Call `onSwipe(el, 'left', fn)` from `@pdxui/core` on a `:ref`
  instead. Not checked today.

#### Examples

```pdx
<template>
  <div class="card" @swipe.left="next()" @longpress="pin">{{ index }}</div>
</template>

<script setup>
let index = $signal(0);
function next() { index++; }
function pin() { console.log('pinned'); }
</script>
```

This compiles, and does nothing when swiped (see Rules).

#### Since

alpha

## Components and slots

### `<component :is>`, `@keepAlive`

#### Syntax

```ebnf
DynamicComponent ::= "<component" S ":is=" AttrValue ( S DynamicOption )* S? ( "/>" | ">" )
DynamicOption    ::= PropBinding | "@keepAlive" | "keep-alive"
                   | "@transition" S? "(" StringLiteral ( S? "," S? StringLiteral )? ")"
                   | "@mode" S? "(" StringLiteral ")"
```

#### Semantics

The tag becomes `dynamic(() => tag, () => ({ prop: … }), { keepAlive, transition, mode })`. `:is` is an
expression giving a tag name; when it changes, the element is replaced (`<component>` itself is never
in the DOM). Each other `:prop` is passed to the element, camelCased (`:item-label` → `itemLabel`).
With `@keepAlive` an element left behind is hidden, not destroyed, and shown again when its tag comes
back; the cache keeps at most 10, least recently used first out. `@transition('in', 'out')` animates
the swap, `@mode('out-in')` sequences it.

#### Rules

- **`<component :is>` works only on the template path.** The inline path builds a literal
  `<component>` element with `is` and the props as properties, and `@keepAlive` as an event listener
  with an empty handler: the production module does not parse. Not checked today (#200).
- Only `:is`, `:prop` bindings and the three options are read; an `@event`, a `::` binding or a plain
  attribute on `<component>` is dropped. Not checked today.
- The tags it may render must be registered: the auto-import reads the tags written in the markup,
  not a name held in a signal. Not checked today.

#### Examples

```pdx
<template>
  <button @click="view = view === 'pdx-tab-list' ? 'pdx-tab-grid' : 'pdx-tab-list'">Switch</button>
  <component :is="view" :item-label="label" @keepAlive />
</template>

<script setup>
let view = $signal('pdx-tab-list');
let label = $signal('Orders');
</script>
```

#### Since

alpha

### `<slot :name>` scoped slot outlet

#### Syntax

```ebnf
SlotOutlet     ::= "<slot" ( S "name=" AttrValue )? ( S ":" Identifier "=" AttrValue )+ S?
                   ( "/>" | ">" Template "</slot>" )
```

A `<slot>` with no `:` binding (and no `let:`) is plain HTML.

#### Semantics

In the child, `<slot name="row" :item="first">fallback</slot>` compiles to
`renderSlot(ctx.__slots, 'row', () => ({ item: … }), () => html\`fallback\`)`: the parent's fill for
`row` is rendered with `{ item }` as its scope, and the content between the tags when the parent
gives none. `name` defaults to `default`. Declare what a slot passes with `@slot` in the script
([script.md](script.md)), e.g. `@slot name: { row: Item };`.

#### Rules

- **It works only on the template path.** The inline path builds a literal `<slot>` element with the
  bound names as its properties, and the scope never reaches the parent's fill. Not checked today (#200).
- A bound name is `[A-Za-z0-9_]+`: no `-`. Not checked today.

#### Examples

```pdx
<template>
  <ul>
    <slot name="row" :item="first" :index="0">
      <li>{{ first }}</li>
    </slot>
  </ul>
</template>

<script setup>
@slot row: { item: string, index: number };
let first = $signal('Ada');
</script>
```

#### Since

alpha

### `@slot`, `<slot let:name>`

#### Syntax

```ebnf
SlotBlock      ::= "@slot" S? "(" S? SlotName S? ( "," S? SlotScope S? )? ")" Block
SlotScope      ::= "{" S? Identifier ( S? "," S? Identifier )* S? "}" | Identifier
SlotFill       ::= "<slot" ( S "name=" AttrValue )? ( S "let:" Identifier )+ S? ( "/>" | ">" Template "</slot>" )
SlotName       ::= [^,)]+
```

#### Semantics

The parent's side of a scoped slot, written inside the child component's tag.
`@slot(row, { item, index }) { … }` and `<slot name="row" let:item let:index>…</slot>` are the same
node: the body is hoisted out of the template as `const __pdxSlot_row_0 = (__scope) => { const {
item, index } = __scope; return html\`…\`; }` and the tag gets `slotCarrier('row', __pdxSlot_row_0)`.
The child calls it with its scope. `@slot(row)` takes no scope; `<slot>` without a `name` fills
`default`. The scope names are local to the body. Both paths hoist the same function.

#### Rules

- `@slot(name, item)` with one bare name destructures `{ item }` from the scope; it is not the whole
  scope object. Not checked today.
- A slot name need not be an identifier (`col:price`, `empty-state`). Not checked today.
- A `<slot let:…>` must have its `</slot>`, or be self-closing (then it has no body). Not checked
  today.
- The `@slot` script declaration (`@slot name: { row: Item };`) is the child's, in
  [script.md](script.md); this is the parent's.

#### Examples

```pdx
<template>
  <pdx-user-table>
    @slot(row, { user, index }) {
      <span>{{ index }}. {{ user.name }}</span>
    }
    <slot name="empty" let:query>
      <p>No user matches {{ query }}.</p>
    </slot>
  </pdx-user-table>
</template>

<script setup>
</script>
```

#### Since

alpha

## Block directives

A block directive is `@name`, an optional `Paren`, and a `Block`. The condition, collection or value
in the parentheses is an `Expression` in the component's scope.

### `@if`, `@else`

#### Syntax

```ebnf
IfBlock        ::= "@if" S? Paren S? BlockTransition? Block ( S? "@else" S? ( ( "@if" | "if" ) S? Paren S? BlockTransition? Block | Block ) )*
```

`BlockTransition` is defined under `@transition`, below.

#### Semantics

`when(() => cond, () => html\`…\`, () => html\`…\`, options)`: the body is rendered while the
condition is truthy, the `@else` body while it is not, and a branch is built again only when the
truthiness changes. A branch's effects are disposed with it. `@else if (…)` and `@else @if (…)` nest a
second `when` in the else branch. In a production build on the template path a literal `true` or
`false` condition is folded away.

#### Rules

- `@else` with no `@if` just before it stops the compile: `Unexpected @else … no matching @if`.
- A block body must start with `{`: `Expected '{'`.
- A `@transition` on the `@if` applies to its two branches, not to a nested `@else if`.

#### Examples

```pdx
<template>
  @if (user) {
    <p>Welcome, {{ user.name }}</p>
  } @else if (loading) {
    <p>Signing in…</p>
  } @else {
    <button @click="loading = true">Sign in</button>
  }
</template>

<script setup>
let user = $signal<{ name: string } | null>(null);
let loading = $signal(false);
</script>
```

#### Since

alpha

### `@for`, `@empty`

#### Syntax

```ebnf
ForBlock       ::= "@for" S? "(" S? Expression S "as" S Binding ( S? "," S? Identifier )? S? ";" S? "track" S Expression S? ")"
                   S? BlockTransition? Block ( S? "@empty" Block )?
Binding        ::= Identifier | /* an object or array destructuring pattern */
```

#### Semantics

`@for (items as item, i; track item.id)` renders the body once per element of the collection, keyed by
the `track` expression. A plain `item` compiles to `eachRow(() => ctx.items(), 'id', (item, i) => …)`:
`item` and `i` are getters, so a row reused for the same key reads the current object and position
(`{{ item.name }}` is `() => item().name`). A destructured binding compiles to `each(…)`, its names
bound once from the object the row was created with. `track item.field` is passed as the field name;
any other key is a function, `(item, i) => …`. Rows are moved, not rebuilt, by a keyed
reconciliation. `@empty` wraps the loop in `when(() => items?.length > 0, …, () => html\`…\`)`.

#### Rules

- `as` and `; track` are required: `Invalid @for syntax` stops the compile.
- A destructured binding — `@for (pairs as { key, value }; track key)` — compiles on both paths, but
  the check for undeclared names takes the whole pattern as one name and reports each name in it as
  `PDX_UNDECLARED_REF` (error). Bind a plain item and read its fields (#201).
- An empty body is `PDX_EMPTY_FOR` (warning).
- The key must be unique and stable: a changing field in it recreates the row. Not checked today.
- On the template path in a production build with `inlineBindings: false`, a loop whose body reads a
  signal that does not depend on the row has that read hoisted into one `computed` — and then its
  `@empty` is dropped. Not checked today. The default inline path keeps it.

#### Examples

```pdx
<template>
  <ul>
    @for (todos as todo, i; track todo.id) {
      <li :class.done="todo.done">{{ i + 1 }}. {{ todo.text }}</li>
    } @empty {
      <li>Nothing to do.</li>
    }
  </ul>
</template>

<script setup>
let todos = $signal([{ id: 1, text: 'Write', done: false }]);
</script>
```

#### Since

alpha

### `@transition`, `@stagger`, `@mode`, `@move`

#### Syntax

```ebnf
BlockTransition ::= "@transition" S? "(" Name ( S? "," S? Name )? ")" ( S? "@stagger" S? "(" Number ")" )?
                    ( S? "@mode" S? "(" Name ")" )? ( S? Move )?
                  | Move
Move            ::= "@move" S? "(" Number? ")"
Name            ::= StringLiteral | [A-Za-z0-9_-]+
Number          ::= [0-9]+ ( "." [0-9]+ )?
```

Written between the parentheses and the body of an `@if` or a `@for`, in this order. The page rune
`@transition 'fade';` in a script is another construct, in [routing.md](routing.md).

#### Semantics

They become the last argument of the block's `when` / `each` / `eachRow`:
`{ enter, exit, stagger, mode, move }`. `@transition('fade')` uses one name for both,
`@transition('slide-up', 'fade')` names enter and exit. Entering, an element gets the classes
`pdx-<name> pdx-enter-from`, then `pdx-enter-active` until its `transitionend`; leaving,
`pdx-<name> pdx-exit-from`, then `pdx-exit-active`, and it is removed after. `@stagger(ms)` delays
the enter of the i-th node by `ms × i`. `@mode('out-in')` waits for the old branch to leave before the new
one enters. `@move(ms)` animates a `@for` row that changes index, with FLIP; `@move()` is 300 ms.

#### Rules

- `@stagger` and `@mode` are read only after a `@transition`; alone they stop the compile with
  `Expected '{'`. `@move` may stand alone.
- **What the runtime reads differs by block.** On `@if`, `when` reads `enter`, `exit`, `stagger` (over
  the branch's top-level nodes) and `mode` — only `'out-in'` sequences, any other is simultaneous —
  and ignores `move`. On `@for` the list reconciler reads `enter`, `exit` and `move` only: `@stagger`
  and `@mode` are accepted and have no effect. Not checked today (#207).
- The classes only animate if CSS defines a transition for them. Not checked today.
- Both render paths pass the same options (`generateTransition`).

#### Examples

```pdx
<template>
  <button @click="open = !open">Toggle</button>
  @if (open) @transition('fade') {
    <p>Fades in and out.</p>
  }
  <ul>
    @for (rows as row; track row.id)
    @transition('slide-up', 'fade') @move(200) {
      <li>{{ row.label }}</li>
    }
  </ul>
</template>

<script setup>
let open = $signal(true);
let rows = $signal([{ id: 1, label: 'First' }, { id: 2, label: 'Second' }]);
</script>
```

#### Since

alpha

### `@switch`, `@case`, `@default`

#### Syntax

```ebnf
SwitchBlock    ::= "@switch" S? Paren S? "{" ( S? CaseClause )* ( S? "@default" Block )? ( S? CaseClause )* S? "}"
CaseClause     ::= "@case" S? "(" CaseValue ")" Block
CaseValue      ::= StringLiteral | [^)]+
```

#### Semantics

`match(() => value, { 'a': () => html\`…\`, _: () => html\`…\` })`: the case whose value equals
`String(value)` is rendered, `@default` (`_`) when none does, nothing when there is no default. The
rendered case is kept while the value stays on it.

#### Rules

- A case value is a literal, not an expression: one pair of quotes is stripped and the rest is the
  key. `@case (1)` matches the number `1`; `@case (Status.Open)` matches the string `"Status.Open"`.
  Not checked today.
- Inside the braces only `@case` and `@default` are allowed: anything else stops the compile.
  `@case` or `@default` outside a `@switch` stops it too.

#### Examples

```pdx
<template>
  @switch (status) {
    @case ('open') { <span class="pdx-badge">Open</span> }
    @case ('closed') { <span class="pdx-badge">Closed</span> }
    @default { <span>Unknown</span> }
  }
</template>

<script setup>
let status = $signal('open');
</script>
```

#### Since

alpha

### `@require`

#### Syntax

```ebnf
RequireBlock   ::= "@require" S? "(" Permission ")" Block ( S? "@else" Block )?
Permission     ::= StringLiteral | [^)]+
```

#### Semantics

`requirePermission('admin.users', () => html\`…\`, () => html\`…\`)`: the body renders when core's
permission checker (`setPermissions`) grants the permission, the `@else` body when it does not, and the
block follows when the permissions change.

#### Rules

- The permission is a literal; one pair of quotes is stripped. An expression is not evaluated. Not
  checked today.
- `@else` takes a body only: `@else if` after `@require` stops the compile.

#### Examples

```pdx
<template>
  @require ('users.delete') {
    <button>Delete</button>
  } @else {
    <span>Read only</span>
  }
</template>

<script setup>
</script>
```

#### Since

alpha

### `@show`

#### Syntax

```ebnf
ShowBlock      ::= "@show" S? Paren Block
```

#### Semantics

`show(() => cond, html\`…\`)`: the body is rendered once, and its top-level elements get
`style.display = 'none'` while the condition is falsy. Unlike `@if`, nothing is removed.

#### Rules

- Only top-level **elements** are hidden: text directly in the body stays visible. Wrap it. Not
  checked today.

#### Examples

```pdx
<template>
  @show (advanced) {
    <fieldset>
      <label>Timeout <input type="number" /></label>
    </fieldset>
  }
</template>

<script setup>
let advanced = $signal(false);
</script>
```

#### Since

alpha

### `@portal`

#### Syntax

```ebnf
PortalBlock    ::= "@portal" S? "(" Target ")" Block
Target         ::= StringLiteral | [^)]+
```

#### Semantics

`portal(() => html\`…\`, 'body')`: the body is rendered into the first element matching the target
selector, `document.querySelector(target)`, and stays owned by this component — its effects are
disposed with it. If the target is not there yet it is looked up again on the next animation frames,
up to 60.

#### Rules

- The target is a literal selector; one pair of quotes is stripped. Not checked today.
- A target never found leaves the body unrendered, with a console warning in dev. Not checked today.

#### Examples

```pdx
<template>
  @if (open) {
    @portal ('body') {
      <div class="pdx-overlay" @click="open = false">Close</div>
    }
  }
</template>

<script setup>
let open = $signal(false);
</script>
```

#### Since

alpha

### `@defer`, `@placeholder`, `@loading`, `@error`

#### Syntax

```ebnf
DeferBlock     ::= "@defer" S? "(" Trigger ( S? "|" S? Trigger )* ")" Block ( S? ( "@placeholder" | "@loading" | "@error" ) Block )*
Trigger        ::= "viewport" | "idle" ( "(" [0-9]+ ")" )? | "hover" | "interaction" | "timer(" [0-9]+ ")" | "immediate"
```

#### Semantics

`defer({ trigger, placeholder, loading, error }, loadFn, () => html\`…\`)`. `@placeholder` shows
until a trigger fires; `|` means any of them. `viewport` fires when the block is within 100px of the
viewport, `idle` on an idle callback (`idle(ms)` times out after `ms`, 2000 by default), `hover` and
`interaction` on the first `pointerenter` or `focusin` on the element the block sits in, `timer(ms)`
after `ms`, `immediate` at once. Then
the block loads the components its body uses — `loadFn` is `() => Promise.all([import(…)])` for every
`<pdx-…>` tag in the body whose module the plugin resolves, so they leave the route's chunk — showing `@loading` (or the placeholder),
and renders the body; if the load fails it shows `@error`.

#### Rules

- The trigger is not an expression and not quoted: `@defer ('viewport')` names the trigger
  `'viewport'` with its quotes, which is unknown, and an unknown trigger fires at once. Not checked
  today.
- `@error` here takes no parameters: `@error (e)` stops the compile with `Expected '{'`. The error and
  a retry are not available to its body.
- Each sub-block may follow in any order; a second one of the same kind replaces the first.
- `@placeholder`, `@loading` or `@error` with no `@defer` or `@await` before it stops the compile.

#### Examples

```pdx
<template>
  @defer (viewport | idle(3000)) {
    <pdx-chart></pdx-chart>
  } @placeholder {
    <div class="pdx-skeleton"></div>
  } @loading {
    <p>Loading the chart…</p>
  } @error {
    <p>The chart could not be loaded.</p>
  }
</template>

<script setup>
</script>
```

#### Since

alpha

### `@await`, `@loading`, `@error`

#### Syntax

```ebnf
AwaitBlock     ::= "@await" S? Paren S? AwaitTiming? Block ( S? ( "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
AwaitTiming    ::= "{" S? TimingOption ( S? "," S? TimingOption )? S? "}"
TimingOption   ::= ( "minMs" | "maxMs" ) S? ":" S? [0-9]+
ErrorNames     ::= "(" S? Identifier ( S? "," S? Identifier )? S? ")"
```

#### Semantics

`when(() => awaitReady(value), () => html\`…\`, () => html\`…\`)`. A promise shows `@loading` while
pending and the body once fulfilled; any other value is a condition, the body while it is truthy.
With `@error`, the whole is wrapped in `errorBoundary(…, (err, retry) => html\`…\`, { resetOn: () =>
value })`: a rejection shows `@error`, the first name being the error (`err` by default) and the second
a function that renders the block again (`retry` by default); a new promise in the awaited expression
leaves `@error` and awaits it. With timing the switch is `awaitTimed(…, { minMs, maxMs })`: `@loading`
is held back for `minMs`, so a fast answer never flashes it, and after `maxMs` the body is rendered
even if the promise is still pending.

#### Rules

- No `@loading` is `PDX_AWAIT_NO_LOADING` (info).
- The expression must give the same promise every time it is read: `@await (load())` makes a new one
  on every re-run and never settles. Keep the promise in a signal. Not checked today.
- The resolved value is not handed to the body: read it from where the promise wrote it. Not checked
  today.
- `@error` takes at most two names, distinct identifiers; anything else stops the compile.
- **A second name other than `retry` is not in scope**: `@error (e, again)` compiles `again()` as
  `ctx.again()`, on both paths. Use `retry`. Not checked today (#201).
- The timing block is recognised only when it contains `minMs` or `maxMs`; it is not an expression.

#### Examples

```pdx
<template>
  @await (job) { minMs: 200 } {
    <p>{{ result }}</p>
  } @loading {
    <p>Loading…</p>
  } @error (err, retry) {
    <p>{{ err.message }}</p>
    <button @click="retry()">Try again</button>
    <button @click="reload()">Start over</button>
  }
</template>

<script setup>
let result = $signal('');
let job = $signal(load());
function load() { return fetch('/api/report').then((r) => r.text()).then((t) => { result = t; }); }
function reload() { job = load(); }
</script>
```

#### Since

alpha

### `@try`, `@catch`

#### Syntax

```ebnf
TryBlock       ::= "@try" Block S? "@catch" S? "(" S? Identifier ( S? "," S? Identifier )? S? ")" Block
```

#### Semantics

`errorBoundary(() => html\`…\`, (err, retry) => html\`…\`)`: an error thrown while the body renders,
or by one of its effects, replaces the body with the `@catch` body. The first name is the error; the
second, `retry` when omitted, renders the body again.

#### Rules

- `@catch` is required right after the body: `Expected @catch after @try`.
- At most two names, valid identifiers, not the same twice; anything else stops the compile.
- **Only some names are in scope in the `@catch` body today**: the two names are not added to the
  template's scope, and a name works only if the compiler already leaves it unprefixed — `e`, `err`,
  `error` and `retry` among them, and only when the script declares no name of its own like it.
  `@catch (problem)` compiles `{{ problem.message }}` as `ctx.problem().message`, on both paths. Write
  `@catch (err, retry)`. Not checked today (#201).

#### Examples

```pdx
<template>
  @try {
    <p>{{ total(order) }}</p>
  } @catch (err, retry) {
    <p class="error">{{ err.message }}</p>
    <button @click="retry()">Retry</button>
  }
</template>

<script setup>
let order = $signal({ lines: [2, 3] });
function total(o: { lines: number[] }) { return o.lines.reduce((a, b) => a + b, 0); }
</script>
```

#### Since

alpha

### `@let`

#### Syntax

```ebnf
LetDecl        ::= "@let" S [A-Za-z0-9_]+ S? "=" S? Expression ";"
```

The `;` ends the declaration at depth zero, outside strings.

#### Semantics

`@let total = price * qty;` evaluates the expression once, when the enclosing template is rendered,
and assigns it to `ctx.total`; nodes after it read it as `total`. On the template path that is
`${(() => { ctx.total = …; return ''; })()}`, on the inline path the statement `ctx.total = …;`.

#### Rules

- The value is a snapshot, not reactive: it does not follow the signals it read. Use `$derived` in the
  script for a value that must follow. Not checked today.
- Both render paths read the name as the value it holds, `ctx.total`, not as a signal call.
- Without its `;` the compile stops: `Invalid @let syntax`.

#### Examples

```pdx
<template>
  @let total = price * qty;
  <p>{{ qty }} × {{ price }} = {{ total }}</p>
</template>

<script setup>
let price = $signal(4);
let qty = $signal(3);
</script>
```

#### Since

alpha

### `@raw`

#### Syntax

```ebnf
RawBlock       ::= "@raw" S? "{" /* any text with balanced braces */ "}"
```

The analyzer's form is `@raw { … }`.

#### Semantics

The text between the braces is emitted as written: no `{{ }}`, no binding, no directive, no `${ }` is
read in it, and it is not checked for `PDX_RAW_INTERPOLATION`. It is still **markup**: tags in it are
elements, and entities are decoded. The template path escapes it only for the `html` literal; the
inline path builds its elements and sets their attributes as plain values.

#### Rules

- The block ends at its balancing `}`; braces inside it must balance. An unclosed block stops the
  compile: `Unclosed @raw block`.
- To show markup as text, escape it inside the block: `&lt;p&gt;`.
- In a script, `@raw { … }` is the same rune with its script meaning ([script.md](script.md)).

#### Examples

```pdx
<template>
  @raw {
    <code>{{ count }} and @if (x) { … } are shown as written</code>
  }
  <svg viewBox="0 0 10 10" width="20">
    @raw { <circle cx="5" cy="5" r="4"></circle> }
  </svg>
</template>

<script setup>
</script>
```

#### Since

alpha

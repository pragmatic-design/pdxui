# The template

The `<template>` block is HTML with three additions: interpolation (`{{ }}`), bound attributes (`:`,
`::`, `@` in front of an attribute name) and block directives (`@if`, `@for`, …). This page defines the
`Template` production that [overview.md](overview.md) leaves open. The parser is
`packages/compiler/src/parser/template.ts`; attributes are rewritten by
`codegen-template-rewrite.ts` and bound at runtime by core's `renderer/template.ts`.

A template compiles along one **render path**, in the dev server and in a production build alike
(#107): the **inline path**, imperative `createElement` code (`codegen-template-inline.ts`).
`pdx({ inlineBindings })` no longer selects anything (`PDX_INLINE_BINDINGS_IGNORED`), and nothing else
does (#238). The **template path** — an `html\`…\`` tagged template that core parsed and bound at
runtime — is removed (#526): the body of a scoped slot fill was the last part it built, until #364,
and the legacy mode that rendered through it is removed (#158). `html\`\`` stays in core for
components written by hand.

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
  Any other `@word (` or `@word {` that no plugin registers stays text and raises
  `PDX_UNKNOWN_DIRECTIVE` (warning), once per name in a file: `@media (…)` inside a template is
  written `@@media (…)` (#296). The names the parser reads are `TEMPLATE_AT_DIRECTIVES`
  (`compiler/src/parser/template-directives.ts`).
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
- `${…}` in text is `PDX_RAW_INTERPOLATION` (warning): it is written as the text the author typed,
  never evaluated.
- The end is the first `}}` outside a string and outside braces, so `{{ { a: 1 }.a }}` is read whole.
- `{{ }}` inside an attribute value — `title="{{ n }}"` — is not a binding form: the render sets the
  attribute to `''` and spills the rest of the tag into the text. Bind with `:title="n"`. Not checked
  today.
- A Node, a fragment or an array value is put in as nodes — an array's items one after the other —
  (`bindInterpolation`).
- An unclosed `{{` stops the compile: `Unclosed interpolation`.

#### Examples

```pdx
<template>
  <p>{{ name }} has {{ count }} {{ count === 1 ? 'message' : 'messages' }}</p>
  <p>{{ user?.email }}</p>
  <p>Contact: help@@example.com</p>
  <!-- {{ count }} here is a comment, not an interpolation -->
</template>

<script>
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

<script>
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
OnceBinding    ::= ":" BoundName ".once" "=" AttrValue
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

`:name.once="expr"` (#126) reads the value once, untracked, when the element is rendered, assigns it
the same way, and has no `effect`: a later change of what it read does not reach the element.

#### Rules

- `${…}` inside a bound value — `:title="${n}"` — is `PDX_RAW_INTERPOLATION_IN_BINDING` (error, the
  compile stops). A template literal inside the expression, `` :class="`btn-${size}`" ``, is fine.
- `${…}` in an unbound attribute — `title="${n}"` — is `PDX_RAW_INTERPOLATION` (warning): the
  attribute holds the text as written, in a `@for` too; it is never evaluated.
- On a known library component, a bound name that is not one of its props is `PDX_UNKNOWN_PROP`
  (warning), one that matches a prop only ignoring case is `PDX_PROP_NAME_CASE` (warning), and a
  literal value outside a prop's declared values is `PDX_INVALID_ENUM_VALUE` (warning). The plugin
  passes what it knows of the components; a bare `compile()` has no list and checks none of them.
- The shorthand `:name` without a value reads the identifier of the same name: `<input :value>` is
  `<input :value="value">`.
- A modifier other than `.once` on `:name` raises `PDX_BINDING_MODIFIER` (error). `:class.x` and
  `:style.x` are not modifiers: they are removed forms (#129), `PDX_REMOVED_FORM`.

#### Examples

```pdx
<template>
  <a :href="url" :title="label + ' (opens the profile)'" :aria-current="active ? 'page' : null">{{ label }}</a>
  <input :disabled="busy" :maxlength="limit" :data-row="7" />
</template>

<script>
let url = $signal('/users/7');
let label = $signal('Ada');
let active = $signal(true);
let busy = $signal(false);
let limit = $signal(40);
</script>
```

#### Since

alpha

### `:class`

#### Syntax

```ebnf
ClassBinding   ::= ":class" "=" AttrValue
                 | ":class" "=" ( '"{' ClassPair ( "," ClassPair )* '}"' | "'{" ClassPair ( "," ClassPair )* "}'" )
ClassPair      ::= S? ( ClassName | StringLiteral ) S? ":" S? Expression S?
ClassName      ::= [A-Za-z_-] [A-Za-z0-9_-]*
```

#### Semantics

The object form `:class="{ active: on, big: n > 2 }"` toggles each class by its condition,
`classList.toggle('active', !!on)`. `:class="expr"` binds a string of classes, for a fully dynamic
class. Either merges with a static `class="…"`: each new value removes the classes the binding wrote
last and adds its own, and never removes a static class.

#### Rules

- The object form is expanded into one toggle per key before either render path reads the tag, so
  both bind the same classes.
- The object form is recognised only when the whole value is one `{ … }`; a value that merely
  contains an object is the string form. Not checked today.
- `:class.name="cond"` is removed (#129): `PDX_REMOVED_FORM`. `pdx migrate` merges every `:class.x`
  of an element into one object — after the entries of an existing object, or joined to an existing
  string as `[str, cond && 'x'].filter(Boolean).join(' ')`.

#### Examples

```pdx
<template>
  <li class="row" :class="{ selected: picked, done: progress === 100 }">{{ label }}</li>
  <li class="row" :class="tone">{{ label }}</li>
</template>

<script>
let tone = $signal('row-info');
let picked = $signal(false);
let progress = $signal(40);
let label = $signal('Upload');
</script>
```

#### Since

alpha

### `:style`

#### Syntax

```ebnf
StyleBinding   ::= ":style" "=" AttrValue
                 | ":style" "=" ( '"{' StylePair ( "," StylePair )* '}"' | "'{" StylePair ( "," StylePair )* "}'" )
StylePair      ::= S? ( Identifier | StringLiteral ) S? ":" S? Expression S?
```

#### Semantics

The object form `:style="{ width: w, 'background-color': c, '--accent': a }"` sets each property
with `style.setProperty(name, String(value ?? ''))`, a camelCase key turned to kebab-case
(`fontSize` → `font-size`); a custom property is a quoted key. `:style="expr"` writes a string to
`style.cssText`.

#### Rules

- The object form is expanded into one property per key before either render path reads the tag,
  so both set the same properties.
- `:style.name="v"` (with `:style.--x`) is removed (#129): `PDX_REMOVED_FORM`. `pdx migrate` merges
  every `:style.x` of an element into one object, custom-property and hyphenated keys quoted.

#### Examples

```pdx
<template>
  <div class="bar" :style="{ width: percent + '%', 'background-color': colour }"></div>
</template>

<script>
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
TwoWayModifier ::= "lazy" | "trim" | "number" | "debounce(" Digits ")"
TwoWayValue    ::= Identifier ( "." Identifier )*
                 | "{" S? "get" S? ":" S? Expression S? "," S? "set" S? ":" S? Expression S? "}"
```

The quoted value is the name of a `$signal` (or a prop, or a `@model`), or the general form
`{ get, set }`.

#### Semantics

Two-way binding is a contract (#124): `::name` is valid on a component's `@model`
([script.md](script.md)) and on the value properties of native form elements (`value`, `checked`,
`files` of `<input>`, `<textarea>`, `<select>`), which are the platform's models.

`::value="name"` compiles to `::value=${ctx.name}` — the signal itself, not its value — and core's
`bindTwoWay(el, 'value', signal)` binds it. Signal to element: an `effect` assigns the
property. Element to signal: on an `<input>` or `<textarea>` the `input` event (`change` for
`checked`), on a `<select>` `change`; on a custom element that declares the prop as a model, its
`<kebab-name>-change` event and `detail.value`, and nothing else — every value component of the
library declares its model (#125), and the alpha listening to `pdx-input` and `pdx-change` is gone.
An element whose class is defined after the binding is listened to once it is. A prop that is not a
model binds one way, and the compiler refuses `::x` on it wherever it knows the component's models,
the library's included: `PDX_TWO_WAY_NOT_MODEL`.

The value is always read and written as `{ get, set }` (#126): a signal is `{ get: sig, set:
sig.set }`, and the general form `::value="{ get: () => format(cents), set: (s) => cents = parse(s) }"`
is given as written, its functions compiled like a handler's (`cents = …` writes the signal). The
modifiers wrap the setter, so there is one mechanism:

| Modifier | Meaning |
|---|---|
| `.lazy` | commit on `change` (native), on `pdx-change` (a library component without a model); on a component's model, on the native `change` that bubbles to the host from its inner input, reading the model's property — the model's event is live (#479) |
| `.debounce(ms)` | write `ms` after the last input; written at once on the element's `focusout` and on its form's `submit` (in the capture phase, before the form's own listeners) |
| `.trim` | trim a string before writing |
| `.number` | write `Number(v)` after trimming; an empty entry writes `null`; an invalid one writes nothing and marks the element invalid — `aria-invalid="true"`, and `setCustomValidity` on a native control — until a valid entry clears it |

#### Rules

- `::x` on a component prop that is not a model raises `PDX_TWO_WAY_NOT_MODEL` (error), for a project
  component and for every library component, from its manifest; `pdx migrate` flags each one. A
  library component that lists no model has nothing to bind both ways (#125).
- In the editor, the value bound to a model is checked against the model's type.
- A value that is not a signal (no `.set`) falls back to a one-way `:name` binding. Not checked
  today.
- A modifier outside the list raises `PDX_BINDING_MODIFIER` (error), naming the list.
- `.number` writing `0` for an empty or invalid entry was the alpha behaviour; `pdx migrate` flags every
  `::x.number` binding (`two-way-number`), whose value for those entries changed.
- A `{ get, set }` value bound to a form field does not receive `.number`'s parse error yet: binding
  to a form field is #128.
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

<script>
let name = $signal('');
let age = $signal(30);
let subscribed = $signal(false);
let country = $signal('it');
</script>
```

#### Since

alpha

### `::group`

#### Syntax

```ebnf
GroupBinding ::= "::group" "=" AttrValue
```

#### Semantics

Binds a group of inputs to one signal (#127), through core's `bindTwoWay(el, 'group', signal)`. On
`<input type="checkbox" value="v">` the signal is an array: the box is checked when the array holds
`v`, and toggling it writes a new array with `v` added or removed. On `<input type="radio"
value="v">` the signal is the selected value: the radio is checked when it equals `v`, and selecting
it writes `v`. The value is the input's `value`, compared as a string; a `:value` a `@for` row writes
after the binding is the one compared. A group is the inputs bound to the same signal in one
component. On a component, `::group` binds its one `@model` — an array for a checkbox-group-like
component, a single value for a radio-group-like one.

#### Rules

- On a component whose models are known, `::group` with none or several models raises
  `PDX_TWO_WAY_NOT_MODEL` (error), naming them.
- A two-way binding inside a `@for` receives the signal itself in a build too: the loop-invariant
  hoisting of the build leaves a two-way target alone.

#### Examples

```pdx
<template>
  @for (options as t; track t) {
    <label><input type="checkbox" :value="t" ::group="toppings" /> {{ t }}</label>
  }
  <label><input type="radio" value="small" ::group="size" /> Small</label>
  <label><input type="radio" value="large" ::group="size" /> Large</label>
</template>

<script>
let options = $signal(['cheese', 'ham', 'olives']);
let toppings = $signal<string[]>([]);
let size = $signal('small');
</script>
```

#### Since

beta (#127)

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
- **one statement** becomes `() => …`: a signal named bare is updated through `.set` and assigned
  through `.setRaw`, which stores the value as it is, a function too — `count++` is
  `ctx.count.set(v => v + 1)`, `n += 2` is `ctx.n.set(v => v + (2))`, `open = !open` is
  `ctx.open.setRaw(!ctx.open())`, `x ??= v` is `(ctx.x() ?? ctx.x.setRaw(v))`, and an arrow assigned
  (`onSave = () => count++`) has its body rewritten like a handler's. A `$signal` called,
  `onSave()`, is read and then called, `ctx.onSave()()`. Any other expression is called as written,
  `save(item)`;
- **several statements**, separated by `;`, become `($event) => { …; … }`, each rewritten the same way.

`$event` is the event: a handler that mentions it is `($event) => …`. The result is wrapped as
`safeHandler(batchHandler(handler), tag, 'click')`: every write in it lands in one `batch()`, and an
error, or the rejection of a promise it returns, goes to the global error interceptor. Core's
`bindEvent` adds the listener: `.once`, `.capture` and `.passive` are `addEventListener` options; the
others run in a wrapper, in this order — `.self` (only when `target === currentTarget`), the key
filters (`.delete` is `Delete` or `Backspace`, the arrows are `ArrowUp` …), then `.prevent` and
`.stop` — before the handler.

In the editor and in `pdx check --types`, `$event` is typed (#122): the event a `.pdx` component
declares (`CustomEvent<Payload>`, `CustomEvent<unknown>` for an `@event` with no payload); a DOM
event by its name otherwise (`MouseEvent` for `click`), whose `target` and `currentTarget` are the
element the handler is written on, so `$event.target.value` on an `<input>` reads as it runs. The event
of a library component, whose manifest does not type its detail, and of an unknown tag is a
`CustomEvent` whose detail is not checked. A handler that is an arrow, `e => …`, is given the same
event as its parameter.

The template is checked under TypeScript's `strict` mode, the script is not (#468): a read of a value
that may be `null` (`user.name` on a `$signal<User | null>(null)`) and an untyped parameter nothing
gives a type are errors in a template expression. The script's names reach the template with the
types the script gives them: `$signal(null)`, `$signal([])`, `const rows = []` and a `@prop` with no
type are `any` there as in the script.

#### Rules

- A name the script does not declare is `PDX_UNDECLARED_REF` (error).
- `${…}` in the value is `PDX_RAW_INTERPOLATION_IN_BINDING` (error).
- Only a bare signal name is rewritten into `.set`. `user.name = x` assigns a field of the signal's
  current value, which notifies nothing. Not checked today.
- A modifier that is not in the list — `.ctrl`, `.meta` — is ignored. Not checked today.
- A key filter applies to keyboard events only: `@click.enter` fires on a click.
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

<script>
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

### `:ref`

#### Syntax

```ebnf
RefBinding     ::= ":ref" "=" AttrValue
```

The quoted value names a signal.

#### Semantics

`:ref="box"` compiles to `:ref=${ctx.box}`: the signal itself. When the element
is built, core's `bindRef` calls `box.set(element)`; the inline path does the same. Read it after the
mount — in `onMount`, an `$effect` or a handler — as `box`, like any signal.

When the scope that rendered the element is disposed — its `@if` branch, its `@for` row, the
component — the ref is set back to `null`, unless it no longer holds that element (the other branch
of an `@if`/`@else` binding the same ref has taken it). A component's `onDestroy` callbacks run before
its scope is disposed, so they still read the element.

#### Rules

- A value that is not a signal (no `.set`) is ignored without a word: declare the ref as
  `let box = $signal(null);`. Not checked today.
- The bare `ref="box"` is removed (#129): `PDX_REMOVED_FORM`, rewritten to `:ref` by `pdx migrate`.
- On a component, a ref declared `$signal(null)` is typed in the editor from what the component
  exposes (#140): its manifest methods for a library component, its `@expose` for a `.pdx` — the
  element plus those members, so calling one it does not expose is an error.

#### Examples

```pdx
<template>
  <input :ref="field" />
  <button @click="focus()">Focus</button>
</template>

<script>
let field = $signal<HTMLInputElement | null>(null);
function focus() { field?.focus(); }
</script>
```

#### Since

alpha; typed on a component since beta (#140)

### `attach:` attachments

#### Syntax

```ebnf
AttachBinding  ::= "attach:" Identifier ( "=" AttrValue )?
```

The analyzer's form: `attach:name` or `attach:name="value"`.

#### Semantics

`attach:name="value"` compiles to core's `attach(element, name, () => value)` (#143): `name` is called
as `name(element, () => value)` inside an effect owned by the scope that rendered the element. The
function may return a cleanup, which runs before the attachment runs again and when the element's
scope is disposed — its `@if` branch, its `@for` row, the component. The effect tracks the value:
when it changes, the cleanup runs and the attachment runs again; what the attachment reads inside
does not re-run it. Without a value the getter returns `undefined`. On a component, the element is
its host.

`name` is read like any template identifier: a function of the script, or an import. Core's built-in
attachments — `autofocus` (focuses the element, or the first focusable element inside a host, once it
is in the document), `trapFocus` (core's `focusTrap` while the element is rendered) and
`clickOutside` (calls its value, a handler, for a press outside the element) — are imported by the
compiler when the script declares no name of its own for them. In the editor `name` is checked as
`(el: Element, value: () => V) => void | (() => void)`, and the value as its `V`.

#### Rules

- A name that is neither in scope nor a built-in is `PDX_ATTACH_UNKNOWN` (error), at its attribute.

#### Examples

```pdx
<template>
  <input attach:autofocus attach:tooltip="'Search by name'" />
  <div class="menu" attach:clickOutside="close">…</div>
</template>

<script>
import { tooltip } from './tooltip';
function close() { open = false; }
let open = $signal(true);
</script>
```

#### Since

beta (#143)

### `commandfor`, `command` — invoker commands

#### Syntax

```ebnf
CommandAttributes ::= 'commandfor="' Identifier '"' S 'command="' ( "--" Identifier | BuiltInCommand ) '"'
```

The platform's attributes, written on a `<button>`.

#### Semantics

The browser's Invoker Commands: pressing the button dispatches a `command` event on the element whose
`id` is `commandfor`. A built-in command (`show-modal`, `close`, `toggle-popover`, …) is the platform's.
A custom one, `--name`, calls the method `name` the target component exposes (`@expose`, or
`ctx.expose` in TypeScript), with no arguments (#140): core listens for the event on every host that
exposes something.

#### Rules

- A `commandfor` with no element of that `id` in the template raises `PDX_COMMAND_TARGET_MISSING`
  (unless the template binds an `:id`, which may be it).
- A `--name` the target does not expose — read from the manifest for a library component — and a
  built-in command pointed at an element that does not have it (`show-modal` needs a `<dialog>`,
  `toggle-popover` a `popover` element) raise `PDX_COMMAND_UNKNOWN`, as does a command that is neither
  built-in nor `--`.

#### Examples

```pdx
<template>
  <button commandfor="shift" command="--show">Start shift</button>
  <pdx-dialog id="shift" title="Start of shift">…</pdx-dialog>
</template>
```

#### Since

beta (#140)

### `@swipe`, `@longpress`, `@pinch`

#### Syntax

```ebnf
GestureBinding ::= "@swipe." ( "left" | "right" | "up" | "down" ) "=" AttrValue
                 | ( "@longpress" | "@pinch" ) "=" AttrValue
```

#### Semantics

Both render paths hand the element to core's `bindGesture` — `__swipe` with `['left', handler]`,
`__longpress` and `__pinch` with the handler — which wires `onSwipe`, `onLongpress` and `onPinch`. The
value is built as an `@event`'s is: a reference, a call, a mutation such as `n++`, or an arrow, run when
the gesture happens. A swipe is 50px along its axis within 300ms; a longpress is a 500ms hold that
moves less than 10px; a pinch hands `{ scale, center }` while two pointers are down.

#### Rules

- A swipe direction other than `left`, `right`, `up` or `down` is not a gesture: `@swipe.x` is an
  event named `swipe`. Not checked today.

#### Examples

```pdx
<template>
  <div class="card" @swipe.left="next()" @longpress="pin">{{ index }}</div>
</template>

<script>
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
DynamicOption    ::= PropBinding | "@keepAlive" ( S? "(" S? Digits S? ")" )? | "keep-alive"
                   | "@transition" S? "(" StringLiteral ( S? "," S? StringLiteral )? ")"
                   | "@mode" S? "(" StringLiteral ")"
```

#### Semantics

The tag becomes `dynamic(() => tag, () => ({ prop: … }), { keepAlive, transition, mode })`. `:is` is an
expression giving a tag name; when it changes, the element is replaced (`<component>` itself is never
in the DOM). Each other `:prop` is passed to the element, camelCased (`:item-label` → `itemLabel`).
With `@keepAlive` an element left behind is hidden, not destroyed, and shown again when its tag comes
back; the cache keeps at most 10, least recently used first out — `@keepAlive(n)` keeps at most n
(`dynamic(…, { keepAlive: true, maxAlive: n })`), and the view it drops is destroyed.
`@transition('in', 'out')` animates the swap, `@mode('out-in')` sequences it.

#### Rules

- Both render paths compile it to the same `dynamic(…)` call. The component it becomes takes no
  children: what is written between `<component :is>` and `</component>` is not rendered on either
  path, and anything but whitespace there is `PDX_DYNAMIC_CONTENT` (warn) (#358).
- `@keepAlive(n)` takes a whole number of at least 1; anything else is `PDX_KEEPALIVE_MAX` (error),
  and the default of 10 applies.
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

<script>
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

- Both render paths compile it to the same `renderSlot(…)` call.
- The fallback is a template like any block's body: an interpolation, an element, a block directive
  (`@if`, `@for`, …) in it are rendered inside the outlet, only when the parent gives no fill (#276).
  The outlet is closed by the first `</slot>` that is not a nested outlet's own.
- The child collects the parent's fills before it renders, so a fill the parent writes is the one
  rendered. A fill added later, after the child has mounted, is not read.
- With nothing between the tags, or self-closing, the default renders nothing.
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

<script>
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
  <app-user-table>
    @slot(row, { user, index }) {
      <span>{{ index }}. {{ user.name }}</span>
    }
    <slot name="empty" let:query>
      <p>No user matches {{ query }}.</p>
    </slot>
  </app-user-table>
</template>

<script>
</script>
```

#### Since

alpha

### `@render`

#### Syntax

```ebnf
RenderDirective ::= "@render" S Identifier "?."? S? "(" S? ( Expression ( S? "," S? Expression )* )? S? ")"
                    ( S? "@else" Block )?
```

#### Semantics

`@render row(it, i)` renders a typed snippet (#489) where it is written, called with the arguments: a
snippet the parent passes, declared in the script with `@slot row: (…);` ([script.md](script.md)), or
a template `@snippet` of the script itself. It compiles to `renderSnippet(() => snippet, () =>
[args], fallback)`: core renders it again when the parent gives another function or an argument
changes, and the snippet's bindings belong to the block that renders it — removed with it, while the
parent that wrote the snippet stays.

`@render row?.(it)` is for an optional slot (`@slot row?: (…);`): it renders nothing when the parent
gives none, or, with `@else { … }`, that block instead.

#### Rules

- A name that is neither a declared slot nor a script `@snippet` is read from the component's context;
  that it names a function is not checked today.
- A required slot (`@slot row: (…);`) that the parent does not fill renders nothing, and the parent's
  use is `PDX_SLOT_REQUIRED` at compile time.

#### Examples

```pdx
<template>
  <ul>
    @for (items as it, i; track it.name) {
      <li>@render row(it, i)</li>
    }
  </ul>
  @render empty?.() @else { <p>Nothing to show.</p> }
</template>

<script>
@prop items: { name: string }[] = [];
@slot row: (item: { name: string }, index: number);
@slot empty?: ();
</script>
```

#### Since

beta (#489)

### `@snippet`

#### Syntax

```ebnf
SnippetFill ::= "@snippet" S Identifier S? "(" S? ( Identifier ( S? "," S? Identifier )* )? S? ")" Block
```

#### Semantics

Written inside a component's tag, `@snippet row(u, i) { … }` passes the block as that component's
`row` slot (#489): the compiler assigns the element's `row` property, before the element connects,
a function that renders the block with the arguments the component's `@render` passes. Its
parameters are named; there is no implicit context. The rest of the block reads the parent's names,
as any of its template does.

#### Rules

- It fills the component whose tag it is written directly in, not one nested inside it.
- Outside a component's tag it is a compile error.
- Inside the tag of a component that declares the slot required, it is what keeps the use from
  `PDX_SLOT_REQUIRED`.
- The script form, `@snippet` in the `<script>`, is in [script.md](script.md).

#### Examples

```pdx
<template>
  <app-user-list :items="users">
    @snippet row(u, i) { <span>{{ i + 1 }}. {{ u.name }}</span> }
  </app-user-list>
</template>

<script>
let users = $signal([{ name: 'Ada' }]);
</script>
```

#### Since

beta (#489)

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
second `when` in the else branch. In a production build a literal `true` or `false` condition is
folded away (#236).

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

<script>
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
                   S? BlockTransition? ( S? Virtual )? Block ( S? "@empty" Block )?
Binding        ::= Identifier | /* an object or array destructuring pattern */
Virtual        ::= "@virtual" ( S? "(" S? Number S? ")" )?
```

#### Semantics

`@for (items as item, i; track item.id)` renders the body once per element of the collection, keyed by
the `track` expression. A plain `item` compiles to `eachRow(() => ctx.items(), 'id', (item, i) => …)`:
`item` and `i` are getters, so a row reused for the same key reads the current object and position
(`{{ item.name }}` is `() => item().name`). A destructured binding compiles to `eachDestructured(…)`,
its names bound once from the object the row was created with. `track item.field` is passed as the field name;
any other key is a function, `(item, i) => …`. Rows are moved, not rebuilt, by a keyed
reconciliation. `@empty` wraps the loop in `when(() => items?.length > 0, …, () => html\`…\`)`.

A change that adds more than 1 000 rows at once (`LIST_SLICE_THRESHOLD`) renders the first 250 in
the same task (`LIST_FIRST_SLICE`), so they are painted in the next frame, and after that frame the
rest in slices of about 40 ms that yield to input (#242, through `processInSlices`). The numbers were
set against js-framework-benchmark and the INP of a 10 000-row append; the measurements are in
`core/src/renderer/list-slices.ts`. This holds when the rows are appended, the first render included,
and when the list is replaced by one with no row in common. Until the slices settle the rows still to
come are not in the DOM. A newer list replaces the slices pending, and the list's teardown stops
them. A destructured binding slices the same way (#398). A single pass is kept by:
- a `@for` with `@transition`, whose timing is the transition's;
- a hand-written `repeat()` or `each()`, whose caller may read the DOM right after the write;
- a change that keeps some rows and adds many between them.

`@virtual` renders only the rows in view (#283). The element written around the `@for` is the scroll
container, and it compiles to `eachVirtual(() => ctx.items(), 'id', (item, i) => …, { estimate, tag,
getters, empty })` placed where the `@for` was: the rows in the window stay that element's own
children, between two spacers of the rows' tag (`li` in a `ul`, `tr` in a `tbody`) that are
`aria-hidden` and sized to the rows above and below. `@virtual(48)` is the estimated row size in px;
without a number the first rendered row is measured. Each row is measured as it renders, and again
when its size changes. The collection may be an array or a `DataSource`: of a source, `data()` is
rendered, and when its last row is in view, `hasMore()` is true and no load runs, `loadMore()` is
called once. `@empty` is the list's own: it renders for an empty array, or a source with no data that
is not loading.

What a virtual list says to assistive technology follows the container's role (#284): its `role`, or
the implicit role of a `ul`/`ol` (`list`) or a table (`table`, read from a `tbody` too).
- **Set roles.** Under `list`, `listbox` and `tree`, each rendered item root carries `aria-setsize` and
  `aria-posinset`.
- **Row roles.** Under `table`, `grid` and `treegrid`, each rendered row carries `aria-rowindex`, and
  the element with the role carries `aria-rowcount`; both count the rows outside the list, such as a
  header row.
- **The total.** It is the array's length, or a `DataSource`'s `total()` when it reports one, else -1
  while `hasMore()`.
- **Keys.** Under `listbox`, `tree`, `grid` and `treegrid` the list keeps a roving tabindex. It
  answers ArrowUp and ArrowDown, Home and End, PageUp and PageDown, scrolling to and rendering an
  item before focusing it.
- **Focus.** A focused item outside the window stays in place, between the spacers, until focus
  leaves it.
- **Reaching the container.** Under a role without keys, a container that scrolls and whose rendered
  rows hold nothing focusable takes `tabindex="0"`, unless the template wrote one.

#### Rules

- `as` and `; track` are required: `Invalid @for syntax` stops the compile.
- A destructured binding — `@for (pairs as { key, value }; track key)` — puts each name of the pattern
  in the body's scope.
- An empty body is `PDX_EMPTY_FOR` (warning).
- The key must be unique and stable: a changing field in it recreates the row. Not checked today.
- **`@virtual` has a shape.** The `@for` is the only content of the element around it (whitespace and
  comments aside), that element is native (a component's children are projected elsewhere), and the
  body has exactly one root element. Anything else is `PDX_VIRTUAL_SHAPE` (error), naming the rule it
  broke. A `@virtual` with `@transition`, `@stagger`, `@mode` or `@move` is `PDX_VIRTUAL_TRANSITION`
  (error): a row scrolling in or out is not arriving or leaving. `@virtual(n)` takes a positive number;
  anything else stops the compile.
- **`@virtual` needs a bounded container**: a height (`height`, `max-height`, a flex or grid track) and
  `overflow: auto`. A container that grows with its rows renders every row; in development it logs
  one warning naming the element. Not checked at compile time.
- **What a virtual list does not show**: find-in-page and print see only the rendered rows.

#### Examples

```pdx
<template>
  <ul>
    @for (todos as todo, i; track todo.id) {
      <li :class="{ done: todo.done }">{{ i + 1 }}. {{ todo.text }}</li>
    } @empty {
      <li>Nothing to do.</li>
    }
  </ul>
</template>

<script>
let todos = $signal([{ id: 1, text: 'Write', done: false }]);
</script>
```

A virtual list, in a `ul`, a `tbody` and a `div`:

```pdx
<template>
  <ul class="feed">
    @for (posts as post; track post.id) @virtual(64) {
      <li>{{ post.title }}</li>
    } @empty {
      <li>No posts yet.</li>
    }
  </ul>
  <table>
    <tbody class="rows">
      @for (rows as row; track row.id) @virtual { <tr><td>{{ row.name }}</td></tr> }
    </tbody>
  </table>
  <div class="cards">
    @for (cards as card; track card.id) @virtual(120) { <article>{{ card.body }}</article> }
  </div>
</template>

<script>
let posts = $signal([]);
let rows = $signal([]);
let cards = $signal([]);
</script>

<style scoped>
.feed, .cards { height: 400px; overflow: auto; }
.rows { display: block; height: 400px; overflow: auto; }
</style>
```

#### Since

alpha; `@virtual` since #283

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
The page transition is `@page`'s `transition` option, in [routing.md](routing.md); the script's
`@transition 'fade';` is a removed form (#277).

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
  and ignores `move`. On `@for` the list reconciler reads all five: the n-th row that arrives in an
  update waits `n × stagger` ms (its `transition-delay`, cleared once it has entered); `'out-in'`
  holds the arriving rows in their from-state until the leaving ones are gone, and `'in-out'` keeps
  the leaving rows until the arriving ones have entered.
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

<script>
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

<script>
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

<script>
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
`style.display = 'none'` while the condition is falsy. Unlike `@if`, no element is removed: its
state, focus and components survive. A top-level **text** node cannot take a style, so it is
swapped for a placeholder comment while hidden and put back in its place when shown, still bound:
`@show (open) { Details: {{ name }} <b>…</b> }` false shows nothing.

#### Rules

- Hiding does not pause: effects and components in the body keep running while it is hidden. Code
  that must stop while hidden belongs in an `@if`.
- A body that is exactly one element is built where the block stands, its `display` bound on it:
  no `show()` block, the cost the removed `:show` attribute had (#129). The whitespace between the
  braces and that element is the block's, not markup: `@show (c) { <b>x</b> }` builds what
  `<b :show="c">x</b>` built.
- `@show` is the one form of hiding an element in place: the `:show="cond"` attribute is removed
  (#129), `PDX_REMOVED_FORM`. `pdx migrate` wraps the element, `<section :show="open">…</section>`
  becoming `@show (open) { <section>…</section> }`.

#### Examples

```pdx
<template>
  @show (advanced) {
    <fieldset>
      <label>Timeout <input type="number" /></label>
    </fieldset>
  }
</template>

<script>
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

<script>
let open = $signal(false);
</script>
```

#### Since

alpha

### `@defer`, `@placeholder`, `@loading`, `@error`

#### Syntax

```ebnf
DeferBlock     ::= "@defer" S? "(" Triggers ( S? ";" S? "prefetch" S Triggers )? ")" Block
                   ( S? ( "@placeholder" Block | "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
Triggers       ::= Trigger ( S? "|" S? Trigger )*
Trigger        ::= "viewport" | "idle" ( "(" [0-9]+ ")" )? | "interaction" | "timer(" [0-9]+ ")" | "immediate"
                 | "when" S? "(" S? Expression S? ")"
ErrorNames     ::= "(" S? Identifier ( S? "," S? Identifier )? S? ")"
```

#### Semantics

`defer({ trigger, when, prefetch, prefetchWhen, placeholder, loading, error }, loadFn, () => …)`.
The block has two phases (#281). The triggers before `;` start the **render**: the body is mounted, and
its code is loaded first if it has not been. The triggers after `prefetch` start only the **load**: the
code is fetched and kept, and nothing is rendered. Without `; prefetch` the two start together.

`@placeholder` shows until a render trigger fires; `|` means any of them. `viewport` fires when the
block is within 100px of the viewport, `idle` on an idle callback (`idle(ms)` times out after `ms`,
2000 by default), `interaction` on the first `pointerenter` or `focusin` on the element the block sits
in, `timer(ms)` after `ms`, `immediate` at once. `when (expr)` fires the first time the expression is
truthy and does not un-fire: a deferred block is never removed by its trigger, an `@if` around it does
that. The expression is in its own parentheses, so a `|` or a `;` inside it is the expression's.

The code is what the body's components need — `loadFn` is `() => Promise.all([import(…)])` for every
custom-element tag in the body whose module the plugin resolves, so they leave the route's chunk. A
render shows `@loading` (or the placeholder) while the code is in flight, reuses code a prefetch has
loaded — at once when it has arrived, when it does when it is in flight — and renders the body. A
prefetch goes through the prefetch queue, which waits for the browser to be idle; a render's load goes
ahead of it. A prefetch that fails renders nothing; the render trigger loads the code again. A render
whose load fails shows `@error (err, retry)`: `err` is the load's error, and `retry()` loads the code
again. The names are the author's, `err` and `retry` when none are written.

#### Rules

- The trigger is not quoted: `@defer ('viewport')` names the trigger `'viewport'` with its quotes,
  which is unknown. An unknown trigger — misspelt, quoted, or from another framework — an empty
  `when ()`, or a `;` not followed by `prefetch`, is `PDX_DEFER_UNKNOWN_TRIGGER`, an error naming the
  part that is not a trigger (#260). The runtime still fires one at once when it reaches it through a
  hand-written `defer()` call, and warns in development.
- `hover` is a removed form, `PDX_REMOVED_FORM`: it was `interaction` under another name, and
  `pdx migrate` rewrites it (#281).
- `@error` takes at most two names, the error and the retry function; a third, or the same name twice,
  stops the compile.
- Each sub-block may follow in any order; a second one of the same kind replaces the first.
- `@placeholder`, `@loading` or `@error` with no `@defer` or `@await` before it stops the compile.
- `retry` loads the code again: whether the browser fetches a module again after its first `import()`
  failed is the browser's.

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

<script>
</script>
```

```pdx
<template>
  <button @click="tab = 'sales'">Sales</button>
  @defer (when (tab === 'sales'); prefetch idle) {
    <pdx-chart></pdx-chart>
  } @error (err, again) {
    <button @click="again()">Load the chart again</button>
  }
</template>

<script>
let tab = $signal('overview');
</script>
```

#### Since

alpha; `; prefetch`, `when (…)` and `@error (err, retry)`, beta (#281)

### `@await`, `@loading`, `@error`

#### Syntax

```ebnf
AwaitBlock     ::= "@await" S? "(" S? Expression ( S "as" S Identifier )? S? ")" S? AwaitTiming? Block
                   ( S? ( "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
AwaitTiming    ::= "{" S? TimingOption ( S? "," S? TimingOption )? S? "}"
TimingOption   ::= ( "minMs" | "maxMs" ) S? ":" S? [0-9]+
ErrorNames     ::= "(" S? Identifier ( S? "," S? Identifier )? S? ")"
```

#### Semantics

`awaitBlock(() => value, (name) => html\`…\`, loading, (err, retry) => html\`…\`, { minMs, maxMs })`
(#145). What is awaited decides the branch by its state, never by its truthiness:

- **a source** — anything with `state()` and `data()`: `@fetch`, `resource()`, `useQuery`. While
  `state()` is `'idle'` or `'pending'` with no `data()`, `@loading`; `'error'` with no data, `@error`,
  whose second name calls the source's `refetch()`; otherwise the body. A refresh in flight, and a
  refresh that **failed** over kept data, keep the body: `@error` is not rendered in its place, and the
  body reads `x.error()` to show the failure beside the data.
- **a promise** — `@loading` while pending, the body once fulfilled, `@error` when it rejects; a new
  promise in the awaited expression is awaited from the start.
- **a plain value** — `undefined` waits, `false` is a condition not yet met, and anything else is the
  result: `null`, `0` and `''` render the body. `@await (appReady)` is still a condition.

`as name` binds the result in the body: a promise's value, a source's `data()`. It is a getter, so the
body stays when a refresh brings new data, and reads it; the body renders only with a result, so the
name is never bound to a pending value. The editor types it, `Promise<T>` → `T`, `Resource<T>` → `T`.

The timing: `minMs` is a **delay** — nothing shows until it has passed, then `@loading`; a result
that arrives earlier renders the body with no spinner frame. `maxMs` is a **timeout** — with no result
by then, `@error` renders with an `AwaitTimeoutError` (`err.name === 'AwaitTimeoutError'`, exported
from `@pdxui/core`); the source is not cancelled, and a result that arrives later replaces `@error`
with the body. Without `@error`, `@loading` stays. The timers start when the block renders, restart
when it starts waiting again (a new promise, a source back to pending with no data), and stop when the
block is removed. With `@error`, an exception the body throws while it renders lands there too.

#### Rules

- The binding is the **last** top-level `as` followed by a name and the closing parenthesis. A type
  assertion in the awaited expression is written in its own parentheses:
  `@await ((x as Resource<User[]>) as list)`.
- No `@loading` is `PDX_AWAIT_NO_LOADING` (info).
- `maxMs` not greater than `minMs` is `PDX_AWAIT_TIMING` (error).
- The expression must give the same promise every time it is read: `@await (load())` makes a new one
  on every re-run and never settles. Keep the promise in a signal, or use a source. Not checked today.
- `@error` takes at most two names, distinct identifiers; anything else stops the compile.
- Both names are in the `@error` body's scope, whatever they are called. The error is `unknown` to
  the editor, as a TypeScript `catch` binding is (#122): narrow it before reading a member,
  `err instanceof Error ? err.message : String(err)`.
- The timing block is recognised only when it contains `minMs` or `maxMs`; it is not an expression.
- `pdx migrate` parenthesises an alpha `@await (x as T)` whose name is a type, and flags every
  `@await` with `maxMs` and every one whose operand is neither a declared source nor a promise.

#### Examples

```pdx
<template>
  @await (users as list) { maxMs: 8000 } {
    <ul>@for (list as u; track u.id) { <li>{{ u.name }}</li> }</ul>
    @if (users.error()) { <p>Showing the last list: the refresh failed.</p> }
  } @loading {
    <p>Loading…</p>
  } @error (err, retry) {
    <p>{{ err instanceof Error ? err.message : String(err) }}</p>
    <button @click="retry()">Try again</button>
  }
</template>

<script>
interface User { id: number; name: string }
@fetch users: 'GET /api/users' as User[];
</script>
```

#### Since

alpha; the source, `as`, the plain values and the timing as above since #145

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
- Both names are in the `@catch` body's scope, whatever they are called: `@catch (problem, again)`
  reads `problem` and calls `again()`.
- The error is `unknown` to the editor, as a TypeScript `catch` binding is (#122): narrow it before
  reading a member, `problem instanceof Error ? problem.message : String(problem)`.

#### Examples

```pdx
<template>
  @try {
    <p>{{ total(order) }}</p>
  } @catch (err, retry) {
    <p class="error">{{ err instanceof Error ? err.message : String(err) }}</p>
    <button @click="retry()">Retry</button>
  }
</template>

<script>
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
and assigns it to `ctx.total`; nodes after it read it as `total`: the statement `ctx.total = …;`.

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

<script>
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
elements, and entities are decoded. The render builds its elements and sets their attributes as plain
values.

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

<script>
</script>
```

#### Since

alpha

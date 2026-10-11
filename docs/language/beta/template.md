# The template

HTML with interpolation, bound attributes, attachments and block directives. In the beta a template
has **one meaning**, compiled by one code generator in development and in a build (#107,
[file.md](file.md#the-render-model)); there is no «on the inline path» rule left. Constructs marked
**Unchanged** keep the alpha semantics of `docs/language/template.md`.

```ebnf
Template       ::= ( Text | Comment | AtEscape | Element | Interpolation | Directive )*
Element        ::= "<" ElementName ( S Attribute )* S? ( "/>" | ">" ElementContent "</" ElementName S? ">" )
                 | DynamicComponent | SlotOutlet
ElementContent ::= ( Template | SnippetFill )*
```

## Text

### `{{ }}` interpolation — unchanged, one rule changed

```ebnf
Interpolation ::= "{{" S? Expression ( S? Pipe )* S? "}}"
```

A `Node`, a `DocumentFragment` or an **array** of them renders as nodes; an array of other values
renders each item as text, one after the other with no separator (`['a', 'b']` → `ab`, what the
template path rendered; the inline path's `a,b` was the defect of #100). `null`, `undefined` and `false` render as empty
text. Rules as alpha (`PDX_UNDECLARED_REF`, `PDX_RAW_INTERPOLATION`). Since: alpha.

### `|` pipes — for chains

```ebnf
Pipe ::= "|" S? Identifier ( "(" Expression ( S? "," S? Expression )* ")" )?
```

A pipe is a function call written left to right: `{{ price | money }}` is `{{ money(price) }}`. The
beta keeps pipes for **chains** of two or more formatters, where left to right reads better than
nested calls (`{{ total | round(2) | money('EUR') }}`). A single pipe is `PDX_PIPE_SINGLE` (info),
whose hint is the call (decisions.md 4 — proposed). Since: alpha → beta.

## Attributes

A bound value is an `Expression` in the component's scope, in quotes, never with `${ }`
(`PDX_RAW_INTERPOLATION_IN_BINDING`, error — alpha).

### `:name` — unchanged; `.once` added

#### Syntax

```ebnf
PropBinding ::= ":" BoundName ( "=" AttrValue )?
OnceBinding ::= ":" BoundName ".once" "=" AttrValue
```

#### Semantics

`:name` as in alpha (attribute or property, URL sanitising, shorthand `:name`). `:name.once="expr"`
assigns once, with no effect (#126). The compiler also assigns once, on its own, any binding whose
expression reads nothing reactive (#110).

#### Rules

As alpha (`PDX_UNKNOWN_PROP`, `PDX_PROP_NAME_CASE`, `PDX_INVALID_ENUM_VALUE`), plus
`PDX_PROP_REQUIRED` from the component's side (#130). A modifier other than `.once` on `:name` is
`PDX_BINDING_MODIFIER`.

#### Since

alpha → beta (#126)

### `:class`

#### Syntax

```ebnf
ClassBinding ::= ":class" "=" AttrValue
```

#### Semantics

One attribute, two value shapes (#129): an **object literal**, `:class="{ active: on, big: size ===
'lg' }"`, toggles each key by its condition; any other expression is a string of classes, merged with
the static `class` as in alpha. The compiler specialises the emitted update (#112): a
`classList.toggle` per key for the object; one toggle per distinct class when the expression is a
conditional whose branches are string literals (`c ? 'a' : 'b'`, `c ? 'a' : ''`, `c && 'a'`);
`className` (`setAttribute('class')` on SVG) when the element has no static class and the expression
is a string; the merging routine otherwise.

#### Rules

- `:class.name="cond"` is removed (language change); `pdx migrate` merges every `:class.x` of an
  element into one object, added to an existing object when there is one.

#### Since

alpha → beta (#129, #112)

### `:style`

#### Syntax

```ebnf
StyleBinding ::= ":style" "=" AttrValue
```

#### Semantics

An object (`:style="{ fontSize: size, '--accent': color }"`, keys to kebab-case, custom properties
as quoted keys) or a string (`cssText`). The object form works everywhere (#96).

#### Rules

- `:style.prop="v"` is removed, like `:class.name` (decisions.md 5 — proposed; language change):
  `pdx migrate` merges every `:style.x` of an element into one object, quoting custom-property keys.

#### Since

alpha → beta

### `::name` two-way binding

#### Syntax

```ebnf
TwoWayBinding  ::= "::" BoundName ( "." TwoWayModifier )* "=" AttrValue
TwoWayModifier ::= "lazy" | "trim" | "number" | "debounce(" Digits ")"
TwoWayValue    ::= Identifier ( "." Identifier )*
                 | "{" S? "get" S? ":" S? Expression S? "," S? "set" S? ":" S? Expression S? "}"
```

#### Semantics

Two-way binding is a **contract** (#124): `::name` is valid on a `@model` of a component and on the
value properties of native form elements (`value`, `checked`, `files`). The value is a signal, a form
field (`f.email`, #128), or the **general form** `{ get, set }` (#126), of which every modifier is
defined as sugar:

| Modifier | Meaning |
|---|---|
| `.lazy` | commit on `change` (native) or on the model's change event, not on each input |
| `.debounce(ms)` | write `ms` after the last input; flushed on blur and on form submit |
| `.trim` | trim a string before writing |
| `.number` | write `Number(v)`; an empty entry writes `null`; an invalid one leaves the value unchanged and marks the element invalid (`aria-invalid`, `setCustomValidity`), or reports to the form field when bound to one |

On a custom element the binding listens to the model's `<name>-change` event only. Bound to a form
field, the control also receives the field's error, `aria-invalid` and `required`.

#### Rules

- `::x` on a component prop that is not a model: `PDX_TWO_WAY_NOT_MODEL` (error).
- A modifier not in the list: `PDX_BINDING_MODIFIER` (error).
- `.number` writing `0` for an empty or invalid entry was the alpha behaviour; it is gone.

#### Examples

```pdx
<template>
  <input ::value.debounce(300)="query" />
  <input ::value="{ get: () => format(cents), set: (s) => cents = parse(s) }" />
  <input type="number" ::value.number="age" />
</template>

<script>
let query = $signal('');
let cents = $signal(1250);
let age = $signal<number | null>(30);
function format(c: number) { return (c / 100).toFixed(2); }
function parse(s: string) { return Math.round(Number(s) * 100); }
</script>
```

#### Since

alpha → beta (#124, #126, #128)

### `::group`

#### Syntax

```ebnf
GroupBinding ::= "::group" "=" AttrValue
```

#### Semantics

Binds a group of inputs to one signal (#127): on `<input type="checkbox" value="v">` the signal is an
array and the box is checked when it includes `v` (toggling writes a new array); on
`<input type="radio" value="v">` the signal is the selected value. On a component, valid only on a
`@model` of array type (checkbox-group-like) or single value (radio-group-like). A group is the inputs
bound to the same signal in one component.

#### Examples

```pdx
<template>
  <label><input type="checkbox" value="cheese" ::group="toppings" /> Cheese</label>
  <label><input type="checkbox" value="ham" ::group="toppings" /> Ham</label>
  <label><input type="radio" value="small" ::group="size" /> Small</label>
  <label><input type="radio" value="large" ::group="size" /> Large</label>
</template>

<script>
let toppings = $signal<string[]>([]);
let size = $signal('small');
</script>
```

#### Since

beta (#127)

### `@name` event listeners — unchanged, two rules

```ebnf
EventBinding ::= "@" EventName ( "." EventModifier )* "=" AttrValue
```

Unchanged handler forms and modifiers. Beta guarantees: every compiled handler runs inside `batch()`
(#114 — landed); a key filter applies to keyboard events only (#100); events inside a `@for` body are
delegated as [file.md](file.md#the-render-model) lists (#113), with `.stop` still stopping and
`$event.currentTarget` still the element the handler is written on. A component's event does not
bubble unless it is declared `@event(bubbles)` ([components.md](components.md)).

### `:ref`

```ebnf
RefBinding ::= ":ref" "=" AttrValue
```

As alpha, and typed from the target: an element ref is its element type, a component ref is the
component's exposed type (#140). `ref=` without the colon is removed (#129).

### `@swipe`, `@longpress`, `@pinch` — unchanged, working

```ebnf
GestureBinding ::= "@swipe." ( "left" | "right" | "up" | "down" ) "=" AttrValue | ( "@longpress" | "@pinch" ) "=" AttrValue
```

The gestures are wired (#99): the value is called when the gesture completes. Since: alpha.

### `attach:` attachments

#### Syntax

```ebnf
AttachBinding ::= "attach:" Identifier ( "=" AttrValue )?
```

#### Semantics

`attach:name="value"` calls the function `name` in scope as `name(element, () => value)` inside an
effect owned by the element (#143); the function may return a cleanup, run before a re-run and when
the element is removed. Without a value the getter returns `undefined`. On a component, the
attachment applies to its host. Core ships `autofocus`, `trapFocus` and `clickOutside(handler)`.

#### Rules

- An unknown name: `PDX_ATTACH_UNKNOWN` (error). The editor types `name` as
  `(el: Element, value: () => V) => void | (() => void)`.

#### Examples

```pdx
<template>
  <input attach:autofocus attach:tooltip="'Search by name'" />
</template>

<script>
import { autofocus } from '@pdxui/core';
import { tooltip } from './tooltip';
</script>
```

#### Since

beta (#143)

### `data-part`

A literal `data-part="name"` on the element of a declared `@part` ([components.md](components.md),
#134).

### `:show` — removed

The `:show` attribute is removed (#129): `@show (cond) { … }` is the form. `pdx migrate` wraps the
element in an `@show` block.

## Components

### `<component :is>` — unchanged

```ebnf
DynamicComponent ::= "<component" S ":is=" AttrValue ( S DynamicOption )* S? ( "/>" | ">" )
```

Unchanged from alpha.

### `<slot>` — content without data only

```ebnf
SlotOutlet ::= "<slot" ( S "name=" AttrValue )? S? ( "/>" | ">" Template "</slot>" )
```

A plain `<slot>` projects content that carries no data (the children, a named region). Data-carrying
slots are snippets ([components.md](components.md), #131): `<slot :x>` in the child and
`<slot let:x>` / `@slot(name, …) { }` in the parent are removed.

### `@snippet` inside a component's tag, `@render`

```ebnf
SnippetFill     ::= "@snippet" S Identifier S? "(" S? ( Identifier ( S? "," S? Identifier )* )? S? ")" Block
RenderDirective ::= "@render" S Identifier "?."? S? "(" S? ( Expression ( S? "," S? Expression )* )? S? ")" ( S? "@else" Block )?
```

Defined in [components.md](components.md) (#131).

### `<pdx-icon>`

#### Syntax

No new syntax: `<pdx-icon name="edit">`, `<pdx-icon :name="expr">`, and a component prop the manifest
marks as an icon name.

#### Semantics

A literal `name`, and a literal value of a prop the manifest marks as an icon name (`icon="edit"`),
import that icon's module at build time; a name that arrives through data is loaded on demand the
first time it is drawn, and appears a frame later (#47, decided 2026-10-11). `registerPragmaticIcons()`
loads the whole set up front; the CDN build calls it.

#### Since

beta (#47)

## Block directives

### `@if`, `@for`, `@switch`, `@require`, `@show`, `@portal`, `@try`, `@let`, `@raw` — unchanged

Grammars in [grammar.md](grammar.md). Beta guarantees on `@for`: clearing and appending have fast
paths (#118); `track`-key-only expressions are not reactive (#110). `@raw` keeps its two places (script:
statements not rewritten; template: markup not read) with the one meaning «copied as written».

### `@transition`, `@stagger`, `@mode`, `@move` — unchanged, working everywhere

```ebnf
BlockTransition ::= "@transition" S? "(" TName ( S? "," S? TName )? ")" ( S? "@stagger" S? "(" Number ")" )?
                    ( S? "@mode" S? "(" TName ")" )? ( S? Move )? | Move
```

Unchanged grammar and classes (`docs/language/template.md`). The beta guarantee is that they apply
on every build: on `@if` (#85, landed) and on `@for`, whose list reconciler applies `stagger`, `mode`
and `move` (landed). The page transition is `@page`'s `transition` option (decisions.md 7).
Since: alpha.

### `@await` — on a resource, with `as`

#### Syntax

```ebnf
AwaitBlock ::= "@await" S? "(" S? Expression ( S "as" S Identifier )? S? ")" S? AwaitTiming? Block
               ( S? ( "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
```

#### Semantics

`@await` understands everything that speaks the async vocabulary ([data.md](data.md)) — a resource,
a loader, an action, `useQuery` — as well as a promise (#145). With `as name`, the body receives the
resolved value, typed (`Resource<T>` → `T`, `Promise<T>` → `T`):

- pending while `state()` is `'idle'` or `'pending'` and there is no `data()` → `@loading`;
- `state() === 'error'` with no result yet → `@error`, whose first name is `error()` and second
  calls `refetch()` when the source has one;
- otherwise the body, with `data()` bound — including a refresh in flight and a refresh that failed
  over kept data (below).

An operand written as a boolean expression (`@await (ready)`) is still a condition; a **source** that
resolved `false` is data, and renders the body (data.md, E5). The `@error` names are typed by the strict projection (#122): the
error is `unknown`, so the body narrows it before reading a member.

Whether the body renders is decided by `state()`, never by the value's truthiness: a source that
resolved `null` or `0` renders its body (data.md, E5). A refresh that **fails** while data is kept
keeps the body, and `@error` is not rendered in its place; the body reads `x.error()` to show it
beside the data (data.md, E4).

**Timing** (`{ minMs, maxMs }`, grammar unchanged; semantics changed, proposed — decisions.md
point 26). One rule above the others: **the body with `as` renders only with a result**, so the
name is never bound to a pending value.

| Option | Beta meaning | Alpha meaning (`core/src/renderer/helpers.ts:165-209`) |
|---|---|---|
| `minMs` | a **delay**: nothing is shown until `minMs` has passed, then `@loading`; a result that arrives earlier renders the body directly, with no spinner flash | the same — only the parser's comment calls it a minimum display time (`compiler/src/parser/template.ts:164`), and it is not one |
| `maxMs` | a **timeout**: if there is still no result after `maxMs`, `@error` renders with an `AwaitTimeoutError` (`err.name === 'AwaitTimeoutError'`, distinct from the transport's `HttpTimeoutError`); the source is **not** cancelled, and a result that arrives later replaces `@error` with the body. Without `@error`, `@loading` stays | renders the **body** while the promise is still pending (`condition() || _timedOut()`, `helpers.ts:196`) — the body reads unresolved values; the docstring says «force timeout error» (`helpers.ts:167`) |

The timers start when the block renders and are reset when the awaited source changes (a new
promise, a new key); they stop when the block is removed. Alpha starts them once and never resets
them (`helpers.ts:185,191`). A minimum display time — keeping a spinner up for at least N ms once
shown — is not part of the beta (decisions.md 26).

**Rules.** `maxMs` not greater than `minMs` is `PDX_AWAIT_TIMING` (error). `pdx migrate` flags every
`@await` with `maxMs`, whose meaning changes.

Acceptance cases: a promise still pending at `maxMs` → `@error` with `AwaitTimeoutError`, the body not
rendered, and the body rendered when it resolves later; the same without `@error` → `@loading`
stays; a result before `minMs` → no `@loading` frame; the source changing after a timeout → the
timers restart; a promise that resolves `null` → the body.

**`as` and TypeScript.** Inside the parentheses, `x as T` is also a TypeScript type assertion. This
beta keeps both by one rule (decisions.md 18 — proposed): the binding is the **last** top-level `as` followed
by a bare identifier and the closing parenthesis; a type assertion in the awaited expression is
written in its own parentheses, `@await ((x as Resource<User[]>) as list)` (decisions.md).

#### Examples

```pdx
<template>
  @await (users as list) {
    @for (list as u; track u.id) { <li>{{ u.name }}</li> } @empty { <li>Nobody</li> }
  } @loading {
    <li>Loading…</li>
  } @error (err, retry) {
    <li>Could not load the users. <button @click="retry()">Retry</button></li>
  }
</template>

<script>
interface User { id: number; name: string }
@fetch users: 'GET /api/users' as User[];
</script>
```

#### Since

alpha → beta (#145)

### `@defer` — two phases, rules for removal

```ebnf
DeferBlock ::= "@defer" S? "(" Triggers ( S? ";" S? "prefetch" S Triggers )? ")" Block       /* "; prefetch" proposed */
               ( S? ( "@placeholder" Block | "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
Triggers   ::= Trigger ( S? "|" S? Trigger )*
Trigger    ::= /* the alpha triggers */ | "when" S? "(" S? Expression S? ")"                    /* "when" proposed */
```

The components only its body uses are loaded lazily on every build (#98 — landed). What `@defer`
loads is **code**: the `import()` of the body's components (`compiler/src/compiler/codegen-template.ts:350-357`).
The scan that finds them matches `pdx-` tags only (`codegen-template.ts:322-326`); with application
tags prefixed `app-` (#136) it must read the project's components instead, or an application
component in a `@defer` body is no longer lazy — a dependency of #136.

**Two phases** (proposed, decisions.md point 27). *Prefetch* loads the code without rendering;
*render* mounts the body. The triggers before `;` start the render — and the load, if it has not
happened yet; the triggers after `prefetch` start only the load. `@defer (interaction; prefetch idle)`
fetches the chart's code when the browser is idle and mounts it on the first pointer or focus entry
into the block (`pointerenter`/`focusin`, `defer.ts:184-185`; the alpha spelling `hover` is removed —
decisions.md 37).
Without `prefetch`, the two phases start together, as in alpha. **`when (expr)`** — the expression in
its own parentheses, since `|` and `;` separate triggers — fires the first time the expression is
truthy and does not un-fire: a deferred block is never removed by its trigger; `@if` around it does
that.

A **prefetch that fails** renders nothing and is retried by the render trigger's load; `@error`
shows only if that load fails. A render trigger's load goes ahead of the prefetch queue
(performance.md).

**Rules**

- A trigger that is not one of the grammar's is `PDX_DEFER_UNKNOWN_TRIGGER` (error). Alpha accepts
  any text (`parser/template.ts:827-829`) and fires an unknown trigger at once (`core/src/renderer/defer.ts:194`).
- **Removal while loading.** When the block is removed (an `@if` around it, the component destroyed)
  before its code arrives, its triggers are released and the late module mounts nothing — alpha
  already does both (`defer.ts:112`, and the render effect is disposed with the branch). **Everything
  the body mounted is disposed with the block**: the bindings of a body rendered after an
  asynchronous load belong to the block's scope. Alpha does not guarantee that today — the render
  effect does not collect what its re-run creates (`defer.ts:118-152`), so a body mounted late may
  outlive its block (to confirm with a test; it is an inference from the code).
- **A deferred template does not defer its parent's data.** A `@fetch` or a `@loader` declared in
  the component that contains the `@defer` starts when that component mounts, deferred or not. Three
  orders, each with its form:
  - **data before code** — the usual win: the `@fetch` stays in the parent and the deferred child
    receives the resource as a prop;
  - **code and data together**: the parent gates both on one signal — `@fetch sales: '…' { enabled:
    () => showChart }` and `@defer (when (showChart))` — so the `import()` and the request start in
    the same turn, and the child receives the resource as a prop. A built-in trigger (`viewport`,
    `interaction`) cannot enable a fetch; that stays open (decisions.md, «Still open»);
  - **code then data** — a waterfall, acceptable only when the data is not needed without the code:
    the `@fetch` is declared inside the deferred component, and starts when it mounts.
- `@error` takes `(err, retry)` like `@await`'s; `retry` loads the code again (proposed; alpha emits
  no names, `codegen-template.ts:334`).

Acceptance cases: the block removed during its load → no mount, no error, no listener left; a body
mounted after a load and then removed → its effects disposed (count observed); `prefetch idle` →
the module requested before the render trigger, the body mounted only on it; `when` turning truthy,
falsy, truthy → one mount; an unknown trigger → a compile error.

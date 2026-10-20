# The component contract

What a component declares to the outside: its props, its two-way models, its events, the templates it
accepts, its visual states, its public parts, what it binds on its host, what it exposes, and the
context it provides or reads. Each is a `.pdx` declaration **and** a field of the TypeScript
descriptor (#123): the two are one model, and a `.pdx` compiles into the descriptor, so the semantics
live once, in `@pdxui/core`.

## Communication: one way per direction

| Direction | The beta form | Replaces (alpha) |
|---|---|---|
| Parent → child, data | `@prop`; `@model` when it is two-way | setting a property through a ref |
| Child → parent | `@event`, not bubbling by default | `$emit`, `ctx.emit` in a `.pdx`, implicit bubbling |
| Parent → child, an imperative act | `@expose` + a typed `:ref`, or `commandfor`/`command` | `createChannel`, `createCommands` |
| Ancestor → descendants | `@provide Token` / `@inject x from Token` | eight runtime functions, string keys |
| The whole app | `@store` ([data.md](data.md)) | `createBus`, `provideWritable` |
| An async action a button runs | `@action` ([data.md](data.md)) + `pdx-button :action` | four wired lines per button |
| Behaviour on an element | `attach:` ([template.md](template.md)) | a ref + `onMount` + manual cleanup |

`createBus`, `createChannel` and `createCommands` leave the public exports of `@pdxui/core` in the
beta (#144); `provideWritable`, `useWritable` and their `try*` variants have left with the other
context functions (#495).

## @prop

### Syntax

```ebnf
PropDecl ::= "@prop" S Identifier "?"? S? ":" S? Type ( S? "=" S? Expression )? End
```

### Semantics

Declares a prop, as in alpha. The beta adds **required props** with TypeScript's rule (#130 — landed):

| Written | Meaning |
|---|---|
| `@prop id: string;` | required — a parent that omits it does not compile |
| `@prop label: string = '';` | optional, with a default |
| `@prop hint?: string;` | optional; when absent it holds its runtime type's empty value, as an alpha prop with no default did |

Descriptor: `prop.required<T>()`, `prop<T>(default)`, `prop.optional<T>()`.

The empty value is `''`, `0`, `false`, `[]`, or `null` for an `Object` prop — what an alpha prop with no
default held, which this specification first wrote as `undefined`. Keeping it is what lets `pdx
migrate`'s `?` preserve the meaning of existing code exactly; TypeScript still types the read as
`T | undefined`, the wider type.

### Rules

- A parent template that uses the component without a required prop (no attribute, no binding) is
  `PDX_PROP_REQUIRED` (error), for `.pdx` components and, through the manifest, library components.
- `pdx migrate` adds `?` to every alpha `@prop` without a default, which preserves its meaning
  (optional).
- The alpha rules stay (`PDX_PROP_NO_TYPE`, `PDX_PROP_INVALID_TYPE`, `PDX_PROP_TYPE_MISMATCH`,
  `PDX_DUP_PROP`, `PDX_PROP_WRITE`).

### Examples

```pdx
<template>
  <p>{{ user.name }} · {{ label }} {{ hint ?? '' }}</p>
</template>

<script>
import type { User } from './user';
@prop user: User;
@prop label: string = 'Owner';
@prop hint?: string;
</script>
```

### Since

alpha → beta (#130)

## @model

### Syntax

```ebnf
ModelDecl    ::= "@model" S Identifier S? ":" S? Type ( S? "=" S? Expression )? ( S? "{" S? "form" S? "}" )? End
```

### Semantics

Declares a prop **that can be bound both ways** (#124 — landed; `{ form }` is #135). It creates the prop, an event
`<kebab-name>-change` carrying `CustomEvent<{ value: T }>` (not bubbling), and makes an assignment to
the name inside the component write the prop and dispatch the event. A parent binds it with
`::name="sig"` ([template.md](template.md)). The value properties of native form elements (`value`,
`checked`, `files` of `<input>`, `<textarea>`, `<select>`) are the platform's models and bind the same
way. Descriptor: `models: { value: model<T>(default) }`.

`{ form }` makes the component **form-associated** (#135): `formAssociated`, `attachInternals()`,
`setFormValue` on each change (strings as is, numbers and booleans as strings, arrays as repeated
entries, `null` as no entry), `setValidity` from the component's validation state, and the form
lifecycle callbacks (`formResetCallback` restores the initial value, `formDisabledCallback` maps to
`disabled`, `formStateRestoreCallback` restores the value). Descriptor: `model<T>(d, { form: true })`.

Every value component of `@pdxui/ui` declares its value as a model and emits exactly one change event
per model (#125); the alias events of alpha (`pdx-change`, `change`, `valuechange`, `pressedchange`,
`pdx-pressed-change`) are removed; `pdx migrate` rewrites listeners and their payload reads (migration.md).

The model event's payload is always `{ value: T }`, where `value` is the **model's** value. That is
not the alpha payload: `pdx-checkbox`'s `pdx-change` carries `{ checked, value }` or
`{ checked, indeterminate }`, where `checked` is the boolean and `value` the choice's identifier; its
beta event is `checked-change` with `{ value: boolean }`, and the identifier stays the element's
`value` property. Every component's mapping «alpha detail field → beta» is part of its manifest, and
`pdx migrate` uses it (migration.md).

### Rules

- `::x` on a component prop that is not a `@model` is `PDX_TWO_WAY_NOT_MODEL` (error), hint «declare
  `@model x` in the child».

### Examples

```pdx
<template>
  <input ::value="value" />
</template>

<script>
@model value: string = '' { form };
</script>
```

The inner `<input>` writes `value`; writing a model inside its component sets the prop and dispatches
`value-change`, so the parent's `::value` follows.

```pdx
<template>
  <app-name-field ::value="name"></app-name-field>
  <p>{{ name }}</p>
</template>

<script>
let name = $signal('Ada');
</script>
```

### Since

beta (#124, #125, #135)

## @event

### Syntax

```ebnf
EventDecl ::= "@event" ( "(" S? "bubbles" S? ")" )? S Identifier ( S? ":" S? Type )? End
```

### Semantics

Declares an event and the function of the same name that dispatches it, as in alpha — but **events
do not bubble by default** (#138 — landed): `@event saved: Item;` dispatches `CustomEvent('saved', { detail })`
with `bubbles: false, composed: false`. `@event(bubbles) saved: Item;` opts in (`bubbles: true,
composed: true`). The function is the only way to dispatch from a `.pdx` (`$emit` is removed). A
parent listens with `@saved="…"`, and the editor types `$event` as `CustomEvent<Item>`. Descriptor:
`events: { saved: event<Item>({ bubbles? }) }`; library events follow the same default.

### Rules

- The alpha rules stay (`PDX_MALFORMED_EVENT`, `PDX_DUP_EVENT`, `PDX_EVENT_NAME_CASE`).
- `@event(…)` with any option but `bubbles` is `PDX_UNKNOWN_DECLARATION`, its hint the form.
- `pdx migrate` rewrites every existing `@event` as `@event(bubbles)`, preserving behaviour;
  `PDX_EVENT_BUBBLES_UNUSED` (info) then lists the events marked `bubbles` that no ancestor in the
  project listens to. "Listens" is read off the project's templates: a listener written on any element
  other than the component's own tag. One added with `addEventListener` in a `.ts` is not read.
- Library components wrapping another one (`pdx-form-template`, `pdx-pin-input`, `pdx-toggle-group`)
  listen to the inner element and dispatch its events again from their host; no library event is
  declared `bubbles`. Consumers that listened above a library component — a form or a section hearing
  every field's `pdx-change` — listen on the component itself.

### Examples

```pdx
<template>
  <button @click="saved({ id: 'a1' })">Save</button>
</template>

<script>
@event saved: { id: string };
@event(bubbles) closed;
</script>
```

### Since

alpha → beta (#138)

## @slot, @generic, @render, @snippet — templates a component accepts

### Syntax

```ebnf
SlotDecl       ::= "@slot" S Identifier "?"? ( S? ":" S? SlotSignature )? End
SlotSignature  ::= "(" S? ( SlotParam ( S? "," S? SlotParam )* )? S? ")"
GenericDecl    ::= "@generic" S TypeParameter ( S? "," S? TypeParameter )* End
RenderDirective ::= "@render" S Identifier "?."? S? "(" S? ( Expression ( S? "," S? Expression )* )? S? ")"
SnippetFill    ::= "@snippet" S Identifier S? "(" S? ( Identifier ( S? "," S? Identifier )* )? S? ")" Block
GenericArgument ::= Identifier "=" AttrValue
```

### Semantics

Typed snippets replace scoped slots and template props (#131). Three words, three roles — the three
landed in #489, part 1 of #131, and `@generic` with the editor's typing of snippet parameters in
#490; the library's components and the removal of the alpha forms are #131's other parts:

- **Declare** (child, script): `@slot row: (item: T, index: number);` — the contract, a function
  signature. `@slot row?: (…)` is optional; without `?` the parent must provide it.
- **Render** (child, template): `@render row(it, i)`; `@render row?.(it, i)` for an optional one,
  which renders nothing when the parent gives none — or, with a fallback, `@render row?.(it, i) @else
  { <li>{{ it.name }}</li> }`, which renders the `@else` block instead (the alpha `<slot>` fallback;
  decisions.md 22 — landed, #489).
- **Define** (parent, inside the child's tag): `@snippet row(u, i) { … }` passes a template as the
  `row` slot. Parameters are always named; there is no implicit `context`.

`@generic T extends { id: string };` declares a type parameter; `T` is inferred from the props that
use it (`:items="users"` gives `T = User`), and `T="User"` on the tag sets it where inference cannot
(landed, #490: the editor types a `@snippet`'s parameters from the signature, with `T` resolved; a
library component's from the signature its manifest records, once it declares one, #491).
A snippet is a function the child calls, not a projection: one inside an `@if` that becomes true later
renders like anything else. A snippet is also a JavaScript property of the element (`el.row = (item,
i) => node`), so a consumer that is not PDX assigns a function. Plain `<slot>` stays, for content
**without** data (the children). Descriptor: `slots: { row: slot<(item: T, index: number) => Node>() }`.

### Rules

- A required slot the parent does not fill is `PDX_SLOT_REQUIRED` (error).
- `let:`, the parent-side `@slot(name, { … }) { }` block, the child's scoped `<slot :x>` and template
  props (`itemTemplate`) are removed (language changes). `pdx migrate` rewrites the parent forms to
  `@snippet`. In the child, an alpha slot is optional by nature (a parent may not fill it), so the
  migration preserves that: `<slot name="row" :item="it">fallback</slot>` becomes
  `@slot row?: (item: T);` and `@render row?.(it) @else { fallback }`; with no fallback,
  `@render row?.(it)`. A slot becomes required only by a later, deliberate edit that removes the `?`.
- The editor types snippet parameters from the child's signature (#122).

### Examples

```pdx
<template>
  <ul>
    @for (items as it, i; track it.id) {
      <li>@render row(it, i)</li>
    }
  </ul>
</template>

<script>
@generic T extends { id: string };
@prop items: T[];
@slot row: (item: T, index: number);
</script>
```

```pdx
<template>
  <app-list :items="users">
    @snippet row(u, i) { <span>{{ i + 1 }}. {{ u.name }}</span> }
  </app-list>
</template>

<script>
import type { User } from './user';
let users = $signal<User[]>([]);
</script>
```

### Since

alpha → beta (#131)

## @state

### Syntax

```ebnf
StateDecl ::= "@state" S Identifier S? "=" S? Expression End
```

### Semantics

A visual state exposed through the platform's custom states (#132): the compiler calls
`attachInternals()` once and keeps `internals.states` in sync with the boolean expression (usually a
`$derived`), in an effect. Themes and the component style it with `:state(name)`. Under
`target: 'baseline-2024'` the state is also mirrored as a `data-state-<name>` attribute and the design
build emits the attribute selector beside `:state()`. The manifest lists the states. Descriptor:
`states: ['open']` with `ctx.state('open', bool)`.

### Rules

- The expression must be boolean: otherwise `PDX_STATE_NOT_BOOLEAN`, hint «use `$signal` for
  reactive data». (The name echoes Svelte's `$state`, which is a different thing; the platform's name
  wins, and this diagnostic is the guard.)

### Examples

```pdx
<template>
  <button @click="open = !open">Menu</button>
</template>

<script>
let open = $signal(false);
@state expanded = open;
</script>

<style scoped>
:scope:state(expanded) button { font-weight: 600; }
</style>
```

**Landed** (#132), except the `baseline-2024` mirror: the rune, `PDX_STATE_NOT_BOOLEAN`, the
descriptor's `states` with `ctx.state`, and the manifest's `cssStates`. The `data-state-<name>` mirror
and its selector in the design build come with the `target` option (#121), which does not exist yet.
In a `<style scoped>`, `:scope:state(…)` reaches the host since #152 (landed). Certify's state rules do not read `:state()` yet: that
arrives with the first library component that declares a state (#286).

### Since

beta (#132)

## @part

### Syntax

```ebnf
PartDecl      ::= "@part" S Identifier ( S? "," S? Identifier )* End
PartAttribute ::= 'data-part="' Identifier '"'
```

### Semantics

A named, public element of the component (#134). `@part popup;` in the script and
`data-part="popup"` written literally on exactly one element. The part is a typed private reference in
the script (`popup: HTMLDivElement`) and an entry in the manifest. Parts, states and component tokens
are the **public styling surface** of a component; its internal classes are not. Descriptor:
`parts: ['popup']`.

### Rules

- A declared part with no element: `PDX_PART_MISSING`; on two elements: `PDX_PART_DUPLICATE`; a
  `data-part` with no declaration: `PDX_PART_UNDECLARED`.
- `:part=` and the HTML `part` attribute are not this: `part` is the shadow-parts attribute.

### Examples

```pdx
<template>
  <button data-part="trigger" @click="open = !open">Menu</button>
  @if (open) { <div data-part="popup"><slot></slot></div> }
</template>

<script>
@part trigger, popup;
let open = $signal(false);
</script>
```

**Landed** (#134). The part's ref is a signal holding the element (`null` while it is not rendered),
as a `:ref` to a `$signal(null)`. The editor types it `HTMLElement | null`; the tag's own type
(`HTMLDivElement`) needs the template, which is the editor's template projection (#122). The count is of the attribute as written, so a `data-part` inside an
`@for` counts once: whether it may sit there is still one of the open questions (decisions.md). A
name the script declares itself keeps its declaration, and the element is bound to it. The manifest
lists a TypeScript component's `parts` as `cssParts`.

### Since

beta (#134)

## @host

### Syntax

```ebnf
HostDecl      ::= "@host" S? "{" ( S? Attribute )* S? "}"
```

### Semantics

Attributes, bindings and listeners on the component's **own element** (#133), with the same attribute
grammar as an element in the template (`Attribute`, [grammar.md](grammar.md)). A static host attribute is set at connection unless the consumer
already set it (the consumer's `role` or `tabindex` wins). Descriptor:
`host: { role: 'combobox', ':aria-expanded': (ctx) => ctx.open(), '@keydown': (ctx, e) => … }`.

### Rules

- A form that has no meaning on a host is `PDX_HOST_INVALID_ATTRIBUTE` (error), whose message names
  it: a two-way binding (`::x`, the host is the model's owner, not its consumer), `data-part`, a
  generic argument (decisions.md 21, landed with #133).
- A static attribute the consumer already set is not overwritten (#133).

### Examples

```pdx
<template>
  <span>{{ label }}</span>
</template>

<script>
@prop label: string = 'Choose';
let open = $signal(false);
@host { role="combobox" :aria-expanded="open" @keydown="onKey" }
function onKey(e: KeyboardEvent) { if (e.key === 'Enter') open = !open; }
</script>
```

**Landed** (#133): `@host` compiles into the descriptor's `host`, which core's `bindHost` applies after
setup with the render's context. A binding and a listener are built by the template's own rewrite, so
they take the same forms and modifiers; a listener is removed on disconnect; `PDX_HOST_INVALID_ATTRIBUTE`
names which of the three forms it is, and that attribute is not compiled. A generic argument is told
by its name, `T="…"`: a capitalised identifier, which an HTML attribute never is.

### Since

beta (#133)

## @expose, refs and commands

### Syntax

```ebnf
ExposeDecl ::= "@expose" S Identifier ( S? "," S? Identifier )* End
RefBinding ::= ":ref" "=" AttrValue
```

### Semantics

`@expose` defines the component's public instance type (#140): a `:ref` to the component is typed
from it, and nothing else of the component is reachable through the ref in the editor. Exposed
methods are also **invoker commands**: the runtime listens to the `command` event on the host and
calls the exposed method named by the command without its `--` prefix, so
`<button commandfor="confirm" command="--open">` opens `<app-dialog id="confirm">` with no script.
Descriptor: `expose: ['open', 'close']`.

### Rules

- A `commandfor` whose target id is not in the template: `PDX_COMMAND_TARGET_MISSING`; a custom
  command that is not an exposed method of a known component: `PDX_COMMAND_UNKNOWN`; built-in commands
  (`show-modal`, `close`, `toggle-popover`, …) are checked against the target element's type.
- Guidance: a declarative prop first, `commandfor` for an action a button triggers, a ref for what a
  prop cannot express (`focus()`, `scrollTo()`).
- `PDX_EXPOSE_UNDECLARED` as in alpha.

### Examples

```pdx
<template>
  <dialog :ref="box"><slot></slot></dialog>
</template>

<script>
let box = $signal<HTMLDialogElement | null>(null);
function open() { box?.showModal(); }
function close() { box?.close(); }
@expose open, close;
</script>
```

```pdx
<template>
  <button commandfor="confirm" command="--open">Delete</button>
  <app-dialog id="confirm">Sure?</app-dialog>
</template>

<script>
</script>
```

**Landed** (#140). Core listens for `command` on every host that exposes something, and calls the
exposed method with no arguments; a built-in command (no `--`) is left to the platform. The editor
types a `:ref` declared `$signal(null)` on a component as the element plus what the component exposes —
manifest methods for a library component, `@expose` for a `.pdx` — so the element's own API
(`focus()`) stays reachable and anything else is an error. The compiler reads a library component's
methods from its manifest for `PDX_COMMAND_UNKNOWN`; a project component's commands are not checked at
compile time. `PDX_COMMAND_TARGET_MISSING` is skipped when the template binds an `:id`. The
descriptor's `expose` stays a declaration: a TypeScript component exposes with `ctx.expose`, which is
what the manifest reads.

### Since

alpha → beta (#140)

## @provide, @inject — context tokens

### Syntax

```ebnf
ProvideDecl ::= "@provide" S Identifier S? "=" S? Expression End
InjectDecl  ::= "@inject" S Identifier S "from" S Identifier ( S? "=" S? Expression )? End
```

### Semantics

A context is identified by a **token**, not a string (#139): `context<T>(name)` from `@pdxui/core`
returns one, declared in a module and imported
(`export const CurrentUser = context<User>('current-user');`). `@provide CurrentUser = me;` publishes
a value to the elements below; `@inject user from CurrentUser;` reads the nearest one, typed `User`;
`@inject theme from Theme = defaultTheme;` supplies a default. The token is the key of the Web
Components context protocol, compared by identity (#103 — landed), so a provider from another library
that uses the same token answers. With a signal as the provided value, a consumer that subscribes is
called again on each change, and a plain value is delivered once (#103 — landed). The runtime API is `provide(token, value, host)` and
`inject(token, host, default?)` (#495 — landed: `context<T>()`, `ContextValue<C>`, the two functions,
`inject` asking the protocol when no PDX provider has the token, and the library's and router's
contexts as exported tokens — `DataSourceContext`, `ErrorContext`, `RouteParams`, `<pdx-provide
:token>`, `<pdx-data-source :token>`). The runes' token form is #496 — landed: the token must be
imported, and the default is a literal or an imported name. The manifest records which tokens each
component provides and injects.

### Rules

- No provider and no default: a run-time error naming the token and the component.
- String keys (`@provide user = …`, `@inject user;`, `@inject user as me;`) are a language change:
  `PDX_UNKNOWN_DECLARATION` (#496 — landed); `pdx migrate` generates a `contexts.ts` with one token
  per key and rewrites both sides (`@inject me from User`) (#497 — landed). A token it writes is
  `context<unknown>`: give it its type.
- `useProvided`, `tryUseProvided`, `tryInject`, `requestContext`, `provideWritable`, `useWritable`,
  `tryUseWritable` leave the public exports (#495 — landed; an import of one is `PDX_REMOVED_FORM`;
  the bus and channel APIs leave with #144).

### Examples

```ts
// contexts.ts
import { context } from '@pdxui/core';
export interface User { id: number; name: string }
export const CurrentUser = context<User>('current-user');
```

```pdx
<template><slot></slot></template>

<script>
import { CurrentUser } from './contexts';
@provide CurrentUser = { id: 1, name: 'Ada' };
</script>
```

```pdx
<template><p>{{ user.name }}</p></template>

<script>
import { CurrentUser } from './contexts';
@inject user from CurrentUser;
</script>
```

### Since

alpha → beta (#139)

## The TypeScript descriptor

### Syntax

```ts
component('pdx-select', {
  props:   { size: prop<'sm' | 'md' | 'lg'>('md'), options: prop.required<Option[]>() },
  models:  { value: model<string>('', { form: true }) },
  events:  { open: event<void>() },
  slots:   { item: slot<(o: Option) => Node>() },
  states:  ['open'],
  parts:   ['trigger', 'popup'],
  expose:  ['focus'],
  host:    { role: 'combobox' },
  variants: { size: ['sm', 'md', 'lg'] },
  setup(ctx) { /* ctx typed from the fields above */ },
});
```

### Semantics

The library's components are written in TypeScript with this descriptor (owner decision 2026-10-10,
#123): every field carries the semantics of the `.pdx` declaration of the same name, and a `.pdx`
compiles into the same descriptor, so the behaviour exists once, in core. `ctx` is typed from it
(`ctx.size()` is the union; `ctx.emit('nope')` is a type error), and the manifest reads props, events,
slots, states, parts and variants from its types, not from JSDoc. The constructor form of alpha
(`props: { x: { type: String } }`) is a language change. Whether the library moves to `.pdx` is decided
by a measured pilot on three components (#137): if the medium one (`pdx-select`) needs no escape
hatch, `.pdx` becomes the default for the library.

**Landed** (#123): the builders `prop`, `prop.required`, `event`, `model` and `slot` (`@pdxui/core`),
every field above in the descriptor's type, and the behaviour of two of them. `props` types `ctx`
from each type argument; a `prop.required` the host does not set is reported in development. `events`
types `ctx.emit` — the name is a declared one and the detail its type — and, since #138, an event
bubbles only when declared `{ bubbles: true }`; emitting an undeclared one is reported in development
and still dispatched. A `.pdx` compiles its `@event` names into `events`, `(bubbles)` as
`{ bubbles: true }`. The manifest reads a prop's type and an event's detail type from the
type arguments; `pdx-select` and `pdx-toggle` are written this way. The other fields are typed and get
their behaviour in their own issues (`states` landed since, #132; `models`, #124; `slots`, #489: each
is a function property of the element, which `@render` calls).
The constructor form is still accepted.

### Since

beta (#123, #137)

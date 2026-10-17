# The script

The `<script>` of a component: TypeScript statements, some of which are **declarations** (a line
that starts with `@`) and some of which use a **`$` rune**. In the beta there is one script grammar
(#158): no `setup` attribute that changes the meaning, no legacy mode. The declarations of the
component contract (`@prop`, `@model`, `@event`, `@slot`, `@generic`, `@state`, `@part`, `@host`,
`@expose`, `@provide`, `@inject`, `@variants`) are in [components.md](components.md); route
declarations in [routing.md](routing.md); `@fetch`, `@action`, `@form`, `@store` in
[data.md](data.md). This page defines the script itself, the runes and the module declarations.

## The script and its rewrite

### Syntax

```ebnf
Script         ::= ( S? ScriptItem )* S?
ScriptItem     ::= Declaration | RuneStatement | Statement
```

### Semantics

Unchanged from alpha in how declarations are found (a line that starts with `@keyword` in code) and
what the template sees (every top-level name except those starting with `_`). The beta has one
reading rule (decisions.md 11 — proposed): every declaration may span lines when it opens a balanced
`{ … }` or `( … )` on its first line, and it ends at its `;` or at the end of that block; alpha
allowed it declaration by declaration. A malformed declaration of a known keyword is `PDX_UNKNOWN_DECLARATION`, with the
form below as its hint.

**The signal rewrite** (one AST pass, as in alpha). The table differs from alpha in one row, decided
on 2026-10-11 (#187): **assignment stores the value as it is**.

| Written | Generated |
|---|---|
| `count` (a read) | `__count()` |
| `count++`, `++count` / `count--`, `--count` | `__count.set(__v => __v + 1)` / `__count.set(__v => __v - 1)` |
| `count += x` (and every compound operator) | `__count.set(__v => __v + x)` |
| `count \|\|= x`, `count &&= x`, `count ??= x` | `(__count() \|\| __count.setRaw(x))`, `(__count() && __count.setRaw(x))`, `(__count() ?? __count.setRaw(x))` — the short circuit stays, and the assignment branch stores `x` as it is (β #187: a logical assignment is an assignment, not an update; `handler ??= callback` stores `callback`) |
| `count = x` | **`__count.setRaw(x)`** (β #187) — `x` is stored even when it is a function |
| `count = f(count)` (the right side reads `count`) | `__count.setRaw(f(__count.peek()))` (β #187) — the read on the right side is untracked, as the updater form's `prev` was: tracked, `count = count + 1` inside an effect would make the effect depend on what it writes and re-run without end |
| `count.peek()`, `count.setRaw(v)` | `__count.peek()`, `__count.setRaw(v)` — the signal's own methods (β #187) |
| `{ count }` (shorthand property) | `{ count: __count() }` |
| `total` (a prop, a model or a `$derived`, read) | `total()` |

### Rules

- A parameter or local of the same name shadows the signal; a property name is not rewritten (alpha).
- **A signal that holds a function, called.** In alpha a callee is not rewritten, so `onSave()` with
  `onSave` a `$signal` names nothing that exists. In the beta a `$signal` name in callee position is
  read and then called: `onSave()` → `__onSave()()` in the script and `ctx.onSave()()` in a template
  (decisions.md 17 — proposed; a fix, like #187).
- A `$` rune outside the position the compiler reads it in — `$signal`, `$derived`, `$store` outside
  the initialiser of a top-level declaration, `$effect`, `$watch` outside a top-level statement — is
  `PDX_RUNE_POSITION` (error) instead of a silent run-time `ReferenceError` (decisions.md 12 —
  proposed); the hint names the core function for that place (`signal()`, `effect()`).
- Changing a signal's value in place is `PDX_SIGNAL_MUTATED_IN_PLACE` (warning, #151 — landed): a
  mutating method (`push`, `splice`, `sort`, `set`, `add`, `delete`, `clear`, …) or a member write,
  with a fix for `push` and a one-level field. In a template event handler too (#210 — landed).
- A fragment the rewriter cannot parse is `PDX_REWRITE_FALLBACK` (warning).

### Since

alpha → beta (#158, #187)

## The `$` runes

### $signal

#### Syntax

```ebnf
RuneDecl     ::= ( "let" | "const" | "var" ) S RuneBinding ( S? "," S? ( RuneBinding | Binding ) )* End
RuneBinding  ::= Identifier S? ( ":" S? Type S? )? "=" S? Rune S? ( "<" Type ">" )? "(" Expression? ")"
Rune         ::= "$signal" | "$derived" | "$store"          /* only $signal may omit the argument */
```

#### Semantics

Unchanged from alpha, except the assignment rule above: a `$signal` may hold any value, a function
included, and `x = v` stores `v`. `$signal()` with no argument starts at `undefined` (#186, landed).
The assignment rule is a fix of a defect (#187 was a bug: a function could not be stored), so it
applies as soon as it lands.

#### Rules

As alpha (`PDX_NON_REACTIVE`, `PDX_UNUSED_REACTIVE`, `PDX_VERSION_COUNTER`,
`PDX_SIGNAL_MUTATED_IN_PLACE`), plus `PDX_RUNE_POSITION` (above).

#### Examples

The template below calls the stored handler, through the callee rule above.

```pdx
<template>
  <button @click="onSave()">{{ label }}</button>
</template>

<script>
let label = $signal('Save');
let onSave = $signal<() => void>(() => {});

function configure(handler: () => void) {
  onSave = handler;          // stored, not called (#187)
  label = 'Save now';
}
</script>
```

#### Since

alpha → beta (#187)

### $derived, $effect, $watch

#### Syntax

```ebnf
DerivedDecl  ::= RuneDecl                         /* with "$derived" */
EffectCall   ::= "$effect" S? "(" S? Expression S? ")" End
WatchCall    ::= "$watch" S? "(" S? Expression S? "," S? Expression ( S? "," S? Expression )? S? ")" End
```

#### Semantics

Unchanged from alpha, with the runtime guarantees the beta adds: a reader of a `$derived` (an effect,
a binding, another `$derived`) runs again only when the `$derived`'s value actually changed — a
change of a source that leaves the value equal (`Object.is`) does not re-run anything downstream
(#115 — landed); dependencies are tracked once per run and kept between runs (#116 — landed).

#### Since

alpha (runtime: #115, #116)

### $store

Defined in [data.md](data.md). Unchanged.

### $t, $n, $d, $r

```ebnf
I18nCall ::= ( "$t" | "$n" | "$d" | "$r" ) S? "(" S? Expression ( S? "," S? Expression )? S? ")"
```

Unchanged from alpha (`docs/language/script.md`).

### $emit — removed

`$emit(name, detail)` is not part of the beta (#138 — landed). An event is declared with `@event`
([components.md](components.md)) and dispatched by the function the declaration creates. `$emit` is
`PDX_REMOVED_FORM`; `pdx migrate` rewrites `$emit('saved', x)` to
`saved(x)` and adds `@event saved: unknown;` when the declaration is missing. A hyphenated name,
which no `@event` can declare, is listed for a person to rewrite.

## Module declarations

### @tag

```ebnf
TagDecl ::= "@tag" S StringLiteral End
```

Unchanged, plus `PDX_TAG_RESERVED` for an application tag starting with `pdx-` (#136,
[file.md](file.md#the-tag)).

### @use

```ebnf
UseDecl ::= "@use" S "'" [^']+ "'" S "from" S "'" [^']+ "'" End
```

Unchanged (a side-effect import of a package that registers a foreign Web Component). It is in the
single rune list the editor reads (#106 — landed).

### @mixin — removed

`@mixin './x.ts' as name` ran a module's `setup(ctx)`; an imported function called in the script does
the same with no keyword (`const clock = useClock();`), and core's lifecycle functions (`onMount`,
`onDestroy`, `effect`) work inside it. The beta removes `@mixin` (decisions.md 6 — proposed);
no `.pdx` file in the repository uses it. It is `PDX_REMOVED_FORM`.

### @snippet (in the script)

```ebnf
SnippetDecl   ::= "@snippet" S Identifier S? "(" S? SnippetParams? S? ")" S? "{" Template "}"
SnippetParams ::= SnippetParam ( S? "," S? SnippetParam )*
SnippetParam  ::= Identifier ( S? ":" S? Type )?
```

Declares a template function the component's own template renders with `@render name(args)`. In
alpha the body is raw markup copied into an `html` literal (`{{ }}` not read); in the beta the body
is a **template**, compiled like any other, so a snippet written in the script and a snippet passed
inside a component's tag (#131, [components.md](components.md)) are the same thing (decisions.md 9 —
proposed). `pdx migrate` turns `${arg}` into `{{ arg }}`.

### @i18n

Unchanged from alpha (grammar in [grammar.md](grammar.md)).

### @raw (in the script)

```ebnf
RawScriptBlock ::= "@raw" S? "{" /* TypeScript statements, as written */ "}"
```

Unchanged: statements that reach the module as written, with no rewrite.

# Diagnostics

Every `PDX_*` code the PDX tooling reports, grouped by the construct that raises it. The list is the
compiler's diagnostics catalogue (`DIAGNOSTICS`, in `packages/compiler/src/diagnostics/catalog.ts`),
and `packages/compiler/tests/language-reference.test.ts` fails when this page and the catalogue
disagree. Each line here is the catalogue's one-line summary; `pdx explain <CODE>` prints the full
entry, and the site's diagnostics page is generated from the same catalogue.

Severity is the catalogue's (`error`, `warn`, `info`). Codes marked *(design)* are the catalogue's
`design` category: a review question a heuristic raises, not a defect.

## The file and its blocks

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_EMPTY_SOURCE` | error | An empty `.pdx` file (build error). | [The file](overview.md#the-file) |
| `PDX_DUPLICATE_TEMPLATE` | error | A second `<template>` block in a `.pdx`. | [The file](overview.md#the-file) |
| `PDX_DUPLICATE_SCRIPT` | error | A second `<script>` block in a `.pdx`. | [The file](overview.md#the-file) |
| `PDX_SCRIPT_SYNTAX_ERROR` | error | The `<script>` does not parse. | [The file](overview.md#the-file) |
| `PDX_SETUP_REDUNDANT` | info | `<script setup>`: `setup` has no meaning (#158). | [The file](overview.md#the-file) |
| `PDX_TS_UNSUPPORTED` | error | TypeScript in a `.pdx` script that has a runtime of its own: an enum, a namespace, a parameter property, `import = require()`. | [The file](overview.md#the-file) |
| `PDX_TAG_COLLISION` | error | Two compiled `.pdx` files register the same tag (build error). | [The tag](overview.md#the-tag) |
| `PDX_TAG_RESERVED` | error | An application component's tag starts with `pdx-`, the @pdxui packages' prefix (#136). | [The tag](overview.md#the-tag) |
| `PDX_TAG_COLLISION_RESOLVER` | warn | Two component files derive the same tag; the second is not auto-importable. | [The tag](overview.md#the-tag) |
| `PDX_REMOVED_FORM` | error | A form the beta removed from the language, with the form that replaces it. | [Removed forms and browser targets](overview.md#removed-forms-and-browser-targets) |

## Script declarations and runes

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_UNKNOWN_DECLARATION` | error | A known `@` declaration, or a `$signal` / `$derived` / `$store` declaration, written in a shape the compiler does not recognise; an `@store` `persist` that is not `'local'` or `'session'`. | any `@` declaration, `$signal`, `@store`, [script.md](script.md), [data.md](data.md) |
| `PDX_RUNE_POSITION` | error | A `$` rune where the compiler does not read it: not the initialiser of a top-level declaration, or not a top-level statement. | `$signal`, `$derived`, `$store`, `$effect`, `$watch`, [script.md](script.md) |
| `PDX_DUP_DECLARATION` | error | The same name declared twice at the top of the script: runes, `@prop`, functions, classes, plain variables. | [script.md](script.md) |
| `PDX_SCRIPT_EXPORT` | error | An `export` of a value in a component script, which runs inside the component's setup. | [script.md](script.md) |
| `PDX_PROP_NO_TYPE` | error | `@prop` without a type annotation. | `@prop`, [script.md](script.md) |
| `PDX_PROP_INVALID_TYPE` | warn | A `@prop`'s type annotation is malformed. | `@prop`, [script.md](script.md) |
| `PDX_PROP_TYPE_MISMATCH` | warn | A `@prop`'s default does not match its type. | `@prop`, [script.md](script.md) |
| `PDX_DUP_PROP` | error | The same `@prop` declared twice. | `@prop`, [script.md](script.md) |
| `PDX_PROP_WRITE` | warn | A component writes one of its own props (CD-A2). | `@prop`, [script.md](script.md) |
| `PDX_MALFORMED_EVENT` | error | `@event` written in a shape the compiler does not recognise. | `@event`, [script.md](script.md) |
| `PDX_DUP_EVENT` | error | The same `@event` declared twice. | `@event`, [script.md](script.md) |
| `PDX_EVENT_NAME_CASE` | warn | An `@event` name with an uppercase letter. | `@event`, [script.md](script.md) |
| `PDX_EVENT_BUBBLES_UNUSED` | info | An `@event(bubbles)` no template in the project listens to above the component (#138). | `@event`, [script.md](script.md) |
| `PDX_EXPOSE_UNDECLARED` | error | `@expose` names something the component does not declare. | `@expose`, [script.md](script.md) |
| `PDX_COMMAND_TARGET_MISSING` | error | A `commandfor` whose target id is not in the template. | invoker commands, [template.md](template.md) |
| `PDX_COMMAND_UNKNOWN` | error | A command its target does not answer: a `--name` the component does not expose, or a built-in command for another element type. | invoker commands, [template.md](template.md) |
| `PDX_ATTACH_UNKNOWN` | error | `attach:name` whose name is neither in the script nor one of core's attachments (#143). | `attach:`, [template.md](template.md) |
| `PDX_PIPE_SINGLE` | info | A template interpolation with exactly one pipe; its fix is the call (#129). | `{{ }}` pipes, [template.md](template.md) |
| `PDX_BINDING_MODIFIER` | error | A binding modifier outside the closed list (#126). | `::name`, `:name`, [template.md](template.md) |
| `PDX_PROP_REQUIRED` | error | A component used without a prop it requires (#130). | `@prop`, [script.md](script.md) |
| `PDX_NAME_RESERVED` | error | A `@prop`, `@model` or typed `@slot` named after a member of the element (#542). | `@prop`, `@model`, `@slot`, [script.md](script.md) |
| `PDX_SLOT_REQUIRED` | error | A component used without a snippet it requires (#489). | `@slot`, [script.md](script.md); `@snippet`, [template.md](template.md) |
| `PDX_TWO_WAY_NOT_MODEL` | error | `::x` on a component prop that is not one of its models (#124). | `::name`, [template.md](template.md); `@model`, [script.md](script.md) |
| `PDX_PART_MISSING` | error | A declared `@part` that no element of the template carries. | `@part`, [script.md](script.md) |
| `PDX_PART_DUPLICATE` | error | A `@part` written on more than one element. | `@part`, [script.md](script.md) |
| `PDX_PART_UNDECLARED` | error | A `data-part` that names no `@part`. | `@part`, [script.md](script.md) |
| `PDX_HOST_INVALID_ATTRIBUTE` | error | On `@host`, a form with no meaning on a host: `::x`, `data-part`, a generic argument. | `@host`, [script.md](script.md) |
| `PDX_MALFORMED_STATE` | error | `@state` written in a shape the compiler does not recognise. | `@state`, [script.md](script.md) |
| `PDX_STATE_NOT_BOOLEAN` | error | `@state` given something that is not a boolean. | `@state`, [script.md](script.md) |
| `PDX_UNUSED_REACTIVE` | info | A `$signal` or `$derived` that nothing reads. | `$signal`, `$derived`, [script.md](script.md) |
| `PDX_VERSION_COUNTER` | warn | A `$signal` only ever bumped, and read only to be discarded (CD-S3, a heuristic). *(design)* | `$signal`, [script.md](script.md) |
| `PDX_CIRCULAR_DERIVED` | error | `$derived` values that depend on each other in a cycle. | `$derived`, [script.md](script.md) |
| `PDX_DERIVED_WRITE` | warn | Code that writes into the object a `$derived` returned (CD-S2). | `$derived`, [script.md](script.md) |
| `PDX_EFFECT_STATE` | warn | State written by an effect from what the effect reads (CD-D2, a heuristic). *(design)* | `$effect`, [script.md](script.md) |
| `PDX_NON_REACTIVE` | warn | A plain `let` the template reads and the script changes. | `$signal`, [script.md](script.md) |
| `PDX_HAND_WRITTEN_SIGNAL` | error | A `signal()` or `computed()` written by hand in the setup and read bare by the template: it shows the function, not its value (#362). | `$signal`, `$derived`, [script.md](script.md) |
| `PDX_SIGNAL_MUTATED_IN_PLACE` | warn | A `$signal`'s value changed in place: a mutating method (`push`, `splice`, `set`, `add`…) or a write to a member (`user.name = …`, `items[0] = …`). | `$signal`, [script.md](script.md) |
| `PDX_REWRITE_FALLBACK` | warn | A fragment of the setup the signal rewriter could not parse. | the signal rewrite, [script.md](script.md) |
| `PDX_DOCUMENT_QUERY` | warn | `document.querySelector` (or a sibling) in a component (CD-A1). | [script.md](script.md) |
| `PDX_LISTENER_LEAK` | warn | An `addEventListener` on a global target with no matching removal (CD-D3). | [script.md](script.md) |
| `PDX_SEVERAL_PIECES` | warn | One script holds several groups of state that share nothing (CD-B1, a heuristic). *(design)* | [script.md](script.md) |

## Template bindings and directives

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_RAW_INTERPOLATION` | warn | A `${…}` in the template markup. | interpolation, [template.md](template.md) |
| `PDX_RAW_INTERPOLATION_IN_BINDING` | error | A `${…}` inside the value of a bound attribute (`:x`, `::x`, `@x`). | bindings, [template.md](template.md) |
| `PDX_UNDECLARED_REF` | error | A name the template reads that `<script>` does not declare. | expressions, [template.md](template.md) |
| `PDX_UNRESOLVED_COMPONENT` | warn | A custom-element tag that no component package and no project component defines. | component tags, [template.md](template.md) |
| `PDX_UNKNOWN_PROP` | warn | A bound name the component does not declare as a prop. | `:prop` bindings, [template.md](template.md) |
| `PDX_PROP_NAME_CASE` | warn | A bound prop written in lowercase that matches a camelCase prop. | `:prop` bindings, [template.md](template.md) |
| `PDX_INVALID_ENUM_VALUE` | warn | A static or literal attribute value (`size="huge"`, `:size="'huge'"`) outside the values its prop declares. | attributes, [template.md](template.md) |
| `PDX_EMPTY_FOR` | warn | An `@for` with an empty body. | `@for`, [template.md](template.md) |
| `PDX_VIRTUAL_SHAPE` | error | A `@for … @virtual` without the shape it needs: alone in a native element, with one root element per row. | `@for … @virtual`, [template.md](template.md) |
| `PDX_VIRTUAL_TRANSITION` | error | A `@for … @virtual` with `@transition`, `@stagger`, `@mode` or `@move`. | `@for … @virtual`, [template.md](template.md) |
| `PDX_AWAIT_NO_LOADING` | info | `@await` without a `@loading` block. | `@await`, [template.md](template.md) |
| `PDX_AWAIT_TIMING` | error | `@await`'s `maxMs` is not greater than its `minMs`: the timeout would give up before `@loading` could show. | `@await`, [template.md](template.md) |
| `PDX_DEFER_UNKNOWN_TRIGGER` | error | A `@defer` trigger the runtime does not know (`@defer (viewprt)`). | `@defer`, [template.md](template.md) |
| `PDX_KEEPALIVE_MAX` | error | A `<component :is @keepAlive(n)>` whose maximum is not a whole number of at least 1. | `<component :is>`, [template.md](template.md) |
| `PDX_DYNAMIC_CONTENT` | warn | Content between `<component :is>` and `</component>`, which is not rendered. | `<component :is>`, [template.md](template.md) |
| `PDX_UNKNOWN_DIRECTIVE` | warn | A `@word (…)` or `@word { … }` in the template that is no directive and no plugin's: left as text, reported once per name. | any `@`-word, [template.md](template.md) |
| `PDX_INLINE_NODE_UNSUPPORTED` | warn | A template node the inline render path cannot compile. | the compiled template, [template.md](template.md) |
| `PDX_INLINE_BINDINGS_IGNORED` | warn | `pdx({ inlineBindings })` is given; a `.pdx` has one render path, and the option selects nothing. | the plugin's options, [template.md](template.md) |

## Styles

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_GLOBAL_SELECTOR` | warn | `:global()` in a style. | [styles.md](styles.md) |
| `PDX_LIBRARY_INTERNALS` | warn | A style that targets a library component's internal class (CD-C2). | [styles.md](styles.md) |
| `PDX_COLOUR_LITERAL` | warn | A colour written as a value in a `.pdx` style (CD-C3). *(design)* | [styles.md](styles.md) |
| `PDX_SHARED_STYLES` | warn | One stylesheet serves several of the pieces CD-B1 finds (CD-C1, a heuristic). *(design)* | [styles.md](styles.md) |
| `PDX_VARIANTS_MALFORMED` | error | `@variants` holds something that is not an axis. | `@variants`, [styles.md](styles.md) |
| `PDX_VARIANT_UNKNOWN` | error | An `@variant` names an axis or a value `@variants` does not declare. | `@variant`, [styles.md](styles.md) |
| `PDX_VARIANT_UNSTYLED` | warn | A declared variant value has no `@variant` rule. | `@variants`, [styles.md](styles.md) |

## Routing

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_PAGE_INVALID_PATH` | error | An `@page` path that does not start with '/'. | `@page`, [routing.md](routing.md) |
| `PDX_PAGE_INVALID_CONSTRAINT` | warn | A route param constraint that is not a known type. | `@page`, [routing.md](routing.md) |
| `PDX_PAGE_EMPTY_CONSTRAINT` | error | A route param with empty parentheses: `:id()`. | `@page`, [routing.md](routing.md) |
| `PDX_LABEL_NOT_FOUND` | warn | A route's label names a function the script does not declare. | `@page`, [routing.md](routing.md) |
| `PDX_ROUTE_FIELD_INVALID` | error | A `@params` or `@search` field its parser cannot read, such as a type in quotes. | `@params`, `@search`, [routing.md](routing.md) |
| `PDX_PREFETCH_POLICY` | error | A route's `prefetch` names a policy the router does not have. | `@page`, [routing.md](routing.md) |
| `PDX_PAGE_UNKNOWN_OPTION` | error | An `@page` option the router does not have. | `@page`, [routing.md](routing.md) |
| `PDX_LOADER_NOT_FOUND` | warn | `@loader` names a function the script does not declare. | `@loader`, [routing.md](routing.md) |
| `PDX_ROUTE_RENDERS` | warn | A route that renders many structural blocks inline, none a component (CD-B2, a heuristic). *(design)* | `@page`, [routing.md](routing.md) |

## Data

| Code | Severity | Meaning | Construct |
|---|---|---|---|
| `PDX_FETCH_INVALID` | error | `@fetch` without a valid `'METHOD /url'`. | `@fetch`, [data.md](data.md) |
| `PDX_FETCH_METHOD` | error | `@fetch` with a method other than GET. | `@fetch`, [data.md](data.md) |
| `PDX_FETCH_TYPE_COLON` | error | `@fetch` with its type written after `:`. | `@fetch`, [data.md](data.md) |
| `PDX_FETCH_UNKNOWN_OPTION` | error | `@fetch` with an option `resource()` does not take. | `@fetch`, [data.md](data.md) |
| `PDX_FETCH_NO_ERROR_UI` | info | An `@fetch` whose error state the template never shows. | `@fetch`, [data.md](data.md) |
| `PDX_FORM_NO_SUBMIT` | info | A `@form` that nothing submits. | `@form`, [data.md](data.md) |
| `PDX_FORM_ARRAY_RULES_IGNORED` | warn | Validation rules inside a `@form` array field. | `@form`, [data.md](data.md) |
| `PDX_FORM_FIELD_UNPARSED` | warn | A `@form` field the compiler did not understand. | `@form`, [data.md](data.md) |
| `PDX_FORM_UNKNOWN_RULE` | error | A `@form` rule that is neither a core validator nor a function of the script. | `@form`, [data.md](data.md) |
| `PDX_STORE_EXPORT` | error | An `export` in a `@store` module that reads a name the store owns. | `@store`, [data.md](data.md) |

## The build and the project

Codes that no single construct raises: they come from a check over several files, from `pdx check`
options, or from the `pdx-ignore` comments that silence other codes. A `pdx-ignore` comment is
`pdx-ignore <CODE>: reason` (the next line) or `pdx-ignore-file <CODE>: reason` (the whole file),
written as `<!-- … -->` in the template, `/* … */` in a style and `// …` in the script.

| Code | Severity | Meaning | Raised by |
|---|---|---|---|
| `PDX_TS` | error | A TypeScript error in the script or a template expression (`pdx check --types`). | `pdx check --types` |
| `PDX_I18N_MISSING_KEY` | warn | A translation key present in one locale and missing in another (`pdx check --i18n`). | `pdx check --i18n` |
| `PDX_REPEATED_LOGIC` | warn | The same logic written in the same shape in several files (CD-L1, `pdx check --design`). *(design)* | `pdx check --design` |
| `PDX_SHARED_LOADING` | warn | The same endpoint loaded by a route and by a route inside it (CD-D1, a heuristic, `pdx check --design`). *(design)* | `pdx check --design`, over [routing.md](routing.md) and [data.md](data.md) |
| `PDX_IGNORE_WITHOUT_REASON` | error | A `pdx-ignore` comment that does not say why. | `pdx-ignore` |
| `PDX_IGNORE_UNUSED` | warn | A `pdx-ignore` that silences nothing. | `pdx-ignore` |

# Diagnostics in the beta

The codes the beta adds, changes or retires. Every alpha code of `docs/language/diagnostics.md` that
is not listed here stays as it is. «Named by» says where the code's name comes from: an issue that
specifies it, or this specification (a proposal the implementing issue may rename).

## Added

| Code | Severity | Meaning | Construct | Named by |
|---|---|---|---|---|
| `PDX_REMOVED_FORM` | error | A form the beta removes; the message names the beta form and `pdx migrate`. | every language change, [migration.md](migration.md) | #121 (decisions.md 36) |
| `PDX_SETUP_REDUNDANT` | info | `<script setup>`: `setup` has no meaning in the beta. | the file | #158 |
| `PDX_TAG_RESERVED` | error | An application tag that starts with `pdx-`. | the tag | #136 (landed) |
| `PDX_INLINE_BINDINGS_IGNORED` | warn | `pdx({ inlineBindings })` no longer selects a render path. | configuration | #107 |
| `PDX_PROP_REQUIRED` | error | A required prop the parent does not give. | `@prop` | #130 (landed) |
| `PDX_TWO_WAY_NOT_MODEL` | error | `::x` on a component prop that is not a `@model`. | `::name`, `@model` | #124 |
| `PDX_BINDING_MODIFIER` | error | A binding modifier outside the closed list. | `::name`, `:name.once` | #126 |
| `PDX_FORM_REQUIRED_IN_MARKUP` | warn | `required` on a control bound to a form field; it belongs in the schema. | `@form` | #128 (landed) |
| `PDX_SLOT_REQUIRED` | error | A required slot the parent does not fill. | `@slot` | #131 — landed, #489 |
| `PDX_STATE_NOT_BOOLEAN` | error | An `@state` expression that is not boolean. | `@state` | #132 |
| `PDX_PART_MISSING` | error | A declared part with no `data-part` element. | `@part` | #134 (landed) |
| `PDX_PART_DUPLICATE` | error | A part on more than one element. | `@part` | #134 (landed) |
| `PDX_PART_UNDECLARED` | error | A `data-part` with no declaration. | `@part` | #134 (landed) |
| `PDX_EVENT_BUBBLES_UNUSED` | info | An `@event(bubbles)` no ancestor in the project listens to. | `@event` | #138 (landed) |
| `PDX_COMMAND_TARGET_MISSING` | error | A `commandfor` whose target id is not in the template. | commands | #140 (landed) |
| `PDX_COMMAND_UNKNOWN` | error | A custom command that is not an exposed method of the target. | commands | #140 (landed) |
| `PDX_ATTACH_UNKNOWN` | error | `attach:name` with no `name` in scope. | `attach:` | #143 (landed) |
| `PDX_VARIANT_UNKNOWN` | error | An `@variant` naming an undeclared axis or value. | `@variants` | #153 (landed) |
| `PDX_VARIANT_UNSTYLED` | warn | A declared variant value with no rule. | `@variants` | #153 (landed) |
| `PDX_VARIANTS_MALFORMED` | error | An axis of `@variants` that cannot be read: no values, declared twice, a default outside its values. | `@variants` | #153 (landed) |
| `PDX_UNKNOWN_DIRECTIVE` | warn | A directive registered by no plugin. | directives | #296 (landed; #100 planned it and did not add it) |
| `PDX_LOADER_UNKNOWN_OPTION` | error | An `@loader` option other than `staleTime`, or a `staleTime` the compiler cannot read as milliseconds. | `@loader` | this specification (#148 asks for the check — landed, #148) |
| `PDX_ACTION_UNKNOWN_OPTION` | error | An `@action` option outside its list. | `@action` | this specification (landed, #501) |
| `PDX_RUNE_POSITION` | error | A `$` rune outside the position the compiler reads it in. | `$signal`, `$derived`, `$store`, `$effect`, `$watch` | this specification (decisions.md 12 — landed, #278) |
| `PDX_HOST_INVALID_ATTRIBUTE` | error | On `@host`, a form with no meaning on a host: `::x`, `data-part`, a generic argument. | `@host` | #133 (landed; decisions.md 21) |
| `PDX_FORM_FIELD_RESERVED` | error | A form field named like a form member (`valid`, `errors`, `reset`, `dirty`, `getValues`, `handleSubmit`, `array`, …). | `@form` | #128 (landed; decisions.md 13) |
| `PDX_PIPE_SINGLE` | info | A single template pipe; the hint is the function call. | `\|` pipes | #129 (landed) |
| `PDX_DEFER_UNKNOWN_TRIGGER` | error | A `@defer` trigger outside the grammar (alpha fires it at once). | `@defer` | this specification (proposed, decisions.md 27) |
| `PDX_AGENT_ACTION_UNBOUND` | error | An `@action` with `agent` that no control in the template runs: a capability only an agent would have. | `@action`, [agents.md](agents.md) | this specification (decisions.md 31 — landed, #502) |
| `PDX_AWAIT_TIMING` | error | `maxMs` not greater than `minMs`. | `@await` | #145 (landed; decisions.md 26) |
| `PDX_VIRTUAL_SHAPE` | error | `@virtual` on a `@for` that is not its parent's only content, or whose body has more than one root. | `@for` | this specification (proposed, decisions.md 45) |
| `PDX_VIRTUAL_TRANSITION` | error | `@virtual` together with `@move` or `@stagger`. | `@for` | this specification (proposed, decisions.md 29) |

## Changed

| Code | Change | Issue |
|---|---|---|
| `PDX_UNKNOWN_DECLARATION` | Also raised by a malformed beta form of `@slot` (a signature), `@inject` (`from` is required — landed with #496), `@event` (`(bubbles)` — landed with #138), and by `@store` with an unknown `persist` value (landed, #278). | this specification, following the alpha rule «a known keyword in an unknown shape» (#138 says it for `@event`) |
| `PDX_FETCH_NO_ERROR_UI` | Its example and fix use the async vocabulary (`users.state() === 'error'`, `users.error()`). | #141 |
| `PDX_TS` | Raised by the strict template projection: slot contexts, `@catch`/`@error` names and `$event` are typed, not `any`. | #122 — **landed** for the three typings; #468 — **landed**, the template under TypeScript's `strict` mode, in a program of its own: `strict` on the showcase's scripts raised 398 errors that were none, so the script stays in the lenient program and its names reach the template with the types it gives them. A library component's event details and slot contexts stay unchecked until its manifest types them (#131) |

## Retired

These belong to forms the beta removes, and no longer occur:

| Code | Why |
|---|---|
| `PDX_LEGACY_IN_SETUP` | The legacy script mode does not exist in the beta (#158). |
| `PDX_TEMPLATE_NAME_NOT_PROVIDED` | Same: it is a legacy-mode check (#158). |

`PDX_INLINE_NODE_UNSUPPORTED` stays: the single render path is the inline one, and the code is its
net for a node type the parser learns later.

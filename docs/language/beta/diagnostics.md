# Diagnostics in the beta

The codes the beta adds, changes or retires. Every alpha code of `docs/language/diagnostics.md` that
is not listed here stays as it is. «Named by» says where the code's name comes from: an issue that
specifies it, or this specification (a proposal the implementing issue may rename).

## Added

| Code | Severity | Meaning | Construct | Named by |
|---|---|---|---|---|
| `PDX_ALPHA_FORM` | warn (alpha) / error (beta) | A form the beta removes; the message names the beta form and `pdx migrate`. | every language change, [migration.md](migration.md) | #121 |
| `PDX_SETUP_REDUNDANT` | info | `<script setup>`: `setup` has no meaning in the beta. | the file | #158 |
| `PDX_TAG_RESERVED` | error | An application tag that starts with `pdx-`. | the tag | #136 |
| `PDX_INLINE_BINDINGS_IGNORED` | warn | `pdx({ inlineBindings })` no longer selects a render path. | configuration | #107 |
| `PDX_PROP_REQUIRED` | error | A required prop the parent does not give. | `@prop` | #130 |
| `PDX_TWO_WAY_NOT_MODEL` | error | `::x` on a component prop that is not a `@model`. | `::name`, `@model` | #124 |
| `PDX_BINDING_MODIFIER` | error | A binding modifier outside the closed list. | `::name`, `:name.once` | #126 |
| `PDX_FORM_REQUIRED_IN_MARKUP` | warn | `required` on a control bound to a form field; it belongs in the schema. | `@form` | #128 |
| `PDX_SLOT_REQUIRED` | error | A required slot the parent does not fill. | `@slot` | #131 |
| `PDX_STATE_NOT_BOOLEAN` | error | An `@state` expression that is not boolean. | `@state` | #132 |
| `PDX_PART_MISSING` | error | A declared part with no `data-part` element. | `@part` | #134 |
| `PDX_PART_DUPLICATE` | error | A part on more than one element. | `@part` | #134 |
| `PDX_PART_UNDECLARED` | error | A `data-part` with no declaration. | `@part` | #134 |
| `PDX_EVENT_BUBBLES_UNUSED` | info | An `@event(bubbles)` no ancestor in the project listens to. | `@event` | #138 |
| `PDX_COMMAND_TARGET_MISSING` | error | A `commandfor` whose target id is not in the template. | commands | #140 |
| `PDX_COMMAND_UNKNOWN` | error | A custom command that is not an exposed method of the target. | commands | #140 |
| `PDX_ATTACH_UNKNOWN` | error | `attach:name` with no `name` in scope. | `attach:` | #143 |
| `PDX_VARIANT_UNKNOWN` | error | An `@variant` naming an undeclared axis or value. | `@variants` | #153 |
| `PDX_VARIANT_UNSTYLED` | warn | A declared variant value with no rule. | `@variants` | #153 |
| `PDX_UNKNOWN_DIRECTIVE` | warn | A directive registered by no plugin. | directives | #100 |
| `PDX_LOADER_UNKNOWN_OPTION` | error | An `@loader` option other than `staleTime`. | `@loader` | this specification (#148 asks for the check) |
| `PDX_ACTION_UNKNOWN_OPTION` | error | An `@action` option outside its list. | `@action` | this specification |
| `PDX_RUNE_POSITION` | error | A `$` rune outside the position the compiler reads it in. | `$signal`, `$derived`, `$store`, `$effect`, `$watch` | this specification (proposed, decisions.md 12) |
| `PDX_HOST_INVALID_ATTRIBUTE` | error | On `@host`, a form with no meaning on a host: `::x`, `data-part`, a generic argument. | `@host` | this specification (proposed, decisions.md 21) |
| `PDX_FORM_FIELD_RESERVED` | error | A form field named like a form member (`valid`, `errors`, `reset`, `dirty`, `getValues`, `handleSubmit`, `array`). | `@form` | this specification (proposed, decisions.md 13) |
| `PDX_PIPE_SINGLE` | info | A single template pipe; the hint is the function call. | `\|` pipes | this specification (proposed, decisions.md 4) |
| `PDX_DEFER_UNKNOWN_TRIGGER` | error | A `@defer` trigger outside the grammar (alpha fires it at once). | `@defer` | this specification (proposed, decisions.md 27) |
| `PDX_AGENT_ACTION_UNBOUND` | error | An `@action` with `agent` that no control in the template runs: a capability only an agent would have. | `@action`, [agents.md](agents.md) | this specification (proposed, decisions.md 31) |
| `PDX_AWAIT_TIMING` | error | `maxMs` not greater than `minMs`. | `@await` | this specification (proposed, decisions.md 26) |
| `PDX_VIRTUAL_TRANSITION` | error | `@virtual` together with `@move` or `@stagger`. | `@for` | this specification (proposed, decisions.md 29) |
| `PDX_AWAIT_MAXMS_CHANGED` | warn (alpha) | An `@await` with `maxMs`: in the beta it times out to `@error` instead of rendering the body. | `@await` | this specification (proposed, decisions.md 26) |

## Changed

| Code | Change | Issue |
|---|---|---|
| `PDX_UNKNOWN_DECLARATION` | Also raised by a malformed beta form of `@slot` (a signature), `@inject` (`from` is required), `@event` (`(bubbles)`), and by `@store` with an unknown `persist` value. | this specification, following the alpha rule «a known keyword in an unknown shape» (the issues do not say) |
| `PDX_FETCH_NO_ERROR_UI` | Its example and fix use the async vocabulary (`users.state() === 'error'`, `users.error()`). | #141 |
| `PDX_TS` | Raised by the strict template projection: slot contexts, `@catch`/`@error` names and `$event` are typed, not `any`. | #122 |

## Retired at the beta level

These remain under `language: 'alpha'` and cannot occur under `'beta'`:

| Code | Why |
|---|---|
| `PDX_LEGACY_IN_SETUP` | The legacy script mode does not exist in the beta (#158). |
| `PDX_TEMPLATE_NAME_NOT_PROVIDED` | Same: it is a legacy-mode check (#158). |

`PDX_INLINE_NODE_UNSUPPORTED` stays: the single render path is the inline one, and the code is its
net for a node type the parser learns later.

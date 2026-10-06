# .pdx Pattern Library

Reference templates for agents and developers. Each file demonstrates a common UI pattern using the .pdx component format.

## Usage

These templates are NOT imported directly. They serve as **reference** for generating new components. An agent should read the relevant template before creating a similar component.

## Patterns

| File | Pattern | Key Features |
|------|---------|-------------|
| `form.pdx` | Form with validation | `@prop`, `$signal`, `@event`, two-way binding, submit |
| `crud-list.pdx` | CRUD list with add/edit/delete | `$signal` array, `@for`, mutation functions |
| `modal.pdx` | Dialog with confirm/cancel | `@prop open`, `@event`, backdrop, Escape key, ARIA |
| `tabs.pdx` | Tab panel with dynamic tabs | `@prop`/`@slot`, `@for`, `@if`, active state |
| `data-table.pdx` | Table with sort/filter/pagination | `$derived`, `@for`, computed state |
| `auth-guard.pdx` | Permission-gated content | `@require`, `@else`, role-based |
| `lazy-section.pdx` | Lazy-loaded content | `@defer`, `@placeholder`, `@loading`, `@error` |
| `responsive.pdx` | Responsive layout | `@show`, breakpoint signals, adaptive rendering |

## Syntax Quick Reference

```
@prop name: Type = default;     Declare an input property
@event name: PayloadType;       Declare an output event
@slot name;                     Declare a named slot
let x = $signal(value);         Reactive state
const y = $derived(expr);       Computed value
$effect(() => { ... });         Side effect
onMount(() => { ... });         Lifecycle: component mounted
onDestroy(() => { ... });       Lifecycle: component destroyed

@if (cond) { ... } @else { ... }
@for (items as item; track item.id) { ... }
@switch (expr) { @case (val) { ... } @default { ... } }
@require ('permission') { ... } @else { ... }
@show (cond) { ... }
@portal ('target') { ... }
@defer (trigger) { ... } @placeholder { ... } @loading { ... } @error { ... }

:prop="expr"                    One-way binding
::value="signal"                Two-way binding
@click="handler"                Event binding
{{ expr }}                      Interpolation
{{ expr | pipe1 | pipe2 }}      Piped interpolation
```

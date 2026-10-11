# The PDX language — beta specification (draft, 2026-10-11)

This is the **target** specification of the `.pdx` language at the `beta` level: the whole language
as it will be once the beta issues land, in one place. It replaces `docs/language/` when the beta
issues land — the beta replaces the alpha outright, with no compatibility level (decisions.md 36); until
then it lives in `docs/language/beta/`, and the reference in
`docs/language/` keeps describing what the compiler accepts today. Issues cite its sections.

| | `docs/language/` | this specification |
|---|---|---|
| Describes | the language the compiler reads **today** (`alpha`) | the language at the **beta** level |
| Checked by | `language-reference.test.ts`, against the compiler | review against the issues it cites |
| Changes when | an issue lands and updates its section | a decision changes; then the issue that implements it updates `docs/language/` |

When a beta issue lands, its section here and the matching section of `docs/language/` must say the
same thing. When they disagree before that, this page is the plan and the issue is the contract: a
disagreement with an issue is a defect of this specification, to fix here.

## Pages

| Page | What it defines |
|---|---|
| [grammar.md](grammar.md) | **Every production** of the beta language, in one EBNF — the formal core |
| [file.md](file.md) | The file and its blocks, the tag, one language with no levels, browser targets, the render model |
| [script.md](script.md) | Script declarations and `$` runes |
| [components.md](components.md) | The component contract: props, models, events, slots, states, parts, host, refs, context — in `.pdx` and in the TypeScript descriptor |
| [template.md](template.md) | Interpolation, bindings, attachments, block directives |
| [styles.md](styles.md) | `<style>`, scoping by target, variants, component tokens, the design CSS extensions |
| [routing.md](routing.md) | Pages, loaders, navigation, typed routes, static generation |
| [data.md](data.md) | The async vocabulary and its execution contract, `@fetch`, `@action` and its concurrency, `@form` and async validation, `@store`, `$store` |
| [lifecycle.md](lifecycle.md) | What effects, requests, timers, attachments, refs and snippets do when a block is removed, hidden, frozen, resumed or destroyed |
| [library.md](library.md) | What the beta asks of each `@pdxui/ui` component: contract, forms, states, parts, tokens, accessibility for people and agents, and when one is done |
| [agents.md](agents.md) | How an agent reads and operates an app: accessibility the framework guarantees, the description API, capabilities offered to agents |
| [performance.md](performance.md) | Guarantees with their measurements: the compiler, the compiled output, loading and deferred code, the first render, virtual lists, bounded memory, requests, heavy work, bundle budgets |
| [server.md](server.md) | Rendering outside the browser: Node-safe imports, static generation (render and replace), and the separate roadmap to hydration, per-request rendering and streaming |
| [diagnostics.md](diagnostics.md) | Codes the beta adds, changes or removes |
| [migration.md](migration.md) | Every alpha form that changes, its beta form, and what `pdx migrate` does |
| [decisions.md](decisions.md) | Every decision this specification adds to the issues it cites, what is still open, and the known defects of today's runtime |

## Scope

The beta covers the language, its client runtime and static generation (#160). It does **not**
cover streaming rendering, offline conflict resolution for writes, or hydration of server-rendered
markup: those are a separate roadmap, and nothing in these pages promises them.

Where a page says what the runtime must *do* — the execution contract in data.md, lifecycle.md,
performance.md — it says it as **rules with acceptance cases**, not as new syntax. New syntax is
kept to what a rule cannot express, and every piece of it names its issue or is marked proposed.

## How to read a construct

The notation and the five parts of a construct — **Syntax**, **Semantics**, **Rules**, **Examples**,
**Since** — are those of `docs/language/overview.md`. A construct whose beta form equals its alpha
form says **Unchanged** and gives only its grammar and what the beta adds around it; the full alpha
semantics stay in `docs/language/` and are not restated. **Since** reads `alpha`, `beta`, or
`alpha → beta` (changed), and every `beta` construct names the issue that implements it.

Three markers say how far each rule has come: a bare issue number is what that issue (or a recorded
owner decision on it) specifies; **landed** means the change is already on `main`; **proposed** or
**†** is a rule this specification decided (owner, 2026-10-11, recorded in
[decisions.md](decisions.md)) that no issue implements yet. Nothing in these pages is undecided
except what [decisions.md](decisions.md) lists under «Still open».

This page is a **draft**: it is the target the beta issues implement, not a description of what the
compiler accepts. Its examples are not compiled by the reference test, which reads only
`docs/language/*.md`.

## The principles this specification enforces

These come from the repository's own rules and from the decisions of 2026-10-10/11, and every
section below was checked against them:

1. **One way per common thing.** A beta form replaces its alpha alternatives; it does not sit beside
   them: a removed alpha form is an error, `PDX_REMOVED_FORM`, and `pdx migrate` rewrites it (file.md).
2. **A declaration, not wiring.** If a developer writes the same wiring twice, the language lacks a
   declaration.
3. **Explicit and greppable.** No implicit context, no type-based template selection, no name
   assembled at runtime. Every parameter is named.
4. **The platform first.** Where the browser has the feature (`:state()`, form association,
   invokers, `@scope`, style queries), PDX compiles to it instead of wrapping it.
5. **Every rule has a code.** A beta construct used wrongly is a `PDX_*` diagnostic, never a silent
   partial interpretation.

## Sources

The roadmap issues **#96–#160** (beta: #120–#159; render path and performance: #107, #109–#119;
static generation: #160), the decisions recorded on #47, #108, #170 and #187 (2026-10-11) and on #48
(2026-10-10), the landed fixes it cites (#85, #98, #101–#106, #114–#116, #186, #203), and the current
reference in `docs/language/`.

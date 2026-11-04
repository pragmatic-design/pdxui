# The PDX language

This is the formal reference of the `.pdx` language: what each construct accepts, what the compiler
makes of it, what it reports when the construct is wrong, and what the runtime guarantees about what
it compiles to. It describes the language **as the compiler reads it**. The guide pages on the site
teach; this reference defines. When the two disagree, this reference is right only if the compiler
agrees with it, and `packages/compiler/tests/language-reference.test.ts` checks that it does:

- every rune in `packages/compiler/src/compiler/runes.ts` has a section;
- every block directive in `packages/compiler/src/parser/template.ts` has a section in template.md;
- every construct of the construct pages has its five parts, a grammar and an example;
- every example on every page compiles with no warning, type-checks and resolves its imports;
- diagnostics.md indexes every code of the catalogue, and no page names a code that does not exist.

`grammar-runes-lockstep.test.ts` holds the declarations and `$` runes of grammar.md equal to the
rune list, and `migration-registry-lockstep.test.ts` holds migration.md equal to the registry of
language changes (#159). The beta specification that lived in `docs/language/beta/` was promoted into
these pages when the beta issues landed (#159).

## Pages

| Page | What it defines |
|---|---|
| [file.md](file.md) | The file and its blocks, the tag, one language with no levels, browser targets, the render model, static generation |
| [grammar.md](grammar.md) | **Every production** of the language, in one EBNF — the formal core |
| [script.md](script.md) | The script, its rewrite, the component declarations (`@prop`, `@event`, …) and the `$` runes |
| [components.md](components.md) | The component contract: props, models, events, slots, states, parts, host, refs, context — in `.pdx` and in the TypeScript descriptor |
| [template.md](template.md) | Interpolation, every binding form, attachments, every block directive |
| [styles.md](styles.md) | `<style>`, scoping by target, the CSS the compiler rewrites, variants, component tokens, the design CSS extensions |
| [routing.md](routing.md) | `@page` and the declarations a page carries: loaders, navigation, typed routes |
| [data.md](data.md) | The async vocabulary and its execution contract, `@fetch`, `@action` and its concurrency, `@form` and async validation, `@store`, `$store` |
| [lifecycle.md](lifecycle.md) | What effects, requests, timers, attachments, refs and snippets do when a block is removed, hidden, frozen, resumed or destroyed |
| [server.md](server.md) | Rendering outside the browser: Node-safe imports, static generation, and the separate roadmap to hydration, per-request rendering and streaming |
| [performance.md](performance.md) | Guarantees with their measurements: the compiler, the compiled output, loading and deferred code, the first render, virtual lists, bounded memory, requests, heavy work, bundle budgets |
| [agents.md](agents.md) | How an agent reads and operates an app: the accessibility the framework guarantees, the description API, capabilities offered to agents |
| [library.md](library.md) | What the language asks of each `@pdxui/ui` component: contract, forms, states, parts, tokens, accessibility for people and agents, and when one is done |
| [diagnostics.md](diagnostics.md) | Every `PDX_*` code, by the construct that raises it |
| [migration.md](migration.md) | Every alpha form that changed, its beta form, and what `pdx migrate` does |
| [decisions.md](decisions.md) | Every decision these pages add to the issues they cite, what is still open, and the known defects of the runtime |

## How to read a construct

The construct pages — script, template, styles, routing, data — give every construct the same five
parts:

- **Syntax** — a grammar in EBNF, in the notation of the
  [W3C XML specification](https://www.w3.org/TR/xml/#sec-notation): `Name ::= expression`, literal
  text in quotes, `A?` optional, `A*` zero or more, `A+` one or more, `A | B` either, `( … )` grouping,
  `[a-z]` a character class. A production defined once is used by name everywhere else.
- **Semantics** — what the construct means and what the compiler generates for it.
- **Rules** — what is an error or a warning, with its `PDX_*` code. A rule with no code is one the
  compiler does not check; it says so.
- **Examples** — each a complete `.pdx` file.
- **Since** — the release the construct appeared in, `alpha` or `beta`, or `alpha → beta` for one the
  beta changed, naming the issue. It names a release, not a level to choose: there are no language
  levels (file.md).

Three markers say how far a rule has come: a bare issue number is what that issue (or a recorded owner
decision on it) specifies; **landed** means the change is on `main`; **proposed** or **†** is a rule
these pages decided (recorded in [decisions.md](decisions.md)) that no issue implements yet — a
performance target, the WebMCP adapter. Nothing here is undecided except what decisions.md lists
under «Still open».

### Shared productions

The grammars of every page use these. A script is TypeScript, so where a grammar says `Expression`
or `Type` it means a TypeScript expression or type, read by the TypeScript grammar, not restated here.

```ebnf
Identifier    ::= [A-Za-z_$] [A-Za-z0-9_$]*
StringLiteral ::= "'" [^']* "'" | '"' [^"]* '"'
Expression    ::= /* a TypeScript expression */
Type          ::= /* a TypeScript type */
TagName       ::= "pdx-" [a-z0-9] [a-z0-9-]*
S             ::= ( " " | "\t" | "\n" | "\r" )+
```

## Scope

The language covers its client runtime and static generation (#160). It does **not** cover streaming
rendering, offline conflict resolution for writes, or hydration of server-rendered markup: those are
a separate roadmap, and nothing in these pages promises them.

Where a page says what the runtime must *do* — the execution contract in data.md, lifecycle.md,
performance.md — it says it as **rules with acceptance cases**, not as new syntax. New syntax is kept
to what a rule cannot express, and every piece of it names its issue or is marked proposed.

## The principles the language keeps

1. **One way per common thing.** A beta form replaces its alpha alternatives; it does not sit beside
   them: a removed alpha form is an error, `PDX_REMOVED_FORM`, and `pdx migrate` rewrites it (file.md).
2. **A declaration, not wiring.** If a developer writes the same wiring twice, the language lacks a
   declaration.
3. **Explicit and greppable.** No implicit context, no type-based template selection, no name
   assembled at runtime. Every parameter is named.
4. **The platform first.** Where the browser has the feature (`:state()`, form association,
   invokers, `@scope`, style queries), PDX compiles to it instead of wrapping it.
5. **Every rule has a code.** A construct used wrongly is a `PDX_*` diagnostic, never a silent partial
   interpretation.

## Sources

The roadmap issues **#96–#160** (beta: #120–#159; render path and performance: #107, #109–#119;
static generation: #160), the decisions recorded on #47, #108, #170 and #187 (2026-10-11) and on #48
(2026-10-10), and the landed fixes they cite (#85, #98, #101–#106, #114–#116, #186, #203).

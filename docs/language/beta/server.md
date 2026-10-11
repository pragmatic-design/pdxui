# Rendering outside the browser

What the beta renders before the browser runs a script, what it does not, and the path from one to
the other.

## Where the beta stands

| Capability | Beta | Source |
|---|---|---|
| Importing `@pdxui/core` and a compiled component in Node without a DOM | **yes** | #93 — landed |
| **Static generation**: routes rendered to HTML at build time, replaced by the client render at mount | **yes** | #160, owner decision 2026-10-10 |
| Hydration: the client adopts the server's nodes instead of replacing them | no — separate roadmap | this page |
| Rendering per request on a server | no — separate roadmap | this page |
| Streaming | no — separate roadmap | this page |

## Static generation: render and replace (#160)

### Semantics

- The compiler gains a **string emitter** built from the same template AST as the client path. It
  renders initial values only: no effects, no listeners, no `onMount`. A component renders its
  template recursively; `@if`/`@for` are evaluated once; a `@defer` renders its `@placeholder`; an
  `@await` renders its `@loading` branch — except the data of a listed route's `@loader`, run at build
  time (below; decisions.md 33).
- `pdx build --ssg` renders every `@page` route without dynamic parameters, plus the routes listed
  in `pdx({ ssg: { routes } })` with their parameters, to `dist/<route>/index.html`, with the
  route's CSS linked.
- A pre-rendered host carries `data-pdx-ssr`. At mount the component **replaces** that content
  with its client render in the same frame; the pre-rendered children are not treated as slot
  content.
- Code in `setup` must run in Node. Anything that needs the browser goes in `onMount`.

### Why replace, not hydrate

Two facts of today's runtime make adoption a larger change than the beta takes on:
- the mount takes a host's children as content to project and removes them (`core/src/component/element.ts`, the light-DOM move);
- reactive state is per process (the router's signals, the current owner and batch depth are module
  state), which is fine for one build and wrong for concurrent requests.

Replace costs a second render at boot. That is the price of shipping no hydration code, and the
acceptance criteria hold it in check.

### What light-DOM components gain here

PDX components render into the light DOM and are styled by extracted CSS. Pre-rendered markup is
therefore plain HTML that paints with the page's stylesheet: no Declarative Shadow DOM, no style
duplicated per instance. A framework with shadow-DOM components has to serialise each shadow root
and its styles; PDX does not.

### Rules

- A browser global read in `setup` during static generation is an error at build time, naming the
  component and the global; the message points to `onMount`. (Proposed; the check runs in the
  emitter.)
- A route with dynamic parameters that is not listed in `ssg.routes` is skipped and reported, not
  rendered with empty parameters.

### Acceptance criteria (from #160)

- A built showcase route's HTML contains the page's content before any script runs: the test reads
  the file.
- `first-paint.spec.ts` on the SSG build paints content earlier than the client build (reported).
- After mount, the page is identical to the client-rendered one (DOM comparison) and interactive.
- Proposed additions: CLS after the replace < 0.02, the same bound as R2 in performance.md, so the
  replace is invisible; the time to interactive is not worse than the client build's.

### Data at build time

As #160 stands, a page whose content comes from `@fetch` or `@loader` pre-renders its loading
branch: the skeleton paints early, the data does not. For content pages — documentation, a catalogue
— the value is in the data. **Proposed** (decisions.md, point 33): for a route listed in
`ssg.routes`, `pdx build --ssg` runs its `@loader` at build time with that route's parameters, and
the emitter renders the loaded branch. `@fetch` stays client-side. The page then ships its data in
the HTML, and the client loader starts with that value as fresh data (`staleTime` from the build).

## The separate roadmap

Each step needs the one before it. None is in the beta.

| Step | What it takes | What it unlocks |
|---|---|---|
| 1. **Adoption** | a mount that binds to existing nodes instead of creating them. The compiler already knows each template's static structure; the same walk by index that template cloning needs (O1 in performance.md) can find the dynamic nodes inside server markup | hydration without the second render |
| 2. **Islands** | the compiler marks subtrees with no binding and no interactive component; they are never adopted | less JavaScript run on a content page |
| 3. **Scope per request** | the owner, batch and router state carried per request (`AsyncLocalStorage` in Node) instead of per module | rendering on a server for concurrent requests |
| 4. **Streaming** | `@defer` and `@await` boundaries become the points where the server flushes and the client fills in | first bytes before the slow data |

The decision that would open this roadmap is whether PDX targets content sites with request-time
data. The beta's audience — applications behind a login, where SEO does not apply and the first
screen is a shell — is served by static generation plus the first-render guarantees in
performance.md.

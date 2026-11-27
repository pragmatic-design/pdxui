/**
 * What the app weighs, as a ratchet.
 *
 * For a UI framework size is the number users judge on, and unmeasured, every commit could add to
 * it and none of them would be the one that did.
 *
 * Gzipped, because that is what a server sends and a browser downloads. Measured on `dist/` from a
 * real `vite build` of this app: the shell, three pages, one nested pair, the design system and
 * whatever @pdxui/ui the templates pulled in.
 *
 * The ratchet is the shape `tools/docs/surface-scan.mjs` uses for documentation coverage and
 * `i18n-no-literal-strings.test.ts` for hard-coded strings:
 *
 *   - the ceiling may only go DOWN. Raising it is allowed and must be argued for in the commit that
 *     raises it, because a bundle that grew is a decision, not an accident;
 *   - a ceiling left far above the measurement stops being a ratchet and becomes decoration, so
 *     there is a SLACK cap: too much headroom fails too, and the fix is to lower the ceiling.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

/**
 * What each ceiling covers, and why it is where it is.
 *
 * `entry` — the module `index.html` loads, and the one number a visitor always waits for before
 * anything renders. What belongs in it is what must exist before the first route is matched:
 *
 *   - the session. The guard redirect and the user → permissions effect must be in place before
 *     the first route is matched, or a deep-linked guarded route is decided before anything knows
 *     who the visitor is. The HTTP client is NOT: it lives in `src/api.ts`, imported by the pages
 *     that make requests, because in `src/auth.ts` it would put its middleware chain, timeout
 *     and retry in the entry — measured at 1.7 KB more;
 *   - the English strings of the shell and the landing route. English is the default, so the first
 *     screen never waits for a dictionary; every other screen's
 *     section, and the whole of Italian, is an `import()` asked for by the route that reads it
 *     (`src/locales/sections.ts`);
 *   - the route table and Vite's preload map, which is why every route costs the entry about a
 *     tenth of a kilobyte, and every new kind of record in the menu a little more (its entry, its
 *     section, its loader).
 *
 * No `@pdxui/ui` component is in the entry: the shell is the app's default LAYOUT, a chunk of its
 * own, and `entry-attribution.spec.ts` reads the entry's sourcemap and names the modules, because
 * this file can only say that a number moved.
 *
 * `js` — the sum of every chunk. A route is a chunk, and a visitor who never opens it downloads
 * none of it, so this is the honest number to report and the wrong one to optimise. Splitting moves
 * bytes out of the first request without removing them, and the same code gzips a little worse
 * split than inside one chunk — so the total rises when a module gains a second reader and Rollup
 * gives it a chunk of its own, and when a dictionary is split per route or per locale. When the
 * total and the first download disagree, the first download wins.
 *
 * `css` — the design system's foundation (tokens, layout, surfaces, typography, the CSS-only
 * tier), the one theme the app renders, and the stylesheets of the components it renders. A
 * component imports its own stylesheet, so its rules travel with it, and a route's styles are
 * extracted into a `.css` beside its chunk rather than a string its JS has to parse.
 *
 * `blocking` — what `index.html` asks for before the app can paint: the entry module, the entry
 * stylesheet, the landing route's chunk and its static imports named in
 * `<link rel="modulepreload">` (a route is a dynamic import Vite cannot see, and without the
 * preload the browser discovers it one round trip after the entry), and the stylesheets those
 * chunks import, named in `<link rel="preload" as="style">` (Vite's loader waits for them before
 * the page mounts). The ratchet is on the SUM and
 * not on the stylesheet: both resources are on the same wire, and moving a kilobyte from one to the
 * other buys nothing. `first-paint.spec.ts` holds the ordering that makes this true, and
 * `first-paint-waves.spec.ts` the wave count, so a preload that names the wrong file cannot pass by
 * making this number bigger.
 *
 * The shell is preloaded for the landing route, so what it imports is on the first paint. That is
 * why some things are deliberately NOT in it:
 *
 *   - `<pdx-breadcrumb>` (+22.9 KB, most of it the library's string registry) lives on the pages
 *     that show one;
 *   - the toast host is on the screens that can raise a toast, not in the shell (+3 KB for an answer
 *     to an action that has not happened yet); the queue is global, so they share one;
 *   - `<pdx-overlay-outlet>` is imported the first time the dialog queue holds a dialog (+2.4 KB for
 *     a dialog most visits never open).
 *
 * And some things deliberately ARE: the catalogue and the Demo panel are the shell's, because
 * behind a `@defer` each would put a round trip on the first click that opens it, the one moment
 * the visitor is waiting for it.
 *
 * Every ceiling is a ratchet, not a capacity: it may be raised only in the change that needs it,
 * with the reason beside it, and `SLACK_KB` keeps it close to the measurement. In absolute terms the
 * first paint is ~6% of the 2026 critical-path budget for a 3 s load at the 75th percentile
 * (1.2 MiB, JS-heavy, Alex Russell's «Performance Inequality Gap, 2026»).
 */
/**
 * The inline render path, measured.
 *
 * It swaps `html``` for imperative DOM construction, and since #107 it is the one render path of a
 * .pdx, so it is how this app is built and what these ceilings measure (`render-path.spec.ts` reads
 * it off the chunk). The figures below are HISTORICAL, measured before #107 while a build could
 * still select the template path — both paths, same machine, same commit:
 *
 *                     entry      JS total     CSS        blocking
 *   template          34.4 KB    360.6 KB     58.1 KB    88.3 KB
 *   inline            34.0 KB    378.4 KB     58.1 KB    87.9 KB
 *
 * So the first download is slightly SMALLER and the total is 5% bigger: imperative DOM code is more
 * instructions than a template string, and the pages carry the difference. It is not the
 * interesting number.
 *
 * The interesting number is the render, which this app cannot show: its first paint is dominated by
 * fetching and parsing the bundle. Measured instead on a 1500-row list, mounted thirty times per
 * page load in Chromium, median of 180 mounts:
 *
 *   template   19 ms      inline   5.5 ms      — 3.5×
 *
 * Time to first paint on THIS app, 47–53 cold loads interleaved between the two builds: 40 ms
 * median either way, inside one of Chromium's paint-timing ticks. Stated so the 3.5× is read with
 * its condition: it is the cost of RENDERING, and it only shows where rendering is the cost.
 *
 * The flag used to be off in this app's build, because a `<slot>` inside a component's tag was
 * dropped on the inline path. That was fixed (`compiler/tests/inline-slots.test.ts`) and the
 * override outlived it; turning it back on found three inline-path bugs no suite here ran, now
 * fixed in the compiler: a typed `const` read as a signal, `@defer` loading nothing, and a binding
 * writing its value again over a field being typed.
 */
/**
 * Diagnostics do not ship. They sit behind `DEV`, a const (`core/src/utils/env.ts`) and not a
 * function: a call the minifier will not inline is a branch it cannot fold, and the message would
 * ship to every visitor whether or not it could be printed. The bundler replaces the expression
 * behind `DEV`, and the branch goes with its string. `diagnostics.spec.ts` asserts WHICH strings left and which stayed, because
 * a number falling says nothing about what fell.
 */
// css 58 → 59: a grid cell's badges keep one line and mark the cut with an ellipsis (they wrapped,
// and made the row a line taller wherever the font was wider) — 58.1 KB measured.
// blocking 83 → 88: no byte more on the wire. The landing route's stylesheets (dashboard, shell,
// dropdown menu, progress: ~5 KB) were always needed before the first page mounts, but they were
// requested a wave after the entry and this sum, read off index.html, did not see them. index.html
// now announces them, which took the first page from ~1180 to ~885 ms on slow 4G
// (first-paint.spec.ts, #31) — and the sum counts them. 87.7 KB measured.
// entry 34 → 35: `@prefetch 'viewport'` is a policy the router now has (#42) — one shared
// IntersectionObserver in `<pdx-link>`, which every page's links need. 34.1 KB measured.
// blocking 88 → 89: html``'s self-closing expansion and the router's route-pattern compiler are
// scans now, not one-line regexes that ran in polynomial time and, in the router, escaped only the
// slashes of a path (#67). A few hundred bytes of code before the first paint. 88.1 KB measured.
// js 362 → 379: the app is built the production default way now, through the inline render path
// (#44). Same commit, 360.6 KB on the template path and 378.4 KB on the inline one: imperative DOM
// code is longer than a template string, page by page. The entry and the blocking bytes went DOWN
// (34.4 → 34.0, 88.3 → 87.9). 378.4 KB measured.
// js 379 → 380: every compiled template handler runs inside batch() (#114) — `batchHandler(…)` around
// each, so an effect reading a handler's writes runs once, on the finished state. 379.1 KB measured.
// entry 35 → 36, blocking 89 → 90: one router instead of two (#108). A build used to swap the
// router for one generated as a string; now it ships the TypeScript router and a route table. That
// router builds its matcher once at start-up — static paths in a map, dynamic ones as segment lists
// — and keeps a regex only for a pattern that is not made of whole segments, so both matchers are in
// the entry, with createRouterFromTable beside createRouter. About half a kilobyte: 34.9 → 35.4
// entry, 88.7 → 89.2 blocking (main measured in CI, this branch locally, both on LF sources).
// js 380 → 381: a form field knows it is required (#249: `required()` is branded, `FormField.required`
// reads the validators) and a submit stops when a value moved under its async validation (#253: every
// field's value recorded at the start, compared after). Core's form code, in the chunks of the pages
// that have a form; the entry and the first paint did not move. 380.1 KB measured in CI.
// js 381 → 459: every icon of the set is its own chunk now (#47), 359 of them, about 84 KB gzipped in
// all — and no visitor downloads them all: a page loads the icons it draws, one ~240-byte chunk each.
// What every page with an icon paid went DOWN: the `pdx-icon` chunk carried the whole set, 16.3 KB,
// and carries pdx-icon and the map of where each icon is, 6.9 KB. This sum counts every chunk once,
// which is why it is the number to report and the wrong one to optimise. 458.0 KB measured.
// blocking 90 → 91: the dashboard's `pdx-list` brings its empty state's icon, `inbox`, which shows
// while the queue loads (#47). Loaded on demand it was a request after the first paint; it is a few
// hundred bytes of the preloaded list chunk now. 90.4 KB measured.
// entry 36 → 37: the router outlet is in the entry, and a kept-alive page is bounded and frozen
// whole now — its child components frozen with it, by an ancestor walk in core's element (#268),
// and the least recently used frozen page destroyed past `keep-alive-max` (#270). A few hundred
// bytes; the showcase keeps no page alive, so it pays them and uses none. 36.1 KB measured.
// js 459 → 467, blocking 91 → 92: each block's static markup is built once and copied per render
// (#109), which took the script time of creating 1k rows from 13.7 to 11.1 ms and of 10k from 147 to
// 117 (js-framework-benchmark, before and after in one run, median of three). The builders cost what the render's
// static DOM calls cost before; what is new is the walk to the bound nodes, one statement per node
// on a path, and a marker where each dynamic block goes. Same machine, same day: main 458.6 → 466.3
// KB in all, 90.6 → 91.2 before the first paint; 2.5 KB of the first try went back by moving each
// block's template-and-import boilerplate into core's `staticBlock`.
// js 467 → 468: a component's visual states are custom states (#132) — `ctx.state`, the internals a
// host attaches for its declared states, and the Demo panel's `@state expanded`, the showcase's first.
// A few hundred bytes on top of the typed descriptor (#123), which had left the total on the ceiling:
// 467.0 KB measured locally, 467.1 in CI.
// entry 37 → 38, blocking 92 → 93: every host that exposes something listens for invoker commands
// (#140) — `exposeOnElement`, in the entry since every component may expose — on top of `@host`
// (#133) and `@part` (#134) in the compiled pages. Measured locally: entry 37.0, blocking 92.1, js
// 467.4; CI has measured 0.1 KB above local before, and the entry sat on its ceiling.
// js 468 → 469: a `@for` that receives many rows renders them in slices (#242) — the list's slicer
// and `processInSlices` (#240), which every keyed list now reaches. Measured locally: js 468.4.
// js 469 → 470: the set has heading-1, heading-2 and heading-3, the rich-text toolbar's numbered
// headings that drew nothing (#332). Three chunks of their own, each loaded only by a page that draws
// it; the entry and the first paint did not move. Measured locally: js 469.2.
// blocking 93 → 94: a scoped slot's body is built by the inline path (#364), as the rest of a .pdx
// is since #107 — no html`` parsed at runtime, and `${…}` and comments read as everywhere else. The
// shell's two slot fills (the rail's item and actions) are in its preloaded chunk, and imperative DOM
// code is longer than the template string it replaces, as #107 measured. Measured locally: blocking
// 93.3, js 469.8.
// js 470 → 456, blocking 94 → 93: a block's static markup is an HTML string the parser reads once,
// not a builder of DOM calls (#369), where the parser keeps the tree exactly — 120 of the
// showcase's 123 blocks. Measured locally: js 455.0, blocking 92.3, entry 37.7.
// js 456 → 457: pdx-data-grid loads its editors and edit dialog on first use, and pdx-pagination its
// page-size select (#447). A list that never edits stops fetching them before its first screen; the
// cost is in the total, where each now has a chunk of its own behind a dynamic import, with the
// loaders beside them. Same machine, same day: main 455.4 → 456.6 KB in all, entry 37.7 → 37.8,
// blocking 92.4 → 92.5. The showcase's own pages still import the editors for their forms, which is
// what #407 takes on next.
// js 457 → 463, css 59 → 60: /tickets defers what an action opens (#449), and its LCP on slow 4G went
// from ~3.9 s to ~3.0 s. No byte is added: on main, the modules the page imported for its forms
// shared one chunk named after pdx-auto-form (15.1 KB); with the page no longer importing them, Rollup
// splits them into eight (pdx-form-template, color-picker, inline-edit, rating, textarea, the create
// modal…), and each gzipped alone loses the dictionary they shared. Same machine, same day, chunk by
// chunk: js 456.4 → 462.4 KB over 454 → 462 files, css 58.4 → 59.1 over 52 → 56. Merging small chunks
// back is #407's next step, in pdx() for every app.
// entry 38 → 39, js 463 → 464, blocking 93 → 94: a navigation starts every level's chunk beside its
// loader, and a hover prefetches a route's data as well as its code (#119) — the router's navigation,
// in the entry. Same machine, same day: main entry 37.9 → 38.4, js 462.4 → 463.1, blocking
// 92.6 → 93.1. The showcase declares no @loader, so it pays for the router code and gains nothing yet.
// entry 39 → 40: two-way binding is a contract with a model (#124) and has the beta's forms (#126) —
// the model signal in core's component, and `bindTwoWay`'s `{ get, set }` accessor with `.debounce`,
// `.number` and their flushes, which every page with a `::` binding reaches. Measured locally: entry
// 39.1, js 463.7, blocking 93.7.
// js 464 → 465: the app's own components register under app-, not pdx- (#136). No code is added; a
// chunk that named its tags with the library's prefix now carries a second one, and gzip pays for
// it. Measured on the built dist: js 464.1 KB, and 464.0 with every app- written back as pdx- — the
// same bytes, 85 fewer gzipped over 216 occurrences.
// blocking 94 → 95: routes are types (#150). `<pdx-link>` takes `params` as a property and points its
// href, click and active state at the filled URL; `navigate` gains `navigate.url`. Both are the router
// in the entry; the types themselves erase. Same machine, same day, from the pre-push's own line:
// main blocking 94.0, entry 39.3, js 464.2 → this branch 94.2, 39.5, 464.3.
// js 465 → 466, css 60 → 63: a scoped style stops at nested components (#152). Every scoped block is a
// `@scope (…) to (…)`, and each selector carries a second form that matches an element the template
// wrote inside a component's tag, with the specificity the ancestor form had; the template marks those
// elements `data-pdx-<hash>-in`. Same branch, same machine, the app built with `target:
// 'baseline-2024'` against the default: js 464.5 → 465.1, css 59.1 → 62.6, blocking 94.3 → 94.9.
// blocking 95 → 96: a button reads its own tokens (#154) — `--pdx-button-bg`, `-bg-hover` and `-color`,
// a rule per variant in buttons.css, which the landing route's stylesheet carries. Measured locally on
// the built dist: blocking 94.9 → 95.2, css 62.6 → 62.8; the JavaScript did not move.
// blocking 96 → 97: `@defer` has two phases (#281) — `defer()` keeps the prefetched load and reuses it,
// queues the prefetch, and arms `when (…)` triggers; the landing route's chunk carries `defer()`. From
// the CI's own line, same shard: main blocking 95.8, js 465.5 → this branch 96.1, 465.8; entry 39.9.
// js 466 → 467: the choice controls declare their model (#480). Nine components import `model`, which
// puts the descriptor's builders in a chunk of their own (component-descriptor, +296 B), and the forms
// that wire a control they create — form-template, field-list, inline-edit — share a helper that picks
// its model's event (model-event, +257 B); the pages that import them carry the imports. Same machine,
// same day, the built dist: main 465.8 → this branch 466.9 KB over 462 → 464 files; entry and blocking
// did not move.
// js 467 → 468: the editors and the upload declare their model (#482). pdx-file-upload had no `value`
// at all: its model is the files it holds, written on every change and followed when a parent sets it
// (+180 B in its chunk); core's form registry describes the choice controls by their model (+24 B).
// Same machine, same day, the built dist: main 466.9 → this branch 467.2 KB; entry and blocking did
// not move.
// entry 40 → 41: context values are keyed by typed tokens (#495). `inject` asks the context protocol
// when no PDX ancestor provides the token (what `requestContext` did, which left the exports), names
// the token and the component when nothing does, and the router and the form context create their
// tokens at start — all in the entry, which every page reaches through the outlet. Same machine, same
// day, the built dist: main entry 40.0 → this branch 40.2 KB (+172 B in the entry chunk), js 467.2 →
// 468.0 KB; main sat on the entry's ceiling already.
// js 468 → 469: mutation() takes a concurrency policy, a signal per call, cancel(), enabled() and
// keeps optimistic values as overlays (#500), and pdx-button reads the policy. Same machine, same
// day, the built dist: main js 467.8 → this branch 468.1 KB, entry 40.1 → 40.2 KB; blocking did not
// move.
// js 469 → 471: the ticket page reads its record through `@loader ticket: loadTicket;` (#507) — the
// loader's own module, the `@await` block that renders the record, and the router's `loaderSource`
// (#506) now reached by a page. Same machine, same day, the built dist: main js 468.4 → this branch
// 470.1 KB, entry 40.5 → 40.8 KB, blocking 96.8 → 97.0 KB, both still within theirs.
// entry 41 → 42, blocking 97 → 98: a loader's outcomes (#147) — the outlet renders a level's error
// page at any depth, with a retry, and the router turns what a loader throws into a redirect, a
// not-found or an error page. The outlet is in the entry, so all of it is. `redirect()` and
// `notFound()` themselves are not: the router recognises them by a marker, and only the loaders that
// throw them import them. Same machine, same day, the built dist: main entry 40.8 → this branch
// 41.1 KB, blocking 97.0 → 97.4 KB, js 470.1 → 470.4 KB.
// entry 42 → 43, js 471 → 472, blocking 98 → 99: a loader's results are kept in core's cache (#148),
// and the router imports the cache statically, so every routed app carries it in its entry. Loading
// it on demand kept the entry at 41.7 KB but put the module between a navigation and its loader's
// data — three waves where `first-paint-waves.spec.ts` (L4) holds two. Same machine, same day, the
// built dist: main entry 41.1 → this branch 42.6 KB, blocking 97.4 → 98.9 KB, js 470.4 → 472.0 KB.
// css 63 stays: a template that writes nothing inside a component's tag gets the donut scope's
// single-root form (#511). Same machine, same day, the built dist: main 63.0 → this branch 62.3 KB,
// against 59.5 KB for this branch built with `target: 'baseline-2024'` — the 2026 target's cost
// falls from 3.5 to 2.8 KB; what is left is the pages that do write inside a component's tag. The
// budgets are whole kilobytes, and 62 is under the measurement.
// js 472 → 473: the text fields declare their value as a model and commit through the native
// `change` (#479). Seven components import `model`, the clear and stepper paths dispatch the commit
// themselves, `onControlValue` waits for a control's class, and the masked input answers
// `getFormatted()` and `isValid()`. The pre-push build: main 472.0 → this branch 472.1 KB.
// js 473 → 474 (owner's OK): a control binds a form field through its model (#128) — the field's
// two-way protocol in core, its `.number` parse error, `pdx-form-field`'s `:field`. Same machine, same
// day, the built dist: main 483 836 → this branch 484 351 bytes gzip (472.5 → 473.0 KB); CI's Linux
// build measured the branch at 473.1.
// js 474 → 469: inside `<pdx-form :form>` a control binds its field through its model, and the name
// wiring the compiler injected on every named control and form field is gone (#128). The pre-push
// build: main 473.0 → this branch 468.8 KB.
// js 469 → 470, blocking 99 → 100 (owner's OK): a model declared `{ form }` makes its component
// form-associated (#135). The wiring lives in `form/form-model.ts` and reaches a bundle through
// `model()`, which the library's value components import, so the showcase carries it before any of
// them declares `{ form }`; `component()` keeps only the three form callbacks. The required message
// is the browser's own, read from a native input, so core's validators stay out. Same machine, same
// day, the built dist: main js 468.7 → this branch 469.5 KB, blocking 99.0 → 99.1 KB, entry 42.8 → 42.9 KB.
// blocking 100 → 101 (owner's OK): a descriptor declares its variant axes (#512), and `component()`
// turns each into a typed prop with the first value as default, reflected on the host through the
// same `host` bindings a descriptor writes by hand. Every component carries it before any of them
// declares `variants`. Same machine, same day, the built dist: main blocking 100.0 → this branch
// 100.1 KB; entry 43.0 and js 467.9 KB stay within theirs.
// css 63 → 64, blocking 101 → 102 (owner's OK): the text fields (#627) and the pickers (#628) are
// drawn by `@variant` rules keyed on the host's `size`, and each rule is a host selector as well as
// the native class it replaced — `:where(:is(pdx-input, …, pdx-date-picker)[size="sm"]) > [data-part="root"],
// .pdx-input-sm`. The pre-push build: main (after #627) css 63.0 → this branch 63.3 KB, blocking
// 100.9 → 101.0 KB. The remaining variant batches (#629–#632) add more of the same.
// css 64 → 65 (owner's standing OK for #631–#633, at most +1 KB a batch): the surfaces, navigation
// and display components (#632) are drawn by `@variant` rules keyed on the host, each a host selector
// beside the native class it replaced, and tabs' pills rules are written twice, once for the host's
// `variant` and once for the theme's `[pdx-tab-style="pill"]`, which shared one `:is()` before. Same
// machine, the built dist: main (after #631) css 63.9 → this branch 64.1 KB; blocking stays 101.4.
// js 470 → 471 (owner's OK): the pickers' beta contract (#287) — pdx-color-picker's states, parts,
// `open-change` and overlay verbs, and pdx-form-field's rule that finds its swatch first. Same machine,
// the built dist: main js 469.7 → this branch 470.2 KB (+466 bytes).
// blocking 102 → 103 (owner's OK): pdx-menu's beta contract (#288) — its `open` model, the `open`
// state, its parts, `show()`/`toggle()` and the focus it gives back on close. The shell's profile and
// language menus draw with it, so it ships before the first paint. The pre-push build: main blocking
// 101.9 → this branch 102.1 KB.
// js 471 → 472 (owner's OK): pdx-tabs' beta contract (#289) — its `value` model, the loading,
// bordered and overflow states, its parts and the busy active panel. Main sat on the ceiling (it
// passed 471); the built dist of this branch weighs 471.1 KB.
// css 65 → 66 (owner's OK): pdx-nav-menu's beta contract (#289) — its host classes became the ready
// and collapsed states and its entries' classes their ARIA attributes, so nav.css selects
// `pdx-nav-menu:state(collapsed)` and `[aria-expanded="true"] > .pdx-nav-chevron`, each longer than
// the class it replaced. The built dist: 66609 bytes locally, which rounds to 65.0, and 65.1 KB on
// the CI's Linux runner.
// entry 43 → 43.5 (owner's OK): pdx-icon's beta contract (#291) — its styles moved from inline to
// icon.css, which travels with the component. The icon is a chunk of its own, not in the entry; what
// the entry gains is the stylesheet's name in Vite's preload map, listed by every route that draws an
// icon. The built dist: main 43.0 KB → this branch 44090 bytes (43.057 KB, which rounds to 43.1).
// css 66 → 67 (owner's OK, for the batches of #293): pdx-form-field and pdx-field-group draw their
// conditions from their host's custom states, and each rule keeps the native class beside the
// `:where(pdx-form-field):state(…)` form, for markup written without the component. Main sat on the
// ceiling: 66 KB on the CI's line; the built dist of this branch weighs 66.1 KB locally.
// entry 43.5 → 43.6 (owner's OK): pdx-app-shell (#1023) changes no byte of the entry's code — the
// two builds are the same length, 130799 characters — only the content hashes of the chunks named in
// Vite's preload map (pdx-nav-menu, the shell), which gzip packs 14 bytes worse. The built dist:
// main 44577 → this branch 44591 bytes gzipped. Main sat on the rounding edge, 43.5 on the CI's line.
// js 472 → 473 (owner's OK): pdx-scheduler's month, year and agenda views (#1020, part 4) — their
// templates, the calendar model and the year's keys, in the scheduler's chunk, which the showcase's
// scheduler page loads. Main sat on the ceiling; CI's Linux build measured the branch at 472.1 KB.
// js 473 → 473.2 (owner's OK): no code of ours — vite 6.4.4 → 6.4.6 brings rollup 4.64.3 → 4.68.5,
// which no longer drops the default branches of a parameter every caller sets (flip()'s and shift()'s
// `padding ?? …` in core's positioning.ts, public API with documented defaults). Measured on the same
// tree: +140 bytes gzipped spread over 72 chunks, 472.9 → 473.0 KB locally, 473.1 on CI's Linux build.
// js 473.2 → 477.3: every list page defers what a click opens, as /tickets does (#1201). No code is
// added; the forms the routes imported statically now load behind `@defer (idle)`, so Rollup splits
// what the routes shared into chunks of their own, and each gzipped alone loses the dictionary they
// shared — the cost #449 measured. What a route loads before it paints fell, on top of the first
// paint: /customers 175.0 → 105.2 KB, /sites 162.3 → 96.9, /employees 161.7 → 96.3, their contracts
// 124.3 → 28.9, /assets 119.9 → 102.8, /services 105.1 → 98.0 (gzip level 9). The whole of the JS,
// same machine, same level: main 472.5 → this branch 476.5 KB; this file's own measure reads 477.2.
// entry 43.6 → 43.9 (owner's OK): static @for rows (#1233). The shell has a row that reads only its
// item, so the entry carries what builds one — the renderer of list-static.ts, the rebuild of a row
// whose kept key has a new item, collectIfAny — and list.ts's calls to it. A list without static rows
// or @empty does not bundle that code (the jfb app stayed at 14.4 KB). The built dist: this branch
// 44939 bytes gzipped locally, 43.9 KB on the CI's line, where main sat at 43.5.
// js 477.3 → 477.6 (owner's OK, standing for #1210's batches, ≤ +1 KB each): pdx-divider, pdx-spinner
// and pdx-progress moved to .pdx, each lighter alone (0.93×, 0.78×, 0.86×). While the library is half
// moved, a bundle carries both renderers — html``'s engine for the components still in TypeScript, the
// compiled render's helpers for the moved ones — and each move brings helpers no chunk had yet. The
// built dist: 477.3 KB locally, 477.5 on the CI's line. The engine (~4–5 KB) leaves when the last
// component does; the budget comes down then.
// entry 43.9 → 44.1 (owner's OK): value rows (#1237). A row that reads its item as a value is updated
// in place for a new item — core's collectRowRuns, and list-static.ts's update beside its rebuild —
// so the entry carries that code. What it buys, on js-framework-benchmark's script time (median of 3
// runs): create 1k 7.8 → 6.2 ms, replace 14.7 → 11.9, update every 10th 4.8 → 3.4. The built dist:
// 44.1 KB locally.
// entry 44.1 → 43.5, blocking 103 → 102.5 (#1246): core's modules that did work at load — viewport,
// adaptive, online, rtl, the overlay stack, the context protocol — leave an entry that does not use
// them, and the theme restore and the splash come as two boot modules the pdx() plugin imports. The
// built dist: entry 43.4 KB, blocking 102.4 KB, js 477.4 KB locally; a tenth kept for CI's line.
// entry 43.5 → 43.2, blocking 102.5 → 102.2, js 477.6 → 477.3 (#1246, second part): the inspector and
// the devtools API out of the production bundle, every call into them behind DEV and the flush's
// level-1 counters through hooks only `setTelemetryLevel` installs. The built dist: entry 43.1 KB,
// blocking 102.1 KB, js 477.2 KB locally; a tenth kept for CI's line.
// entry 43.2 → 43.0, blocking 102.2 → 102.0, js 477.3 → 476.9 (#1246, part 3a): HMR's bookkeeping —
// each setup's signal map, the live-instance registry, the state save and restore — behind DEV. The
// built dist: entry 42.9 KB, blocking 101.9 KB, js 476.8 KB locally; a tenth kept for CI's line.
// entry 43.0 → 43.2, js 476.9 → 477.1, blocking 102.0 → 102.2 (#1246, part 3b): a prop's property is
// the class's accessor, defined once, not an accessor and two closures defined on every instance at
// every mount. The accessor reads the instance's signals by index, and while unmounted holds a value
// set early or defers to the HTMLElement member a prop is named after: more code than the closures,
// once per app. What it buys, measured beside main in Chromium: 1,000 components with six props mount
// in 0.73–0.80× the time and are removed in 0.54–0.64×; the filter popover's value list mounts in 0.91×
// main's, the conditions and pdx-select in 0.94× (scenario-pilot-mount). The built dist: entry 43.1 KB,
// blocking 102.1 KB, js 477.0 KB locally; a tenth kept for CI's line.
// entry 43.2 → 43.3, js 477.1 → 477.3, blocking 102.2 → 102.3 (#1246, part 3c): a compiled component is
// defined with `defineComponent` and the features it declares, `{ expose, host }`, so an app whose
// components declare neither carries neither (the hello scenario 8,064 → 7,508 B gzip). This app uses
// both, through `@pdxui/ui`'s components, and pays the definition's indirection once and the features
// object in each component that names one. The built dist: entry 43.2 KB, blocking 102.2 KB, js 477.2 KB
// locally; a tenth kept for CI's line.
// js 477.3 → 477.4 (#1246, part 3c): the form API in FormPdxElement, the base of a form-associated
// component only (hello 7,505 → 7,237 B). This app still defines most of its library components with
// component(), which carries every feature, so it carries FormPdxElement as a subclass: entry 44,180 →
// 44,237 B. The built dist: entry 43.2 KB, blocking 102.2 KB, js 477.3 KB locally; a tenth kept.
// entry 43.3 → 43.4, blocking 102.3 → 102.4 (#1246, part 3c): slot projection in its own module, carried
// by a component whose template renders a <slot> (hello: 7,237 → 6,784 B). This app's library still
// defines most components with component(), which carries every feature: entry 44,237 → 44,303 B, a
// module's boundary and its import. The built dist: entry 43.3 KB, blocking 102.3 KB, js 477.1 KB
// locally; a tenth kept for CI's line.
// entry 43.4 → 43.5, js 477.4 → 477.6, blocking 102.4 → 102.5 (#1246, last part): a keyed list runs its
// transitions with the animation its options name, so a list with none does not carry transitions.ts
// (the benchmark 11.8 → 10.9 KB). This app carries it anyway, through when(), dynamic() and its library,
// and pays the indirection: entry 44,303 → 44,425 B, the whole JavaScript +349 B — of which board.pdx,
// its one @for with a transition, 17, and the rest the minifier's names for the entry's exports moving
// in 77 route chunks. The built dist: entry 43.4 KB, blocking 102.4 KB, js 477.5 KB; a tenth kept.
// js 477.6 → 478.0 (owner's OK, standing for #1210's batches, ≤ +1 KB each): pdx-chip,
// pdx-button-group and pdx-radio move to .pdx. Each is lighter alone, but while both forms are in the
// bundle the html`` engine stays for the other components and the compiled helpers they first use come
// in (@host :class's binder, ::checked). The built dist: entry 43.5 KB, blocking 102.5 KB (unchanged),
// js 477.9 KB locally; a tenth kept for CI's line. The budgets come down in #1210's last batch.
// js 478.0 → 479.0 (the same standing OK, at its +1 KB): pdx-button, pdx-checkbox and pdx-input, each
// lighter alone (0.83×, 0.96×, 1.04×). The entry and the blocking bytes do not move; the route chunks
// carry +0.8 KB each through the chunk they share, where the compiled two-way bindings these three are
// the first to use (::value, ::checked) come in while html`` stays for the others. js 478.9 KB locally.
// blocking 102.5 → 102.6 (owner's OK, 2026-11-21): a value that cannot change is written with no effect
// (#1270) — core's four binders take the value and a `once` flag, a branch each, in the code every app
// loads before it paints. In exchange each constant binding outside a row (a literal, a `const`
// template literal such as an id, a `:x.once`) makes no effect at mount. The built dist: blocking
// 102.6 KB, entry 43.5 KB, js 478.6 KB locally.
// js 479.0 → 480.0 (the same standing OK for #1210's batches, at its +1 KB): pdx-form-field moves to .pdx,
// 1.02× alone with its wiring module (3,513 against 3,461 B). The whole JavaScript grows while html``
// stays for the components not yet moved: CI's line read 479.7 KB before the field's $derived, which
// adds a few bytes more, so the whole kilobyte is kept.
// js 480.0 → 481.0 (the same standing OK for #1210's batches, at its +1 KB): pdx-masked-input and
// pdx-tag-input move to .pdx, each lighter alone (0.75× with its mask module, 0.93×). pdx-tag-input is
// the first of the showcase's components to render a snippet with `@render` and its chips with a keyed
// `@for`, whose runtime the showcase did not carry before: its chunk +613 B, masked-input's +127 B, the
// whole +1.0 KB. That runtime is a module of its own, core's renderer/render-snippet.ts: in
// renderer/snippet.ts, beside the `declaredSnippet` most components read, it went into the chunk that
// loads before the first paint (blocking 102.5 → 102.7). The built dist: blocking 102.5 KB (unchanged),
// entry 43.5 KB, js 480.3 KB locally.
// js 481.0 → 482.0 (the same standing OK for #1210's batches, at its +1 KB): pdx-segmented and
// pdx-color-picker move to .pdx, 1.09× and 1.03× alone (color-picker with its colour-math module). Their
// chunks grow more than they do, +410 and +594 B against +185 and +132 B alone, with the compiled code
// they are the first to use while html`` stays for the others; Rollup rearranges three shared modules
// (form-registry, own-prop, selector: net +224 B), every other chunk −351 B. The whole +0.9 KB. The
// built dist: entry 43.5 KB, blocking 102.5 KB (unchanged), js 481.2 KB locally.
// js 482.0 → 483.0 (the same standing OK, for a core fix #1210's next move waits on): a component mounts
// untracked by the effect around it (#1309). CI read js 481.8 → 482.1 KB on the same trees, twice, and
// blocking 102.5 → 102.6. The local build of both, chunk by chunk, reads the opposite: the entry +17 B,
// the whole −98 B. The difference between the two builds is not explained; it is recorded on #1287 with
// the measurements, and this budget follows CI's line, which is the one that gates.
// blocking 102.6 → 102.9 (owner's OK, 2026-11-23): pdx-dropdown-menu moves to .pdx (#1210). The shell's
// avatar menu ships it before the first paint. It is lighter alone (2,743 against 3,067 B, 0.89×), but its
// chunk grows +193 B gzip: the compiled form imports six more names from core's chunk (defineComponent,
// staticBlock, staticMarkup, onNextFrame, slotProjection, exposeOnElement), and its setup is longer than
// the TypeScript one by its prop aliases and emitters. No core runtime the first paint did not carry
// comes in. Main and this branch built the same day: blocking 102.58 → 102.77 KB; a tenth kept for CI's line.
// js 483.0 → 483.9 (the same standing OK for #1210's batches, within its +1 KB): pdx-file-upload moves to
// .pdx, 1.08× alone. Its chunk +760 B gzip: a compiled template where the TypeScript one was an html``
// string, and html`` stays for the components not moved yet. pdx-tag-input and it both render a snippet
// with `@render`, so core's render-snippet leaves tag-input's chunk for one of its own (+377 B, tag-input
// −195 B). The whole +1.1 KB; the built dist: js 483.8 KB locally.
// entry 43.5 → 43.6 (owner's OK, 2026-11-23): with pdx-file-upload the entry chunk is +17 B gzip
// (44,582 → 44,599 B), which crosses the tenth it rounds to (43.54 → 43.55 KB).
// js 483.9 → 484.1 (the same standing OK for #1210's batches): pdx-menu moves to .pdx, 0.83× alone
// (3,559 against 4,266 B). The whole +0.2 KB while html`` stays for the components not moved yet; the
// built dist: js 484.0 KB locally, entry and blocking unchanged.
// js 484.1 → 477.6 (#1346): a URL binding and a component's bound prop are one call to core each
// (`bindUrl`, `bindComponentProp`), not an effect written out at every binding site; measured 477.5 KB
// locally, entry, css and blocking unchanged.
// js 477.6 → 477.8 (the standing OK for #1210's moves): pdx-toast moves to .pdx, 0.88× alone with its
// service and icons (1907 against 2156 B). The showcase raises toasts, and html`` stays for the
// components not moved yet. Measured 477.7 KB locally; entry, css and blocking unchanged.
// js 477.8 → 478.2 (the standing OK for #1210's moves): pdx-dialog moves to .pdx, 0.97× alone (2095
// against 2151 B). The showcase opens dialogs, and html`` stays for the components not moved yet.
// Measured 478.1 KB in CI and 477.9 locally after a clean rebuild: the two agreed on the move before
// this one (477.7), and the 0.2 KB between them is not explained. The ceiling is held to CI's figure.
// Entry, css and blocking unchanged.
// js 478.2 → 478.5 (the standing OK for #1210's moves): pdx-chart moves to .pdx, 0.91× alone (3101
// against 3393 B). The showcase's dashboard draws charts, and its chunk takes the compiled template's
// code where html`` stays for the components not moved yet. Measured 478.5 KB in CI and 478.2 locally,
// the same gap as the dialog's move; the ceiling is held to CI's figure. Entry, css and blocking
// unchanged.
// js 478.5 → 478.6 (the standing OK for #1210's moves): pdx-time-picker moves to .pdx, 0.89× alone with
// its strings module (3137 against 3512 B). The showcase's forms use it; its strings and form-control
// registration are a module of their own beside it, and html`` stays for the components not moved yet.
// Measured 478.6 KB locally; entry, css and blocking unchanged.
// js 478.6 → 478.7 (the standing OK for #1210's moves): pdx-breadcrumb moves to .pdx, 0.79× alone with
// its types module (1402 against 1770 B). The showcase's shell and pages draw it, and their chunks take
// the compiled template's code where html`` stays for the components not moved yet. Measured 478.7 KB in
// CI and 478.5 locally, the gap of the moves before; the ceiling is held to CI's figure. Entry, css and
// blocking unchanged.
// js 478.7 → 479.1 (the standing OK for #1210's moves): pdx-alert-dialog moves to .pdx, 1.03× alone
// (2333 against 2256 B): its template is compiled, where the TypeScript version wired its two buttons
// imperatively, and the showcase's CRUD pages draw it. Measured 478.9 KB locally; CI has read the
// moves before 0.2 KB above the local figure, so the ceiling is held to that. Entry, css and blocking
// unchanged.
// js 479.1 → 479.2 (the standing OK for #1210's moves): pdx-command moves to .pdx, 0.93× alone (3456
// against 3701 B), but its type module and its compiled snippet land in other chunks than the
// TypeScript file did: 479.0 KB measured locally, held to CI's figure as above.
// js 479.2 → 479.3 (the same standing OK): pdx-drawer moves to .pdx, 0.91× alone (2526 against 2788
// B); the total measured 479.1 KB locally, and CI has read about 0.2 KB above the local figure.
// js 479.3 → 479.5 (the same standing OK): pdx-calendar moves to .pdx, 0.91× alone with its two
// modules (5308 against 5835 B), and the total still grew 0.2 KB, the cause not isolated: 479.3 KB
// measured locally, held to CI's figure as above.
// js 479.5 → 480.0 (the same standing OK): pdx-date-picker moves to .pdx, 0.88× alone with its
// modules (6944 against 7882 B, typed-date counted on both sides), but its chunk grows 398 B gzip
// with the same file count; the per-chunk diff and the cause are on #1287. 479.8 KB measured locally,
// held to CI's figure as above.
// js 480.0 → 480.3 (the same standing OK): pdx-bulk-actions moves to .pdx, 1.17× alone (1703 against
// 1459 B), the blocks of its template; by #1379 its weight is read here, where /customers renders it
// inside pdx-entity-grid: that route grows 0.3 KB gzip. 480.0 KB measured locally, held to CI's
// figure as above.
// js 480.3 → 481.0 (the same standing OK): pdx-nav-menu moves to .pdx, 0.81× alone with its siblings
// (4689 against 5793 B). The TypeScript version imported `declaredSnippet`, which put core's
// renderer/snippet.ts in the shell chunk every route shares; the .pdx reads its snippets as values,
// so that module leaves the shell (-59 B) for a chunk of its own, `snippet`, which the ~20 route and
// component chunks that still call it import (+181 B for the chunk, a few bytes of import in each).
// Blocking 102.6 KB is unchanged. 480.5 KB measured locally against 479.8 on main; the split is
// #1287's.
// entry 43.6 → 43.7 (the owner's OK, on #1448): the new `snippet` chunk is named in Vite's preload
// map in the entry, +25 B, which took CI's entry from 43.6 to 43.7 KB; locally it rounds to 43.6.
// js 481.0 → 481.5 (the same standing OK): pdx-autocomplete moves to .pdx, 0.95× alone (4636 against
// 4902 B gzip), but the pdx-tag-input chunk it is bundled into grows 242 B: its template compiles to
// blocks where the TypeScript version shared html``'s engine, as the moves before it found. +439 B
// over 77 files, the entry +16 B (44698 B, 43.65 KB, still under 43.7). 481.0 KB measured locally
// against 480.5 on main.
// js 481.5 → 482.4 (the same standing OK): pdx-select moves to .pdx. Its chunk is 8040 B gzip against
// 7063 on main's build: the module minifies to the length it had (19866 against 19844 B) and
// compresses worse (6782 against 5760 B gzip), its compiled template static markup and walks where
// html`` repeated one shape per binding (#1287). The `snippet` chunk is gone with it, -181 B: no
// component in the showcase reads a snippet through `declaredSnippet` any more. 482.3 KB measured
// locally, the entry unchanged at 43.6.
// js 482.4 → 484.8 and blocking 102.9 → 103.0 (the owner's OK, on #1275): a block's bindings run in
// one effect, where each made its own. A block with two or more declares its group and runs it
// (`,u=[]` … `Be(u)` minified), each binding passes it (`,u`), and core carries `bindGroup` and
// `bindText`. The trade is the effects: pdx-fieldset written declaratively went from 1.41× its
// TypeScript version's mount to 1.01×. 484.8 KB and 103.0 KB measured locally against 482.3 and 102.6
// on main; the entry unchanged at 43.6.
// js 484.8 → 485.2 and blocking 103.0 → 103.1 (the owner's OK, on #1275): the values the bindings have
// with the props at their defaults go into the static markup and to `bindGroup` (`Be(u,[…])`), which
// writes only what differs — the fieldset's whole mount, the frame after it included, 0.70–0.76× its
// TypeScript version's. 485.2 KB and 103.1 KB measured locally, held to CI's js figure, 485.4; the
// entry unchanged at 43.6.
const BUDGET_KB = { entry: 43.7, js: 485.4, css: 67, blocking: 103.1 };
/** How much headroom a ceiling may keep before it stops measuring anything. */
const SLACK_KB = 4;

/**
 * What `index.html` asks for before the app can paint, gzipped.
 *
 * Read off the HTML rather than guessed: a resource added to the head by a build change is a
 * resource this notices, which a hard-coded pair of filenames would not.
 */
function blockingKb(): number {
    const html = readFileSync(resolve(DIST, '..', 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length, 'index.html references nothing in assets/ — this budget measures nothing')
        .toBeGreaterThan(1);
    const bytes = refs.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length, 0);
    return Math.round((bytes / 1024) * 10) / 10;
}

function gzippedKb(ext: '.js' | '.css'): number {
    const files = readdirSync(DIST).filter((f) => f.endsWith(ext));
    const total = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length, 0);
    return Math.round((total / 1024) * 10) / 10;
}

test('there is a build on disk to weigh', () => {
    const files = readdirSync(DIST);
    expect(files.some((f) => f.endsWith('.js')), 'no JS in dist/assets').toBe(true);
    expect(files.some((f) => f.endsWith('.css')), 'no CSS in dist/assets').toBe(true);
    // An empty entry gzips to 20 bytes and would pass every budget below. Only the entry and the
    // stylesheet are checked: a route chunk is legitimately tiny — a page whose template is four
    // elements compiles to a few hundred bytes, and demanding a floor of it would be demanding
    // that the split not work.
    expect(statSync(join(DIST, entryChunk())).size, 'the entry is empty').toBeGreaterThan(10_000);
    const css = files.filter(f => f.endsWith('.css'));
    expect(css.reduce((n, f) => n + statSync(join(DIST, f)).size, 0), 'the stylesheets are empty')
        .toBeGreaterThan(10_000);
});

for (const ext of ['.js', '.css'] as const) {
    const key = ext.slice(1) as 'js' | 'css';

    test(`the ${key} bundle is within its budget`, () => {
        const kb = gzippedKb(ext);
        expect(kb, `${key} is ${kb} KB gzipped, the budget is ${BUDGET_KB[key]} KB — say in the commit why it grew`)
            .toBeLessThanOrEqual(BUDGET_KB[key]);
    });

    test(`the ${key} budget is held against the real number, not a stale one`, () => {
        const kb = gzippedKb(ext);
        expect(BUDGET_KB[key] - kb,
            `the ${key} budget is ${BUDGET_KB[key]} KB and the app is ${kb} KB — lower the budget`)
            .toBeLessThanOrEqual(SLACK_KB);
    });
}

test('the bytes before the first paint are within their budget', () => {
    const kb = blockingKb();
    expect(kb, `${kb} KB gzipped must arrive before anything is painted, the budget is `
        + `${BUDGET_KB.blocking} KB — say in the commit why it grew`)
        .toBeLessThanOrEqual(BUDGET_KB.blocking);
});

test('the blocking budget is held against the real number, not a stale one', () => {
    const kb = blockingKb();
    expect(BUDGET_KB.blocking - kb,
        `the blocking budget is ${BUDGET_KB.blocking} KB and the app is ${kb} KB — lower the budget`)
        .toBeLessThanOrEqual(SLACK_KB);
});

test('the numbers are reported, whether or not they pass', () => {
    // A budget nobody can read is a budget nobody lowers.
    const js = gzippedKb('.js');
    const css = gzippedKb('.css');
    const entry = Math.round((gzipSync(readFileSync(join(DIST, entryChunk()))).length / 1024) * 10) / 10;
    console.log(`[bundle] entry ${entry} KB (budget ${BUDGET_KB.entry}) · js ${js} KB total (budget ${BUDGET_KB.js})`
        + ` · css ${css} KB (budget ${BUDGET_KB.css}) · blocking ${blockingKb()} KB (budget ${BUDGET_KB.blocking})`);
    expect(js).toBeGreaterThan(0);
    expect(css).toBeGreaterThan(0);
});

test('the ENTRY is within its budget, which is the number a visitor waits for', () => {
    const kb = Math.round((gzipSync(readFileSync(join(DIST, entryChunk()))).length / 1024) * 10) / 10;
    expect(kb, `the entry is ${kb} KB gzipped, the budget is ${BUDGET_KB.entry} KB`)
        .toBeLessThanOrEqual(BUDGET_KB.entry);
    expect(BUDGET_KB.entry - kb, `the entry budget is ${BUDGET_KB.entry} KB and the entry is ${kb} KB — lower it`)
        .toBeLessThanOrEqual(SLACK_KB);
});

// ─── Route splitting ────────────────────────────────────────────
//
// The framework's documentation says `@page` implies lazy loading and code splitting: one chunk
// with every page in it would mean opening `/` downloads the whole application.
//
// The subject is the ENTRY — what a visitor waits for before anything renders — not the total.
// Splitting does not remove bytes, it moves them out of the first request, so the total is expected
// to stay roughly the same and the entry is expected to fall.

/** The entry chunk: the one index.html loads directly. */
function entryChunk(): string {
    const html = readFileSync(resolve(DIST, '..', 'index.html'), 'utf8');
    const m = html.match(/src="\/assets\/([^"]+\.js)"/);
    if (!m) throw new Error('index.html loads no module script — nothing to measure');
    return m[1];
}

test('the build produces more than one JavaScript chunk', () => {
    const js = readdirSync(DIST).filter((f) => f.endsWith('.js'));
    expect(js.length, 'one chunk means every route is in the first download').toBeGreaterThan(1);
});

test('the entry does not carry a route the visitor has not asked for', () => {
    // A marker only the intervention PAGE emits. Not its title and not its nav label: the shell
    // links to it, so "Intervention 2" is in the entry legitimately.
    //
    // Not a sentence of the page's either: every sentence in the app is in `locales/*.json`, and
    // where a dictionary is loaded is the dictionaries' business, not the route's. Only the page's
    // markup is the page's own.
    const MARKER = 'intervention-ticket';
    const entry = readFileSync(join(DIST, entryChunk()), 'utf8');
    expect(entry, 'the intervention page is in the chunk that loads on `/`').not.toContain(MARKER);

    // And the control: it IS somewhere, in a chunk of its own.
    const elsewhere = readdirSync(DIST)
        .filter(f => f.endsWith('.js') && f !== entryChunk())
        .some(f => readFileSync(join(DIST, f), 'utf8').includes(MARKER));
    expect(elsewhere, 'the page is in no chunk at all — the assertion above proves nothing').toBe(true);
});

// ─── What a list route loads before it can paint ────────────────
//
// A route mounts once its whole static graph has arrived. On a list page the create modal and the
// record drawer open only on a click, but their forms — the auto form, its date picker, its relation
// pickers — were most of that graph: /tickets painted at 3.9 s on slow 4G, and 3.0 s once its
// overlays were in `@defer (idle)` (#407). Every list page defers them the same way (#1201).
//
// The closure is what the route table says to load for the route: its chunk and the entries of
// Vite's preload map listed beside it. That is what the router waits for before it mounts the page.

const LIST_ROUTES = ['/customers', '/sites', '/employees', '/employees/:id/contracts', '/assets', '/services', '/tickets'];
/** The modules only an overlay of a list page needs. */
const FORM_CHUNKS = ['pdx-auto-form', 'pdx-edit-drawer', 'pdx-date-picker'];
const chunkOf = (name: string) => new RegExp(`^${name}-[\\w-]{8}\\.js$`);

/** A route's chunk and the files Vite's preload map lists beside it, read off the entry's route table. */
function routeClosure(path: string): string[] {
    const entry = readFileSync(join(DIST, entryChunk()), 'utf8');
    const preloadMap = entry.match(/m\.f=(\[[^\]]*\])/);
    if (!preloadMap) throw new Error('the entry has no preload map (`__vite__mapDeps`) — nothing to read');
    const files: string[] = JSON.parse(preloadMap[1]).map((p: string) => p.replace(/^assets\//, ''));
    const escaped = path.replace(/[/:]/g, (c) => `\\${c}`);
    const route = entry.match(new RegExp(`"${escaped}":\\(\\)=>\\w+\\(\\(\\)=>import\\("\\./([^"]+\\.js)"\\)(?:,__vite__mapDeps\\(\\[([\\d,]*)\\]\\))?`));
    if (!route) throw new Error(`the route table has no loader for ${path}`);
    const deps = route[2] ? route[2].split(',').map((i) => files[Number(i)]) : [];
    return [route[1], ...deps];
}

test('the forms a list page opens on a click are not in what the route loads before it paints', () => {
    // The control: the forms are in the build, so a closure without them means something.
    const all = readdirSync(DIST);
    for (const name of FORM_CHUNKS) {
        expect(all.some((f) => chunkOf(name).test(f)), `${name} has no chunk of its own — the check below proves nothing`)
            .toBe(true);
    }
    const found: string[] = [];
    for (const path of LIST_ROUTES) {
        const closure = routeClosure(path);
        const gz = closure.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length, 0);
        console.log(`[bundle] route ${path}: ${closure.length} files, ${(gz / 1024).toFixed(1)} KB gzipped`);
        for (const name of FORM_CHUNKS) {
            if (closure.some((f) => chunkOf(name).test(f))) found.push(`${path} loads ${name}`);
        }
    }
    expect(found, 'put the page\'s overlays inside one `@defer (idle)`, as tickets.pdx does').toEqual([]);
});

test('and the entry is smaller than the whole of the JavaScript', () => {
    const all = readdirSync(DIST).filter((f) => f.endsWith('.js'));
    const total = all.reduce((s, f) => s + gzipSync(readFileSync(join(DIST, f))).length, 0);
    const entry = gzipSync(readFileSync(join(DIST, entryChunk()))).length;
    console.log(`[bundle] entry ${(entry / 1024).toFixed(1)} KB gzipped of ${(total / 1024).toFixed(1)} KB total`);
    expect(entry, 'the entry is the whole bundle — nothing was split out of it').toBeLessThan(total);
});

# Performance tools

The tools a performance survey is made with: build a scenario, profile one of its actions, read the
profile top-down and bottom-up, and time a hand-patched build against the one it was copied from. They
are how #685 found that a `@defer` whose code had arrived cost the `.pdx` filter popover most of its
gap, where the self-time list pointed at the per-binding work.

They use the showcase's own `vite` and `@playwright/test`, and the scenario suite's table of scenarios
(`tests/scenarios-build.ts`), so a scenario is built here as the suite builds it. Every command below
runs from the repository root; the outputs are from one run on the `pilot-mount` scenario, the
`.pdx` pilot's components against their TypeScript versions.

| Tool | What it does |
|---|---|
| `build-scenario.mjs <scenario> <out> [--no-minify] [--config <vite config>]` | a production build of a scenario into `<out>`, emptied first |
| `profile.mjs <dir> <action> [runs] [--out <file>]` | a CDP CPU profile of `runs` calls of an action, saved as a `.cpuprofile` |
| `tree.mjs <profile> <root> [minMs] [depth]` | the top-down call tree from a function, merged by function |
| `callers.mjs <profile> <fn> [depth]` | bottom-up: the caller chains a function's self time is spent under |
| `compare.mjs <action> <dirA> <dirB> […] [--samples <n>]` | several builds of one page, timed alternated in one run |

An **action** is `name[:arg,arg…]`, a call of the page's `window.__<name>(…args)`: `mount:conditions,100`
is `window.__mount('conditions', 100)`. An argument that parses as JSON is passed as that value, any
other as a string. A scenario says it is ready with `window.__ready = true`. When the function returns
a number, that number is the action's time (a scenario's `__mount` times itself, up to the moment
every instance has drawn); otherwise it is the time the call took to settle.

## build-scenario.mjs

```
node packages/showcase/tools/perf/build-scenario.mjs pilot-pdx packages/showcase/scenarios/dist/perf/pilot-pdx --no-minify
```

`pilot-ts` is built the same way, into `dist/perf/pilot-ts`, for `compare.mjs` below.
`<scenario>` is a name of the suite's table: `hello`, `memory`, `lifecycle`, `crud`, `dashboard`,
`benchmark`, `pilot-ts`, `pilot-pdx`. `--config` builds the same root with another of its Vite configs
(`pilot-ts` with `--config vite.pilot.config.ts` is `pilot-pdx`). Build under `scenarios/dist/`, which
git ignores. **Profile an unminified build**: a minified one names its functions with one letter. Time
a minified one when the number itself matters.

Its last line (Vite's warnings and the compiler's diagnostics come before it):

```
pilot-pdx → packages/showcase/scenarios/dist/perf/pilot-pdx (unminified)
```

## profile.mjs

```
node packages/showcase/tools/perf/profile.mjs packages/showcase/scenarios/dist/perf/pilot-pdx mount:conditions,100 30
```

Serves the build, warms it up with 10 calls, then records a profile sampled every 50 µs over `runs`
calls (30 by default). It saves `<dir>/<name>.cpuprofile` (or `--out`), which DevTools also opens, and
prints the median and the functions with the most self and inclusive time. The profile covers the
whole call, the instances' removal included, which `__mount` leaves out of the time it returns.

```
mount:conditions,100: median 132.80 ms over 30 runs; 5060 ms sampled
profile → packages\showcase\scenarios\dist\perf\pilot-pdx\mount.cpuprofile
— self —
   716.6 ms  14.2%  (garbage collector):0
   449.4 ms   8.9%  body:3357 index-CrpETu4q.js
   316.5 ms   6.3%  dispose:518 index-CrpETu4q.js
   290.6 ms   5.7%  hydrateAttributes:1460 index-CrpETu4q.js
   226.4 ms   4.5%  (program):0
   153.3 ms   3.0%  importNode:0
   126.5 ms   2.5%  appendChild:0
   103.4 ms   2.0%  removeChild:0
    97.8 ms   1.9%  cloneNode:0
    96.6 ms   1.9%  querySelectorAll:0
    95.0 ms   1.9%  insertBefore:0
    92.2 ms   1.8%  read.dispose:462 index-CrpETu4q.js
    91.0 ms   1.8%  remove:0
    90.2 ms   1.8%  addEventListener:0
    84.3 ms   1.7%  setAttribute:0
— inclusive —
  4073.6 ms  80.5%  (anon):1
  4073.6 ms  80.5%  evaluate:284
  4070.6 ms  80.5%  mount:11089 index-CrpETu4q.js
  3253.6 ms  64.3%  add:11058 index-CrpETu4q.js
  3249.6 ms  64.2%  buildFilterPopoverContent:11036 index-CrpETu4q.js
  3227.5 ms  63.8%  appendChild:0
  3217.9 ms  63.6%  connectedCallback:3329 index-CrpETu4q.js
  3215.4 ms  63.5%  connectedCallback:2911 index-CrpETu4q.js
  2838.0 ms  56.1%  collectDisposers:231 index-CrpETu4q.js
  2838.0 ms  56.1%  collectScope:253 index-CrpETu4q.js
  2836.8 ms  56.1%  (anon):2936 index-CrpETu4q.js
  2836.8 ms  56.1%  (anon):255 index-CrpETu4q.js
  2778.2 ms  54.9%  body:3357 index-CrpETu4q.js
  1090.9 ms  21.6%  effect:473 index-CrpETu4q.js
   999.0 ms  19.7%  html:1354 index-CrpETu4q.js
```

The median here is higher than the one `compare.mjs` reports: the profiler slows what it samples.
Read a profile for where the time goes, and time with `compare.mjs`.

## tree.mjs

```
node packages/showcase/tools/perf/tree.mjs packages/showcase/scenarios/dist/perf/pilot-pdx/mount.cpuprofile mount 150 4
```

Starts at every outermost call of `<root>` (a name, or `name:line` to pick one of several), merges the
calls of one function under one parent into a row of total and self milliseconds, leaves out rows
under `minMs` (5) and stops at `depth` (8). This is the reading a self-time list does not give: which
call a cost belongs to.

```
4070.6 (self 2.7)  mount:11089
  3253.6 (self 1.4)  add:11058
    3249.6 (self 2.5)  buildFilterPopoverContent:11036
      3223.9 (self 6.0)  appendChild:0
        3217.9 (self 2.5)  connectedCallback:3329
  754.1 (self 91.0)  remove:0
    663.2 (self 56.5)  disconnectedCallback:2987
      246.2 (self 16.3)  dispose:238
      203.7 (self 197.0)  dispose:518
```

## callers.mjs

```
node packages/showcase/tools/perf/callers.mjs packages/showcase/scenarios/dist/perf/pilot-pdx/mount.cpuprofile dispose 4
```

Groups every sample taken inside `<fn>` itself by its chain of callers, up to `depth` (6) frames,
nearest first, and prints the ten heaviest chains. A bare name matches every function with it, here
the two `dispose`s, at lines 238 and 518; `dispose:518` would take one.

```
dispose: 343.1 ms of self time
   213.4 ms  disconnectedCallback:2987 < remove:0 < mount:11089 < (anon):1
    84.8 ms  dispose:238 < disconnectedCallback:2987 < remove:0 < mount:11089
     7.4 ms  dispose:238 < (anon):2464 < dispose:238 < (anon):2393
     7.2 ms  dispose:238 < (anon):2364 < dispose:238 < disconnectedCallback:2987
     5.5 ms  dispose:238 < dispose:518 < dispose:238 < (anon):2364
     5.2 ms  (anon):2364 < dispose:238 < disconnectedCallback:2987 < remove:0
     4.5 ms  disposeAll:3939 < (anon):7125 < disconnectedCallback:2987 < remove:0
     4.1 ms  dispose:238 < (anon):2393 < dispose:238 < dispose:518
     3.1 ms  dispose:238 < (anon):2464 < dispose:238 < disconnectedCallback:2987
     2.9 ms  (anon):7125 < disconnectedCallback:2987 < remove:0 < mount:11089
```

## compare.mjs

```
node packages/showcase/tools/perf/compare.mjs mount:conditions,100 packages/showcase/scenarios/dist/perf/pilot-ts packages/showcase/scenarios/dist/perf/pilot-pdx
```

Opens each build in its own page of one browser, warms each up with 10 calls, then takes 31 samples
(`--samples`): one call per build, in an order that reverses every other sample, so that no build
always runs first. Prints each build's median and its ratio to the first.

```
mount:conditions,100: 31 samples per build, alternated
packages/showcase/scenarios/dist/perf/pilot-ts      91.20 ms  1.00×
packages/showcase/scenarios/dist/perf/pilot-pdx     97.50 ms  1.07×
```

**A ratio is read only against a baseline timed in the same run**: two runs of the same pair move by
about 10% against each other. To estimate a change before writing it, copy an unminified build, patch
the copy's bundle by hand, and compare the copy with the build it was copied from.

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
| `detached.mjs <dir> [tag …] [--mounts <n>]` | detached elements each component leaves alive after its removal ([Memory](#memory)) |
| `retainers.mjs <dir> <tag> [paths] [--mounts <n>]` | the strong reference chains that keep a removed component alive |
| `heap-diff.mjs <dir> <tag> [rounds]` | the kinds of object that grow between two heap snapshots of a tag's mounts |
| `css-retention.mjs <css> [from to] \| --each … \| --inner …` | bisects a stylesheet for the rules that make Chromium keep removed elements |

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

## Memory

Four tools for what a removed component leaves behind. `memory.mjs` holds what they share: a page
with a CDP session, a forced GC, a heap snapshot, and the live detached elements. They work on the
`component-mount` scenario, whose `window.__mount(tag, n)` mounts any tag of the library and removes
it. `tests/scenario-component-retention.spec.ts` holds every tag to keeping no instance. When a row of
that spec goes red, these tools are how to find out why. They found the five causes of #881 and the
leak of #889.

Build the scenario unminified first:

```
node packages/showcase/tools/perf/build-scenario.mjs component-mount packages/showcase/scenarios/dist/perf/component-mount --no-minify
```

### detached.mjs

Each tag gets a fresh page and 5 × 100 mounts and removals, then a forced GC. The tool prints every
detached element still alive, by `tag[data-part].class`. The retention spec counts a component's own
instances, and a component can leak part of its tree while the instance goes: `pdx-avatar-group`
kept 500 root `<div>`s that way (#887). With no tag named, it runs the whole manifest and prints only
the tags that leave something. On `main` today:

```
node packages/showcase/tools/perf/detached.mjs packages/showcase/scenarios/dist/perf/component-mount
```
```
0 of 114 tags leave detached elements after 500 mounts
```

### retainers.mjs

The tool takes a heap snapshot after the tag's mounts and walks it backwards from each live
`<tag …>` element to the GC roots. It follows strong edges only: weak and shortcut edges keep
nothing, and a `WeakMap`'s value edge keeps its value only while the key is reachable some other way.
It prints the most frequent chains, root first. On a build of the scenario from before #888, it shows
the cause that PR fixed: a resolver created inside the first error boundary kept that boundary's
`fallbackFn`, `ctx` and element, and through the detached container all its siblings.

```
node packages/showcase/tools/perf/retainers.mjs <a build from before #888> pdx-error-boundary 1
```
```
pdx-error-boundary: 100 live elements in the snapshot

1× synthetic:  --[n]-->
    synthetic:(GC roots)  --[n]-->
    synthetic:(Global handles)  --internal:1 / V8PerContextData::context_-->
    hidden:system / NativeContext / http://127.0.0.1:56184  --internal:global_object-->
    object:Window (global*) / http://127.0.0.1:56184  --property:__mount-->
    closure:mount  --internal:context-->
    object:system / Context  --context:ownerResolver-->
    closure:  --internal:context-->
    object:system / Context  --context:fallbackFn-->
    closure:  --internal:context-->
    object:system / Context  --context:ctx-->
    object:Object  --property:el-->
    native:<pdx-error-boundary data-pdx-root="">  --[n]-->
    native:<div>  --[n]-->
    native:<pdx-error-boundary data-pdx-root="">  --[n]-->
    native:<pdx-error-boundary data-pdx-root="">  --[n]-->
    native:<pdx-error-boundary data-pdx-root="">
```

On `main` the same command for any tag prints `0 live elements in the snapshot`.

### heap-diff.mjs

A leak can keep no element at all. This tool takes two snapshots, the second after twice as many
mounts again, and lists the kinds of object whose size grew most, with the count added per mount. A
kind that grows by a steady count per mount is what the leak is made of. Here, on `main` before #890,
it is the 14 computeds a `pdx-rich-text` mount left behind: `closure recompute`, `markDirty`, `read`
and the `Set` of their subscribers. That was #889.

```
node --max-old-space-size=8192 packages/showcase/tools/perf/heap-diff.mjs packages/showcase/scenarios/dist/perf/component-mount pdx-rich-text 5
```
```
pdx-rich-text: 1000 mounts between the two snapshots
   1297 KB  +  13662   13.66/mount  array 
   1227 KB  +  27324   27.32/mount  object system / Context
   1121 KB  +  40986   40.99/mount  closure 
   1017 KB  +  13662   13.66/mount  array (object elements)
    534 KB  +  27324   27.32/mount  hidden system / PropertyArray
    438 KB  +  14254   14.25/mount  object Object
    427 KB  +  13662   13.66/mount  closure recompute
    427 KB  +  27324   27.32/mount  object Array
    374 KB  +  13662   13.66/mount  closure markDirty
    374 KB  +  13662   13.66/mount  closure read
    213 KB  +  13662   13.66/mount  object Set
     57 KB  +     45    0.04/mount  code 
     20 KB  +    127    0.13/mount  code system / TrustedByteArray
      9 KB  +    590    0.59/mount  object WeakRef
      8 KB  +     45    0.04/mount  code system / ProtectedFixedArray
      7 KB  +    101    0.10/mount  hidden system / WeakArrayList
      3 KB  +     45    0.04/mount  code (code)
      3 KB  +     25    0.03/mount  native PerformanceScriptTiming
      2 KB  +     45    0.04/mount  code system / TrustedWeakFixedArray
      2 KB  +      1    0.00/mount  code (instruction stream for reapplyUiAttrs)
```

### css-retention.mjs

Chromium can keep a removed element alive when the page's CSS has a sibling combinator beside an
attribute selector, and the attribute was set while the element was in the page. Whether it does
depends on how the elements sit in the tree (#891). This tool loads a stylesheet's top-level rules
`from`..`to` into `about:blank` and inserts 20 `<div>`s one by one. Once each is in the page it sets
`--attr` (`data-part`), then removes it. It then counts how many are still alive after a GC.

To bisect, halve the range until a single top-level rule is left. `--each <from> <to>` probes the
rules of a range one at a time, and `--inner <index>` probes the rules inside one `@layer` block. That
is how `[data-part="item"] + [data-part="item"]` was found in the list dividers (#887). On the
scenario's stylesheet today it finds nothing:

```
node packages/showcase/tools/perf/css-retention.mjs packages/showcase/scenarios/dist/perf/component-mount/assets/<the built .css>
```
```
rules 0..138 of 138: 0 of 20 alive; with no CSS: 0 of 20
```

`core/tests/design-sibling-attribute.test.ts` keeps the shape out of the design system's own CSS.

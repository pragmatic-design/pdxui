// Tests for auto-import detection of new signal operators in the compiler.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';
import { injectComponentImports } from '../src/plugin-utils';

describe('auto-import: signal operators', () => {
    it('auto-imports pipe + debounce + map', () => {
        const source = `
<template><div>{{ search }}</div></template>
<script setup>
  @prop query: string = '';
  const search = pipe(() => query(), debounce(300), map(q => q.trim()));
</script>`;
        const { code: output } = compile(source, 'search.pdx');
        expect(output).toContain('pipe');
        expect(output).toContain('debounce');
        expect(output).toContain('map');
        // Should be in the import from @pdxui/core
        expect(output).toMatch(/import\s*\{[^}]*pipe[^}]*\}\s*from\s*'@pdxui\/core'/);
    });

    it('auto-imports switchSignal', () => {
        const source = `
<template><div>{{ results }}</div></template>
<script setup>
  @prop query: string = '';
  let q = $signal('');
  const results = switchSignal(() => q, (v) => fetch('/api?q=' + v));
</script>`;
        const { code: output } = compile(source, 'switch.pdx');
        expect(output).toContain('switchSignal');
    });

    it('auto-imports exhaustSignal', () => {
        const source = `
<template><div>{{ result }}</div></template>
<script setup>
  let trigger = $signal(0);
  const result = exhaustSignal(() => trigger, () => fetch('/api/submit'));
</script>`;
        const { code: output } = compile(source, 'exhaust.pdx');
        expect(output).toContain('exhaustSignal');
    });

    it('auto-imports distinct + previous + scan', () => {
        const source = `
<template><div>{{ total }}</div></template>
<script setup>
  let count = $signal(0);
  const d = distinct(() => count);
  const prev = previous(() => count);
  const total = scan(() => count, (acc, v) => acc + v, 0);
</script>`;
        const { code: output } = compile(source, 'utility.pdx');
        expect(output).toContain('distinct');
        expect(output).toContain('previous');
        expect(output).toContain('scan');
    });

    it('auto-imports fromEvent + fromResize', () => {
        const source = `
<template><div>{{ clicks }}</div></template>
<script setup>
  let clicks = $signal(0);
  const evts = fromEvent(document, 'click');
  const size = fromResize(document.body);
</script>`;
        const { code: output } = compile(source, 'dom.pdx');
        expect(output).toContain('fromEvent');
        expect(output).toContain('fromResize');
    });

    it('auto-imports fromPromise + toPromise', () => {
        const source = `
<template><div>{{ data }}</div></template>
<script setup>
  const data = fromPromise(fetch('/api/data'));
  const ready = toPromise(() => data());
</script>`;
        const { code: output } = compile(source, 'promise.pdx');
        expect(output).toContain('fromPromise');
        expect(output).toContain('toPromise');
    });

    it('auto-imports tween + easings', () => {
        const source = `
<template><div>{{ smooth }}</div></template>
<script setup>
  let target = $signal(0);
  const smooth = tween(() => target, { easing: easings.easeOutCubic });
</script>`;
        const { code: output } = compile(source, 'anim.pdx');
        expect(output).toContain('tween');
        expect(output).toContain('easings');
    });

    it('auto-imports untracked', () => {
        const source = `
<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  let other = $signal(10);
  $effect(() => {
    count;
    const val = untracked(() => other);
  });
</script>`;
        const { code: output } = compile(source, 'untrack.pdx');
        expect(output).toContain('untracked');
    });

    it('auto-imports useQuery', () => {
        const source = `
<template><div>{{ users }}</div></template>
<script setup>
  const { data: users } = useQuery(() => fetch('/api/users'), { key: 'users' });
</script>`;
        const { code: output } = compile(source, 'query.pdx');
        expect(output).toContain('useQuery');
    });

    it('auto-imports tap + catchError', () => {
        const source = `
<template><div>{{ safe }}</div></template>
<script setup>
  let x = $signal(0);
  const safe = pipe(() => x, tap(v => console.log(v)), catchError(() => 0));
</script>`;
        const { code: output } = compile(source, 'pipe-error.pdx');
        expect(output).toContain('tap');
        expect(output).toContain('catchError');
    });

    it('does NOT import map when used as array method', () => {
        const source = `
<template><div>{{ items }}</div></template>
<script setup>
  let items = $signal([1, 2, 3]);
  const doubled = items.map(x => x * 2);
</script>`;
        const { code: output } = compile(source, 'array-map.pdx');
        const importLine = output.match(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/)?.[1] ?? '';
        expect(importLine).not.toMatch(/\bmap\b/);
    });

    it('does NOT import operators mentioned only in comments', () => {
        const source = `
<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  // TODO: use pipe() and map() later
  // switchSignal is great for search
  // fromEvent(el, 'click') would be useful
</script>`;
        const { code: output } = compile(source, 'comments.pdx');
        const importLine = output.match(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/)?.[1] ?? '';
        expect(importLine).not.toMatch(/\bpipe\b/);
        expect(importLine).not.toMatch(/\bmap\b/);
        expect(importLine).not.toMatch(/\bswitchSignal\b/);
        expect(importLine).not.toMatch(/\bfromEvent\b/);
    });

    it('does NOT import operators in string literals', () => {
        const source = `
<template><div>{{ label }}</div></template>
<script setup>
  @prop label: string = 'use pipe() here';
  const msg = "call switchSignal() for search";
</script>`;
        const { code: output } = compile(source, 'strings.pdx');
        const importLine = output.match(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/)?.[1] ?? '';
        expect(importLine).not.toMatch(/\bpipe\b/);
        expect(importLine).not.toMatch(/\bswitchSignal\b/);
    });
});

// The reactivity PRIMITIVES belong to that list too.
//
// `script-analyzer.ts` auto-imports the core APIs called in the setup body — `pipe`,
// `switchSignal`, `fromEvent`, `tween` — and `effect`, `computed`, `batch`, `watch`, `onCleanup`
// with them. A `$effect(` at the start of a line has an import of its own; without this, `effect(…)`
// called inside a function compiles to a module that references an undefined name.
//
// That fails at RUN time, in the function, with a minified stack: the page mounts, and the first
// upload throws.
describe('auto-import: the reactivity primitives', () => {
    const importsOf = (script: string): string => {
        const source = `<template><div>{{ ready }}</div></template>\n<script setup>\n${script}\n</script>`;
        const { code } = compile(source, 'panel.pdx');
        return code.match(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/)?.[1] ?? '';
    };

    it('imports effect when it is called inside a function', () => {
        // The shape that breaks: a handle per transfer, an effect per handle.
        expect(importsOf(`
  let ready = $signal(false);
  function watchTransfer(handle) {
    const stop = effect(() => { ready = handle.progress() === 100; });
    return stop;
  }
`)).toMatch(/\beffect\b/);
    });

    it('imports computed, batch, watch and onCleanup the same way', () => {
        const line = importsOf(`
  let n = $signal(0);
  function build() {
    const double = computed(() => n * 2);
    batch(() => { n = 1; });
    watch(() => n, () => {});
    onCleanup(() => {});
    return double;
  }
`);
        for (const name of ['computed', 'batch', 'watch', 'onCleanup']) {
            expect(line, `${name} is called and not imported`).toMatch(new RegExp(`\\b${name}\\b`));
        }
    });

    it('imports a lifecycle hook that is not onMount', () => {
        // `onMount` and `onDestroy` each have a branch of their own; the other nine rely on the
        // detector. Without it `onBeforeLeave(…)` compiles to `onBeforeLeave is not defined`, and the
        // page renders "Error in <pdx-intake>" instead of itself — as a page that guards a route on
        // a dirty form does.
        const line = importsOf(`
  let ready = $signal(false);
  onBeforeLeave(() => ready);
  onRouteChange(() => { ready = false; });
`);
        expect(line, 'onBeforeLeave is called and not imported').toMatch(/\bonBeforeLeave\b/);
        expect(line).toMatch(/\bonRouteChange\b/);
    });

    it('control — a name that is only mentioned, not called, is not imported', () => {
        expect(importsOf(`
  let ready = $signal(false);
  const note = 'call effect() yourself';
  // batch() is not used here
`)).not.toMatch(/\beffect\b|\bbatch\b/);
    });

    it('control — a method call on an object is not the core API', () => {
        expect(importsOf(`
  let ready = $signal(false);
  function go(runner) { runner.effect(); return runner.batch(); }
`)).not.toMatch(/\beffect\b|\bbatch\b/);
    });

    it('does not import a name the setup declares itself', () => {
        // Emitting the import here is a duplicate binding and a build failure, and it would only
        // ever hit the author who wrote their own helper. The guard covers every auto-imported
        // name — `map` and `filter` are far likelier to be someone's local function than `effect` is.
        const line = importsOf(`
  let ready = $signal(false);
  function effect(fn) { return fn(); }
  const map = (xs) => xs;
  function go() { effect(() => 1); map([1]); }
`);
        expect(line, 'a local declaration was shadowed by an auto-import').not.toMatch(/\beffect\b/);
        expect(line).not.toMatch(/\bmap\b/);
    });

    it('and the author own import is not doubled', () => {
        // Two `import { effect }` in one module is a SyntaxError. A core import is absorbed into
        // the generated one, so this is the assertion that it stays absorbed.
        const source = `<template><div>{{ ready }}</div></template>
<script setup>
import { effect, uploadFile } from '@pdxui/core';
let ready = $signal(false);
function go(file) { const h = uploadFile('/u', file); effect(() => { ready = h.progress() === 100; }); }
</script>`;
        const { code } = compile(source, 'panel.pdx');
        expect(code.match(/from\s*'@pdxui\/core'/g) ?? []).toHaveLength(1);
        expect(code).toMatch(/import\s*\{[^}]*\beffect\b[^}]*\}\s*from\s*'@pdxui\/core'/);
    });
});

// A component used only inside `@defer` must not be in the route's payload.
//
// `docs/template.md` promises it: "The compiler generates the dynamic import and the boundary…
// It's the right way to keep a chart you only see on scroll out of the home bundle." Postponing
// only the RENDER is not that: a STATIC import at the top of the module is what decides which
// chunk the code lands in, and a chart behind a tab most visitors never open would cost the
// route's chunk its full size (15 KB on the showcase's ticket route).
describe('a component only used inside @defer', () => {
    const compileDeferred = (template: string): string => {
        const source = `<template>${template}</template>\n<script setup>\nlet ready = $signal(true);\n</script>`;
        const resolver = new ComponentResolver();
        resolver.registerUiManifest();
        const { code } = compile(source, 'page.pdx', undefined, undefined, {
            importPathOf: (tag) => resolver.resolve(tag)?.importPath ?? null,
        });
        return injectComponentImports(code, 'page.pdx', source, resolver);
    };

    it('is imported DYNAMICALLY, inside the defer, not statically at the top', () => {
        const out = compileDeferred(`
  @defer (interaction) {
    <pdx-chart type="line"></pdx-chart>
  } @placeholder {
    <div class="skeleton"></div>
  }
`);
        const staticImports = out.split('\n').filter(l => l.trimStart().startsWith('import '));
        expect(staticImports.join('\n'), 'the chart is in the route payload — @defer postponed only the render')
            .not.toMatch(/@pdxui\/ui\/chart/);
        expect(out, 'no dynamic import was generated for the deferred component')
            .toMatch(/import\(\s*['"]@pdxui\/ui\/chart['"]\s*\)/);
    });

    it('control — the same component OUTSIDE a defer keeps its static import', () => {
        const out = compileDeferred('<pdx-chart type="line"></pdx-chart>');
        const staticImports = out.split('\n').filter(l => l.trimStart().startsWith('import '));
        expect(staticImports.join('\n')).toMatch(/@pdxui\/ui\/chart/);
    });

    it('control — used both inside and outside, the static import stays', () => {
        // A tag rendered elsewhere on the page is in the payload whatever the defer does, and
        // dropping its static import would break the eager one.
        const out = compileDeferred(`
  <pdx-chart type="bar"></pdx-chart>
  @defer (interaction) {
    <pdx-chart type="line"></pdx-chart>
  }
`);
        const staticImports = out.split('\n').filter(l => l.trimStart().startsWith('import '));
        expect(staticImports.join('\n')).toMatch(/@pdxui\/ui\/chart/);
    });
});

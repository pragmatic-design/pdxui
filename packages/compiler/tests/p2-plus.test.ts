// Tests for P2+ features: @search validation codegen, @await timing, @outlet parallel

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { parseTemplate } from '../src/parser/template';

describe('@search validation codegen', () => {
    it('generates searchParams computed from @search schema', () => {
        const { code } = compile(`
<template><div>Products</div></template>
<script setup>
@page '/products';
@search { page: number = 1, sort: string = 'name', filter?: string };
</script>`, 'products.pdx');

        expect(code).toContain('searchParams');
        expect(code).toContain('computed(');
        expect(code).toContain('URLSearchParams');
        expect(code).toContain("'page'");
        expect(code).toContain("'sort'");
        expect(code).toContain("'filter'");
    });

    it('generates number validation warning for number params', () => {
        const { code } = compile(`
<template><div>List</div></template>
<script setup>
@page '/list';
@search { page: number = 1 };
</script>`, 'list.pdx');

        expect(code).toContain('isNaN');
        expect(code).toContain('console.warn');
        expect(code).toContain('must be a number');
    });

    it('includes searchParams in auto-return', () => {
        const { code } = compile(`
<template><div>{{ searchParams.page }}</div></template>
<script setup>
@page '/items';
@search { page: number = 1 };
</script>`, 'items.pdx');

        expect(code).toMatch(/return \{[^}]*searchParams/);
    });

    it('imports currentSearch from @pdxui/router — the router that is RUNNING, never a second one', () => {
        // There is exactly ONE router in a build — `@pdxui/router` funnels through
        // `src/active.ts`, whose CONTENT is the generated module in a production build — so
        // importing from the package is how a component gets the router that is actually
        // navigating. Naming `virtual:pdx-router` directly is the split-brain state: it would
        // instantiate the generated module a second time, beside the one the outlet drives, with
        // its own signals and its own popstate listener — one router listening to popstate, the
        // other being read, and a search signal that goes stale.
        const { code } = compile(`
<template><div>{{ searchParams.page }}</div></template>
<script setup>
@page '/items';
@search { page: number = 1 };
</script>`, 'items.pdx');

        expect(code).toContain("import { currentSearch } from '@pdxui/router';");
        expect(code, 'a component naming the virtual module gets a router nothing is navigating')
            .not.toContain("from 'virtual:pdx-router'");
    });

    it('applies default + number validation from the @search schema', () => {
        const { code } = compile(`
<template><div>{{ searchParams.page }}</div></template>
<script setup>
@page '/items';
@search { page: number = 1 };
</script>`, 'items.pdx');

        // Default of 1 is applied when the param is absent, and non-numeric input is guarded.
        expect(code).toContain("__sp.get('page') ?? 1");
        expect(code).toContain('isNaN');
    });
});

describe('@await timing parser', () => {
    it('parses @await with minMs option', () => {
        const ast = parseTemplate('@await (ready) { minMs: 200 } { <div>Content</div> } @loading { <p>Wait</p> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].minMs).toBe(200);
        expect(ast[0].maxMs).toBeUndefined();
        expect(ast[0].body.length).toBeGreaterThan(0);
        expect(ast[0].loading).toBeDefined();
    });

    it('parses @await with both minMs and maxMs', () => {
        const ast = parseTemplate('@await (loaded) { minMs: 300, maxMs: 5000 } { <main>App</main> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].minMs).toBe(300);
        expect(ast[0].maxMs).toBe(5000);
    });

    it('parses @await without timing (backward compat)', () => {
        const ast = parseTemplate('@await (ok) { <div>Done</div> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].minMs).toBeUndefined();
        expect(ast[0].maxMs).toBeUndefined();
    });
});

describe('@await timing codegen', () => {
    it('generates awaitTimed for @await with timing options', () => {
        const { code } = compile(`
<template>
    @await (ready) { minMs: 200 } {
        <div>Content</div>
    } @loading {
        <p>Loading...</p>
    }
</template>
<script setup>
let ready = $signal(false);
</script>`, 'timed.pdx');

        expect(code).toContain('awaitTimed');
        expect(code).toContain('minMs: 200');
    });

    it('uses when() for @await without timing (no awaitTimed)', () => {
        const { code } = compile(`
<template>
    @await (ready) {
        <div>Content</div>
    } @loading {
        <p>Loading...</p>
    }
</template>
<script setup>
let ready = $signal(false);
</script>`, 'simple.pdx');

        expect(code).toContain('when(');
        expect(code).not.toContain('awaitTimed');
    });
});

describe('@outlet parallel codegen', () => {
    it('emits outlets in route manifest', () => {
        const { code } = compile(`
<template><div>Dashboard</div></template>
<script setup>
@page '/dashboard';
@outlet 'sidebar' -> 'pdx-sidebar';
@outlet 'toolbar' -> 'pdx-toolbar';
</script>`, 'dashboard.pdx');

        expect(code).toContain('outlets:[{name:"sidebar",tag:"pdx-sidebar"},{name:"toolbar",tag:"pdx-toolbar"}]');
    });

    it('parses multiple outlets', () => {
        const analysis = analyzeScript(
            "@page '/app';\n@outlet 'left' -> 'pdx-nav';\n@outlet 'right' -> 'pdx-chat';",
            'test.pdx'
        );
        expect(analysis.route.outlets).toHaveLength(2);
        expect(analysis.route.outlets![0]).toEqual({ name: 'left', tag: 'pdx-nav' });
        expect(analysis.route.outlets![1]).toEqual({ name: 'right', tag: 'pdx-chat' });
    });
});

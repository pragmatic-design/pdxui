import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parser/template';
import { compile } from '../src/plugin';
import { validate } from '../src/compiler/validate';
import { analyzeScript } from '../src/compiler/script-analyzer';

// ─── Parser ──────────────────────────────────────────────────────────

describe('@await parser', () => {
    it('parses basic @await', () => {
        const ast = parseTemplate('@await (ready) { <div>Content</div> }');
        expect(ast).toHaveLength(1);
        expect(ast[0].type).toBe('await');
        if (ast[0].type !== 'await') return;
        expect(ast[0].condition).toBe('ready');
        expect(ast[0].body).toHaveLength(1);
        expect(ast[0].loading).toBeUndefined();
        expect(ast[0].errorBody).toBeUndefined();
    });

    it('parses @await with @loading', () => {
        const ast = parseTemplate('@await (appReady) { <main>App</main> } @loading { <div>Loading...</div> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].condition).toBe('appReady');
        expect(ast[0].body).toHaveLength(1);
        expect(ast[0].loading).toHaveLength(1);
    });

    it('parses @await with @error (no variable)', () => {
        const ast = parseTemplate('@await (data) { <p>OK</p> } @error { <p>Error</p> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].errorBody).toHaveLength(1);
        expect(ast[0].errorVar).toBeUndefined();
    });

    it('parses @await with @error (err) variable', () => {
        const ast = parseTemplate('@await (ready) { <p>OK</p> } @error (err) { <p>{{ err.message }}</p> }');
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].errorVar).toBe('err');
        // errorBody has 3 nodes: html(<p>), interpolation(err.message), html(</p>)
        expect(ast[0].errorBody!.length).toBeGreaterThanOrEqual(1);
        expect(ast[0].errorBody!.some(n => n.type === 'interpolation')).toBe(true);
    });

    it('parses @await with both @loading and @error', () => {
        const ast = parseTemplate(
            '@await (authenticated) { <nav>Welcome</nav> } @loading { <div>Checking...</div> } @error (e) { <div>Auth failed</div> }'
        );
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].condition).toBe('authenticated');
        expect(ast[0].loading).toHaveLength(1);
        expect(ast[0].errorBody).toHaveLength(1);
        expect(ast[0].errorVar).toBe('e');
    });

    it('parses complex condition expression', () => {
        const ast = parseTemplate("@await (users.status() !== 'loading') { <ul>list</ul> } @loading { <p>Wait</p> }");
        expect(ast).toHaveLength(1);
        if (ast[0].type !== 'await') return;
        expect(ast[0].condition).toBe("users.status() !== 'loading'");
    });

    it('records source location', () => {
        const ast = parseTemplate('@await (ok) { <p>yes</p> }');
        expect(ast[0].loc).toBeDefined();
        expect(ast[0].loc!.line).toBe(1);
    });

    it('nests inside @if', () => {
        const ast = parseTemplate('@if (hasAuth) { @await (ready) { <p>Content</p> } @loading { <p>Wait</p> } }');
        expect(ast).toHaveLength(1);
        expect(ast[0].type).toBe('if');
        if (ast[0].type !== 'if') return;
        // Body has whitespace html + @await node (+ possible trailing whitespace)
        const awaitNode = ast[0].body.find(n => n.type === 'await');
        expect(awaitNode).toBeDefined();
        expect(awaitNode!.type).toBe('await');
    });
});

// ─── Codegen (end-to-end compile) ────────────────────────────────────

describe('@await codegen', () => {
    it('compiles @await to when()', () => {
        const source = `
<template>
    @await (ready) {
        <div>Content</div>
    } @loading {
        <div>Loading...</div>
    }
</template>

<script setup>
let ready = $signal(false);
</script>`;

        const { code } = compile(source, 'await-basic.pdx');
        expect(code).toContain('when(');
        expect(code).toContain('ctx.ready()');
        expect(code).toContain('Content');
        expect(code).toContain('Loading...');
    });

    it('imports when from @pdxui/core', () => {
        const source = `
<template>
    @await (appReady) {
        <main>App</main>
    } @loading {
        <p>Booting</p>
    }
</template>

<script setup>
let appReady = $signal(false);
</script>`;

        const { code } = compile(source, 'await-import.pdx');
        expect(code).toContain('when');
        expect(code).toContain("from '@pdxui/core'");
    });

    it('compiles @await without @loading (null else branch)', () => {
        const source = `
<template>
    @await (ready) {
        <div>Content</div>
    }
</template>

<script setup>
let ready = $signal(false);
</script>`;

        const { code } = compile(source, 'await-no-loading.pdx');
        expect(code).toContain('when(');
        expect(code).toContain(', null)');
    });

    it('compiles @await with @error to errorBoundary wrapping when', () => {
        const source = `
<template>
    @await (data) {
        <div>Loaded</div>
    } @loading {
        <div>Loading</div>
    } @error (err) {
        <div>Error: {{ err.message }}</div>
    }
</template>

<script setup>
let data = $signal(false);
</script>`;

        const { code } = compile(source, 'await-error.pdx');
        expect(code).toContain('errorBoundary(');
        expect(code).toContain('when(');
        expect(code).toContain('err');
        expect(code).toContain('retry');
    });

    it('compiles complex condition with signal calls', () => {
        const source = `
<template>
    @await (status !== 'loading') {
        <p>Ready</p>
    } @loading {
        <p>Wait</p>
    }
</template>

<script setup>
let status = $signal('loading');
</script>`;

        const { code } = compile(source, 'await-complex.pdx');
        expect(code).toContain("ctx.status()");
        expect(code).toContain("'loading'");
    });
});

// ─── Validate ────────────────────────────────────────────────────────

describe('@await validation', () => {
    it('warns when @await has no @loading block', () => {
        const script = `let ready = $signal(false);`;
        const analysis = analyzeScript(script, 'test.pdx');
        const ast = parseTemplate('@await (ready) { <div>Content</div> }');
        const warnings = validate(analysis, ast, 'test.pdx');
        const awaitWarning = warnings.find(w => w.code === 'PDX_AWAIT_NO_LOADING');
        expect(awaitWarning).toBeDefined();
        expect(awaitWarning!.severity).toBe('info');
    });

    it('does not warn when @await has @loading block', () => {
        const script = `let ready = $signal(false);`;
        const analysis = analyzeScript(script, 'test.pdx');
        const ast = parseTemplate('@await (ready) { <div>Content</div> } @loading { <div>Wait</div> }');
        const warnings = validate(analysis, ast, 'test.pdx');
        const awaitWarning = warnings.find(w => w.code === 'PDX_AWAIT_NO_LOADING');
        expect(awaitWarning).toBeUndefined();
    });

    it('extracts identifiers from @await condition for unused checks', () => {
        const script = `let ready = $signal(false); let unused = $signal(0);`;
        const analysis = analyzeScript(script, 'test.pdx');
        const ast = parseTemplate('@await (ready) { <div>Content</div> } @loading { <div>Wait</div> }');
        const warnings = validate(analysis, ast, 'test.pdx');
        // 'ready' is used in condition, so no unused warning for it
        const unusedReady = warnings.find(w => w.code === 'PDX_UNUSED_REACTIVE' && w.message.includes('ready'));
        expect(unusedReady).toBeUndefined();
    });
});

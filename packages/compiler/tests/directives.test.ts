// Tests for new compiler directives: @show, @portal, @defer, <component :is>

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parser/template';
import { compile } from '../src/plugin';

// ─── Parser Tests ──────────────────────────────────────────────────

describe('parser: @show', () => {
    it('parses @show directive', () => {
        const ast = parseTemplate('@show (visible) { <div>Content</div> }');
        expect(ast[0].type).toBe('show');
        if (ast[0].type === 'show') {
            expect(ast[0].condition).toBe('visible');
            expect(ast[0].body.length).toBeGreaterThan(0);
        }
    });
});

describe('parser: @portal', () => {
    it('parses @portal with string target', () => {
        const ast = parseTemplate("@portal ('body') { <div>Modal</div> }");
        expect(ast[0].type).toBe('portal');
        if (ast[0].type === 'portal') {
            expect(ast[0].target).toBe('body');
        }
    });

    it('parses @portal with selector target', () => {
        const ast = parseTemplate("@portal ('#modal-root') { <div>Content</div> }");
        if (ast[0].type === 'portal') {
            expect(ast[0].target).toBe('#modal-root');
        }
    });
});

describe('parser: @defer', () => {
    it('parses @defer with trigger', () => {
        const ast = parseTemplate('@defer (viewport) { <div>Heavy</div> }');
        expect(ast[0].type).toBe('defer');
        if (ast[0].type === 'defer') {
            expect(ast[0].trigger).toBe('viewport');
        }
    });

    it('parses @defer with composite trigger', () => {
        const ast = parseTemplate('@defer (viewport | idle(2000)) { <div>Content</div> }');
        if (ast[0].type === 'defer') {
            expect(ast[0].trigger).toBe('viewport | idle(2000)');
        }
    });

    it('parses @defer with @placeholder', () => {
        const ast = parseTemplate('@defer (viewport) { <div>Loaded</div> } @placeholder { <div>Skeleton</div> }');
        if (ast[0].type === 'defer') {
            expect(ast[0].placeholder).toBeDefined();
            expect(ast[0].placeholder!.length).toBeGreaterThan(0);
        }
    });

    it('parses @defer with @loading and @error', () => {
        const ast = parseTemplate('@defer (timer(100)) { <div>Done</div> } @loading { <spinner/> } @error { <div>Fail</div> }');
        if (ast[0].type === 'defer') {
            expect(ast[0].loading).toBeDefined();
            expect(ast[0].error).toBeDefined();
        }
    });

    it('parses @defer with all sub-blocks', () => {
        const ast = parseTemplate(`
            @defer (viewport | idle(2000)) {
                <heavy-chart/>
            } @placeholder {
                <div class="skeleton">Loading...</div>
            } @loading {
                <spinner/>
            } @error {
                <div>Failed to load</div>
            }
        `);
        if (ast[0].type === 'defer') {
            expect(ast[0].trigger).toBe('viewport | idle(2000)');
            expect(ast[0].body.length).toBeGreaterThan(0);
            expect(ast[0].placeholder).toBeDefined();
            expect(ast[0].loading).toBeDefined();
            expect(ast[0].error).toBeDefined();
        }
    });
});

// ─── Compiler Tests ────────────────────────────────────────────────

describe('compile: @show', () => {
    it('compiles @show to show() call', () => {
        const { code } = compile(`
<template>
  @show (visible) { <div>Content</div> }
</template>
<script setup>
  @prop visible: boolean = true;
</script>`, 'test.pdx');

        expect(code).toContain('show');
        expect(code).toContain('ctx.visible');
    });
});

describe('compile: @portal', () => {
    it('compiles @portal to portal() call', () => {
        const { code } = compile(`
<template>
  @portal ('body') { <div class="modal">Modal</div> }
</template>
<script setup>
  @prop x: number = 0;
</script>`, 'test.pdx');

        expect(code).toContain('portal');
        expect(code).toContain("'body'");
    });
});

describe('compile: @defer', () => {
    it('compiles @defer to defer() call', () => {
        const { code } = compile(`
<template>
  @defer (viewport) { <div>Heavy content</div> }
</template>
<script setup>
  @prop x: number = 0;
</script>`, 'test.pdx');

        expect(code).toContain('defer');
        expect(code).toContain("trigger: 'viewport'");
    });

    it('compiles @defer with @placeholder and @loading', () => {
        const { code } = compile(`
<template>
  @defer (viewport | idle(2000)) {
    <div>Loaded</div>
  } @placeholder {
    <div>Skeleton</div>
  } @loading {
    <div>Loading...</div>
  }
</template>
<script setup>
  @prop x: number = 0;
</script>`, 'test.pdx');

        expect(code).toContain('placeholder:');
        expect(code).toContain('loading:');
        expect(code).toContain("trigger: 'viewport | idle(2000)'");
    });
});

describe('compile: <component :is>', () => {
    it('compiles <component :is> to dynamic() call', () => {
        const { code } = compile(`
<template>
  <component :is="currentView"/>
</template>
<script setup>
  @prop currentView: string = 'pdx-home';
</script>`, 'test.pdx');

        expect(code).toContain('dynamic');
        expect(code).toContain('ctx.currentView');
    });

    it('compiles <component :is> with props', () => {
        const { code } = compile(`
<template>
  <component :is="view" :userId="id"/>
</template>
<script setup>
  @prop view: string = 'pdx-home';
  @prop id: string = '';
</script>`, 'test.pdx');

        expect(code).toContain('dynamic');
        expect(code).toContain('userId: ctx.id()');
    });
});

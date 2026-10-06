// Tests for new directives: @try/@catch, @stagger, @mode.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';

// ─── @try / @catch ────────────────────────────────────────────────

describe('@try / @catch', () => {
    it('parses @try/@catch into TryNode AST', () => {
        const ast = parseTemplate(`
            @try {
                <pdx-widget />
            } @catch (error) {
                <div>Error: {{ error.message }}</div>
            }
        `);

        const tryNode = ast.find(n => n.type === 'try');
        expect(tryNode).toBeDefined();
        expect(tryNode!.type).toBe('try');
        expect((tryNode as any).errorVar).toBe('error');
        expect((tryNode as any).body.length).toBeGreaterThan(0);
        expect((tryNode as any).catchBody.length).toBeGreaterThan(0);
    });

    it('compiles @try/@catch to errorBoundary()', () => {
        const source = `
<template>
  @try {
    <pdx-risky />
  } @catch (err) {
    <div class="error">{{ err.message }}</div>
  }
</template>
<script setup>
let x = $signal(0);
</script>`;
        const result = compile(source, 'test.pdx');
        expect(result.code).toContain('errorBoundary(');
        expect(result.code).toContain('(err, retry)');
    });

    it('throws on @catch without @try', () => {
        expect(() => parseTemplate(`@catch (e) { <div>oops</div> }`))
            .toThrow(/Unexpected @catch/);
    });

    it('throws on @try without @catch', () => {
        expect(() => parseTemplate(`@try { <div>content</div> }`))
            .toThrow(/Expected @catch/);
    });
});

// ─── @stagger ─────────────────────────────────────────────────────

describe('@stagger', () => {
    it('parses @stagger after @transition', () => {
        const ast = parseTemplate(`
            @for (items as item; track item.id) @transition('fade-in', 'fade-out') @stagger(50) {
                <div>{{ item.name }}</div>
            }
        `);

        const forNode = ast.find(n => n.type === 'for');
        expect(forNode).toBeDefined();
        expect((forNode as any).transition?.stagger).toBe(50);
    });

    it('compiles @stagger to stagger option', () => {
        const source = `
<template>
  @for (items as item; track item.id) @transition('fade-in') @stagger(75) {
    <div>{{ item.name }}</div>
  }
</template>
<script setup>
let items = $signal([]);
</script>`;
        const result = compile(source, 'test.pdx');
        expect(result.code).toContain('stagger: 75');
    });
});

// ─── @mode ────────────────────────────────────────────────────────

describe('@mode', () => {
    it('parses @mode after @transition', () => {
        const ast = parseTemplate(`
            @if (show) @transition('slide-right', 'slide-left') @mode('out-in') {
                <div>content</div>
            }
        `);

        const ifNode = ast.find(n => n.type === 'if');
        expect(ifNode).toBeDefined();
        expect((ifNode as any).transition?.mode).toBe('out-in');
    });

    it('compiles @mode to mode option', () => {
        const source = `
<template>
  @if (visible) @transition('fade-in', 'fade-out') @mode('out-in') {
    <div>hello</div>
  } @else {
    <div>bye</div>
  }
</template>
<script setup>
let visible = $signal(true);
</script>`;
        const result = compile(source, 'test.pdx');
        expect(result.code).toContain("mode: 'out-in'");
    });

    it('parses @stagger + @mode together', () => {
        const ast = parseTemplate(`
            @for (items as item; track item.id) @transition('slide-up') @stagger(30) @mode('out-in') {
                <div>{{ item.name }}</div>
            }
        `);

        const forNode = ast.find(n => n.type === 'for');
        expect((forNode as any).transition?.stagger).toBe(30);
        expect((forNode as any).transition?.mode).toBe('out-in');
    });
});

// ─── @move ────────────────────────────────────────────────────────
//
// `@transition` animates a list item ARRIVING and LEAVING. An item that merely moves to a new index
// is animated by the reconciler's FLIP (`renderer/list.ts:172` records the positions, `:299` plays
// the animation), which asks for `transitions.move`: `@move` is what makes the compiler emit it, so
// the one case FLIP exists for — a reorder — can be expressed in a template.
//
// `@move` stands alone as well as following a `@transition`, unlike `@stagger` and `@mode`: a list
// that should animate its reorder and NOT animate arrivals is an ordinary thing to want, and
// requiring `@transition('fade')` to get it would force an enter animation nobody asked for.

describe('@move', () => {
    it('parses after a @transition', () => {
        const ast = parseTemplate(`
            @for (items as item; track item.id) @transition('fade') @move(200) {
                <div>{{ item.name }}</div>
            }
        `);
        const forNode = ast.find(n => n.type === 'for') as { transition?: { enter?: string; move?: string } };
        expect(forNode.transition?.enter).toBe('fade');
        expect(forNode.transition?.move).toBe('200');
    });

    it('parses on its own, with no @transition before it', () => {
        const ast = parseTemplate(`
            @for (items as item; track item.id) @move(200) {
                <div>{{ item.name }}</div>
            }
        `);
        const forNode = ast.find(n => n.type === 'for') as { transition?: { enter?: string; move?: string } };
        expect(forNode.transition?.move, 'a reorder animation needs no enter animation').toBe('200');
        expect(forNode.transition?.enter, 'it invented an enter animation').toBeUndefined();
    });

    it('takes the runtime default when given no duration', () => {
        const ast = parseTemplate(`
            @for (items as item; track item.id) @move() {
                <div>{{ item.name }}</div>
            }
        `);
        const forNode = ast.find(n => n.type === 'for') as { transition?: { move?: string } };
        // 300 is flipAnimate's own default; naming it here keeps the emitted value explicit rather
        // than relying on the runtime's `|| 300` fallback for an empty string.
        expect(forNode.transition?.move).toBe('300');
    });

    it('reaches the generated each() call', () => {
        const { code } = compile(
            '<template>@for (items as i; track i.id) @move(200) { <li>{{ i.n }}</li> }</template>\n'
            + '<script setup>\nlet items = $signal([]);\n</script>',
            'movable.pdx');
        expect(code, 'the option the reconciler reads never reached it').toMatch(/move: '200'/);
    });

    it('still emits enter and exit beside it', () => {
        const { code } = compile(
            "<template>@for (items as i; track i.id) @transition('fade') @move(200) { <li>{{ i.n }}</li> }</template>\n"
            + '<script setup>\nlet items = $signal([]);\n</script>',
            'movable2.pdx');
        expect(code).toMatch(/enter: 'fade'/);
        expect(code).toMatch(/move: '200'/);
    });

    it('a list without @move emits no move option', () => {
        const { code } = compile(
            "<template>@for (items as i; track i.id) @transition('fade') { <li>{{ i.n }}</li> }</template>\n"
            + '<script setup>\nlet items = $signal([]);\n</script>',
            'plain.pdx');
        expect(code, 'every list started animating its reorder').not.toMatch(/move:/);
    });
});

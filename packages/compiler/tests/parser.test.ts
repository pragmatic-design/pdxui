import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';

// ─── SFC Parser ────────────────────────────────────────────────────

describe('parseSFC', () => {
    it('extracts template block', () => {
        const result = parseSFC('<template><div>Hello</div></template>');
        expect(result.template?.content).toBe('<div>Hello</div>');
    });

    it('extracts script setup block', () => {
        const result = parseSFC('<script setup>const x = 1;</script>');
        expect(result.script?.content).toBe('const x = 1;');
        expect(result.script?.setup).toBe(true);
    });

    it('extracts regular script block', () => {
        const result = parseSFC('<script>export default {}</script>');
        expect(result.script?.setup).toBe(false);
    });

    it('extracts scoped style block', () => {
        const result = parseSFC('<style scoped>.x { color: red }</style>');
        expect(result.style?.content).toBe('.x { color: red }');
        expect(result.style?.scoped).toBe(true);
    });

    it('extracts non-scoped style block', () => {
        const result = parseSFC('<style>.x { color: red }</style>');
        expect(result.style?.scoped).toBe(false);
    });

    it('parses full SFC with all blocks', () => {
        const sfc = `
<template>
  <div>{{ name }}</div>
</template>

<script setup>
  const name = signal('World');
</script>

<style scoped>
  div { color: blue; }
</style>`;
        const result = parseSFC(sfc);
        expect(result.template).not.toBeNull();
        expect(result.script?.setup).toBe(true);
        expect(result.style?.scoped).toBe(true);
    });

    it('returns null for missing blocks', () => {
        const result = parseSFC('<template><div>Only template</div></template>');
        expect(result.template).not.toBeNull();
        expect(result.script).toBeNull();
        expect(result.style).toBeNull();
    });
});

// ─── Template Parser ───────────────────────────────────────────────

describe('parseTemplate', () => {
    it('parses plain HTML', () => {
        const ast = parseTemplate('<div>Hello</div>');
        expect(ast).toMatchObject([{ type: 'html', content: '<div>Hello</div>' }]);
    });

    it('parses interpolation', () => {
        const ast = parseTemplate('<span>{{ name }}</span>');
        expect(ast.length).toBe(3);
        expect(ast[0]).toMatchObject({ type: 'html', content: '<span>' });
        expect(ast[1]).toMatchObject({ type: 'interpolation', expr: 'name', pipes: [] });
        expect(ast[2]).toMatchObject({ type: 'html', content: '</span>' });
    });

    it('parses piped interpolation', () => {
        const ast = parseTemplate('{{ price | currency }}');
        expect(ast[0]).toMatchObject({ type: 'interpolation', expr: 'price', pipes: ['currency'] });
    });

    it('parses multiple pipes', () => {
        const ast = parseTemplate('{{ name | trim | uppercase }}');
        expect(ast[0]).toMatchObject({ type: 'interpolation', expr: 'name', pipes: ['trim', 'uppercase'] });
    });

    it('parses @if block', () => {
        const ast = parseTemplate('@if (open) { <div>content</div> }');
        expect(ast.length).toBe(1);
        const node = ast[0];
        expect(node.type).toBe('if');
        if (node.type === 'if') {
            expect(node.condition).toBe('open');
            expect(node.body.length).toBe(1);
            expect(node.body[0].type).toBe('html');
        }
    });

    it('parses @if/@else blocks', () => {
        const ast = parseTemplate('@if (show) { <span>yes</span> } @else { <span>no</span> }');
        const node = ast[0];
        expect(node.type).toBe('if');
        if (node.type === 'if') {
            expect(node.elseBody).toBeDefined();
            expect(node.elseBody!.length).toBe(1);
        }
    });

    it('parses @if with @transition', () => {
        const ast = parseTemplate("@if (open) @transition('slide-right', 'fade-out') { <div>drawer</div> }");
        const node = ast[0];
        if (node.type === 'if') {
            expect(node.transition).toEqual({ enter: 'slide-right', exit: 'fade-out' });
        }
    });

    it('parses @for block', () => {
        const ast = parseTemplate('@for (items as item; track item.id) { <li>{{ item.name }}</li> }');
        const node = ast[0];
        expect(node.type).toBe('for');
        if (node.type === 'for') {
            expect(node.items).toBe('items');
            expect(node.item).toBe('item');
            expect(node.track).toBe('item.id');
            expect(node.body.length).toBe(3); // <li>, interpolation, </li>
        }
    });

    it('parses @switch block', () => {
        const ast = parseTemplate(`@switch (status) {
            @case ('active') { <span>Active</span> }
            @case ('error') { <span>Error</span> }
            @default { <span>Unknown</span> }
        }`);
        const node = ast[0];
        expect(node.type).toBe('switch');
        if (node.type === 'switch') {
            expect(node.cases.length).toBe(2);
            expect(node.cases[0].value).toBe('active');
            expect(node.cases[1].value).toBe('error');
            expect(node.defaultBody).toBeDefined();
        }
    });

    it('parses @require block', () => {
        const ast = parseTemplate("@require ('admin.panel') { <nav>Admin</nav> }");
        const node = ast[0];
        expect(node.type).toBe('require');
        if (node.type === 'require') {
            expect(node.permission).toBe('admin.panel');
        }
    });

    it('parses @require with @else', () => {
        const ast = parseTemplate("@require ('admin') { <nav>Admin</nav> } @else { <span>Denied</span> }");
        const node = ast[0];
        if (node.type === 'require') {
            expect(node.elseBody).toBeDefined();
        }
    });

    it('parses nested blocks', () => {
        const ast = parseTemplate('@if (show) { @for (items as item; track item.id) { <li>{{ item.name }}</li> } }');
        const ifNode = ast[0];
        if (ifNode.type === 'if') {
            expect(ifNode.body.length).toBeGreaterThan(0);
            const forNode = ifNode.body.find(n => n.type === 'for');
            expect(forNode).toBeDefined();
        }
    });

    it('tracks source locations on AST nodes', () => {
        const ast = parseTemplate('<h1>Title</h1>\n@if (show) {\n  <p>Hello</p>\n}', 1);
        // Line 1: <h1>Title</h1>
        // Line 2: @if (show) {
        // Line 3:   <p>Hello</p>
        // Line 4: }
        // The offset into the template content: the source map is built from it.
        expect(ast[0].loc).toEqual({ line: 1, column: 0, offset: 0 }); // html node
        const ifNode = ast[1];
        expect(ifNode.type).toBe('if');
        expect(ifNode.loc?.line).toBe(2); // @if starts on line 2
        expect(ifNode.loc?.offset).toBe('<h1>Title</h1>\n'.length);
        // The condition's own offset: past `@if (`.
        expect(ifNode.type === 'if' && ifNode.exprOffset).toBe('<h1>Title</h1>\n@if ('.length);
    });

    it('interpolation loc points to {{ position', () => {
        const ast = parseTemplate('Hello {{ name }}', 5);
        const interp = ast.find(n => n.type === 'interpolation');
        expect(interp?.loc?.line).toBe(5); // inherited from lineOffset
    });

    it('parses mixed HTML and directives', () => {
        const ast = parseTemplate('<h1>Title</h1>\n@if (show) { <p>Content</p> }\n<footer>End</footer>');
        expect(ast.length).toBe(3);
        expect(ast[0].type).toBe('html');
        expect(ast[1].type).toBe('if');
        expect(ast[2].type).toBe('html');
    });
});

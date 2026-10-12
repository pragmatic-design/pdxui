// A scoped slot outlet is one parser node, and the validators still read it (#276).
//
// Before its node, the outlet's tag — and its scope bindings — lived in an `html` node, where the
// validators found the names it reads. As a node of its own, a walker that skipped it would report a
// signal read only there as unused, and a name its fallback reads as nothing.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';

const codesOf = (src: string) => compile(src, 'outlet.pdx').warnings.map(w => w.code);

describe('the scoped slot outlet node', () => {
    it('holds its fallback as nodes, interpolation and block included', () => {
        const [div] = parseTemplate('<div><slot name="row" :item="first">none {{ first }} @if (first) { <b>x</b> }</slot></div>');
        expect(div.type).toBe('html');
        const nodes = parseTemplate('<slot name="row" :item="first">none {{ first }} @if (first) { <b>x</b> }</slot>');
        expect(nodes).toHaveLength(1);
        const outlet = nodes[0];
        expect(outlet.type).toBe('scoped-slot');
        if (outlet.type !== 'scoped-slot') return;
        expect(outlet.tag).toBe('<slot name="row" :item="first">');
        expect(outlet.body.map(n => n.type)).toEqual(['html', 'interpolation', 'html', 'if']);
    });

    it('control — a slot with no binding stays markup, and a let: slot is the parent-side node', () => {
        expect(parseTemplate('<slot name="row">none</slot>').map(n => n.type)).toEqual(['html']);
        expect(parseTemplate('<slot name="row" let:item>{{ item }}</slot>').map(n => n.type)).toEqual(['slot-template']);
    });

    it('a signal read only by the outlet\'s binding is not reported unused', () => {
        const codes = codesOf('<template><div><slot name="row" :item="first">none</slot></div></template>\n'
            + "<script setup>\nlet first = $signal('Ada');\n</script>");
        expect(codes).not.toContain('PDX_UNUSED_REACTIVE');
    });

    it('a name the fallback reads and nobody declares is reported', () => {
        const codes = codesOf('<template><div><slot name="row" :item="first">{{ missing }}</slot></div></template>\n'
            + "<script setup>\nlet first = $signal('Ada');\n</script>");
        expect(codes).toContain('PDX_UNDECLARED_REF');
    });
});

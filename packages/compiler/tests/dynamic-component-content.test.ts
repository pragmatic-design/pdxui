// What is written between `<component :is>` and `</component>` (#358).
//
// `dynamic()` takes no children, so that content has nowhere to go. The inline path built it into a
// fragment nothing appended. It now consumes the tag, its content and its closing tag as one unit and
// emits only the `dynamic(…)` call, and content that is not whitespace is PDX_DYNAMIC_CONTENT, once.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { markup } from './static-markup-of';

const SCRIPT = "<script>\nlet view = $signal('pdx-home');\n</script>\n";
const build = (template: string) => compile(`<template>${template}</template>\n${SCRIPT}`, 'host.pdx', [], undefined, { production: true });
const codes = (template: string) => build(template).warnings.map((w) => w.code).filter((c) => c === 'PDX_DYNAMIC_CONTENT');

describe('content inside <component :is>', () => {
    it('is reported once, and neither the content nor a closing tag is emitted', () => {
        const r = build('<component :is="view"><p>inside</p></component>');
        expect(r.code).toContain('dynamic(');
        expect(r.code, 'the content was emitted').not.toContain('inside');
        expect(r.code, 'a stray </component> was emitted').not.toContain('</component>');
        expect(codes('<component :is="view"><p>inside</p></component>')).toEqual(['PDX_DYNAMIC_CONTENT']);
        const w = r.warnings.find((x) => x.code === 'PDX_DYNAMIC_CONTENT')!;
        expect(w.severity).toBe('warn');
        expect(w.message).toContain('<component :is="view">');
        expect(w.line, 'the warning has no place in the file').toBeGreaterThan(0);
    });

    it('in a scoped slot body, the same', () => {
        const r = build('<pdx-select :options="[]"><slot name="item" let:label>'
            + '<component :is="view"><p>inside</p></component></slot></pdx-select>');
        expect(r.code).toContain('dynamic(');
        expect(r.code, 'the slot body emitted the content').not.toContain('inside');
        expect(r.code, 'the slot body emitted a stray </component>').not.toContain('</component>');
    });

    it('content spanning an interpolation, the same; what follows the closing tag is kept', () => {
        const { code } = build('<component :is="view"><p>in {{ view }} side</p></component><p>after</p>');
        expect(code).toContain('dynamic(');
        expect(code, 'the content was emitted').not.toContain('side');
        expect(code, 'a stray </component> was emitted').not.toContain('</component>');
        expect(markup(code).join(''), 'what follows the closing tag was dropped too').toContain('<p>after</p>');
    });

    it('control — empty, whitespace-only or self-closed is not reported, and leaves nothing behind', () => {
        for (const t of ['<component :is="view"></component>', '<component :is="view">\n  \n</component>', '<component :is="view" />']) {
            expect(codes(t), t).toEqual([]);
            expect(build(t).code, t).not.toContain('</component>');
        }
    });

    it('control — two of them report the one with content', () => {
        expect(codes('<component :is="view"></component><component :is="view">text</component>'))
            .toEqual(['PDX_DYNAMIC_CONTENT']);
    });
});

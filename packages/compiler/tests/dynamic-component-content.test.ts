// What is written between `<component :is>` and `</component>` (#358).
//
// `dynamic()` takes no children, so that content has nowhere to go. The two render paths disagreed
// about it: the template path — which still builds a scoped slot's body (#364) — copied the content
// and a stray `</component>` after the outlet, and the inline path built it into a fragment nothing
// appended. Both now consume the tag, its content and its closing tag as one unit and emit only the
// `dynamic(…)` call, and content that is not whitespace is PDX_DYNAMIC_CONTENT, once.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = "<script setup>\nlet view = $signal('pdx-home');\n</script>\n";
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

    it('in a scoped slot body, built by the template path, the same', () => {
        const r = build('<pdx-select :options="[]"><slot name="item" let:label>'
            + '<component :is="view"><p>inside</p></component></slot></pdx-select>');
        expect(r.code).toContain('dynamic(');
        expect(r.code, 'the template path emitted the content').not.toContain('inside');
        expect(r.code, 'the template path emitted a stray </component>').not.toContain('</component>');
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

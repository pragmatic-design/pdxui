// A template written on the `<template>` line: its findings' columns are the file's.
//
// The parser is given the template's first COLUMN in the file as well as its first LINE: without it,
// on the line the `<template>` tag opens every column counts from the content, ten characters early,
// `PDX_RAW_INTERPOLATION` points at `iv class`, and its fix, which reads the text at the position,
// does not apply. A multi-line template does not show it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = '\n<script setup>\nlet tone = $signal(\'info\');\n</script>\n';

function rawInterpolation(source: string) {
    return compile(source, 'one-line.pdx').warnings.find(w => w.code === 'PDX_RAW_INTERPOLATION');
}

describe('a finding on the <template> line', () => {
    it('points at its column in the file, and carries its fix', () => {
        const source = '<template><div class="${tone}">x</div></template>' + SCRIPT;
        const w = rawInterpolation(source);
        expect(w, 'no PDX_RAW_INTERPOLATION').toBeDefined();
        expect(source.split('\n')[0].slice(w!.column! - 1, w!.column! + 1)).toBe('${');
        expect([w!.line, w!.column]).toEqual([1, 23]);
        expect(w!.fix, 'no fix was proposed').toBeDefined();
        expect(w!.fix!.edits.map(e => e.newText).join('')).toContain(':class="tone"');
    });

    it('…with attributes on the <template> tag too', () => {
        const source = '<template shadow><p title="${tone}">x</p></template>' + SCRIPT;
        const w = rawInterpolation(source)!;
        expect(source.split('\n')[0].slice(w.column! - 1, w.column! + 1)).toBe('${');
        expect(w.fix).toBeDefined();
    });

    it('control — a template on its own lines keeps the columns it had', () => {
        const source = '<template>\n  <p title="${tone}">x</p>\n</template>' + SCRIPT;
        const w = rawInterpolation(source)!;
        expect([w.line, w.column]).toEqual([2, 13]);
        expect(w.fix).toBeDefined();
    });

    it('control — a finding on the second line of a one-line-opened template is not shifted', () => {
        const source = '<template><div>\n  <p title="${tone}">x</p></div>\n</template>' + SCRIPT;
        const w = rawInterpolation(source)!;
        expect([w.line, w.column]).toEqual([2, 13]);
    });
});

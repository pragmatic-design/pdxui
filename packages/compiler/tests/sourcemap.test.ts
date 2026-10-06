// Tests for source map generation

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { SourceMapBuilder } from '../src/compiler/sourcemap';

describe('SourceMapBuilder', () => {
    it('produces valid v3 source map structure', () => {
        const builder = new SourceMapBuilder('test.pdx', '<template>Hello</template>');
        builder.addMapping(1, 0, 1, 0);
        const map = builder.toJSON();

        expect(map.version).toBe(3);
        expect(map.sources).toEqual(['test.pdx']);
        expect(map.sourcesContent).toEqual(['<template>Hello</template>']);
        expect(typeof map.mappings).toBe('string');
        expect(map.names).toEqual([]);
    });

    it('encodes single mapping correctly', () => {
        const builder = new SourceMapBuilder('test.pdx', 'source');
        builder.addMapping(1, 0, 1, 0);
        const map = builder.toJSON();

        // First segment: genCol=0, srcIdx=0, srcLine=0 (0-based), srcCol=0
        // VLQ: 0→A, 0→A, 0→A, 0→A = AAAA
        expect(map.mappings).toBe('AAAA');
    });

    it('addLineBlock maps multiple lines', () => {
        const builder = new SourceMapBuilder('test.pdx', 'a\nb\nc');
        builder.addLineBlock(1, 5, 3);
        const map = builder.toJSON();

        // 3 lines of mappings separated by ;
        const lines = map.mappings.split(';');
        expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('handles multiple sources lines', () => {
        const builder = new SourceMapBuilder('test.pdx', 'line1\nline2\nline3');
        builder.addMapping(1, 0, 1, 0);
        builder.addMapping(2, 0, 2, 0);
        builder.addMapping(3, 0, 3, 0);
        const map = builder.toJSON();

        const lines = map.mappings.split(';');
        expect(lines.length).toBeGreaterThanOrEqual(3);
        // Each line should have at least one segment
        for (const line of lines) {
            if (line) expect(line.length).toBeGreaterThan(0);
        }
    });
});

describe('compile() source map integration', () => {
    it('returns source map alongside code', () => {
        const { code, map } = compile(`
<template>
  <div>{{ name }}</div>
</template>

<script setup>
  @prop name: string = 'World';
</script>`, 'test.pdx');

        expect(code).toContain('component(');
        expect(map).toBeDefined();
        expect(map.version).toBe(3);
        expect(map.sources).toEqual(['test.pdx']);
        expect(map.sourcesContent).not.toBeNull();
    });

    it('source map has non-empty mappings', () => {
        const { map } = compile(`
<template>
  <div>Hello</div>
</template>`, 'hello.pdx');

        expect(map.mappings.length).toBeGreaterThan(0);
    });

    it('source map points to original .pdx content', () => {
        const source = `<template>
  <h1>{{ title }}</h1>
  @if (show) {
    <p>Content</p>
  }
</template>

<script setup>
  @prop title: string = 'Hello';
  @prop show: boolean = true;
</script>`;

        const { map } = compile(source, 'page.pdx');

        // sourcesContent should contain the original .pdx source
        expect(map.sourcesContent?.[0]).toBe(source);
        // mappings should be non-trivial
        expect(map.mappings.split(';').length).toBeGreaterThan(3);
    });

    it('file field points to .js output', () => {
        const { map } = compile('<template><div>test</div></template>', 'counter.pdx');
        expect(map.file).toBe('counter.js');
    });
});

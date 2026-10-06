// Type-checking LITERAL bindings against the manifest's prop types.
// `:count="'x'"` on a number prop → an error; `:count="5"` is fine; identifiers
// (loosely-typed signals) are NOT checked → no false positives.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import type { ResolveType } from '../src/utils/template-projection';

const ROOT = join(__dirname, '..', '..', '..');
const URI = 'file:///' + join(ROOT, 'x.pdx').split('\\').join('/');
const svc = new PdxTsService(ROOT);

// Manifest finto: <pdx-counter count: number, label: string>
const resolveType: ResolveType = (tag, attr) => {
    if (tag !== 'pdx-counter') return null;
    if (attr === 'count') return 'number';
    if (attr === 'label') return 'string';
    return null;
};

function diagsFor(src: string) {
    const { descriptor, ast } = analyzeDocument(src, 'x.pdx');
    const tmpl = descriptor!.template!.content;
    const vf = buildVirtualFile(
        descriptor!.script!.content, descriptor!.script!.start,
        ast, tmpl, src.indexOf(tmpl), resolveType,
    );
    return getTsDiagnostics(svc, URI, vf, src);
}

const wrap = (tmplBody: string) =>
    ['<template>', tmplBody, '</template>',
     '<script setup>', 'let n = $signal(0);', '</script>'].join('\n');

describe('type-checking literal bindings against the props of a component', () => {
    it('reports a string literal on a number prop', () => {
        const d = diagsFor(wrap('  <pdx-counter :count="\'x\'" />'));
        expect(d.length).toBeGreaterThan(0);
    });

    it('does NOT report a number literal on a number prop', () => {
        const d = diagsFor(wrap('  <pdx-counter :count="5" />'));
        expect(d).toHaveLength(0);
    });

    it('NON segnala un binding a signal (identificatore, loosely-typed)', () => {
        const d = diagsFor(wrap('  <pdx-counter :count="n" />'));
        expect(d).toHaveLength(0);
    });

    it('does NOT report a string literal on a string prop', () => {
        const d = diagsFor(wrap('  <pdx-counter :label="\'ciao\'" />'));
        expect(d).toHaveLength(0);
    });
});

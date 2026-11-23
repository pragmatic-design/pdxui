// An `@part(external)` is written where the component builds it (#1338): by its script, or by a module
// the script imports by a relative path, at any depth. pdx-data-grid builds its rows, cells and headers
// in sub-modules (grid-body.ts, grid-cell.ts, grid-header.ts): read in the script alone, each of its
// parts was PDX_PART_EXTERNAL_UNWRITTEN, an error, for parts that are written.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/plugin';

let root: string;

function file(rel: string, content: string): string {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full.replace(/\\/g, '/');
}

/** The reader the plugin gives the compiler: the file's text, or null when there is none. */
const read = (f: string) => { try { return readFileSync(f, 'utf-8'); } catch { return null; } };

const component = (imports: string, parts: string) =>
    `<template></template>\n<script>\n${imports}\n@part(external) ${parts};\n</script>\n`;
const unwritten = (warnings: { code: string; message: string }[]) =>
    warnings.filter((w) => w.code === 'PDX_PART_EXTERNAL_UNWRITTEN').map((w) => w.message.match(/'([\w-]+)'/)?.[1]);

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-external-'));
    file('grid/grid-body.ts', "import { cell } from './grid-cell';\nexport function row(el) { el.dataset.part = 'row'; cell(el); }");
    file('grid/grid-cell.ts', "export function cell(el) { el.setAttribute('data-part', 'cell'); }");
    file('grid/grid-header.ts', "// el.dataset.part = 'header' — a comment writes nothing\nexport function header() {}");
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('an @part(external) written by a module the script imports', () => {
    it('is no diagnostic when the imported module writes it, or a module that one imports', () => {
        const at = file('grid/pdx-grid.pdx', component("import { row } from './grid-body';\nimport { header } from './grid-header';", 'row, cell'));
        const r = compile(readFileSync(at, 'utf-8'), at, [], undefined, { readComponent: read });
        expect(unwritten(r.warnings)).toEqual([]);
    });

    it('control — a part no module writes, a comment aside, is still PDX_PART_EXTERNAL_UNWRITTEN', () => {
        const at = file('grid/pdx-grid.pdx', component("import { row } from './grid-body';\nimport { header } from './grid-header';", 'row, cell, header'));
        const r = compile(readFileSync(at, 'utf-8'), at, [], undefined, { readComponent: read });
        expect(unwritten(r.warnings)).toEqual(['header']);
    });

    it('with no reader, a script that imports a relative module is not judged on its external parts', () => {
        const at = file('grid/pdx-grid.pdx', component("import { row } from './grid-body';", 'row, header'));
        expect(unwritten(compile(readFileSync(at, 'utf-8'), at).warnings)).toEqual([]);
    });

    it('control — with no reader and no relative module import, the script alone is checked, as before', () => {
        const at = file('grid/pdx-grid.pdx', component("import { onDestroy } from '@pdxui/core';", 'row'));
        expect(unwritten(compile(readFileSync(at, 'utf-8'), at).warnings)).toEqual(['row']);
    });
});

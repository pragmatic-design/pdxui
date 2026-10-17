// A .pdx that imports a rune module — a `.pdx.ts` written with `@store` and `$signal` — type-checks
// against what the compiler makes of it (#467).
//
// The language server used to read the `.pdx.ts` as it is written: `@store name;` is no TypeScript
// export, so the file was «not a module» and every import of its `useName()` an error — 43 of the 62
// type errors `pdx check --types` reported on showcase-new. It now reads the module projected the way a
// .pdx script is (`projectScript`), with the hook the compiler emits: `useName()` returns the module's
// names, each `$signal` / `$derived` as a signal (`logs()`), the rest as declared.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { projectRuneModule } from '../src/utils/rune-module';

const STORE = [
    '// The page\'s log.',
    '@store pageLog;',
    '',
    'let logs = $signal([] as string[]);',
    'const count = $derived(logs.length);',
    'function add(line: string) { logs = [...logs, line]; }',
    '',
].join('\n');

let root: string;
let svc: PdxTsService;

beforeAll(() => {
    root = join(tmpdir(), `pdx-rune-module-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'log.pdx.ts'), STORE);
    svc = new PdxTsService(root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** The TS diagnostics of src/page.pdx made of `script`, with no template. */
function diagnose(script: string): string[] {
    const source = `<template><p>x</p></template>\n<script setup>\n${script}\n</script>\n`;
    const uri = pathToFileURL(join(root, 'src', 'page.pdx')).href;
    const vf = buildVirtualFile(script, source.indexOf(script), [], null, -1);
    return getTsDiagnostics(svc, uri, vf, source).map((d) => `${d.code} ${d.message.split('\n')[0]}`);
}

describe('a .pdx importing a @store module', () => {
    it("reads the hook the compiler emits: a signal is called, a function is called", () => {
        const script = [
            "import { usePageLog } from './log.pdx';",
            'const log = usePageLog();',
            'function f() { log.add("x"); const n: number = log.count(); const all: string[] = log.logs(); return [n, all]; }',
            'f;',
        ].join('\n');
        expect(diagnose(script)).toEqual([]);
    });

    it('a member the module does not declare is an error', () => {
        const found = diagnose("import { usePageLog } from './log.pdx';\nconst log = usePageLog();\nlog.ad('x');\n");
        expect(found.map((f) => f.split(' ')[0])).toEqual(['ts(2339)']);
    });
});

describe('projectRuneModule', () => {
    it('keeps every offset of the source, and appends the hook after it', () => {
        const out = projectRuneModule(STORE, 'log.pdx.ts');
        // The rune line is blanked, not removed: a definition found in the module keeps its line.
        expect(out.split('\n').slice(0, 7).map((l) => l.length)).toEqual(STORE.split('\n').map((l) => l.length));
        expect(out).toMatch(/export function usePageLog\(\)/);
    });

    it('control — a .pdx.ts with no @store is projected without a hook', () => {
        const plain = 'export function twice(v: number) { return v * 2; }\n';
        expect(projectRuneModule(plain, 'util.pdx.ts')).not.toMatch(/export function use/);
        expect(projectRuneModule(plain, 'util.pdx.ts').startsWith(plain)).toBe(true);
    });
});

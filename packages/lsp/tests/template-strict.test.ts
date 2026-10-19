// The template is checked under `strict`, the script is not (#468). A template expression is code the
// author wrote and nothing else checks: an implicit `any` or a read of a possibly-null value there is
// a bug. The script is checked as before, so `$signal(null)` and `$signal([])` stay what they mean.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { typecheckPdx } from '../src/typecheck';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'strict-probe.pdx')).href;
const svc = new PdxTsService(ROOT);

function sourceOf(script: string, template: string): string {
    return `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
}

function diagnose(script: string, template: string): { code: string; message: string; at: string }[] {
    const source = sourceOf(script, template);
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length);
    const lines = source.split('\n');
    return getTsDiagnostics(svc, URI, vf, source).map((d) => ({
        code: String(d.code),
        message: d.message.split('\n')[0],
        at: lines[d.range.start.line].slice(d.range.start.character, d.range.end.character),
    }));
}

const USER = 'interface User { name: string }\nlet user = $signal<User | null>(null);';

describe('the template under strict', () => {
    it("an arrow handler's parameter is the event: a misspelt member of it is reported", () => {
        const d = diagnose('function save(v: string) {}', '<input @input="e => save(e.taget)">');
        expect(d.map((x) => [x.code, x.at]), JSON.stringify(d)).toEqual([['ts(2551)', 'taget']]);
    });

    it('an arrow handler whose body is a block, and one that is several statements, still type', () => {
        expect(diagnose('let v = $signal(\'\');', '<input @input="e => { v = e.target.value; }" @change="v = \'\'; v += \'x\'">')).toEqual([]);
    });

    it('an untyped parameter nothing gives a type is an implicit any', () => {
        const d = diagnose('let v = $signal(1);', '<p :data-fn="(y) => y + v"></p>');
        expect(d.find((x) => x.code === 'ts(7006)'), JSON.stringify(d)).toMatchObject({ at: 'y' });
    });

    it('a read of a value that may be null is reported, on the read', () => {
        const d = diagnose(USER, '<p>{{ user.name }}</p>');
        expect(d.find((x) => x.code === 'ts(18047)'), JSON.stringify(d)).toMatchObject({ at: 'user' });
    });

    it('a read the template guards is not', () => {
        expect(diagnose(USER, '<p>{{ user?.name }}</p>')).toEqual([]);
    });
});

describe('the script stays lenient', () => {
    it('$signal(null), $signal([]) and $signal({}) keep the types the script gives them, in the template too', () => {
        const script = 'let picked = $signal(null);\nlet items = $signal([]);\nlet counts = $signal({});\n'
            + 'function add(x) { items = [...items, x]; picked = 3; counts = { a: 1 }; }';
        expect(diagnose(script, '<p>{{ items.length }} {{ picked.toFixed(1) }} {{ counts[\'a\' + 1] }}</p><button @click="add(1)">+</button>')).toEqual([]);
    });

    it('a name declared with an empty value keeps the type the script gives it', () => {
        expect(diagnose('const rows = [];\nconst byId = {};\nlet picked = null;', '<p>{{ rows.length }} {{ byId[\'a\' + 1] }} {{ picked }}</p>')).toEqual([]);
    });

    it('a prop declared with no type is any, in the template too', () => {
        expect(diagnose('@prop label;', '<p>{{ label.toUpperCase() }}</p>')).toEqual([]);
    });

    it("an error in the script is reported once, as the lenient program sees it", () => {
        const d = diagnose('const n: number = "x";', '<p>{{ n }}</p>');
        expect(d.map((x) => x.code)).toEqual(['ts(2322)']);
    });
});

describe('pdx check --types', () => {
    it('reports what the editor reports', () => {
        const path = join(ROOT, 'strict-probe.pdx');
        const found = typecheckPdx(ROOT, [{ path, content: sourceOf(USER, '<p>{{ user.name }}</p>') }], { routeTypes: false }).get(path) ?? [];
        expect(found.map((e) => e.tsCode)).toEqual([18047]);
    });
});

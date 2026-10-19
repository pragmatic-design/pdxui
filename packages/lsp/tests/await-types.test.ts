// `@await (x as name)` in the editor (#145): the body sees the result, typed — `T` for a
// `Promise<T>`, a source's `data()` without `undefined`. A read the type does not have is an error.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'await-probe.pdx')).href;
const svc = new PdxTsService(ROOT);

function diagnose(script: string, template: string): { message: string; at: string }[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length);
    const lines = source.split('\n');
    return getTsDiagnostics(svc, URI, vf, source).map((d) => ({
        message: d.message.split('\n')[0],
        at: lines[d.range.start.line].slice(d.range.start.character, d.range.end.character),
    }));
}

const SOURCE = 'interface User { id: number; name: string }\n'
    + 'const users = null as unknown as { data(): User[] | undefined; state(): string };\n'
    + 'const one = null as unknown as Promise<User>;';

describe('@await (x as name) in the editor', () => {
    it('a source binds its data, without undefined', () => {
        expect(diagnose(SOURCE, '@await (users as list) { <p>{{ list.length }} {{ list[0].name }}</p> }')).toEqual([]);
    });

    it('a promise binds its value', () => {
        expect(diagnose(SOURCE, '@await (one as user) { <p>{{ user.name.toUpperCase() }}</p> }')).toEqual([]);
    });

    it('a member the result does not have is an error', () => {
        const d = diagnose(SOURCE, '@await (one as user) { <p>{{ user.email }}</p> }');
        expect(d.some((x) => /email/.test(x.message)), JSON.stringify(d)).toBe(true);
    });
});

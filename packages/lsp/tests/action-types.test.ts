// `@action save(dto: Dto) { … }` is typed in the editor (#501): the projection declares `save` as
// core's `Mutation`, its input the parameter's type and its data what the body returns, so a wrong
// `execute()` argument is a TypeScript error. The body stays where it is written and is checked there.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
// Inside a package that depends on @pdxui/core, which the projection's type comes from.
const URI = pathToFileURL(join(ROOT, 'packages', 'showcase', 'src', 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx, each with the text it points at. */
function diagnose(script: string, template = '<p>x</p>'): { code: string; at: string }[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length);
    return getTsDiagnostics(svc, URI, vf, source).map((d) => {
        const lines = source.split('\n');
        const line = lines[d.range.start.line];
        return { code: String(d.code), at: line.slice(d.range.start.character, d.range.end.character) };
    });
}

const DTO = 'interface Dto { name: string }';

beforeAll(() => { diagnose('let x = $signal(1);'); }, 60_000);

describe('@action in the editor', () => {
    it("execute() takes the parameter's type: a number for a Dto is an error", () => {
        const found = diagnose(`${DTO}\n@action save(dto: Dto) { return dto.name.length; }\nfunction go() { save.execute(1); }`);
        expect(found.map((f) => f.at)).toEqual(['1']);
    });

    it("control — a Dto reads, and data() is what the body returns", () => {
        expect(diagnose(`${DTO}\n@action save(dto: Dto) { return dto.name.length; }\nfunction go() { save.execute({ name: 'a' }); const n: number | undefined = save.data(); return n; }`)).toEqual([]);
    });

    it('the body is checked where it is written', () => {
        const found = diagnose(`${DTO}\n@action save(dto: Dto) {\n  return dto.nope;\n}`);
        expect(found.map((f) => f.at)).toEqual(['nope']);
    });

    it('with when and with, and a { signal }, the name is still the action', () => {
        expect(diagnose(`${DTO}\nlet ok = $signal(true);\n@action save(dto: Dto, { signal }) when ok with { concurrency: 'drop' } { signal.aborted; return 1; }\nfunction go() { save.cancel(); save.enabled(); save.execute({ name: 'a' }); }`)).toEqual([]);
    });
});

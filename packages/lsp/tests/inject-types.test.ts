// `@inject user from CurrentUser;` is typed by the token in the editor (#496): the projection declares
// `user` as `ContextValue<typeof CurrentUser>`, so `user.nope` is a TypeScript error and `user.name`
// is not. With a fallback the type is the same.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
// Inside a package that depends on @pdxui/core: the type is `ContextValue` from core, resolved from
// the file's place, and the repository root has no @pdxui/core to resolve.
const URI = pathToFileURL(join(ROOT, 'packages', 'showcase', 'src', 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx, each with the text it points at. */
function diagnose(script: string, template = '<p>x</p>'): { code: string; at: string }[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length);
    const lines = source.split('\n');
    return getTsDiagnostics(svc, URI, vf, source).map((d) => {
        const line = lines[d.range.start.line];
        return { code: String(d.code), at: line.slice(d.range.start.character, d.range.end.character) };
    });
}

// The token, as the module the script imports would declare it.
const TOKEN = "import { context } from '@pdxui/core';\nconst CurrentUser = context<{ name: string }>('current-user');";

beforeAll(() => { diagnose('let x = $signal(1);'); }, 60_000);

describe('@inject name from Token, in the editor', () => {
    it("types the name as the token's value: a member it does not have is an error", () => {
        const found = diagnose(`${TOKEN}\n@inject user from CurrentUser;\nfunction label() { return user.nope; }`);
        expect(found.map((f) => f.at)).toEqual(['nope']);
    });

    it('control — a member it has reads', () => {
        expect(diagnose(`${TOKEN}\n@inject user from CurrentUser;\nfunction label() { return user.name; }`)).toEqual([]);
    });

    it('with a fallback, the type is the same', () => {
        const found = diagnose(`${TOKEN}\n@inject user from CurrentUser = { name: 'Guest' };\nfunction label() { return user.nope; }`);
        expect(found.map((f) => f.at)).toEqual(['nope']);
    });
});

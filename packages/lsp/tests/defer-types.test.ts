// `@defer` in the editor (#281): `when ( … )` is an expression of the script's names, checked in
// either phase, and `@error (err, retry)` gives its branch the error, `unknown`, and a retry function.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'defer-probe.pdx')).href;
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

const SCRIPT = "const tab: 'sales' | 'overview' = 'sales';\nconst ready = true;";

describe('@defer in the editor', () => {
    it('when ( … ) reads the script, in both phases', () => {
        expect(diagnose(SCRIPT, "@defer (when (tab === 'sales'); prefetch when (ready)) { <p>x</p> }")).toEqual([]);
    });

    it('a name when ( … ) reads that the script does not declare is an error', () => {
        const d = diagnose(SCRIPT, '@defer (when (opened)) { <p>x</p> }');
        expect(d.some((x) => /opened/.test(x.message)), JSON.stringify(d)).toBe(true);
    });

    it('@error (err, retry) names the error and a function', () => {
        expect(diagnose(SCRIPT, '@defer (viewport) { <p>x</p> } @error (e, again) { <button @click="again()">{{ String(e) }}</button> }')).toEqual([]);
    });

    it('the error is unknown: a member read on it is an error', () => {
        const d = diagnose(SCRIPT, '@defer (viewport) { <p>x</p> } @error (e) { <p>{{ e.message }}</p> }');
        expect(d.some((x) => /unknown/.test(x.message)), JSON.stringify(d)).toBe(true);
    });
});

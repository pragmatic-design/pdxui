// `@try { maxRetries: n, … } { … }` in the editor (#1365): each option's value is checked against its
// key, on the text the author wrote — a number for `maxRetries`, a callback of the error and its count
// for `onError`.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'try-options-probe.pdx')).href;
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

const SCRIPT = 'let tries = $signal(3);\nlet label = $signal(\'x\');\n'
    + 'function failed(error: Error, count: number) { void error; void count; }';
const CATCH = '@catch (err, retry) { <button @click="retry()">Retry</button> }';

// The language service's cold start, paid here with a timeout of its own (see await-types.test.ts).
beforeAll(() => { diagnose('let x = $signal(1);', '<p>{{ x }}</p>'); }, 60_000);

describe('@try options in the editor', () => {
    it('values of the types errorBoundary takes are not errors', () => {
        expect(diagnose(SCRIPT, `@try { maxRetries: tries, autoRetry: true, retryDelay: 500, onError: failed } { <p>a</p> } ${CATCH}`)).toEqual([]);
    });

    it('a value of the wrong type is an error on the key it is given to, as TypeScript reports it', () => {
        const d = diagnose(SCRIPT, `@try { maxRetries: label } { <p>a</p> } ${CATCH}`);
        expect(d.some((x) => x.at === 'maxRetries' && /string/.test(x.message)), JSON.stringify(d)).toBe(true);
    });
});

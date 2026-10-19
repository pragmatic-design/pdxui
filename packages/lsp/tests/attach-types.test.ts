// `attach:name="value"` in the editor (#143): the name is checked as an attachment —
// `(el: Element, value: () => V) => void | (() => void)` — and the value as its V; core's built-ins
// need no import, as the compiler imports them.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'attach-probe.pdx')).href;
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

const TIP = 'function tip(el: Element, value: () => string) { el.setAttribute("title", value()); }';

describe('attach: in the editor', () => {
    it('an attachment and a value of its type are clean', () => {
        expect(diagnose(TIP, '<input attach:tip="\'Search\'" />')).toEqual([]);
    });

    it('a value of another type is an error on the value', () => {
        const d = diagnose(TIP, '<input attach:tip="42" />');
        expect(d.some((x) => /number/.test(x.message) && /string/.test(x.message)), JSON.stringify(d)).toBe(true);
    });

    it('a name that is not a function of an element is an error on the name', () => {
        const d = diagnose('const tip = 3;', '<input attach:tip />');
        expect(d.map((x) => x.at)).toContain('tip');
    });

    it('core\'s built-ins need no import', () => {
        expect(diagnose('function close() {}', '<input attach:autofocus /><div attach:clickOutside="close"></div>')).toEqual([]);
    });
});

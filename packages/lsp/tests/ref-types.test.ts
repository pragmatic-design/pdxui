// A `:ref` on a component is typed from what the component exposes (#140): `dlg.show()` on a
// pdx-dialog ref is checked, and `dlg.nope()` is an editor error.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { refTargets, typeRefs } from '../src/utils/ref-types';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'refs.pdx')).href;
const svc = new PdxTsService(ROOT);

// pdx-dialog's methods, as the manifest lists them.
const exposed = (tag: string) => (tag === 'pdx-dialog' ? ['show', 'close', 'toggle'] : null);

function diagnose(script: string, template: string): string[] {
    const source = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script setup>\n') + '<script setup>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length, undefined, exposed);
    return getTsDiagnostics(svc, URI, vf, source).map(d => `${d.code} ${d.message.split('\n')[0]}`);
}

const TEMPLATE = '<pdx-dialog :ref="dlg" title="T"><p>x</p></pdx-dialog>';

describe('a ref on a component is typed from what it exposes', () => {
    it('calling an exposed method is fine', () => {
        expect(diagnose('let dlg = $signal(null);\nfunction open() { dlg.show(); }\nopen;', TEMPLATE)).toEqual([]);
    });

    it('calling a method the component does not expose is an error', () => {
        const found = diagnose('let dlg = $signal(null);\nfunction open() { dlg.nope(); }\nopen;', TEMPLATE);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/ts\(2339\) Property 'nope' does not exist/);
    });

    it('the element\'s own API stays: focus() on the ref', () => {
        expect(diagnose('let dlg = $signal(null);\nfunction f() { dlg.focus(); }\nf;', TEMPLATE)).toEqual([]);
    });

    it('the control: a ref on a plain element is not touched', () => {
        const refs = refTargets(parseTemplate('<div :ref="box"></div>', 1), exposed);
        expect(refs.size).toBe(0);
    });

    it('the script keeps its length: offsets stay 1:1', () => {
        const projected = 'let dlg = $signal(null);';
        const { script, declarations } = typeRefs(projected, new Map([['dlg', ['show']]]));
        expect(script).toHaveLength(projected.length);
        expect(script).toBe('let dlg = $signal(_r00);');
        expect(declarations).toContain('declare var _r00: HTMLElement & { show: any; };');
    });
});

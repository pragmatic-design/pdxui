// The editor sees the diagnostics the compiler finds while generating code.
//
// A bound name is checked against the component's props while the template is rewritten, not by
// validate(): `<pdx-app-layout :withBordr="on">` prints PDX_UNKNOWN_PROP in `vite dev`, and an editor
// that ran validate() only would draw no squiggle. analyzeDocument compiles the document too, with
// the components' props.

import { describe, it, expect } from 'vitest';
import { ComponentResolver } from '@pdxui/compiler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { toDiagnostics } from '../src/capabilities/diagnostics';
import { getAnalysis, setAnalyzeOptions } from '../src/document-manager';

const resolver = new ComponentResolver();
resolver.registerUiManifest();
const propsOf = (tag: string) => resolver.propsOf(tag);

const source = [
    '<template>',                                            // line 0 (LSP positions are 0-based)
    '  <pdx-app-layout :withBordr="on"></pdx-app-layout>',   // line 1, `:withBordr` at character 18
    '</template>',
    '<script setup>',
    'let on = $signal(false);',
    '</script>',
].join('\n');

describe('analyzeDocument with the components\' props', () => {
    it('returns PDX_UNKNOWN_PROP for a bound name the component does not declare', () => {
        const { warnings } = analyzeDocument(source, 'shell.pdx', { propsOf });
        const unknown = warnings.find((w) => w.code === 'PDX_UNKNOWN_PROP');
        expect(unknown, `no PDX_UNKNOWN_PROP in ${JSON.stringify(warnings.map((w) => w.code))}`).toBeTruthy();
        expect(`${unknown!.message} ${unknown!.hint ?? ''}`).toContain('withBorder');
    });

    it('the diagnostic is on the attribute, not on the script', () => {
        const { warnings, descriptor } = analyzeDocument(source, 'shell.pdx', { propsOf });
        const diag = toDiagnostics(warnings, source, descriptor?.script ?? null).find((d) => d.code === 'PDX_UNKNOWN_PROP');
        expect(diag?.range.start).toEqual({ line: 1, character: 18 });
    });

    it('a warning validate() already gave is not listed twice', () => {
        const counter = '<template><span>{{ count }}</span></template>\n<script setup>\nlet count = 5;\n</script>';
        const keys = analyzeDocument(counter, 'counter.pdx', { propsOf }).warnings.map((w) => `${w.code}: ${w.message}`);
        expect(keys).toContain(keys.find((k) => k.startsWith('PDX_NON_REACTIVE')));
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('the document manager analyzes with the props the server sets, and drops analyses made without them', () => {
        const doc = TextDocument.create('file:///ws/shell.pdx', 'pdx', 1, source);
        setAnalyzeOptions({});
        expect(getAnalysis(doc).warnings.map((w) => w.code)).not.toContain('PDX_UNKNOWN_PROP');
        setAnalyzeOptions({ propsOf });
        expect(getAnalysis(doc).warnings.map((w) => w.code), 'a cached analysis survived the new options').toContain('PDX_UNKNOWN_PROP');
        setAnalyzeOptions({});
    });

    it('a document the compiler cannot compile still gets its validate() warnings, and no crash', () => {
        const broken = '<template><span>{{ count }}</span></template>\n<script setup>\nlet count = 5;\n</script>\n<style src="./missing.css"></style>';
        const { warnings } = analyzeDocument(broken, 'broken.pdx', { propsOf });
        expect(warnings.map((w) => w.code)).toContain('PDX_NON_REACTIVE');
    });
});

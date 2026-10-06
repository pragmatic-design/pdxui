// LSP L2 — document symbols (outline) from the analysis.

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { getDocumentSymbols } from '../src/capabilities/symbols';
import { SymbolKind } from 'vscode-languageserver';

const source = [
    '<template><div>{{ count }}</div></template>',
    '<script setup>',                       // line 1
    "@prop title: string = 'x';",           // line 2
    '@event changed: number;',              // line 3
    'let count = $signal(0);',              // line 4
    'const doubled = $derived(count * 2);', // line 5
    'function inc() { count++; }',          // line 6
    '</script>',
].join('\n');

describe('document symbols', () => {
    const { analysis, descriptor } = analyzeDocument(source, 'x.pdx');
    const symbols = getDocumentSymbols(analysis!, source, descriptor!.script!);
    const byName = Object.fromEntries(symbols.map(s => [s.name, s]));

    it('lists props, events, signals, deriveds and functions', () => {
        expect(byName.title?.kind).toBe(SymbolKind.Property);
        expect(byName.changed?.kind).toBe(SymbolKind.Event);
        expect(byName.count?.kind).toBe(SymbolKind.Variable);
        expect(byName.doubled?.kind).toBe(SymbolKind.Variable);
        expect(byName.inc?.kind).toBe(SymbolKind.Function);
    });

    it('points each symbol at its declaration line in the script', () => {
        expect(byName.title.range.start.line).toBe(2);
        expect(byName.count.range.start.line).toBe(4);
        expect(byName.inc.range.start.line).toBe(6);
    });

    it('carries a detail label', () => {
        expect(byName.title.detail).toBe('@prop');
        expect(byName.count.detail).toBe('$signal');
    });
});

// LSP — go-to-definition for same-file symbols (@prop/@event/$signal/$derived/fn).

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { resolveLocalSymbolDefinition } from '../src/capabilities/definition';

const URI = 'file:///x.pdx';
const source = [
    '<template><div @click="inc">{{ count }}</div></template>',
    '<script setup>',                       // line 1
    "@prop title: string = 'x';",           // line 2
    '@event changed: number;',              // line 3
    'let count = $signal(0);',              // line 4
    'const doubled = $derived(count * 2);', // line 5
    'function inc() { count++; }',          // line 6
    '</script>',
].join('\n');

describe('go-to-definition (same-file symbols)', () => {
    const { analysis, descriptor } = analyzeDocument(source, 'x.pdx');
    const resolve = (word: string) =>
        resolveLocalSymbolDefinition(word, analysis!, source, descriptor!.script!, URI);

    it('resolves an @event to its declaration line', () => {
        const loc = resolve('changed');
        expect(loc?.uri).toBe(URI);
        expect(loc?.range.start.line).toBe(3);
    });

    it('resolves a $signal, a $derived, a @prop and a function', () => {
        expect(resolve('count')?.range.start.line).toBe(4);
        expect(resolve('doubled')?.range.start.line).toBe(5);
        expect(resolve('title')?.range.start.line).toBe(2);
        expect(resolve('inc')?.range.start.line).toBe(6);
    });

    it('returns null for an unknown identifier', () => {
        expect(resolve('nope')).toBeNull();
    });
});

// LSP L2 — code actions: quick-fixes built from diagnostics carrying a FixProposal.

import { describe, it, expect } from 'vitest';
import { Range, type TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { getCodeActions } from '../src/capabilities/code-actions';

const URI = 'file:///comp.pdx';
// `msg` is a plain let used in the template → PDX_NON_REACTIVE, which carries a fix.
const source = [
    '<template><p>{{ msg }}</p></template>',
    '<script setup>',
    'let count = $signal(0);',
    "let msg = 'hello';",
    '</script>',
].join('\n');

const { warnings, descriptor } = analyzeDocument(source, 'comp.pdx');
const wholeDoc = Range.create(0, 0, 100, 0);

/** The document after the edits, as the editor would leave it. */
const applied = (text: string, edits: TextEdit[]): string =>
    TextDocument.applyEdits(TextDocument.create(URI, 'pdx', 1, text), edits);

describe('code actions', () => {
    it('the source produces a fixable PDX_NON_REACTIVE diagnostic', () => {
        expect(warnings.some(w => w.code === 'PDX_NON_REACTIVE' && w.fix)).toBe(true);
    });

    it('offers a quick-fix that wraps the variable in $signal()', () => {
        const actions = getCodeActions({ uri: URI, source, descriptor, warnings, range: wholeDoc });
        const fix = actions.find(a => a.title.includes('PDX_NON_REACTIVE'));
        expect(fix).toBeDefined();
        const after = applied(source, fix!.edit!.changes![URI]);
        expect(after.split('\n')[3]).toBe("let msg = $signal('hello');");
    });

    it('returns no actions when the requested range is far from the diagnostic', () => {
        const farRange = Range.create(0, 0, 0, 1); // template line, not the declaration
        const actions = getCodeActions({ uri: URI, source, descriptor, warnings, range: farRange });
        expect(actions.find(a => a.title.includes('PDX_NON_REACTIVE'))).toBeUndefined();
    });
});

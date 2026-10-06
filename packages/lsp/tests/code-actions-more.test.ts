// Quick-fix construction; edits are in offsets.
//
// `code-actions.test.ts` covers the one warning the compiler gives a fix. What is left is everything
// that decides whether a fix becomes an offer at all: edits anywhere in the file, the range overlap
// that stops an action appearing over an unrelated line, and the ways a proposal can be inapplicable —
// where returning a broken edit would corrupt the user's file.

import { describe, it, expect } from 'vitest';
import { Range } from 'vscode-languageserver';
import type { ValidationWarning, FixProposal, SFCDescriptor } from '@pdxui/compiler';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { getCodeActions } from '../src/capabilities/code-actions';

const URI = 'file:///comp.pdx';

const SOURCE = [
    '<template><p>{{ msg }}</p></template>',
    '<script setup>',
    'let count = $signal(0);',
    "let msg = 'hello';",
    '</script>',
].join('\n');

const { descriptor } = analyzeDocument(SOURCE, 'comp.pdx');

/** The offsets of `text` in SOURCE. */
const span = (text: string): { start: number; end: number } => {
    const start = SOURCE.indexOf(text);
    if (start < 0) throw new Error(`'${text}' is not in the fixture`);
    return { start, end: start + text.length };
};

/** A fix that replaces `text` with `newText`. */
const replacing = (text: string, newText: string): FixProposal => ({ title: 'do the thing', edits: [{ ...span(text), newText }] });

/** A warning on the `msg` name of `let msg` (line 4, column 5), carrying the fix under test. */
function warningWith(fix: FixProposal | undefined, at = { line: 4, column: 5 }): ValidationWarning {
    return { code: 'PDX_TEST', severity: 'warn', message: "Variable 'msg' is not reactive", hint: 'a hint', ...at, fix };
}

const actionsFor = (fix: FixProposal | undefined, range = Range.create(0, 0, 100, 0), at?: { line: number; column: number }) =>
    getCodeActions({ uri: URI, source: SOURCE, descriptor, warnings: [warningWith(fix, at)], range });

const editsOf = (fix: FixProposal) => actionsFor(fix)[0]?.edit?.changes?.[URI];

describe('edits, wherever they fall', () => {
    it('a replace lands on the text its offsets name', () => {
        const edits = editsOf(replacing("'hello'", "$signal('hello')"));
        expect(edits, 'a replace fix produced no edit').toHaveLength(1);
        expect(edits![0].newText).toBe("$signal('hello')");
        expect(edits![0].range).toEqual(Range.create(3, 10, 3, 17));
    });

    it('an insert is an empty range', () => {
        const at = span("'hello'").start;
        const edits = editsOf({ title: 't', edits: [{ start: at, end: at, newText: '/* x */ ' }] });
        expect(edits![0].range.start).toEqual(edits![0].range.end);
    });

    it('several edits are offered as one action, in order', () => {
        const hello = span("'hello'");
        const edits = editsOf({ title: 't', edits: [
            { start: hello.end, end: hello.end, newText: ')' },
            { start: hello.start, end: hello.start, newText: '$signal(' },
        ] });
        expect(edits!.map((e) => e.newText)).toEqual(['$signal(', ')']);
    });

    it('an edit in the TEMPLATE is offered — fixes are not confined to the script', () => {
        // The warning sits on the template line, as a template finding does.
        const actions = actionsFor(replacing('{{ msg }}', '{{ msg() }}'), Range.create(0, 0, 0, 40), { line: 1, column: 17 });
        expect(actions, 'a template edit was not offered').toHaveLength(1);
        expect(actions[0].edit!.changes![URI][0].range.start.line).toBe(0);
    });

    it('a document with no script block can still be fixed in its template', () => {
        const source = '<template><p>x</p></template>';
        const noScript = { template: { content: '<p>x</p>', start: 10 } } as unknown as SFCDescriptor;
        const actions = getCodeActions({
            uri: URI, source, descriptor: noScript,
            warnings: [warningWith({ title: 't', edits: [{ start: 13, end: 14, newText: 'y' }] }, { line: 1, column: 14 })],
            range: Range.create(0, 0, 100, 0),
        });
        expect(actions).toHaveLength(1);
    });
});

describe('a proposal that cannot be applied', () => {
    it('no edits is no action', () => {
        expect(actionsFor({ title: 't', edits: [] })).toEqual([]);
    });

    it('an edit past the end of the document is dropped', () => {
        expect(actionsFor({ title: 't', edits: [{ start: SOURCE.length - 1, end: SOURCE.length + 5, newText: 'x' }] }),
            'an edit was offered against text that is not there').toEqual([]);
    });

    it('an edit whose end is before its start is dropped', () => {
        expect(actionsFor({ title: 't', edits: [{ start: 10, end: 5, newText: 'x' }] })).toEqual([]);
    });

    it('two edits over the same text are dropped, whole', () => {
        const hello = span("'hello'");
        expect(actionsFor({ title: 't', edits: [
            { ...hello, newText: 'a' },
            { start: hello.start + 1, end: hello.end, newText: 'b' },
        ] })).toEqual([]);
    });

    it('a warning with no fix is not an action', () => {
        expect(actionsFor(undefined)).toEqual([]);
    });
});

describe('only the fixes under the cursor', () => {
    const fix = replacing("let msg = 'hello';", 'x');

    it('offers the fix when the requested range covers the warning', () => {
        expect(actionsFor(fix, Range.create(3, 0, 3, 20)).length,
            'the fix did not appear on its own line').toBe(1);
    });

    it('offers nothing when the cursor is on an unrelated line', () => {
        expect(actionsFor(fix, Range.create(0, 0, 0, 5)),
            'every fix in the file was offered wherever the cursor was').toEqual([]);
    });

    it('an empty range exactly on the warning boundary still counts', () => {
        // A cursor with no selection is an empty range: if touching did not count, placing the
        // caret at the start of the offending symbol would offer nothing.
        const wr = actionsFor(fix)[0].diagnostics![0].range;
        const caret = Range.create(wr.start, wr.start);

        expect(actionsFor(fix, caret).length,
            'the caret on the symbol itself offered no fix').toBe(1);
    });

    it('but an empty range just before it does not', () => {
        const wr = actionsFor(fix)[0].diagnostics![0].range;
        const before = Range.create(
            { line: wr.start.line, character: Math.max(0, wr.start.character - 2) },
            { line: wr.start.line, character: Math.max(0, wr.start.character - 2) },
        );

        expect(actionsFor(fix, before), 'the overlap test accepts anything on the line')
            .toEqual([]);
    });
});

describe('what the editor is shown', () => {
    it('titles the action with the code and the fix, and marks it preferred', () => {
        const action = actionsFor(replacing("'hello'", "$signal('hello')"))[0];

        expect(action.title).toBe('PDX_TEST: do the thing');
        expect(action.isPreferred, 'the only fix for a diagnostic was not the preferred one').toBe(true);
        expect(action.kind).toBe('quickfix');
        expect(action.diagnostics![0].code).toBe('PDX_TEST');
        expect(action.diagnostics![0].source).toBe('pdx');
    });
});

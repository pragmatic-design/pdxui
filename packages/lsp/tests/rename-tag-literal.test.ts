// Renaming a component declared with `@tag` rewrites ITS literal, and only it (#71).
//
// The old tag went into a regex with only `-` escaped. A custom-element name may hold a `.`
// (`pdx-a.b` is valid), and unescaped it matched any character: a `@tag 'pdx-aXb'` earlier in the file
// — a comment, a string — was edited instead of the declaration.

import { describe, it, expect } from 'vitest';
import type { TextEdit } from 'vscode-languageserver';
import { getRenameEdits } from '../src/capabilities/rename';
import { buildComponentIndex } from '../src/utils/component-index';

const DEF_URI = 'file:///widget.pdx';
const def = [
    '<template><p>x</p></template>',
    '<script setup>',
    "// renamed from @tag 'pdx-aXb' last week",
    "@tag 'pdx-a.b';",
    '</script>',
].join('\n');

const files = [{ uri: DEF_URI, content: def }];

describe('@tag literal rename', () => {
    it('the index knows the tag as declared — the control', () => {
        expect(buildComponentIndex(files).get('pdx-a.b')?.usesCustomTag).toBe(true);
    });

    it('edits the declaration, not a look-alike before it', () => {
        const edit = getRenameEdits({
            word: 'pdx-a.b', newName: 'pdx-c', source: def, descriptor: null, analysis: null,
            uri: DEF_URI, files, index: buildComponentIndex(files),
        });
        const edits = (edit?.changes?.[DEF_URI] ?? []) as TextEdit[];
        expect(edits, 'no edit to the declaration').toHaveLength(1);
        // Line 3 (0-based) is `@tag 'pdx-a.b';`; line 2 is the comment.
        expect(edits[0].range.start.line).toBe(3);
        expect(edits[0].newText).toBe('pdx-c');
    });
});

// Document formatting — safe, non-destructive whitespace normalisation for a
// .pdx (template + script + style mixed together). Deliberately conservative: it does not
// re-indent or reorder code (risky over mixed HTML/TS/CSS), but it does tidy:
//   - leading tabs → 2 spaces
//   - trailing spaces/tabs removed
//   - runs of 3+ blank lines → 1
//   - exactly one final newline

import type { TextEdit } from 'vscode-languageserver';

export function normalizePdx(source: string): string {
    let out = source.replace(/\r\n/g, '\n');
    out = out.split('\n')
        .map(line => line.replace(/^\t+/, t => '  '.repeat(t.length)).replace(/[ \t]+$/, ''))
        .join('\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/\s*$/, '') + '\n';
    return out;
}

/** Full-document formatting edit (empty when it is already formatted). */
export function formatDocument(source: string): TextEdit[] {
    const formatted = normalizePdx(source);
    if (formatted === source) return [];

    const lines = source.split('\n');
    return [{
        range: {
            start: { line: 0, character: 0 },
            end: { line: lines.length - 1, character: lines[lines.length - 1].length },
        },
        newText: formatted,
    }];
}

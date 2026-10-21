// One reading rule for every declaration (#524; decisions.md point 11): a declaration may span lines
// when it opens a balanced `{ … }` or `( … )` on its first line, and it ends at its `;` or at the end
// of that block.
//
// Applied once, before any rune's own parser sees the script: the lines a declaration's open block
// spans are read onto its first line, and the lines it took stay in place, empty, so every line after
// it keeps its number. Each rune's parser then reads one line, as it reads the one-line form.
//
// A rune with a body — `@raw { … }`, `@action …(…) { … }`, `@snippet …(…) { … }` — keeps its body's
// lines: the body is code or a template, where a newline means something (a `//` comment, the end of a
// statement, the text of a `<pre>`). Its parser reads the body to its balanced brace, as it always did;
// what this joins for it is its parameter list, the `( … )` it opens on its first line, and for
// `@action` its options, the `{ … }` after `with`.

import { DECORATOR_RUNES } from './runes';
import { maskNonCode, skipNonCode } from './tokenizer';

/** The runes whose first-line `{` opens a body, read by their own parser with its lines kept. */
const BODY_RUNES = new Set(['raw', 'action', 'snippet']);

const OPENERS = '([{';
const CLOSERS = ')]}';

/** The line without a trailing `//` comment, strings stepped over. */
function withoutLineComment(line: string): string {
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '/' && line[j + 1] === '/') return line.slice(0, j);
        const skip = skipNonCode(line, j);
        if (skip !== null) j = skip - 1;
    }
    return line;
}

/**
 * The brackets a code-only line leaves open at its end, outermost first, from the `stack` open before
 * it; and whether the stack emptied somewhere in the line — the blocks open before it all closed, even
 * if the line then opens another.
 */
function scanLine(code: string, stack: string[] = []): { open: string[]; emptied: boolean; outerAt: number } {
    const open = [...stack];
    const at: number[] = stack.map(() => -1);
    let emptied = false;
    for (let j = 0; j < code.length; j++) {
        const c = code[j];
        if (OPENERS.includes(c)) { open.push(c); at.push(j); }
        else if (CLOSERS.includes(c) && open.length > 0) {
            open.pop();
            at.pop();
            if (open.length === 0) emptied = true;
        }
    }
    // Where, in this line, the outermost bracket still open was opened (-1: before the line).
    return { open, emptied, outerAt: at[0] ?? -1 };
}

/**
 * Whether a body rune's open bracket is one the rule reads: its parameter list `( … )`, or `@action`'s
 * options, the `{ … }` after `with`. Any other `{` is its body.
 */
function readsAsDeclaration(rune: string, code: string, scan: { open: string[]; outerAt: number }): boolean {
    if (scan.open[0] === '(') return true;
    // Match: the `with` keyword right before the bracket. Groups: none
    return rune === 'action' && /\bwith\s*$/.test(code.slice(0, scan.outerAt));
}

/**
 * The script's lines with every rune declaration that spans lines read onto its first line (see the
 * module comment), and the lines that were read onto another: still there, empty, and to be skipped.
 */
export function readDeclarationsOntoOneLine(lines: string[]): { lines: string[]; consumed: Set<number> } {
    const out = [...lines];
    const consumed = new Set<number>();
    const code = maskNonCode(lines.join('\n')).split('\n');
    for (let i = 0; i < out.length; i++) {
        // Match: a statement-leading `@name`, in code (not in a comment or a string). Groups: [1]=name
        const rune = /^\s*@([A-Za-z]\w*)/.exec(code[i])?.[1];
        if (!rune || !DECORATOR_RUNES.has(rune)) continue;
        const first = scanLine(code[i]);
        let open = first.open;
        if (open.length === 0) continue;
        // A body rune's open `{` is its body: its own parser reads it, lines kept.
        if (BODY_RUNES.has(rune) && !readsAsDeclaration(rune, code[i], first)) continue;
        // To the line where the blocks the first line opened have all closed — "the end of that
        // block". What that line opens next (`@form`'s options after its schema) is the rune's.
        let last = i;
        let closed = false;
        while (!closed && last + 1 < out.length) {
            last++;
            const scan = scanLine(code[last], open);
            open = scan.open;
            closed = scan.emptied;
        }
        // Never balanced: left to the rune's parser, which reports what it cannot read.
        if (!closed) continue;
        const parts = [withoutLineComment(out[i]).trimEnd()];
        for (let k = i + 1; k <= last; k++) parts.push(withoutLineComment(out[k]).trim());
        // Joined as the one-line form is written: `f(a)` and `[a]` with nothing inside the brackets,
        // `{ a }` with a space.
        out[i] = parts.filter(Boolean).reduce((joined, part) =>
            /[([]$/.test(joined) || /^[)\]]/.test(part) ? joined + part : `${joined} ${part}`);
        for (let k = i + 1; k <= last; k++) { out[k] = ''; consumed.add(k); }
        i = last;
    }
    return { lines: out, consumed };
}

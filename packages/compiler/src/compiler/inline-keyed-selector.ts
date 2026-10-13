// `row.key === sig` inside a @for keyed by `row.key` → a keyed selector (#117).
//
// Read as written, `sig` subscribes every row: a selection re-runs one effect per row to change two of
// them. Core's `selector(() => sig)` keeps one signal per key being read, and `is(key)` reads only that
// one — so a change of `sig` from `a` to `b` re-runs the rows keyed `a` and `b`. The rewrite applies to
// a whole `===` or `==` comparison whose one side is exactly the loop's track expression and whose
// other side is a signal read (`ctx.name()`); anything else is left as it is.

import ts from 'typescript';

/** The name of the selector over the signal `name`, declared once at the top of the render. */
export const selectorName = (name: string): string => `__sel_${name}`;

/**
 * `code` — a binding's expression, already rewritten into the render's form — with every
 * `key === ctx.name()` (either side) replaced by `__sel_name.is(key)`, where `key` is one of `keyReads`
 * (the track expressions in scope, in the same form). `use` is told each signal a selector is for.
 */
export function rewriteKeyedSelectors(code: string, keyReads: readonly string[], use: (name: string) => void): string {
    if (keyReads.length === 0 || !code.includes('==')) return code;
    const sf = ts.createSourceFile('__pdx_selector.ts', `(${code});`, ts.ScriptTarget.Latest, true);
    const edits: { start: number; end: number; text: string }[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isBinaryExpression(node)) {
            const op = node.operatorToken.kind;
            if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) {
                const left = node.left.getText(sf), right = node.right.getText(sf);
                const pair = keyReads.includes(left) ? [left, right] : keyReads.includes(right) ? [right, left] : null;
                // Match: a signal read, `ctx.name()`. Groups: [1]=name
                const signal = pair && /^ctx\.([A-Za-z_$][\w$]*)\(\)$/.exec(pair[1]);
                if (pair && signal) {
                    use(signal[1]);
                    // The source was wrapped in `(` … `);`: positions are shifted by one.
                    edits.push({ start: node.getStart(sf) - 1, end: node.getEnd() - 1, text: `${selectorName(signal[1])}.is(${pair[0]})` });
                    return;
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    let out = code;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return out;
}

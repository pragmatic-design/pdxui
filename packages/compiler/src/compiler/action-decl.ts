// `@action name(param[: Type][, { signal }]) [when expr] [with { options }] { body }` — a declared
// write (#501), the counterpart of `@fetch`. It compiles to `mutation()` (#500):
//
//   const name = mutation({ fn: async (param, { signal }) => { body }, enabled: () => (expr), ...{ options } });
//
// The line goes into the setup body, where the signal rewrite reads it like the rest of the script.
// One parser, read by the analyzer and by the editor's projection (packages/lsp).

import { maskNonCode } from './tokenizer';
import { splitAtTopLevelCommas } from './script-analyzer-helpers';

/** A parsed `@action`. Offsets are into the declaration's text. */
export interface ActionDecl {
    name: string;
    /** The parameters as written, between the parentheses. */
    params: string;
    /** The first parameter's type as written, null when it has none or there is no input. */
    inputType: string | null;
    /** Whether the action takes an argument: false with no parameter, or only `{ signal }`. */
    hasInput: boolean;
    /** The `when` expression, if any. */
    when?: string;
    /** The `with` object literal as written, braces included, if any. */
    options?: string;
    /** The body, between its braces. */
    body: string;
    /** Where the head ends and the body's `{` starts. */
    bodyStart: number;
    /** Just past the body's `}`. */
    end: number;
}

/** The options `with { … }` takes; `agent` and `consequential` are carried for #502. */
export const ACTION_OPTIONS = ['invalidate', 'optimistic', 'onSuccess', 'onError', 'concurrency', 'agent', 'consequential'] as const;
/** The values `concurrency` takes. */
export const ACTION_CONCURRENCY = ['queue', 'drop', 'coalesce', 'parallel'] as const;

// Match: `{ signal }`, the call's AbortSignal parameter. Groups: none
const SIGNAL_PARAM = /^\{\s*signal\s*\}$/;

/** The index of the bracket that closes the one at `open` in `masked`, or -1. */
function closing(masked: string, open: number): number {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

/** Each top-level `{ … }` block of `masked` from `from` on, as [start, end) pairs. */
function topLevelBlocks(masked: string, from: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = from; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[') { const j = closing(masked, i); if (j < 0) return out; i = j; continue; }
        if (c === '{') { const j = closing(masked, i); if (j < 0) return out; out.push([i, j + 1]); i = j; }
    }
    return out;
}

/**
 * Parse an `@action` declaration (the text from `@action` to past its body, or more: the body is the
 * last top-level block, and only whitespace or a `;` may follow it). Null when the text is not one.
 */
export function parseActionDecl(text: string): ActionDecl | null {
    // Match: `@action name(`. Groups: [1]=the name
    const head = /^@action\s+([A-Za-z_$][\w$]*)\s*\(/.exec(text);
    if (!head) return null;
    const masked = maskNonCode(text);
    const open = head[0].length - 1;
    const close = closing(masked, open);
    if (close < 0) return null;
    const blocks = topLevelBlocks(masked, close + 1);
    if (blocks.length === 0) return null;
    const [bodyStart, end] = blocks[blocks.length - 1];
    // Only whitespace, or a `;`, may follow the body (trimmed, not a regex: no backtracking on spaces).
    const tail = text.slice(end).trim();
    if (tail !== '' && tail !== ';') return null;

    // Between the parameters and the body: `when expr`, `with { … }`, both, or nothing.
    const between = text.slice(close + 1, bodyStart);
    const betweenMasked = masked.slice(close + 1, bodyStart);
    let when: string | undefined;
    let options: string | undefined;
    // Match: the `with` keyword at top level, before its object literal. Groups: none
    const withAt = betweenMasked.search(/(^|\s)with\s*\{/);
    const beforeWith = withAt < 0 ? between : between.slice(0, withAt);
    if (withAt >= 0) {
        const brace = close + 1 + betweenMasked.indexOf('{', withAt);
        const braceEnd = closing(masked, brace);
        if (braceEnd < 0 || text.slice(braceEnd + 1, bodyStart).trim() !== '') return null;
        options = text.slice(brace, braceEnd + 1);
    }
    const whenText = beforeWith.trim();
    if (whenText) {
        // `when <expression>`: the keyword, then whitespace, then the expression.
        if (!/^when\s/.test(whenText)) return null;
        when = whenText.slice('when'.length).trim();
        if (!when) return null;
    }

    const params = text.slice(open + 1, close).trim();
    const list = splitAtTopLevelCommas(params, { typeArguments: true }).map((p) => p.trim()).filter(Boolean);
    if (list.length > 2 || (list.length === 2 && !SIGNAL_PARAM.test(list[1]))) return null;
    const hasInput = list.length > 0 && !SIGNAL_PARAM.test(list[0]);
    const colon = hasInput ? list[0].indexOf(':') : -1;
    const inputType = colon >= 0 ? list[0].slice(colon + 1).trim() : null;
    return { name: head[1], params, inputType, hasInput, when, options, body: text.slice(bodyStart + 1, end - 1), bodyStart, end };
}

/** Each `key: value` of the `with` options as written, a shorthand `key` with an empty value. */
export function actionOptionValues(options: string): Map<string, string> {
    const inner = options.trim().replace(/^\{/, '').replace(/\}$/, '');
    const out = new Map<string, string>();
    for (const entry of splitAtTopLevelCommas(inner).map((e) => e.trim()).filter(Boolean)) {
        const colon = entry.indexOf(':');
        out.set((colon < 0 ? entry : entry.slice(0, colon)).trim(), colon < 0 ? '' : entry.slice(colon + 1).trim());
    }
    return out;
}

/**
 * The agent options of an action (#502, decision 31): `agent`, the description a tool is offered
 * under, read when it is a string literal; `consequential`, true only when written `true`.
 */
export function actionAgentOptions(options: string | undefined): { agent?: string; consequential: boolean } {
    if (!options) return { consequential: false };
    const values = actionOptionValues(options);
    // Match: a quoted literal. Groups: [2]=its text
    const agent = /^(['"`])(.*)\1$/.exec(values.get('agent') ?? '')?.[2];
    return { ...(agent !== undefined ? { agent } : {}), consequential: values.get('consequential') === 'true' };
}

/** What is wrong with the `with` options: each unknown key, and a `concurrency` value outside the four. */
export function actionOptionProblems(options: string): string[] {
    const inner = options.trim().replace(/^\{/, '').replace(/\}$/, '');
    const problems: string[] = [];
    for (const entry of splitAtTopLevelCommas(inner).map((e) => e.trim()).filter(Boolean)) {
        // `key: value`, or a shorthand `key`: split at the first colon (no regex over the value).
        const colon = entry.indexOf(':');
        const key = (colon < 0 ? entry : entry.slice(0, colon)).trim();
        const value = colon < 0 ? '' : entry.slice(colon + 1).trim();
        if (!(ACTION_OPTIONS as readonly string[]).includes(key)) { problems.push(`\`${key}\` is not an option`); continue; }
        if (key === 'concurrency' && value) {
            // Match: a quoted literal. Groups: [2]=its text
            const literal = /^(['"])(.*)\1$/.exec(value);
            if (literal && !(ACTION_CONCURRENCY as readonly string[]).includes(literal[2])) problems.push(`\`concurrency: '${literal[2]}'\` is not a policy`);
        }
    }
    return problems;
}

/**
 * The `@action` that starts on line `first` of a script split into lines, read to its body's closing
 * brace — the body may span lines. `codeLines` is the same script with strings and comments blanked,
 * for counting braces. `lastLine` is the line it ends on; `decl` is null when it is not a form of
 * `@action`, and then only its first line is consumed.
 */
export function readActionDecl(lines: string[], codeLines: string[], first: number): { decl: ActionDecl | null; lastLine: number } {
    let depth = 0;
    let sawBrace = false;
    for (let i = first; i < lines.length; i++) {
        for (const c of codeLines[i] ?? '') {
            if (c === '{') { depth++; sawBrace = true; } else if (c === '}') depth--;
        }
        if (sawBrace && depth === 0) {
            // `with { … }` closes a block before the body opens: parse, and read on when it is not yet one.
            const decl = parseActionDecl(lines.slice(first, i + 1).join('\n').trim());
            if (decl) return { decl, lastLine: i };
        }
        if (depth < 0) break;
    }
    return { decl: null, lastLine: first };
}

/** The setup line an `@action` compiles to. */
export function compileAction(d: ActionDecl): string {
    const parts = [`fn: async (${d.params}) => {${d.body}}`];
    if (d.when) parts.push(`enabled: () => (${d.when})`);
    if (d.options) parts.push(`...${d.options}`);
    return `const ${d.name} = mutation({ ${parts.join(', ')} });`;
}

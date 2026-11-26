// The type of a TypeScript assertion in a template expression: `x as Resource<User[]>` (#145).
//
// A template expression reaches the generated module, whose types are erased (erase-types.ts). The
// type after `as` or `satisfies` names a type, not a value: the ctx. prefix must leave it as written,
// and the reads collected for the template must not count it.

import { skipNonCode } from './tokenizer';

/** Whether the identifier `id`, spanning `start`..`end` of `expr`, is an `as`/`satisfies` operator. */
export function isAssertionOperator(expr: string, id: string, start: number, end: number): boolean {
    return (id === 'as' || id === 'satisfies')
        && start > 0 && /\s/.test(expr[start - 1])
        // Match: whitespace, then what a type starts with — a name, a bracket, a quote or a digit
        && /^\s+[A-Za-z_$({['"\d]/.test(expr.slice(end));
}

/**
 * The index past the type that starts after `pos` (whitespace first): members joined by `|` and `&`.
 * A member is a name (dotted, with its `<…>` arguments), a bracketed type — an object literal
 * `{ a: string; b?: number }`, a tuple `[string, number]`, a parenthesised type or a function type's
 * parameters `(v: number) => string` — or a string or number literal type, each with its `[]`
 * suffixes. A bracketed type is copied whole, balanced (#1383): read member by member, the `{` of
 * `{ label?: string }` ended the type, and the prefix wrote `ctx.label` into it. Enough for an
 * assertion in a template; the editor's projection checks the type itself.
 */
export function skipAssertedType(expr: string, pos: number): number {
    let i = pos;
    for (;;) {
        while (/\s/.test(expr[i] ?? '')) i++;
        const end = skipMember(expr, i);
        if (end === i) return i;
        i = end;
        while (expr.startsWith('[]', i)) i += 2;
        // Match: `|` or `&` after optional whitespace, the join to the next member
        const join = /^\s*[|&]/.exec(expr.slice(i));
        if (!join) return i;
        i += join[0].length;
    }
}

/** The index past the one member of a type at `i`, or `i` when no type starts there. */
function skipMember(expr: string, i: number): number {
    const ch = expr[i];
    if (ch === "'" || ch === '"') return skipNonCode(expr, i) ?? i;
    // Match: a number literal type, `0` or `1.5`
    const number = /^\d[\d.]*/.exec(expr.slice(i));
    if (number) return i + number[0].length;
    if (ch === '{' || ch === '[' || ch === '(') {
        let end = skipBalanced(expr, i);
        // A function type: its parameters, then `=>` and the type it returns.
        // Match: `=>` after optional whitespace
        const arrow = ch === '(' ? /^\s*=>/.exec(expr.slice(end)) : null;
        if (arrow) end = skipAssertedType(expr, end + arrow[0].length);
        return end;
    }
    // Match: a name, dotted (`ns.Type`), the keyword of `keyof T` / `typeof x` included
    const name = /^[A-Za-z_$][\w$.]*/.exec(expr.slice(i));
    if (!name) return i;
    let end = i + name[0].length;
    if (name[0] === 'keyof' || name[0] === 'typeof' || name[0] === 'readonly') {
        // Match: whitespace, then the start of the operand
        const operand = /^\s+(?=[A-Za-z_$({['"])/.exec(expr.slice(end));
        if (operand) return skipMember(expr, end + operand[0].length);
    }
    if (expr[end] === '<') end = skipTypeArguments(expr, end);
    return end;
}

/** The index past the bracket opening at `open` and its contents, strings skipped whole. */
function skipBalanced(expr: string, open: number): number {
    let depth = 0;
    for (let i = open; i < expr.length; i++) {
        const past = skipNonCode(expr, i);
        if (past !== null) { i = past - 1; continue; }
        const ch = expr[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if ((ch === '}' || ch === ']' || ch === ')') && --depth === 0) return i + 1;
    }
    return expr.length;
}

/** The index past the `<…>` opening at `open`, where the `>` of an arrow `=>` closes nothing. */
function skipTypeArguments(expr: string, open: number): number {
    let depth = 0;
    for (let i = open; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === '<') depth++;
        else if (ch === '>' && expr[i - 1] !== '=' && --depth === 0) return i + 1;
    }
    return expr.length;
}

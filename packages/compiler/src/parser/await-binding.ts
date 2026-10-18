// `@await (<expr> as <name>)` — where the binding ends and the awaited expression begins (#145).
//
// Inside the parentheses, `x as T` is also a TypeScript type assertion. One rule keeps both: the
// binding is the LAST top-level `as` followed by a bare identifier and the closing parenthesis; a
// type assertion in the expression is written in its own parentheses,
// `@await ((x as Resource<User[]>) as list)` (docs/language/beta/decisions.md, point 18).

/** The awaited expression and, when there is one, the name its result is bound to. */
export interface AwaitBinding {
    expr: string;
    as?: string;
}

/**
 * Whether `index` in `text` is at bracket depth 0 and outside a string or template literal. The
 * depth counts `()`, `[]` and `{}`; a generic's `<…>` is not a bracket here — an `as` inside one is
 * never followed by an identifier and the closing parenthesis, which is all this is asked.
 */
function atTopLevel(text: string, index: number): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < index; i++) {
        const c = text[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
    }
    return depth === 0 && quote === null;
}

/** Split `@await`'s parenthesised text into the awaited expression and its `as` binding. */
export function splitAwaitBinding(condition: string): AwaitBinding {
    // Match: `<expr> as <name>` at the very end. Groups: [1]=the expression [2]=the name
    const m = /^([\s\S]*\S)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(condition);
    if (!m || !atTopLevel(condition, m[1].length)) return { expr: condition };
    return { expr: m[1], as: m[2] };
}

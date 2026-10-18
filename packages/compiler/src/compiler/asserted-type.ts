// The type of a TypeScript assertion in a template expression: `x as Resource<User[]>` (#145).
//
// A template expression reaches the generated module, whose types are erased (erase-types.ts). The
// type after `as` or `satisfies` names a type, not a value: the ctx. prefix must leave it as written,
// and the reads collected for the template must not count it.

/** Whether the identifier `id`, spanning `start`..`end` of `expr`, is an `as`/`satisfies` operator. */
export function isAssertionOperator(expr: string, id: string, start: number, end: number): boolean {
    return (id === 'as' || id === 'satisfies')
        && start > 0 && /\s/.test(expr[start - 1])
        && /^\s+[A-Za-z_$({[]/.test(expr.slice(end));
}

/**
 * The index past the type that starts after `pos` (whitespace first): names joined by `.`, `|` and
 * `&`, each with its `<…>` arguments and `[]` suffixes. Enough for an assertion in a template; the
 * editor's projection checks the type itself.
 */
export function skipAssertedType(expr: string, pos: number): number {
    let i = pos;
    for (;;) {
        while (/\s/.test(expr[i] ?? '')) i++;
        const name = /^[A-Za-z_$][\w$.]*/.exec(expr.slice(i));
        if (!name) return i;
        i += name[0].length;
        if (expr[i] === '<') {
            for (let depth = 0; i < expr.length; i++) {
                if (expr[i] === '<') depth++;
                else if (expr[i] === '>' && --depth === 0) { i++; break; }
            }
        }
        while (expr.startsWith('[]', i)) i += 2;
        const join = /^\s*[|&]/.exec(expr.slice(i));
        if (!join) return i;
        i += join[0].length;
    }
}

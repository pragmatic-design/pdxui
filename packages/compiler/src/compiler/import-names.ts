// The local names an import statement binds.
//
// The template is compiled into the same module as the script's imports, so an imported name is in
// scope there as it is. `prefixCtx` needs to know which names those are; without them it would
// prepend `ctx.` to every one, and `@click="toggleDarkMode()"` would throw «ctx.toggleDarkMode is
// not a function».
//
// The statement is scanned, not matched: the patterns that read it took quadratic time on a run of
// whitespace or of `{` (#598, js/polynomial-redos).

const isSpace = (ch: string) => /\s/.test(ch);

/**
 * The clause between `import` and the first `from` that is followed by a quoted specifier, or null
 * when the statement imports types only, nothing, or is not an import.
 */
function importClause(stmt: string): string | null {
    if (!stmt.startsWith('import') || !isSpace(stmt.charAt(6))) return null;
    let start = 6;
    while (start < stmt.length && isSpace(stmt[start])) start++;
    // `import type …` binds nothing at runtime.
    if (stmt.startsWith('type', start) && isSpace(stmt.charAt(start + 4))) return null;
    for (let at = stmt.indexOf('from', start + 1); at !== -1; at = stmt.indexOf('from', at + 1)) {
        if (!isSpace(stmt[at - 1])) continue;
        let quote = at + 4;
        if (!isSpace(stmt.charAt(quote))) continue;
        while (quote < stmt.length && isSpace(stmt[quote])) quote++;
        if (stmt[quote] === '\'' || stmt[quote] === '"') return stmt.slice(start, at).trim();
    }
    return null;
}

/**
 * The names `stmt` binds in the module, by their LOCAL spelling. `stmt` is one flattened import
 * statement, the shape the script analyzer keeps them in.
 *
 *   import a from 'x'                  → a
 *   import * as ns from 'x'            → ns
 *   import { b, c as d, type T } from  → b, d        (an inline `type` binds nothing at runtime)
 *   import a, { b } from 'x'           → a, b
 *   import type { T } from 'x'         → (none)
 *   import 'x'                         → (none)
 */
export function importedLocalNames(stmt: string): string[] {
    const clause = importClause(stmt.trim());
    if (!clause) return [];
    const names: string[] = [];

    // Groups: [1]=the namespace's local name
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) names.push(ns[1]);

    // Groups: [1]=the default import, when it comes first
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (def) names.push(def[1]);

    // The named list: from the first `{` to the first `}` after it.
    const open = clause.indexOf('{');
    const close = open === -1 ? -1 : clause.indexOf('}', open + 1);
    if (close !== -1) {
        for (const part of clause.slice(open + 1, close).split(',')) {
            const spec = part.trim();
            if (!spec || /^type\s/.test(spec)) continue;
            // `c as d` binds d; `b` binds b.
            const words = spec.split(/\s+/);
            const local = words.length >= 3 && words[words.length - 2] === 'as' ? words[words.length - 1] : spec;
            if (/^[A-Za-z_$][\w$]*$/.test(local)) names.push(local);
        }
    }
    return names;
}

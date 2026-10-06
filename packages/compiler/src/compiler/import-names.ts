// The local names an import statement binds.
//
// The template is compiled into the same module as the script's imports, so an imported name is in
// scope there as it is. `prefixCtx` needs to know which names those are; without them it would
// prepend `ctx.` to every one, and `@click="toggleDarkMode()"` would throw «ctx.toggleDarkMode is
// not a function».

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
    // Groups: [1]=the clause between `import` and `from`
    const m = /^import\s+(?!type\s)([\s\S]+?)\s+from\s+['"]/.exec(stmt.trim());
    if (!m) return [];
    const clause = m[1].trim();
    const names: string[] = [];

    // Groups: [1]=the namespace's local name
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) names.push(ns[1]);

    // Groups: [1]=the default import, when it comes first
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (def) names.push(def[1]);

    // Groups: [1]=the named list between the braces
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
        for (const part of named[1].split(',')) {
            const spec = part.trim();
            if (!spec || /^type\s/.test(spec)) continue;
            // `c as d` binds d; `b` binds b.
            const local = spec.split(/\s+as\s+/).pop()!.trim();
            if (/^[A-Za-z_$][\w$]*$/.test(local)) names.push(local);
        }
    }
    return names;
}

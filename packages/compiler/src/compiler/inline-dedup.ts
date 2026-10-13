// Binding deduplication on the inline render path (#236).
//
// Two bindings that read the same expression — `<button :disabled="count > 0" :hidden="count > 0">` —
// share ONE computed in a production build, instead of each effect evaluating the expression and
// subscribing to its signals on its own. The template path did this on its `${() => expr}`
// interpolations (`deduplicateBindings`); since #107 every .pdx renders inline, so the optimisation
// lives here, with the template path's rules:
//   - only the TOP LEVEL of the render counts: a copy inside a control-flow branch (`@if`, `@for`,
//     `@try`…) is guarded by it, and a computed hoisted to the top would read it while the branch is
//     closed — `shown().name` throwing on every close. A guarded copy keeps its own expression;
//   - a bare read of one signal (`ctx.count()`) is never shared: it already is one subscription;
//   - an expression that names a local — a `@let`, anything not reached through `ctx` — is never
//     hoisted, since at the top of the render that name is not declared yet.

import { referencesLocalScope } from './codegen-shared';

// Match: `ctx.name` or `ctx.name()` alone — one signal read, nothing to share.
const BARE_READ = /^ctx\.[\w$]+(\(\))?$/;

/** Collects the top-level bindings of one render, then writes the shared computeds. */
export class BindingDedup {
    private readonly seen = new Map<string, { token: string; count: number }>();

    /**
     * The text to write for a binding's value `expr`: a placeholder when it may be shared, `expr`
     * itself when it may not. Every placeholder is resolved by {@link finish}.
     */
    share(expr: string): string {
        const value = expr.trim();
        if (BARE_READ.test(value) || !value.includes('ctx.') || referencesLocalScope(`() => ${value}`)) return expr;
        let entry = this.seen.get(value);
        if (!entry) {
            // A placeholder no generated code and no author text contains.
            entry = { token: `__pdx_bd_slot_${this.seen.size}__`, count: 0 };
            this.seen.set(value, entry);
        }
        entry.count++;
        return entry.token;
    }

    /**
     * `lines` with each placeholder resolved: an expression bound twice or more becomes `__bd_N()`
     * and gets its declaration in `decls`, to be written before the first line; one bound once is put
     * back as it was. `decls` is empty when nothing repeats.
     */
    finish(lines: string[]): { lines: string[]; decls: string[] } {
        const decls: string[] = [];
        const replacements = new Map<string, string>();
        for (const [expr, { token, count }] of this.seen) {
            if (count < 2) { replacements.set(token, expr); continue; }
            const name = `__bd_${decls.length}`;
            decls.push(`const ${name} = computed(() => ${expr});`);
            replacements.set(token, `${name}()`);
        }
        if (replacements.size === 0) return { lines, decls };
        // Match: any placeholder this collector handed out.
        const tokenRe = /__pdx_bd_slot_\d+__/g;
        return { lines: lines.map(l => l.replace(tokenRe, t => replacements.get(t) ?? t)), decls };
    }
}

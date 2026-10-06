// Signal declaration helpers — emit the const __name = signal(…) / computed(…) declarations
// and the auto-return object. The actual mutation/read rewriting of setup bodies moved to the
// AST rewriter in signal-rewrite-ast.ts (rewriteAst). Derived expressions still get their reads
// rewritten with a small inline regex here (they are single $derived(EXPR) expressions, not
// arbitrary statement bodies).

import ts from 'typescript';
import type { SignalDecl } from './script-analyzer';
import { skipNonCode } from './tokenizer';
import { rewriteAst } from './signal-rewrite-ast';

/**
 * Is this fragment, as a whole, an arrow function? The question `$derived(…)` has to answer before
 * deciding whether to wrap the expression in `() =>`.
 *
 * It is asked of the parser because no pattern can answer it: an arrow may appear anywhere inside
 * an expression that is not one. Unparseable input answers false — the caller then wraps, which is
 * the harmless direction (a wrapped non-expression fails loudly at compile time; an unwrapped one
 * fails at runtime, far from here).
 */
function isArrowFunction(expr: string): boolean {
    const sf = ts.createSourceFile('__pdx_derived.ts', `(${expr})`, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const statement = sf.statements[0];
    if (!statement || !ts.isExpressionStatement(statement)) return false;
    const inner = ts.isParenthesizedExpression(statement.expression)
        ? statement.expression.expression
        : statement.expression;
    return ts.isArrowFunction(inner);
}

/**
 * Rewrite bare prop reads in an initializer expression to `ctx.prop.peek()`.
 * String/comment/template-aware, and skips object keys (identifier followed by `:`
 * that is not `::`) so `{ label: label }` only rewrites the VALUE, and string
 * contents like `'label: x'` are left untouched (compiler rule #10).
 */
export function rewritePropPeeks(expr: string, propNames: Set<string>): string {
    if (propNames.size === 0) return expr;
    let result = '';
    let pos = 0;
    while (pos < expr.length) {
        const skip = skipNonCode(expr, pos);
        if (skip !== null && skip > pos) {
            result += expr.slice(pos, skip);
            pos = skip;
            continue;
        }
        const ch = expr[pos];
        if (/[A-Za-z_$]/.test(ch)) {
            const start = pos;
            while (pos < expr.length && /[\w$]/.test(expr[pos])) pos++;
            const id = expr.slice(start, pos);
            const prevChar = start > 0 ? expr[start - 1] : '';
            // Object key: identifier followed by a single `:` (not `::`).
            const after = expr.slice(pos).match(/^\s*:/);
            const isObjectKey = !!after && expr[pos + after[0].length] !== ':';
            if (propNames.has(id) && prevChar !== '.' && !isObjectKey) {
                result += `ctx.${id}.peek()`;
            } else {
                result += id;
            }
            continue;
        }
        result += ch;
        pos++;
    }
    return result;
}

/**
 * Generate signal declaration code.
 * let count = $signal(0) → const __count = signal(0, { name: 'file:count' });
 */
export function generateSignalDeclarations(signals: SignalDecl[], filename: string, propNames: Set<string>, production = false): string {
    return signals.map(s => {
        // If initial expr references a prop, read it with .peek() (string/key-aware)
        const initExpr = rewritePropPeeks(s.initialExpr, propNames);
        // Production: strip debug name for smaller output
        if (production) {
            return `    const __${s.name} = signal(${initExpr});`;
        }
        const baseName = filename.replace(/\.pdx$/, '').split('/').pop() ?? '';
        return `    const __${s.name} = signal(${initExpr}, { name: '${baseName}:${s.name}' });`;
    }).join('\n');
}


/**
 * Generate derived (computed) declarations.
 * const doubled = $derived(count * 2) → const doubled = computed(() => __count() * 2);
 *
 * Signals are rewritten with __ prefix: count → __count()
 * Other deriveds are called without prefix: userData → userData()
 */
export function generateDerivedDeclarations(
    deriveds: { name: string; expr: string }[],
    signalNames: Set<string>,
    derivedNames?: Set<string>,
    filename = '',
    production = false,
): string {
    // The same debug name a `$signal` gets, for the same reason: without it a computed is an
    // anonymous function in every reading `__pdx_debug` gives, so «what does this depend on» and
    // «who is subscribed to that» answer with lists of `(anonymous)`. Stripped in production, like
    // the signals'.
    const baseName = filename.replace(/\.pdx$/, '').split('/').pop() ?? '';
    const debugArg = (name: string): string =>
        production || !baseName ? '' : `, { name: '${baseName}:${name}' }`;
    return deriveds.map(d => {
        // Route derived reads through the TS-AST rewriter (same path as the setup body):
        // signals → __name(), other callables (deriveds + props) → name(). The AST natively
        // handles spread (`[...items]`), spaceless ternaries (`cond ? on: off`), generics,
        // strings and comments — a regex mishandles all of these.
        // Wrap in parens so the fragment parses as an EXPRESSION (a bare `{ a: x }` would
        // otherwise parse as a block); strip the wrapper back off afterwards.
        const callables = new Set(derivedNames ?? []);
        callables.delete(d.name); // a derived never reads itself
        const wrapped = rewriteAst(`(${d.expr})`, signalNames, callables, '__derived.ts');
        const expr = wrapped.startsWith('(') && wrapped.endsWith(')')
            ? wrapped.slice(1, -1)
            : d.expr;
        const trimmedExpr = expr.trimStart();

        // If expr is already an arrow function, pass it directly to computed()
        // $derived(() => count * 2) → computed(() => __count() * 2), NOT computed(() => () => ...)
        //
        // Asked of the AST, not of a pattern. `/^\(.*\)\s*=>/` answers yes for anything that
        // merely CONTAINS an arrow after a parenthesis: `.*` is greedy and crosses nested
        // structure, so `(docs ?? []).filter((d) => d.k)` matches from its first `(` to the `)`
        // after `d`, and the whole expression would go to computed() naked. `computed(value)` instead
        // of `computed(() => value)` throws `fn is not a function` on the first read, from inside
        // recompute, with a stack that names the reader and not this line.
        if (isArrowFunction(trimmedExpr)) {
            return `    const ${d.name} = computed(${expr}${debugArg(d.name)});`;
        }

        // Wrap object literals in parens: computed(() => ({...})) not computed(() => {...})
        const looksLikeObject = trimmedExpr.startsWith('{') &&
            /^\{\s*\w+\s*:/.test(trimmedExpr);
        const wrappedExpr = looksLikeObject ? `(${expr})` : expr;
        return `    const ${d.name} = computed(() => ${wrappedExpr}${debugArg(d.name)});`;
    }).join('\n');
}

/**
 * Generate the auto-return object from exports list.
 */
export function generateAutoReturn(exports: { name: string; kind: string }[]): string {
    if (exports.length === 0) return '';
    const entries = exports.map(e => {
        if (e.kind === 'signal') return `${e.name}: __${e.name}`;
        return e.name;
    });
    return `    return { ${entries.join(', ')} };`;
}

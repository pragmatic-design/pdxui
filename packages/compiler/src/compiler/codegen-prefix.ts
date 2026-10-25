// Template expression prefix — adds ctx. to bare identifiers.
// Extracted from codegen-template.ts for modularity.
// All state is passed via CompileContext — no module-level mutable variables.

import ts from 'typescript';
import { skipNonCode, findClosing } from './tokenizer';
import type { CompileContext } from './compile-context';
import { jsQuote } from './js-literal';
import { isAssertionOperator, skipAssertedType } from './asserted-type';

// ─── Signal call insertion ──────────────────────────────────────

/**
 * Convert ctx.name → ctx.name() for signal reads (skip non-signals).
 *
 * A `$signal` (state, `ctx.stateSignalNames`) also follows the script's rules (#187): in callee
 * position it is read, then called — `ctx.handler(a)` → `ctx.handler()(a)`, the stored function —
 * and `ctx.x.peek(` / `ctx.x.setRaw(` reach the signal itself. Any other name followed by `(` is
 * left as it is: a function, a derived or a prop called by the author.
 */
export function callSignals(expr: string, ctx: CompileContext): string {
    // Match: ctx.<name>, and what follows it when that is a call or a signal method call.
    // Groups: [1]=name [2]=`(` or `.peek(`/`.setRaw(` with the spaces before it
    return expr.replace(/ctx\.([\w$]+)(?![\w$])(\s*\(|\.(?:peek|setRaw)\s*\()?/g, (match, name: string, after?: string) => {
        if (ctx.nonSignalNames?.has(name)) return match;
        const state = ctx.stateSignalNames?.has(name) ?? false;
        if (after === undefined) return `ctx.${name}()`;
        if (after.trimStart().startsWith('(')) return state ? `ctx.${name}()${after}` : match;
        // `.peek(` / `.setRaw(`: the signal's own method on state, the value's member otherwise.
        return state ? match : `ctx.${name}()${after}`;
    });
}

/**
 * `{{ value | upper | money('EUR') }}` as core's value chain, `templatePipe(value, …)`, shared by both
 * render paths (#199). A pipe is a function the script declares (`ctx.upper`) or imports (`upper`, as
 * written); one with arguments is called with the value first, `(v) => ctx.money(v, 'EUR')`, its
 * arguments read like any template expression. `value` is already read (signals called).
 */
export function pipeChain(value: string, pipes: string[], ctx: CompileContext): string {
    const fns = pipes.map((pipe) => {
        // Match: a pipe name, and its argument list when it has one. Groups: [1]=name [2]=arguments
        const m = /^([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?$/.exec(pipe.trim());
        if (!m) return `ctx.${pipe.trim()}`;
        const fn = ctx.importedNames?.has(m[1]) && !ctx.declaredNames?.has(m[1]) ? m[1] : `ctx.${m[1]}`;
        if (m[2] === undefined) return fn;
        return `(v) => ${fn}(v, ${callSignals(prefixCtx(m[2], ctx), ctx)})`;
    });
    return `templatePipe(${value}, ${fns.join(', ')})`;
}

// ─── @for scope ─────────────────────────────────────────────────

/** True when a @for binds a plain identifier — not a destructuring — so it can be a row getter. */
export function isRowBinding(node: { item: string }): boolean {
    return /^[A-Za-z_$][\w$]*$/.test(node.item.trim());
}

/**
 * The names a @for binding introduces: the identifier itself, or every name a destructuring pattern
 * binds (`{ id, user: { name } }` → id, name). Put in scope as ONE name, the text
 * `{ id, user: { name } }`, the pattern would match no reference in the body, and `{{ name }}` would
 * compile to `ctx.name`.
 */
export function bindingNames(binding: string): string[] {
    const text = binding.trim();
    if (isRowBinding({ item: text })) return [text];
    const source = ts.createSourceFile('binding.ts', `(${text}) => 0`, ts.ScriptTarget.Latest, false);
    const names: string[] = [];
    const collect = (name: ts.BindingName): void => {
        if (ts.isIdentifier(name)) { names.push(name.text); return; }
        for (const element of name.elements) {
            if (!ts.isOmittedExpression(element)) collect(element.name);
        }
    };
    const statement = source.statements[0];
    if (statement && ts.isExpressionStatement(statement) && ts.isArrowFunction(statement.expression)) {
        for (const parameter of statement.expression.parameters) collect(parameter.name);
    }
    return names;
}

/**
 * The key argument of the each()/eachRow() a @for compiles to. `track item.field` on a plain binding
 * is the field's name; anything else is a key function over the raw item and index, resolved like
 * every other template expression: the loop's own names stay local, the component's get `ctx.`.
 * Pasted as written, `track keyOf(doc)` with `keyOf` in the setup would throw
 * `ReferenceError: keyOf is not defined` and the list would never render.
 */
export function trackKeyArg(node: { item: string; index?: string; track: string }, ctx: CompileContext): string {
    if (isRowBinding(node)) {
        const field = node.track.match(new RegExp(`^${node.item}\\.(\\w+)$`));
        if (field) return jsQuote(field[1]);
    }
    const params = node.index ? `${node.item}, ${node.index}` : node.item;
    // The key function receives values, not row getters: in scope as plain locals.
    const key = withLoopScope(node, false, ctx, () => callSignals(prefixCtx(node.track, ctx), ctx));
    return `(${params}) => ${key}`;
}

/**
 * Generate a @for body with its item and index in scope: as row getters (`item()`, eachRow) when
 * `rows`, as plain locals otherwise. Membership is RESTORED afterwards rather than deleted, so an
 * inner loop reusing an outer loop's name does not take it out of scope for the rest of the outer
 * body.
 */
export function withLoopScope<T>(
    node: { item: string; index?: string },
    rows: boolean,
    ctx: CompileContext,
    generate: () => T,
): T {
    const names = [...bindingNames(node.item), ...(node.index ? [node.index] : [])];
    const before = names.map(n => ({ n, scope: ctx.scopeVars.has(n), row: ctx.rowVars.has(n) }));
    for (const n of names) {
        ctx.scopeVars.add(n);
        if (rows) ctx.rowVars.add(n); else ctx.rowVars.delete(n);
    }
    try {
        return generate();
    } finally {
        for (const { n, scope, row } of before) {
            if (scope) ctx.scopeVars.add(n); else ctx.scopeVars.delete(n);
            if (row) ctx.rowVars.add(n); else ctx.rowVars.delete(n);
        }
    }
}

/**
 * Generate an error-boundary body — `@catch (error, retry)`, `@await … @error (error, retry)` — with
 * its two names in scope as plain locals. Without them, any name the compiler does not already leave
 * unprefixed compiled to `ctx.<name>`: `@catch (problem)` read `ctx.problem()` (#201).
 */
export function withBoundaryScope<T>(errorVar: string, retryVar: string, ctx: CompileContext, generate: () => T): T {
    return withLoopScope({ item: errorVar, index: retryVar }, false, ctx, generate);
}

/**
 * Generate a snippet's body (#489) with its parameters in scope as plain locals: the values its
 * caller passes, not a @for's row getters, and not `ctx.<name>`. Membership is restored afterwards.
 */
export function withPlainLocals<T>(names: readonly string[], ctx: CompileContext, generate: () => T): T {
    const before = names.map(n => ({ n, scope: ctx.scopeVars.has(n), row: ctx.rowVars.has(n) }));
    for (const n of names) { ctx.scopeVars.add(n); ctx.rowVars.delete(n); }
    try {
        return generate();
    } finally {
        for (const { n, scope, row } of before) {
            if (scope) ctx.scopeVars.add(n); else ctx.scopeVars.delete(n);
            if (row) ctx.rowVars.add(n); else ctx.rowVars.delete(n);
        }
    }
}

// ─── ctx. prefix logic ──────────────────────────────────────────

/**
 * Prefix bare identifiers with ctx. — token-aware.
 * Walks the expression character by character, understanding:
 * - String literals and comments (skipped entirely)
 * - Template literals: the text as written, each `${…}` prefixed as an expression (#371)
 * - Arrow function params (tracked as local vars, not prefixed)
 * - Property access after . (not prefixed)
 * - JS keywords and known globals (not prefixed)
 *
 * `outerLocals`: the names an enclosing expression binds, for a template literal's `${…}`.
 */
export function prefixCtx(expr: string, ctx: CompileContext, outerLocals?: Set<string>): string {
    if (expr.startsWith('ctx.')) return expr;

    let result = '';
    let pos = 0;
    const localVars = new Set<string>(outerLocals);
    // Per bracket-depth count of pending ternary `?`. A `:` at a depth with a pending
    // `?` is the ternary's colon, NOT an object-key colon — so the identifier before
    // it (the `then` branch) must still be prefixed.
    const ternary: number[] = [0];
    // What each open bracket is: an object literal `{`, a block `{` (an arrow body, or after `)`
    // / `;` in a multi-statement handler), or `(` / `[`. A shorthand property is only possible
    // directly inside an object literal.
    const brackets: ('obj' | 'block' | '(' | '[')[] = [];

    while (pos < expr.length) {
        const ch = expr[pos];

        // A template literal: its text as written, its substitutions read like the expression
        // around them (#371). Skipped whole, `${label}` read a bare name the render does not have.
        if (ch === '`') {
            const end = prefixTemplateLiteral(expr, pos, ctx, localVars);
            result += end.text;
            pos = end.pos;
            continue;
        }

        // Skip strings/comments entirely (using shared tokenizer)
        const nonCodeEnd = skipNonCode(expr, pos);
        if (nonCodeEnd !== null) {
            result += expr.slice(pos, nonCodeEnd);
            pos = nonCodeEnd;
            continue;
        }

        // Track bracket depth for ternary scoping
        if (ch === '(' || ch === '[' || ch === '{') {
            // Detect arrow function params: (x, y) => ... — add params to localVars
            if (ch === '(' && expr.includes('=>', pos)) {
                const closeIdx = findClosing(expr, pos);
                if (closeIdx > pos && expr.slice(closeIdx + 1).trimStart().startsWith('=>')) {
                    const params = expr.slice(pos + 1, closeIdx);
                    for (const p of params.split(',')) {
                        const name = p.trim().replace(/[=:].*/, '').replace(/[{}[\]]/g, '').trim();
                        if (name && /^[a-zA-Z_$][\w$]*$/.test(name)) localVars.add(name);
                    }
                }
            }
            ternary.push(0);
            brackets.push(ch === '{' ? braceKind(expr, pos) : ch);
            result += ch;
            pos++;
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            if (ternary.length > 1) ternary.pop();
            brackets.pop();
            result += ch;
            pos++;
            continue;
        }
        // Ternary `?` (not `?.` optional chaining, not `??` nullish)
        if (ch === '?' && expr[pos + 1] !== '.' && expr[pos + 1] !== '?') {
            ternary[ternary.length - 1]++;
            result += ch;
            pos++;
            continue;
        }
        // A `:` that closes a pending ternary at this depth
        if (ch === ':' && expr[pos + 1] !== ':' && ternary[ternary.length - 1] > 0) {
            ternary[ternary.length - 1]--;
            result += ch;
            pos++;
            continue;
        }

        // Identifier token
        if (/[a-zA-Z_$]/.test(ch)) {
            const start = pos;
            while (pos < expr.length && /[\w$]/.test(expr[pos])) pos++;
            const id = expr.slice(start, pos);

            // `x as Resource<User[]>`: the type is copied as written, not prefixed — the module's
            // types are erased (#145).
            if (isAssertionOperator(expr, id, start, pos)) {
                const end = skipAssertedType(expr, pos);
                result += expr.slice(start, end);
                pos = end;
                continue;
            }

            // Arrow single-param without parens: `x => x.name`. The `(…) =>` form is
            // detected at the paren branch above, but a bare-identifier param never opens a
            // paren — so register it as scope-local here (else `x` gets prefixed to `ctx.x`,
            // producing `ctx.x() => …` = invalid module). Lookahead for `<id> =>`.
            if (/^\s*=>/.test(expr.slice(pos))) {
                localVars.add(id);
                result += id;
                continue;
            }

            const prevChar = start > 0 ? expr[start - 1] : '';
            // Spread: the identifier after `...` is NOT a property access —
            // the third dot would fool the prevChar === '.' check and the name would
            // never be prefixed ([...items] → a ReferenceError at runtime).
            const isSpread = prevChar === '.' && start >= 3 &&
                expr[start - 2] === '.' && expr[start - 3] === '.';
            // Check if this is an object key: identifier followed by : (not ::),
            // and NOT a ternary `then`-branch colon at the current depth.
            const afterId = expr.slice(pos).match(/^\s*:/);
            const followedByTernaryColon = !!afterId && ternary[ternary.length - 1] > 0;
            const isObjectKey = !!afterId && expr[pos + (afterId[0].length)] !== ':' && !followedByTernaryColon;
            // `{ productId, n }`: the name is both the key and the value. Prefixed in place it
            // becomes `{ ctx.productId() }` — invalid JS, and the module fails to load.
            // Written out as `key: value` the value takes whatever a bare reference would.
            const isShorthand = brackets[brackets.length - 1] === 'obj'
                && /[{,]\s*$/.test(expr.slice(0, start))
                && /^\s*[,}]/.test(expr.slice(pos));

            // The fallback loop vars (item, error, e, ...) are skipped ONLY when the
            // component declares no name of its own like them — otherwise a signal `error`
            // declared in the setup would be unreachable from the template.
            // A @for row getter (eachRow): the reference reads the row's CURRENT item, `item()`,
            // unless it is shadowed by a local (an arrow param of the same name) or is not a
            // reference at all (a property after `.`, an object key).
            if (ctx.rowVars.has(id) && !localVars.has(id) && !(prevChar === '.' && !isSpread) && !isObjectKey) {
                result += isShorthand ? `${id}: ${id}()` : `${id}()`;
                continue;
            }
            const skipAsFallbackVar = LOOP_VAR_FALLBACK.has(id) && !ctx.declaredNames?.has(id);
            // A global yields to a name the component declares, like the fallback list above: else a
            // setup `function confirm()` called from a handler would compile to window.confirm.
            const skipAsGlobal = GLOBAL_NAMES.has(id) && !ctx.declaredNames?.has(id);
            // An import is a module-scope binding, and the template is compiled into the same
            // module: it is reached as it is. `ctx.toggleDarkMode()` would throw on click, because the
            // context holds what the setup returns and imports are never in it. Same
            // yield as a global: a name the component declares is its own.
            const skipAsImport = !!ctx.importedNames?.has(id) && !ctx.declaredNames?.has(id);
            const skip = (prevChar === '.' && !isSpread)
                || isObjectKey
                || NEVER_PREFIX.has(id)
                || skipAsGlobal
                || skipAsImport
                || skipAsFallbackVar
                || localVars.has(id)
                || ctx.scopeVars.has(id);
            if (skip) {
                result += id;
            } else {
                result += isShorthand ? `${id}: ctx.${id}` : `ctx.${id}`;
            }
            continue;
        }

        result += ch;
        pos++;
    }

    return result;
}

/**
 * The template literal opening at `start` (a backtick), with each `${…}` prefixed as an expression
 * that sees `locals`, and the index past its closing backtick. An unterminated literal is copied to
 * the end of `expr`, as the tokenizer reads it.
 */
function prefixTemplateLiteral(expr: string, start: number, ctx: CompileContext, locals: Set<string>): { text: string; pos: number } {
    let text = '`';
    let i = start + 1;
    while (i < expr.length) {
        const c = expr[i];
        if (c === '\\') { text += expr.slice(i, i + 2); i += 2; continue; }
        if (c === '`') return { text: text + '`', pos: i + 1 };
        if (c === '$' && expr[i + 1] === '{') {
            const close = findClosing(expr, i + 1);
            if (close === -1) break;
            text += '${' + prefixCtx(expr.slice(i + 2, close), ctx, locals) + '}';
            i = close + 1;
            continue;
        }
        text += c;
        i++;
    }
    return { text: text + expr.slice(i), pos: expr.length };
}

/**
 * Whether the `{` at `pos` opens a block or an object literal. Template expressions hold no
 * statement blocks except an arrow body (`=> {`) and the bodies of a multi-statement handler
 * (`if (x) {`, after `;`), so a brace anywhere else — after `(`, `,`, `=`, `:`, `?`, `[`,
 * `return`, an operator, or at the start — is an object: `() => ({ a })` is one, `() => { a }` is
 * not.
 */
function braceKind(expr: string, pos: number): 'obj' | 'block' {
    const before = expr.slice(0, pos).trimEnd();
    if (before.endsWith('=>') || before.endsWith(')') || before.endsWith(';')) return 'block';
    if (/\b(else|try|finally|do)$/.test(before)) return 'block';
    return 'obj';
}

// ─── Skip-prefix list ───────────────────────────────────────────

/** Identifiers that are never prefixed: keywords, literals, and the template's own context names.
 *  None of them is a name a setup can meaningfully declare. */
const NEVER_PREFIX = new Set([
    // JS keywords & literals
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'if', 'else', 'for', 'while', 'return', 'const', 'let', 'var', 'function',
    'new', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'this',
    // An async handler's (#675): prefixed, `await go()` was `ctx.await() ctx.go()`.
    'async', 'await',
    // Template context
    'ctx',
    // Inline event handler: the event is exposed as $event (Vue-style)
    '$event',
]);

/** Globals and framework helpers a template may call directly (`@click="alert('hi')"`). Not
 *  prefixed, UNLESS the component declares the same name: then the template means its own. */
const GLOBAL_NAMES = new Set([
    // Built-in globals
    'Math', 'Date', 'JSON', 'console', 'window', 'document', 'globalThis',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Promise', 'Error', 'RegExp', 'Symbol', 'BigInt',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    // Browser globals (usable directly in template handlers, e.g. @click="alert('hi')")
    'alert', 'confirm', 'prompt', 'fetch', 'structuredClone',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
    'localStorage', 'sessionStorage', 'navigator', 'location', 'history',
    'URL', 'URLSearchParams', 'FormData', 'Intl',
    'signal', 'computed', 'effect', 'batch', 'ref',
    // i18n helpers (global imports, not ctx properties)
    '$t', '$n', '$d', '$r',
]);

/** Common loop/callback vars: NOT prefixed, as a historical fallback, BUT a name
 *  declared in the setup that matches one of these has to win. */
const LOOP_VAR_FALLBACK = new Set([
    'item', 'index', 'i', 'e', 'v', 'el', 'prev', 'n', 'k',
    'error', 'err', 'retry',
]);

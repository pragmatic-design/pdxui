// What a template's attributes compile to, for the inline render path: event handlers, a two-way
// accessor, the `dynamic(…)` call of a `<component :is>` and the `renderSlot(…)` call of a scoped slot
// outlet. The html`` rewrite this file was named for is gone (#526).

import type { CompileContext } from './compile-context';
import { prefixCtx, callSignals } from './codegen-prefix';
import { splitAtDepthZero } from './tokenizer';
import { jsQuote } from './js-literal';

// ─── Event handler building ──────────────────────────────────────
//
// PDX aims to match (or beat) the event ergonomics of Vue/Svelte/Solid. An @event value can be:
//   • a function reference        @click="inc"            → ctx.inc            (the event is the 1st arg)
//   • a method call               @click="save(item)"     → () => ctx.save(ctx.item)
//   • an inline signal mutation   @click="count++"        → () => ctx.count.set(v => v + 1)
//                                 @click="open = !open"   → () => ctx.open.set(!ctx.open())
//   • an arrow / lambda           @input="e => name = e.target.value"
//   • multiple statements         @click="count++; touched = true"
//   • the raw event via $event    @click="select($event.detail)"   (Vue-style)
// Modifiers (.prevent/.stop/.once/.self/.capture/.passive + key filters) are handled at runtime.

// A plain reference: identifier or member access, no operators/calls → passed as a function ref.
const BARE_REF = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
// An arrow function: `(a, b) => …`, `e => …`, `() => …`. Groups: [1]=params (with/without parens) [2]=body
// One level of nested parentheses in the params is supported (a default with a call).
// The body starts at a non-space, so it cannot share the spaces before it with `\s*` (#461, CodeQL
// js/polynomial-redos): every caller trims, so the captures are the ones `\s*([\s\S]+)` gave.
const ARROW = /^(\((?:[^()]|\([^()]*\))*\)|[A-Za-z_$][\w$]*)\s*=>\s*(\S[\s\S]*)$/;
// count++ / ++count / count-- / --count
const INC_DEC = /^(?:(\+\+|--)\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(\+\+|--))$/;
// count = x | count += x | count -= x | count *= x | count /= x | count %= x  (= not ==)
// | count ||= x | count &&= x | count ??= x.  Groups: [1]=name [2]=operator [3]=right side,
// from its first non-space, as ARROW's body.
const ASSIGN = /^([A-Za-z_$][\w$]*)\s*(=(?!=)|\+=|-=|\*=|\/=|%=|\|\|=|&&=|\?\?=)\s*(\S[\s\S]*)$/;

/**
 * Build the JS for an @event handler value (see the table above). Falls into one of:
 *  reference · arrow (pass-through) · single mutation · single expression · multi-statement block.
 * Without this, `@click="count++"` would compile to `safeHandler(ctx.count++)` — evaluated once
 * at bind time, clobbering the signal; arrows would be double-wrapped; `$event` unavailable.
 *
 * Every handler runs inside `batch()` (#114, the owner's decision): writes outside it flush one by
 * one, so a handler writing three signals ran an effect reading them three times, twice on a state
 * half written. Core's `batchHandler` does it, once per module import rather than spelled out at
 * every handler, keeping the call's `this` and its return value — `safeHandler` reads the promise
 * an async handler returns to route its rejection. Both render paths call this builder; the caller
 * imports `batchHandler`.
 */
export function buildEventHandler(expr: string, ctx: CompileContext): string {
    return `batchHandler(${unbatchedHandler(expr, ctx)})`;
}

/**
 * A @for row's handler, declared once for every row (#375): the same handler, taking after the event
 * the scope the row stores with it — `names`, the names in scope where it is written, as one value
 * when there is one and as an array when there are more. Core's `delegate` passes it.
 */
export function buildScopedEventHandler(expr: string, ctx: CompileContext, names: string[]): string {
    const scope = names.length === 1 ? names[0] : `[${names.join(',')}]`;
    return `batchHandler((__e,${scope})=>(${unbatchedHandler(expr, ctx)})(__e))`;
}

/** The handler itself, before `buildEventHandler` puts it inside `batch()`. */
function unbatchedHandler(expr: string, ctx: CompileContext): string {
    const e = expr.trim();

    // 0. No handler: `@click.stop` is there for its modifiers, and does nothing else. Written as
    //    `() => ` it was a module that did not parse.
    if (e === '') return '() => {}';

    // 1. Bare reference → function reference (the event is passed as the first argument).
    if (BARE_REF.test(e)) return prefixCtx(e, ctx);

    // 2. Arrow / lambda → keep the function; rewrite its body (params stay local).
    const arrow = rewriteArrow(e, ctx);
    if (arrow !== null) return arrow;

    // 3. Inline statement(s). One statement → tight arrow; many → block. The event is `$event`.
    const stmts = splitAtDepthZero(e, ';').map(s => s.trim()).filter(Boolean);
    if (stmts.length > 1) {
        return `($event) => { ${stmts.map(s => rewriteStatement(s, ctx)).join('; ')} }`;
    }
    const single = stmts[0] ?? e;
    const body = signalMutation(single, ctx) ?? callSignals(prefixCtx(single, ctx), ctx);
    // Expose $event only when referenced, so simple handlers stay as `() => …`.
    return /\$event\b/.test(single) ? `($event) => ${body}` : `() => ${body}`;
}

/**
 * The general two-way form, `::x="{ get: () => …, set: (v) => … }"` (#126), with each function
 * rewritten as a handler's: reads of a signal are calls, an assignment in `set` writes the signal
 * (`cents = …` → `ctx.cents.setRaw(…)`). Null when `expr` is not an object with `get` and `set`.
 */
export function rewriteTwoWayAccessor(expr: string, ctx: CompileContext): string | null {
    const e = expr.trim();
    if (!e.startsWith('{') || !e.endsWith('}')) return null;
    const fields = new Map<string, string>();
    for (const entry of splitAtDepthZero(e.slice(1, -1), ',').map(s => s.trim()).filter(Boolean)) {
        // Match: `get: <value>` / `set: <value>`. Groups: [1]=key [2]=value
        const m = /^(get|set)\s*:\s*(\S[\s\S]*)$/.exec(entry);
        if (!m) return null;
        fields.set(m[1], m[2]);
    }
    const get = fields.get('get');
    const set = fields.get('set');
    if (get === undefined || set === undefined) return null;
    const fn = (value: string): string => rewriteArrow(value, ctx) ?? callSignals(prefixCtx(value, ctx), ctx);
    return `{ get: ${fn(get)}, set: ${fn(set)} }`;
}

/**
 * An arrow function written in a handler, with its body rewritten as handler statements (its
 * parameters stay local), or null when `expr` is not one. Used for a handler that IS an arrow and
 * for an arrow a handler assigns to a `$signal` (`onSave = () => count++`, #187).
 */
function rewriteArrow(expr: string, ctx: CompileContext): string | null {
    const arrow = ARROW.exec(expr);
    if (!arrow) return null;
    const [, params, body] = arrow;
    const names = paramNames(params);
    const block = body.trimStart().startsWith('{');
    const inner = block ? body.trim().slice(1, -1) : body;
    const rewritten = rewriteStatements(inner, ctx, names);
    return `${params} => ${block ? `{ ${rewritten} }` : rewritten}`;
}

/** Extract identifier names from an arrow param list (`(a, b)` or `a`); destructuring is skipped. */
function paramNames(params: string): string[] {
    return params.replace(/^\(|\)$/g, '').split(',')
        .map(p => p.trim().replace(/[=:].*/, '').replace(/[{}[\]]/g, '').trim())
        .filter(p => /^[A-Za-z_$][\w$]*$/.test(p));
}

/** Rewrite `;`-separated statements, treating `extraLocals` (e.g. arrow params) as non-signals. */
function rewriteStatements(code: string, ctx: CompileContext, extraLocals: string[] = []): string {
    const added = extraLocals.filter(n => !ctx.scopeVars.has(n));
    added.forEach(n => ctx.scopeVars.add(n));
    try {
        return splitAtDepthZero(code, ';').map(s => s.trim()).filter(Boolean)
            .map(s => rewriteStatement(s, ctx)).join('; ');
    } finally {
        added.forEach(n => ctx.scopeVars.delete(n));
    }
}

/** One statement: a bare-identifier signal mutation → `ctx.x.set(...)`, else a prefixed expression. */
function rewriteStatement(stmt: string, ctx: CompileContext): string {
    return signalMutation(stmt, ctx) ?? callSignals(prefixCtx(stmt, ctx), ctx);
}

/**
 * Rewrite a bare-identifier mutation, or null if not a mutation. An update (`++`, `--`, `+=` …)
 * keeps the updater form, `ctx.name.set(v => …)`; an assignment (`=`, `||=`, `&&=`, `??=`) stores
 * its value as it is, `ctx.name.setRaw(…)`, so a function is kept rather than called as an updater
 * (#187). An arrow on the right side has its body rewritten like a handler's.
 */
function signalMutation(expr: string, ctx: CompileContext): string | null {
    let m = INC_DEC.exec(expr);
    if (m) {
        const name = m[2] || m[3];
        const delta = (m[1] || m[4]) === '++' ? '+ 1' : '- 1';
        return `ctx.${name}.set(v => v ${delta})`;
    }
    m = ASSIGN.exec(expr);
    if (m) {
        const [, name, op, rawRhs] = m;
        const raw = rawRhs.trim();
        const rhs = rewriteArrow(raw, ctx) ?? callSignals(prefixCtx(raw, ctx), ctx);
        if (op === '=') return `ctx.${name}.setRaw(${rhs})`;
        const logical = LOGICAL[op];
        if (logical) return `(ctx.${name}() ${logical} ctx.${name}.setRaw(${rhs}))`;
        return `ctx.${name}.set(v => v ${op[0]} (${rhs}))`;
    }
    return null;
}

/** The logical assignment operators, by the short-circuit operator each stands for. */
const LOGICAL: Record<string, string> = { '||=': '||', '&&=': '&&', '??=': '??' };

// ─── Dynamic Component ───────────────────────────────────────────

/**
 * The `dynamic(…)` call a `<component :is="expr" …>` tag stands for, or null without `:is`. Shared by
 * both render paths, so the inline one makes the same component with the same keep-alive cache (#200).
 */
export function dynamicComponentCall(tag: string, ctx: CompileContext): string | null {
    const isMatch = tag.match(/:is=(?:"([^"]*?)"|'([^']*?)')/);
    if (!isMatch) return null;

    const tagExpr = isMatch[1] ?? isMatch[2];
    const tagCode = callSignals(prefixCtx(tagExpr, ctx), ctx);

    // Extract other :prop bindings — kebab-case included (else :item-template would be
    // dropped in silence) and camelised for dynamic()'s props object.
    const propBindings: string[] = [];
    const propRegex = /:([\w-]+)=(?:"([^"]*?)"|'([^']*?)')/g;
    let match;
    while ((match = propRegex.exec(tag)) !== null) {
        const propName = match[1];
        const propExpr = match[2] ?? match[3];
        if (propName !== 'is') {
            const camelName = propName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
            propBindings.push(`${camelName}: ${callSignals(prefixCtx(propExpr, ctx), ctx)}`);
        }
    }

    const propsArg = propBindings.length > 0
        ? `() => ({ ${propBindings.join(', ')} })`
        : 'null';

    // Extract options: @keepAlive, @transition, @mode
    const optionParts: string[] = [];

    if (tag.includes('@keepAlive') || tag.includes('keep-alive')) {
        // `@keepAlive(n)`: at most n views kept, the least recently shown dropped first (#270). Without
        // it the runtime's default, 10. Match: `@keepAlive(…)`. Groups: [1]=what is inside.
        const max = tag.match(/@keepAlive\s*\(\s*([^)]*?)\s*\)/);
        if (max && /^[1-9]\d*$/.test(max[1])) {
            optionParts.push(`keepAlive: true, maxAlive: ${max[1]}`);
        } else {
            if (max) {
                ctx.warnings.push({
                    code: 'PDX_KEEPALIVE_MAX',
                    severity: 'error',
                    message: `"${max[0]}": the maximum of kept-alive views is a whole number of at least 1.`,
                    hint: 'Write @keepAlive(3) for three views, or @keepAlive alone for the default of 10.',
                });
            }
            optionParts.push('keepAlive: true');
        }
    }

    const transMatch = tag.match(/@transition\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/);
    if (transMatch) {
        optionParts.push(`transition: { enter: ${jsQuote(transMatch[1])}, exit: ${jsQuote(transMatch[2] ?? transMatch[1])} }`);
    }

    const modeMatch = tag.match(/@mode\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (modeMatch) {
        optionParts.push(`mode: ${jsQuote(modeMatch[1])}`);
    }

    const optionsArg = optionParts.length > 0
        ? `, { ${optionParts.join(', ')} }`
        : '';

    return `dynamic(() => ${tagCode}, ${propsArg}${optionsArg})`;
}

// ─── Scoped Slot ─────────────────────────────────────────────────

/**
 * The `renderSlot(…)` call for a scoped slot outlet opened by `tag`:
 * `<slot name="cell" :row="row">` → `renderSlot(ctx.__slots, 'cell', () => ({ row }), fallback)`.
 * Shared by both render paths, so they cannot disagree about the name or the scope (#200). The
 * fallback — `fallback`, a function building the outlet's body — is generated by the caller from the
 * parser's `scoped-slot` node, each path its own way: it is a list of nodes, not text scanned for a
 * `</slot>` that an interpolation or a block had cut off (#276).
 */
export function scopedSlotCall(tag: string, fallback: string, ctx: CompileContext): string {
    const nameMatch = tag.match(/name=(?:"([^"]*?)"|'([^']*?)')/);
    const slotName = nameMatch ? (nameMatch[1] ?? nameMatch[2]) : 'default';

    const scopeBindings: string[] = [];
    const bindingRegex = /:([\w]+)=(?:"([^"]*?)"|'([^']*?)')/g;
    let match;
    while ((match = bindingRegex.exec(tag)) !== null) {
        const propName = match[1];
        const expr = match[2] ?? match[3];
        scopeBindings.push(`${propName}: ${callSignals(prefixCtx(expr, ctx), ctx)}`);
    }

    const scopeArg = scopeBindings.length > 0
        ? `() => ({ ${scopeBindings.join(', ')} })`
        : 'null';

    return `renderSlot(ctx.__slots, ${jsQuote(slotName)}, ${scopeArg}, ${fallback})`;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Find the closing > of a tag, skipping quoted attribute values. */
export function findTagEnd(str: string, start: number): number {
    let inQuote = false;
    let quoteChar = '';
    let braceDepth = 0;   // inside a ${ ... } interpolation
    for (let i = start + 1; i < str.length; i++) {
        if (inQuote) {
            if (str[i] === quoteChar) inQuote = false;
            continue;
        }
        // Unquoted `${...}` interpolations (e.g. injected form/event bindings like
        // :error=${() => ...}) contain '>' inside arrow functions (`=>`); those must NOT be
        // mistaken for the tag end, otherwise the tag is truncated and later bindings spill
        // out as escaped text. Track brace depth and skip everything inside the interpolation.
        if (braceDepth > 0) {
            if (str[i] === '{') braceDepth++;
            else if (str[i] === '}') braceDepth--;
            continue;
        }
        if (str[i] === '$' && str[i + 1] === '{') { braceDepth++; i++; continue; }
        if (str[i] === '"' || str[i] === "'") { inQuote = true; quoteChar = str[i]; continue; }
        if (str[i] === '>') return i;
    }
    return str.length - 1;
}

// What the inline render path (./codegen-template-inline) shares with the generator that once built a
// render as an html`` tagged template: the options of a transition, of a virtual list and of an
// `@await`, the loader of a `@defer`, the hoisting of a scoped slot's function and of a loop's
// invariant reads. That generator is gone (#526): nothing reached it after the legacy mode (#158).
// All state is passed via CompileContext — no module-level mutable variables.

import type { ForNode, TransitionConfig, AwaitNode, SlotTemplateNode } from '../parser/template';
import type { CompileContext } from './compile-context';
import { jsQuote, jsString } from './js-literal';
import { virtualRowTag } from './validate-virtual';

/**
 * The options object of an `eachVirtual` call (#283): the estimate written in `@virtual(n)`, the rows'
 * tag for the spacers, getters for a plain item, and `@empty`.
 */
export function virtualOptions(node: ForNode, getters: boolean, empty: string | null): string {
    const parts = [
        node.virtual?.estimate !== undefined ? `estimate:${node.virtual.estimate}` : '',
        `tag:${jsString(virtualRowTag(node))}`,
        getters ? 'getters:true' : '',
        empty ? `empty:${empty}` : '',
    ].filter(Boolean);
    return `{${parts.join(',')}}`;
}

/**
 * Collect loop-invariant signal reads safe to hoist out of a production each() body.
 * ONLY hoists true signal/computed reads (ctx.count / ctx.count()). EXCLUDES:
 *   - ctx.el (a DOM node, not a signal → computed(()=>ctx.el()) would throw)
 *   - event handlers (referenced inside safeHandler(...) — hoisting would INVOKE them at render)
 * The remaining names are still verified to never appear in a call position other
 * than the signal-read form, so we never hoist a function that gets called.
 *
 * ⚠️ And a name the setup declares as NOT a signal is never hoisted. Inside the loop
 * body a signal passed by reference and a plain constant have the same text — `ctx.picked`,
 * `ctx.kindOptions` — so the text alone cannot tell them apart. Hoisting both as
 * `computed(() => ctx.NAME())`, the build would CALL the constant (`TypeError: e.kindOptions is not
 * a function`) and call a signal object's value where its method was meant (`block().set`), while
 * the dev server — which does not hoist — works. The hoister asks the same question `callSignals`
 * does, through `ctx.nonSignalNames`.
 */
export function extractLoopInvariants(bodyCode: string, loopVar: string, ctx: CompileContext): string[] {
    // Names used as event handlers: safeHandler(ctx.NAME, ...) or safeHandler(() => ...).
    // Capture the bare-ref form which is the dangerous one (gets invoked when hoisted).
    const handlerNames = new Set<string>();
    const handlerRe = /safeHandler\(\s*ctx\.([\w$]+)\s*,/g;
    let hm: RegExpExecArray | null;
    while ((hm = handlerRe.exec(bodyCode)) !== null) handlerNames.add(hm[1]);
    // A `:ref` target is the signal itself, written by the binding, never a read of its value:
    // `bindRef(el, ctx.NAME)`. Hoisted, the binding would receive the value (`null`) and the ref would
    // never be set (#262).
    const refRe = /bindRef\([^,]+,\s*ctx\.([\w$]+)/g;
    while ((hm = refRe.exec(bodyCode)) !== null) handlerNames.add(hm[1]);

    const reads = new Set<string>();
    const pattern = /ctx\.(\w+)(?:\(\))?/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(bodyCode)) !== null) {
        const name = m[1];
        if (name === loopVar || name === 'emit' || name === 'track') continue;
        if (name === 'el') continue;             // DOM node, not a signal
        if (handlerNames.has(name)) continue;    // event handler — never hoist/invoke
        if (ctx.nonSignalNames?.has(name)) continue; // a const/let/function/form — not reactive
        // Already hoisted by a NESTED each(): the inner loop body emitted
        // `const __li<n>_NAME = computed(() => ctx.NAME())` and rewrote its reads to it.
        // Re-hoisting at this (outer) level would replace that inner declaration's own
        // `ctx.NAME()` initializer with the shadowing name → a self-referential computed → TDZ at
        // render. Leave it to the inner loop (its computed still reads ctx.NAME() reactively). The
        // digits are the generator's counter: every line it writes lands in ONE block, so a second
        // loop in the same block cannot reuse the plain name.
        if (new RegExp(`__li\\d*_${name}\\b`).test(bodyCode)) continue;
        reads.add(name);
    }

    // Drop any name that appears in a call position other than the signal-read form
    // (i.e. ctx.NAME( with args) — those are functions, not reactive reads.
    // And any name used through a member of the signal object — `ctx.NAME.set(…)`, `.update(…)`,
    // `.peek()`: a $signal the loop WRITES is not an invariant. Hoisted, its write would become
    // `__li_NAME().set(…)`, i.e. `.set` on the value (`true.set(false)`), production only.
    return [...reads].filter(name => {
        const callRe = new RegExp(`ctx\\.${name}\\((?!\\))`);
        const memberRe = new RegExp(`ctx\\.${name}\\.`);
        return !callRe.test(bodyCode) && !memberRe.test(bodyCode);
    });
}

/**
 * `defer`'s second argument, a `loadFn`: the block loads what it renders. Passing `null` would
 * leave the components to the tag scan's STATIC import at the top of the module — which is what
 * decides the chunk, so the payload would not be deferred at all, only the render. And the static
 * import of a tag used only inside a defer is dropped (`injectComponentImports`), so with `null`
 * nothing would import it at all (#44).
 *
 * Emitted for every tag in the body, not only the ones used exclusively here: a component
 * rendered elsewhere too keeps its static import, and `import()` on an already-loaded module
 * resolves from the module cache.
 */
export function deferLoadFn(tags: string[], ctx: CompileContext): string {
    const paths = ctx.importPathOf
        ? tags.map(tag => ctx.importPathOf!(tag)).filter((p): p is string => !!p)
        : [];
    return paths.length > 0
        ? `() => Promise.all([${paths.map(p => `import(${jsQuote(p)})`).join(', ')}])`
        : 'null';
}

/** `@await`'s `{ minMs, maxMs }` as awaitBlock's last argument, or '' when neither is set. */
export function awaitTimingArg(node: AwaitNode): string {
    const opts: string[] = [];
    if (node.minMs) opts.push(`minMs:${node.minMs}`);
    if (node.maxMs) opts.push(`maxMs:${node.maxMs}`);
    return opts.length ? `{${opts.join(',')}}` : '';
}

/**
 * Hoist a scoped slot's function, whose statements `body` generates with the slot's scope variables
 * in scope as plain locals, and return the EXPRESSION that carries it (#364).
 */
export function hoistSlotFunction(node: SlotTemplateNode, imports: Set<string>, ctx: CompileContext, body: () => string): string {
    imports.add('slotCarrier');

    // The scope vars are locals inside the slot body: no ctx. prefix, and not a @for's row getters.
    // Membership is restored afterwards, as a loop's is.
    const before = node.scopeVars.map(n => ({ n, scope: ctx.scopeVars.has(n), row: ctx.rowVars.has(n) }));
    for (const v of node.scopeVars) { ctx.scopeVars.add(v); ctx.rowVars.delete(v); }
    let bodyCode: string;
    try {
        bodyCode = body();
    } finally {
        for (const { n, scope, row } of before) {
            if (scope) ctx.scopeVars.add(n); else ctx.scopeVars.delete(n);
            if (row) ctx.rowVars.add(n); else ctx.rowVars.delete(n);
        }
    }

    // Unique variable name for hoisted slot function. The slot name is not always an identifier —
    // the data grid's cell slots are `col:{field}` / `header:{field}`, others use a hyphen — and
    // `__pdxSlot_col:name_0` is not JavaScript. Only the variable is renamed;
    // the carrier below keeps the real name, and the index keeps `col:a` and `col-a` apart.
    const varName = `__pdxSlot_${node.name.replace(/[^\w$]/g, '_')}_${ctx.hoistedSlots.length}`;

    const fnCode = node.scopeVars.length === 0
        ? `const ${varName} = () => { ${bodyCode} };`
        : `const ${varName} = (__scope) => { const { ${node.scopeVars.join(', ')} } = __scope; ${bodyCode} };`;

    ctx.hoistedSlots.push([varName, fnCode]);

    return `slotCarrier(${jsQuote(node.name)}, ${varName})`;
}

/**
 * The options a `when` / `each` / `eachRow` call takes for `@transition`, `@stagger`, `@mode` and
 * `@move`, as `, { … }` to append after its last argument, or '' for a block without them (#85).
 */
export function generateTransition(config?: TransitionConfig): string {
    if (!config) return '';
    const parts: string[] = [];
    if (config.enter) parts.push(`enter: ${jsQuote(config.enter)}`);
    if (config.exit) parts.push(`exit: ${jsQuote(config.exit)}`);
    if (config.stagger) parts.push(`stagger: ${config.stagger}`);
    if (config.mode) parts.push(`mode: ${jsQuote(config.mode)}`);
    // The reconciler reads this to record positions before the mutation and play the FLIP after
    // (renderer/list.ts:172 and :299).
    if (config.move) parts.push(`move: ${jsQuote(config.move)}`);
    return `, { ${parts.join(', ')} }`;
}

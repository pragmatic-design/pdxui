// Template code generation — converts template AST nodes to html`` tagged template strings.
// Shared between new mode and legacy mode.
// All state is passed via CompileContext — no module-level mutable variables.
// HTML attribute rewriting is in codegen-template-rewrite.ts.

import type {
    TemplateNode, IfNode, ForNode, SwitchNode,
    RequireNode, InterpolationNode, TransitionConfig,
    ShowNode, PortalNode, DeferNode, TryNode, AwaitNode,
    SlotTemplateNode,
} from '../parser/template';
import type { CompileContext } from './compile-context';
import { prefixCtx, callSignals, isRowBinding, withLoopScope, trackKeyArg } from './codegen-prefix';
import { rewriteHtmlBindings, isSimpleAccess } from './codegen-template-rewrite';
import { templateMark, htmlOriginOf } from './codegen-origins';
import { jsQuote, jsString } from './js-literal';
import { escapeForTemplateLiteral } from './codegen-shared';

/** `${…}` with an origin mark just inside its `${`, where it is part of the expression, not the HTML. */
function markInterpolation(code: string, mark: string): string {
    return mark && code.startsWith('${') ? '${' + mark + code.slice(2) : code;
}

// ─── Node Generation ───────────────────────────────────────────────

/**
 * Convert an array of AST nodes into a `html\`...\`` tagged template string.
 * Buffers consecutive HTML text, flushes before each dynamic node.
 * Tracks which @pdxui/core imports are needed (when, each, match, etc).
 */
export function generateNodes(nodes: TemplateNode[], imports: Set<string>, ctx: CompileContext): string {
    if (nodes.length === 0) return 'html``';

    const parts: string[] = [];
    let htmlBuf = '';
    // Where each html node's content starts in the buffer, and the .pdx origin of its characters.
    let segments: { start: number; at: ((k: number) => number | null) | null }[] = [];

    function flushHtml() {
        if (htmlBuf) {
            const segs = segments;
            const originAt = segs.some((seg) => seg.at) ? (i: number) => {
                const seg = segs.filter((g) => g.start <= i).pop();
                return seg?.at ? seg.at(i - seg.start) : null;
            } : undefined;
            parts.push(rewriteHtmlBindings(htmlBuf, ctx, originAt));
            htmlBuf = '';
            segments = [];
        }
    }

    for (const node of nodes) {
        switch (node.type) {
            case 'html':
                if (node.raw) {
                    // @raw: escaped for the html`` literal and nothing else — no binding rewrite.
                    flushHtml();
                    parts.push(escapeForTemplateLiteral(node.content));
                    break;
                }
                segments.push({ start: htmlBuf.length, at: htmlOriginOf(ctx, node) });
                htmlBuf += node.content;
                break;
            case 'interpolation':
                flushHtml();
                parts.push(markInterpolation(generateInterpolation(node, imports, ctx), templateMark(ctx, node.exprOffset)));
                break;
            case 'if':
                flushHtml();
                parts.push(markInterpolation(generateIf(node, imports, ctx), templateMark(ctx, node.exprOffset)));
                break;
            case 'for':
                flushHtml();
                parts.push(markInterpolation(generateFor(node, imports, ctx), templateMark(ctx, node.exprOffset)));
                break;
            case 'switch':
                flushHtml();
                parts.push(generateSwitch(node, imports, ctx));
                break;
            case 'require':
                flushHtml();
                parts.push(generateRequire(node, imports, ctx));
                break;
            case 'show':
                flushHtml();
                parts.push(generateShow(node, imports, ctx));
                break;
            case 'portal':
                flushHtml();
                parts.push(generatePortal(node, imports, ctx));
                break;
            case 'defer':
                flushHtml();
                parts.push(generateDefer(node, imports, ctx));
                break;
            case 'try':
                flushHtml();
                parts.push(generateTry(node, imports, ctx));
                break;
            case 'await':
                flushHtml();
                parts.push(generateAwait(node, imports, ctx));
                break;
            case 'let': {
                // @let assigns a computed value to ctx, accessible by subsequent template nodes
                flushHtml();
                const letExpr = callSignals(prefixCtx(node.expr, ctx), ctx);
                parts.push(`\${(() => { ctx.${node.name} = ${letExpr}; return ''; })()}`);
                break;
            }
            case 'slot-template':
                flushHtml();
                parts.push(generateSlotTemplate(node, imports, ctx));
                break;
            case 'custom-directive':
                flushHtml();
                if (ctx.customDirectiveHandlers && ctx.customDirectiveHandlers.has(node.name)) {
                    const handler = ctx.customDirectiveHandlers.get(node.name)!;
                    const bodyCode = generateNodes(node.body, imports, ctx);
                    parts.push(`\${${handler.generate(node.expr, bodyCode, imports)}}`);
                } else {
                    parts.push(`<!-- unknown directive @${node.name} -->`);
                }
                break;
        }
    }
    flushHtml();

    const result = 'html`' + parts.join('') + '`';
    if (result.includes('renderSlot(')) imports.add('renderSlot');
    if (result.includes('dynamic(')) imports.add('dynamic');
    if (result.includes('errorBoundary(')) imports.add('errorBoundary');
    if (result.includes('safeHandler(')) imports.add('safeHandler');
    return result;
}

// ─── Per-Node Generators ───────────────────────────────────────────

function generateInterpolation(node: InterpolationNode, imports: Set<string>, ctx: CompileContext): string {
    const expr = prefixCtx(node.expr, ctx);

    if (node.pipes.length > 0) {
        imports.add('pipe');
        const pipeFns = node.pipes.map(p => {
            // Pipe with arguments: currency('EUR') → (v) => ctx.currency(v, 'EUR')
            const argMatch = p.match(/^(\w+)\((.+)\)$/);
            if (argMatch) return `(v) => ctx.${argMatch[1]}(v, ${argMatch[2]})`;
            // Simple pipe: uppercase → ctx.uppercase
            return `ctx.${p}`;
        }).join(', ');
        return `\${() => pipe(${expr}(), ${pipeFns})}`;
    }

    if (isSimpleAccess(node.expr, ctx)) {
        return `\${${expr}}`;
    }
    return `\${() => ${callSignals(expr, ctx)}}`;
}

function generateIf(node: IfNode, imports: Set<string>, ctx: CompileContext): string {
    if (ctx.production) {
        const cond = node.condition.trim();
        if (cond === 'true') {
            return generateNodes(node.body, imports, ctx).slice(5, -1);
        }
        if (cond === 'false') {
            if (node.elseBody) return generateNodes(node.elseBody, imports, ctx).slice(5, -1);
            return '';
        }
    }
    imports.add('when');
    const condition = callSignals(prefixCtx(node.condition, ctx), ctx);
    const thenCode = generateNodes(node.body, imports, ctx);
    const elseCode = node.elseBody ? `() => ${generateNodes(node.elseBody, imports, ctx)}` : 'null';
    const transition = generateTransition(node.transition);
    return `\${when(() => ${condition}, () => ${thenCode}, ${elseCode}${transition})}`;
}

function generateFor(node: ForNode, imports: Set<string>, ctx: CompileContext): string {
    // A plain `item` becomes a row getter (eachRow): a row reused for the same key reads its
    // current item and index. A destructured binding keeps each(): its names are
    // bound once, from the object the row was created with.
    const rows = isRowBinding(node);
    const helper = rows ? 'eachRow' : 'each';
    imports.add(helper);
    const itemsExpr = callSignals(prefixCtx(node.items, ctx), ctx);

    const keyArg = trackKeyArg(node, ctx);
    const bodyCode = withLoopScope(node, rows, ctx, () => generateNodes(node.body, imports, ctx));
    const transition = generateTransition(node.transition);
    const renderParams = node.index ? `${node.item}, ${node.index}` : node.item;
    const eachCall = `${helper}(() => ${itemsExpr}, ${keyArg}, (${renderParams}) => ${bodyCode}${transition})`;

    if (ctx.production) {
        const invariants = extractLoopInvariants(bodyCode, node.item, ctx);
        if (invariants.length > 0) {
            imports.add('computed');
            const hoisted = invariants.map(name =>
                `const __li_${name} = computed(() => ctx.${name}());`
            ).join(' ');
            let optimized = eachCall;
            for (const name of invariants) {
                optimized = optimized.replace(new RegExp(`ctx\\.${name}\\(\\)`, 'g'), `__li_${name}()`);
                // Match: `ctx.NAME` passed by reference — not followed by a word char, `(` or `.`
                // (a member of the signal object is never a read of its value).
                optimized = optimized.replace(new RegExp(`ctx\\.${name}(?!\\w|\\(|\\.)`, 'g'), `__li_${name}()`);
            }
            return `\${(() => { ${hoisted} return ${optimized}; })()}`;
        }
    }

    // @empty fallback — shown when the array is empty
    if (node.emptyBody) {
        imports.add('when');
        const emptyCode = generateNodes(node.emptyBody, imports, ctx);
        return `\${when(() => ${itemsExpr}?.length > 0, () => ${eachCall}, () => ${emptyCode})}`;
    }

    return `\${${eachCall}}`;
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
        // `const __li_NAME = computed(() => ctx.NAME())` and rewrote its reads to __li_NAME().
        // Re-hoisting at this (outer) level would replace that inner declaration's own
        // `ctx.NAME()` initializer with the shadowing `__li_NAME()` → a self-referential
        // `const __li_NAME = computed(() => __li_NAME())` → TDZ at render. Leave it to the
        // inner loop (its computed still reads ctx.NAME() reactively).
        //
        // The digits are the inline path's names, which carry the generator's
        // counter: every line that path writes lands in ONE block, so a second loop in
        // the same block cannot reuse the plain name. Matched here so the skip covers both.
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

function generateSwitch(node: SwitchNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('match');
    const expr = callSignals(prefixCtx(node.expr, ctx), ctx);
    const caseParts = node.cases.map(c => {
        const bodyCode = generateNodes(c.body, imports, ctx);
        return `    ${jsString(c.value)}: () => ${bodyCode}`;
    });
    if (node.defaultBody) {
        caseParts.push(`    _: () => ${generateNodes(node.defaultBody, imports, ctx)}`);
    }
    return `\${match(() => ${expr}, {\n${caseParts.join(',\n')}\n  })}`;
}

function generateRequire(node: RequireNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('requirePermission');
    const bodyCode = generateNodes(node.body, imports, ctx);
    const elseCode = node.elseBody ? `() => ${generateNodes(node.elseBody, imports, ctx)}` : 'null';
    return `\${requirePermission(${jsQuote(node.permission)}, () => ${bodyCode}, ${elseCode})}`;
}

function generateShow(node: ShowNode, imports: Set<string>, ctx: CompileContext): string {
    if (ctx.production) {
        const cond = node.condition.trim();
        if (cond === 'true') return generateNodes(node.body, imports, ctx).slice(5, -1);
        if (cond === 'false') return '';
    }
    imports.add('show');
    const condition = callSignals(prefixCtx(node.condition, ctx), ctx);
    const bodyCode = generateNodes(node.body, imports, ctx);
    return `\${show(() => ${condition}, ${bodyCode})}`;
}

function generatePortal(node: PortalNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('portal');
    const bodyCode = generateNodes(node.body, imports, ctx);
    return `\${portal(() => ${bodyCode}, ${jsQuote(node.target)})}`;
}

/**
 * The `<pdx-…>` tags a deferred body renders, in source order and without repeats.
 *
 * Read from the generated code rather than walked on the AST: the body has already been through
 * every other generator here, so whatever tag survives into it is a tag that will be rendered —
 * including the ones a `@for` or an `@if` inside the block produced.
 */
function deferredTags(bodyCode: string): string[] {
    const seen = new Set<string>();
    for (const m of bodyCode.matchAll(/<(pdx-[\w-]+)/gi)) seen.add(m[1].toLowerCase());
    return [...seen];
}

function generateDefer(node: DeferNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('defer');
    const bodyCode = generateNodes(node.body, imports, ctx);
    const optionParts: string[] = [`trigger: ${jsQuote(node.trigger)}`];
    if (node.placeholder) optionParts.push(`placeholder: () => ${generateNodes(node.placeholder, imports, ctx)}`);
    if (node.loading) optionParts.push(`loading: () => ${generateNodes(node.loading, imports, ctx)}`);
    if (node.error) optionParts.push(`error: () => ${generateNodes(node.error, imports, ctx)}`);

    // The block loads what it renders, through `defer`'s second argument, a `loadFn`. Passing `null`
    // would leave the components to the tag scan's STATIC import at the top of the module — which
    // is what decides the chunk, so the payload would not be deferred at all, only the render.
    //
    // Emitted for every tag in the body, not only the ones used exclusively here: a component
    // rendered elsewhere too keeps its static import, and `import()` on an already-loaded module
    // resolves from the module cache. The static import is the one that is dropped, and only when
    // the tag appears nowhere outside a defer — see `injectComponentImports`.
    const paths = ctx.importPathOf
        ? deferredTags(bodyCode).map(tag => ctx.importPathOf!(tag)).filter((p): p is string => !!p)
        : [];
    const loadFn = paths.length > 0
        ? `() => Promise.all([${paths.map(p => `import(${jsQuote(p)})`).join(', ')}])`
        : 'null';

    return `\${defer({ ${optionParts.join(', ')} }, ${loadFn}, () => ${bodyCode})}`;
}

function generateTry(node: TryNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('errorBoundary');
    const bodyCode = generateNodes(node.body, imports, ctx);
    const catchCode = generateNodes(node.catchBody, imports, ctx);
    return `\${errorBoundary(() => ${bodyCode}, (${node.errorVar}, ${node.retryVar}) => ${catchCode})}`;
}

function generateAwait(node: AwaitNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('when');
    // awaitReady, not the raw condition: a Promise is always truthy, so `when(() => promise, …)` would show
    // the body at once and forever, pending or rejected. It waits for a thenable and is
    // plain truthiness for anything else; a rejection throws into the @error boundary below.
    imports.add('awaitReady');
    const awaited = callSignals(prefixCtx(node.condition, ctx), ctx);
    const condition = `awaitReady(${awaited})`;
    const bodyCode = generateNodes(node.body, imports, ctx);
    const loadingCode = node.loading ? `() => ${generateNodes(node.loading, imports, ctx)}` : 'null';

    let whenExpr: string;
    if (node.minMs || node.maxMs) {
        imports.add('awaitTimed');
        const opts: string[] = [];
        if (node.minMs) opts.push(`minMs: ${node.minMs}`);
        if (node.maxMs) opts.push(`maxMs: ${node.maxMs}`);
        whenExpr = `awaitTimed(() => ${condition}, () => ${bodyCode}, ${loadingCode}, { ${opts.join(', ')} })`;
    } else {
        whenExpr = `when(() => ${condition}, () => ${bodyCode}, ${loadingCode})`;
    }

    if (node.errorBody) {
        imports.add('errorBoundary');
        const errorVar = node.errorVar || 'err';
        ctx.scopeVars.add(errorVar);
        const errorCode = generateNodes(node.errorBody, imports, ctx);
        ctx.scopeVars.delete(errorVar);
        // resetOn: a new promise in the awaited expression leaves @error and awaits it.
        return `\${errorBoundary(() => html\`\${${whenExpr}}\`, (${errorVar}, ${node.retryVar ?? 'retry'}) => ${errorCode}, { resetOn: () => ${awaited} })}`;
    }

    return `\${${whenExpr}}`;
}

// ─── @slot (parent-side scoped slot template) ─────────────────────

/**
 * Generate a scoped slot carrier element.
 * @slot(item, { value, index }) { <span>${value}</span> }
 *
 * Hoists the slot function OUTSIDE the html`` template to avoid nested template
 * literal issues with Vite's es-module-lexer. The generated code references
 * a variable: ${slotCarrier('item', __pdxSlot_item)}
 */
function generateSlotTemplate(node: SlotTemplateNode, imports: Set<string>, ctx: CompileContext): string {
    return `\${${hoistSlotTemplate(node, imports, ctx)}}`;
}

/**
 * Hoist a scoped slot's function and return the EXPRESSION that carries it.
 *
 * Split out of `generateSlotTemplate` so the inline render path can use it too: it needs the same
 * carrier, appended to a parent rather than interpolated into a template, and a second
 * implementation of the hoisting is exactly the kind of copy that drifts — a slot name that is not
 * an identifier is one of the cases it has to get right.
 */
export function hoistSlotTemplate(node: SlotTemplateNode, imports: Set<string>, ctx: CompileContext): string {
    imports.add('slotCarrier');

    // Add scope vars so they don't get ctx. prefix inside the slot body
    for (const v of node.scopeVars) ctx.scopeVars.add(v);

    const bodyCode = generateNodes(node.body, imports, ctx);

    // Remove scope vars after processing
    for (const v of node.scopeVars) ctx.scopeVars.delete(v);

    // Unique variable name for hoisted slot function. The slot name is not always an identifier —
    // the data grid's cell slots are `col:{field}` / `header:{field}`, others use a hyphen — and
    // `__pdxSlot_col:name_0` is not JavaScript. Only the variable is renamed;
    // the carrier below keeps the real name, and the index keeps `col:a` and `col-a` apart.
    const varName = `__pdxSlot_${node.name.replace(/[^\w$]/g, '_')}_${ctx.hoistedSlots.length}`;

    let fnCode: string;
    if (node.scopeVars.length === 0) {
        fnCode = `const ${varName} = () => ${bodyCode};`;
    } else {
        const destructure = `{ ${node.scopeVars.join(', ')} }`;
        fnCode = `const ${varName} = (__scope) => { const ${destructure} = __scope; return ${bodyCode}; };`;
    }

    ctx.hoistedSlots.push([varName, fnCode]);

    return `slotCarrier(${jsQuote(node.name)}, ${varName})`;
}

/**
 * The options a `when` / `each` / `eachRow` call takes for `@transition`, `@stagger`, `@mode` and
 * `@move`, as `, { … }` to append after its last argument, or '' for a block without them. Both
 * render paths call it, so they cannot disagree about what a block animates (#85).
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

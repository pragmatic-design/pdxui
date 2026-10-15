// HTML attribute rewriting — transforms .pdx binding syntax into html`` interpolations.
// Extracted from codegen-template.ts for modularity (~240 lines).
// Handles: :prop, ::twoWay, @event, ref=, <component :is>, <slot :binding>, gestures.

import type { CompileContext } from './compile-context';
import { prefixCtx, callSignals, asArrowBody } from './codegen-prefix';
import { splitAtDepthZero, findClosing } from './tokenizer';
import { escapeForTemplateLiteral } from './codegen-shared';
import { boundPropName } from './codegen-prop-names';
import { VOID_ELEMENTS } from './codegen-template-inline';
import { attributeOrigins } from './codegen-origins';
import { originMark } from './sourcemap';
import { jsQuote } from './js-literal';
import { camelToKebab, expandAttributeForms, gestureOf, gestureValue } from './codegen-attribute-forms';

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
const ARROW = /^(\((?:[^()]|\([^()]*\))*\)|[A-Za-z_$][\w$]*)\s*=>\s*([\s\S]+)$/;
// count++ / ++count / count-- / --count
const INC_DEC = /^(?:(\+\+|--)\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(\+\+|--))$/;
// count = x | count += x | count -= x | count *= x | count /= x | count %= x  (= not ==)
// | count ||= x | count &&= x | count ??= x.  Groups: [1]=name [2]=operator [3]=right side
const ASSIGN = /^([A-Za-z_$][\w$]*)\s*(=(?!=)|\+=|-=|\*=|\/=|%=|\|\|=|&&=|\?\?=)\s*([\s\S]+)$/;

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

// ─── Main Entry ──────────────────────────────────────────────────

/**
 * Rewrite .pdx template attribute bindings to html`` syntax.
 * Scans for opening tags and rewrites binding attributes within each tag.
 * Special: `<component :is="expr">` → `${dynamic(() => ctx.expr())}`.
 */
export function rewriteHtmlBindings(htmlStr: string, ctx: CompileContext,
    /** The .pdx origin of the character at an index of `htmlStr`, when the code is marked. */
    originAt?: (i: number) => number | null,
): string {
    let result = '';
    let i = 0;
    let textRun = '';
    // Author literal text (between tags) must be escaped so backticks and ${...}
    // don't break the html`` module or get executed. Tags are rewritten separately.
    const flushText = () => { if (textRun) { result += escapeForTemplateLiteral(textRun); textRun = ''; } };
    while (i < htmlStr.length) {
        // An HTML comment is not markup to rewrite. Without this it would fall into the tag branch:
        // `findTagEnd` stops at the first `>`, and anything that looks like a directive
        // inside the comment would be rewritten — so `<!-- no @click="go" here -->` would emit a
        // `${...}` placeholder INSIDE the comment, which breaks the comment in the DOM parse
        // and spills its tail onto the page as visible text. Copied verbatim, only escaped so
        // a backtick or `${` in prose cannot break the html`` literal itself.
        if (htmlStr.startsWith('<!--', i)) {
            flushText();
            const close = htmlStr.indexOf('-->', i + 4);
            // Unterminated comment: the rest of the template is inside it.
            const end = close === -1 ? htmlStr.length : close + 3;
            result += escapeForTemplateLiteral(htmlStr.slice(i, end));
            i = end;
        } else if (htmlStr[i] === '<' && htmlStr[i + 1] !== '/') {
            flushText();
            const tagEnd = findTagEnd(htmlStr, i);
            const tagStr = htmlStr.slice(i, tagEnd + 1);

            if (tagStr.match(/^<component\s/i)) {
                result += rewriteDynamicComponent(tagStr, ctx);
            } else {
                const tagStart = i;
                const origins = originAt ? attributeOrigins(tagStr, (k) => originAt(tagStart + k)) : undefined;
                result += expandSelfClosing(rewriteTagAttributes(tagStr, ctx, origins));
            }
            i = tagEnd + 1;
        } else if (htmlStr[i] === '<') {
            // Closing tag — copy verbatim (no author text, no bindings).
            flushText();
            const tagEnd = findTagEnd(htmlStr, i);
            result += htmlStr.slice(i, tagEnd + 1);
            i = tagEnd + 1;
        } else {
            textRun += htmlStr[i];
            i++;
        }
    }
    flushText();
    return result;
}

/**
 * `<x … />` of a non-void element → `<x …></x>`. The HTML parser does not honour `/>` there: it
 * opens the element, and the next sibling becomes its child — which a component, rendering its own
 * content, then drops: `<pdx-autocomplete … />` would lose the line after it. Void elements keep their form. Vue and Svelte expand the same way.
 * Runs on the tag after its attributes are rewritten, so a `/>` inside a quoted value is not the end.
 */
function expandSelfClosing(tag: string): string {
    // Match: the element name at the start of the tag. Groups: [1]=name
    const name = /^<([A-Za-z][\w-]*)/.exec(tag)?.[1];
    if (!name || VOID_ELEMENTS.has(name.toLowerCase())) return tag;
    // Match: the tag's own `/>` (with any spaces before it) at its very end.
    if (!/\/\s*>$/.test(tag)) return tag;
    return tag.replace(/\s*\/\s*>$/, '>') + `</${name}>`;
}

// ─── Dynamic Component ───────────────────────────────────────────

/**
 * Rewrite `<component :is="expr" :prop="val" @transition @keepAlive @mode />` to
 * `${dynamic(() => ctx.expr(), () => ({ prop: ctx.val() }), { keepAlive: true, ... })}`.
 */
function rewriteDynamicComponent(tag: string, ctx: CompileContext): string {
    const call = dynamicComponentCall(tag, ctx);
    return call === null ? tag : `\${${call}}`;
}

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

// ─── Tag Attributes ──────────────────────────────────────────────

function rewriteTagAttributes(tag: string, ctx: CompileContext,
    /** Each attribute's origin in the .pdx, by its name as written. */
    origins?: Map<string, number>,
): string {
    // The origin mark of an attribute, written just inside the `${` it becomes.
    const m = (name: string) => { const o = origins?.get(name); return o == null ? '' : originMark(o); };
    // Bound names on a known component are resolved against its declared props.
    // Match: the element name at the start of the tag string — `<pdx-app-layout`. Groups: [1]=name
    const tagName = tag.match(/^<([\w-]+)/)?.[1].toLowerCase() ?? '';
    const bindName = (name: string) => camelToKebab(boundPropName(tagName, name, ctx));

    // 0. Gesture directives: @swipe.dir, @longpress, @pinch → runtime setup calls
    tag = rewriteGestureAttributes(tag, ctx);

    // 1. @event(.mod)="expr" → @event.mod=${safeHandler(<handler>, …)}
    // safeHandler wraps event handlers to dispatch errors to the global error interceptor.
    // <handler> is a reference, a signal-mutation arrow, or a wrapped expression (see buildEventHandler).
    tag = tag.replace(/@([\w.-]+)=(?:"([^"]*?)"|'([^']*?)')/g, (_, event: string, dq: string, sq: string) => {
        let expr = dq ?? sq;
        // Strip ${...} wrapper if present — dev may write @event="${handler}" instead of @event="handler"
        const wrappedMatch = expr.match(/^\$\{(.+)\}$/);
        if (wrappedMatch) expr = wrappedMatch[1];
        const evName = event.split('.')[0];
        return `@${event}=\${${m('@' + event)}safeHandler(${buildEventHandler(expr, ctx)}, ctx.el?.tagName?.toLowerCase(), ${jsQuote(evName)})}`;
    });

    // 2. ::prop(.mod)="signal" → ::prop.mod=${ctx.signal}
    // Prop name normalized to kebab-case for HTML safety (browser lowercases attributes)
    tag = tag.replace(/::([\w.]+)=(?:"([^"]*?)"|'([^']*?)')/g, (_, prop: string, dq: string, sq: string) => {
        let expr = dq ?? sq;
        // Strip ${...} wrapper if present
        const wrappedMatch = expr.match(/^\$\{(.+)\}$/);
        if (wrappedMatch) expr = wrappedMatch[1];
        const parts = prop.split('.');
        parts[0] = bindName(parts[0]);
        return `::${parts.join('.')}=\${${m('::' + prop)}${prefixCtx(expr, ctx)}}`;
    });

    // 2.5. :class / :style objects → one :class.x / :style.x per key, the expansion the inline path
    // shares (#96). Step 3 below binds them; each keeps the origin of the attribute it came from.
    tag = expandAttributeForms(tag, (name, from) => {
        const o = origins?.get(from);
        if (origins && o != null) origins.set(name, o);
    });

    // 3. :prop="expr" → :prop=${() => ctx.expr()}
    // Simple accesses (signals/props) are passed directly as signal getters.
    // Non-signal names (functions, consts) MUST be wrapped in () => to avoid
    // the template engine calling them as getters.
    // Prop name normalized to kebab-case for HTML safety (browser lowercases attributes).
    tag = tag.replace(/:([\w.-]+)=(?:"([^"]*?)"|'([^']*?)')/g, (_, prop: string, dq: string, sq: string) => {
        let expr = dq ?? sq;
        // Strip ${...} wrapper if present — dev may write :prop="${val}" instead of :prop="val"
        // Both forms should work identically
        const wrappedMatch = expr.match(/^\$\{(.+)\}$/);
        if (wrappedMatch) expr = wrappedMatch[1];
        // Normalize prop name: camelCase → kebab-case (split modifiers first)
        const parts = prop.split('.');
        parts[0] = bindName(parts[0]);
        const kebabProp = parts.join('.');
        const alwaysReactive = parts[0] === 'class' || parts[0] === 'style';
        // :ref takes the ref object itself — bindRef calls its .set(el) and ignores anything else,
        // so an arrow would leave the ref null in silence. Same as `ref="x"` below and as the
        // inline generator's refBind. A row getter is read once, when the row is built.
        const mark = m(':' + prop);
        if (parts[0] === 'ref') return `:ref=\${${mark}${prefixCtx(expr, ctx)}}`;
        if (!alwaysReactive && isSimpleAccess(expr, ctx)) {
            const rootName = expr.trim().split('.')[0];
            if (ctx.nonSignalNames?.has(rootName)) {
                return `:${kebabProp}=\${${mark}() => ${asArrowBody(prefixCtx(expr, ctx))}}`;
            }
            return `:${kebabProp}=\${${mark}${prefixCtx(expr, ctx)}}`;
        }
        return `:${kebabProp}=\${${mark}() => ${asArrowBody(callSignals(prefixCtx(expr, ctx), ctx))}}`;
    });

    // 4. :prop shorthand (no value) → :prop=${() => ctx.prop()}
    // Kebab-case in output, but the expression uses the original camelCase name
    tag = tag.replace(/\s:([\w]+)(?=[\s>/])/g, (_, prop: string) => {
        return ` :${bindName(prop)}=\${${m(':' + prop)}${prefixCtx(prop, ctx)}}`;
    });

    // 5. ref="name" → :ref=${ctx.name}
    tag = tag.replace(/\bref=(?:"([^"]*?)"|'([^']*?)')/g, (_, dq: string, sq: string) => {
        return `:ref=\${${m('ref')}${prefixCtx(dq ?? sq, ctx)}}`;
    });

    // 6. Escape raw `${...}` that survives inside a normal (non-binding) quoted attribute
    // value. Author text is escaped by escapeForTemplateLiteral, but the tag string is
    // emitted verbatim into the html`` literal — so `title="${x}"` would leak through as a
    // live interpolation (inconsistent with escaped text; rule #7). Generated `=${...}`
    // interpolations are UNQUOTED, so escaping only inside quotes never touches them.
    // EXCEPTION: an interpolation that references a scope variable (a `@for`/slot binding) is
    // legitimate — it runs inside the loop/slot `() => html\`…\`` closure where the var is in
    // scope — so it is left live. Only genuinely unbound `${…}` (component-level mistakes) are
    // escaped.
    tag = escapeRawInterpolationInAttrs(tag, ctx);

    return tag;
}

/**
 * Escape `${` inside quoted attribute values so it becomes literal text in the html`` literal.
 * Skips generated `${...}` interpolations (unquoted, brace-balanced) verbatim, and leaves any
 * interpolation that references a scope variable (loop/slot binding) live.
 */
function escapeRawInterpolationInAttrs(tag: string, ctx: CompileContext): string {
    const referencesScopeVar = (expr: string): boolean => {
        for (const v of ctx.scopeVars) {
            if (new RegExp(`\\b${v}\\b`).test(expr)) return true;
        }
        return false;
    };
    let out = '';
    let i = 0;
    while (i < tag.length) {
        const ch = tag[i];
        // Generated interpolation — copy the whole ${...} block verbatim (string-safe).
        if (ch === '$' && tag[i + 1] === '{') {
            const close = findClosing(tag, i + 1);
            const end = close === -1 ? tag.length - 1 : close;
            out += tag.slice(i, end + 1);
            i = end + 1;
            continue;
        }
        // Quoted attribute value — escape any raw ${ inside it (unless it binds a scope var), and the
        // backslash and backtick: the value is the text of a template literal, where a backtick
        // ends it and a backslash starts an escape (`\b` would be a backspace).
        if (ch === '"' || ch === "'") {
            const q = ch;
            out += q;
            i++;
            while (i < tag.length && tag[i] !== q) {
                if (tag[i] === '$' && tag[i + 1] === '{') {
                    const close = findClosing(tag, i + 1);
                    const end = close === -1 ? tag.length - 1 : close;
                    const inner = tag.slice(i + 2, end);
                    if (referencesScopeVar(inner)) {
                        out += tag.slice(i, end + 1); // keep live — bound to a loop/slot var
                    } else {
                        out += '\\${' + tag.slice(i + 2, end + 1); // escape the opener only
                    }
                    i = end + 1;
                    continue;
                }
                out += tag[i] === '\\' || tag[i] === '`' ? '\\' + tag[i] : tag[i];
                i++;
            }
            if (i < tag.length) { out += q; i++; }
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

// ─── Gesture Directives ──────────────────────────────────────────

/**
 * Rewrite gesture attributes into the runtime gesture setup: `@swipe.left="next()"` →
 * `@__swipe=${['left', handler]}`, which core's `bindAttribute` hands to `bindGesture`. The handler is
 * built as an event handler is, so `n++` is a write when the gesture happens — written as a plain
 * read it ran once at render, and the count was NaN before anyone swiped (#99).
 */
function rewriteGestureAttributes(tag: string, ctx: CompileContext): string {
    // Match: @swipe.<dir>, @longpress or @pinch with a quoted value.
    // Groups: [1]=the name after @ [2]/[3]=double- or single-quoted value
    return tag.replace(/@(swipe\.\w+|longpress|pinch)=(?:"([^"]*?)"|'([^']*?)')/g, (all, name: string, dq: string, sq: string) => {
        const gesture = gestureOf(`@${name}`);
        if (!gesture) return all;
        return `@${gesture.name}=\${${gestureValue(gesture, buildEventHandler(dq ?? sq, ctx))}}`;
    });
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

/**
 * Can this expression be emitted verbatim, without an arrow wrapper?
 *
 * A BARE identifier can: `${ctx.count}` hands the template engine the signal's read
 * function, which it calls and subscribes to. A DOTTED path rooted at a signal cannot —
 * `${ctx.user.name}` reads a property of the READ FUNCTION, not of its value, so
 * `{{ user.name }}` rendered the literal string "read" (the function's own name) and
 * `{{ report.errors }}` rendered nothing. Those must go through the arrow path, where
 * callSignals() inserts the call.
 *
 * A dotted path is still simple when its root is a plain local — a @for item, a catch var —
 * since there is no getter to call. Without a context we cannot tell, so we assume the
 * unsafe case and wrap: an unnecessary arrow is correct, a missing call is not.
 */
export function isSimpleAccess(expr: string, ctx?: CompileContext): boolean {
    const trimmed = expr.trim();
    if (!/^[\w$]+(\.[\w$]+)*$/.test(trimmed)) return false;
    const root = trimmed.split('.')[0];
    // A @for row getter is read through a call and changes when the row is reused for a new
    // object: bound once, `doc.progress` would stay at its first value for good.
    if (ctx?.rowVars.has(root)) return false;
    if (!trimmed.includes('.')) return true;
    return ctx ? ctx.scopeVars.has(root) : false;
}


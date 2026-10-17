// Template projection — projects the .pdx template into a TS function `__pdxRender`
// (appended to the virtual file after the script) where every template expression is
// emitted VERBATIM in the right scope (for-of for @for, catch for @catch, and so on).
// It builds a 1:1 SegmentMap over the verbatim text; the scaffolding is not mapped.
// Signals are already typed as their value ($signal<T>:T) → no unwrapping needed.
//
// The names a template introduces are typed, not `any` (#122): a handler's `$event`, the error of
// `@catch` / `@await … @error` (`unknown`), a scoped slot's context. The projection shares the
// script's program, so it is not compiled `strict`: forcing it raised 398 errors on the showcase,
// nearly all in the scripts (./ts-service). The typed names report a misspelt member without it.

import type { TemplateNode } from '@pdxui/compiler';
import { SegmentMap } from './segment-map';

export interface TemplateProjection { code: string; map: SegmentMap; }

/**
 * Resolves the (safe) TS type of a component's prop attribute, or null. Asked with `@name` for an
 * event, it answers the type of that event's `$event` — `CustomEvent<Payload>` — or null when the
 * payload is unknown. Asked with `#name` for a slot, it answers the type of the context the slot
 * passes (`{ row: Row }`), or null when the component declares none.
 */
export type ResolveType = (tag: string, attr: string) => string | null;

// Type-check ONLY string-literal values (`'x'` / `"x"`): assigning one to a
// number/boolean prop or to the wrong string enum is a real bug (`:count="'x'"`, for one).
// Boolean/number literals are NOT checked: auto-generated manifests often type as
// `string` props that accept a boolean (attribute reflection) → false positives.
const STRING_LITERAL = /^\s*('[^']*'|"[^"]*")\s*$/;

interface Range { start: number; end: number; }

/** The <pre>/<code> regions in the content: sample code, NOT to be projected. */
function maskedRanges(content: string): Range[] {
    const out: Range[] = [];
    for (const m of content.matchAll(/<(pre|code)\b[\s\S]*?<\/\1>/gi)) {
        out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
}

/** Elements that never have a closing tag. */
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * The innermost custom element (a tag with a `-`) still open at `offset` in the template content:
 * the component a slot fill written there belongs to. Null when none is.
 */
export function enclosingComponent(content: string, offset: number): string | null {
    const open: string[] = [];
    // Match: `<tag …>`, `</tag>`, `<tag … />`.  Groups: [1]=`/` of a closing tag [2]=the name [3]=`/` of a self-closing one
    for (const m of content.slice(0, offset).matchAll(/<(\/?)([a-zA-Z][\w-]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
        const name = m[2].toLowerCase();
        if (m[1]) {
            const at = open.lastIndexOf(name);
            if (at >= 0) open.length = at;
        } else if (!m[3] && !VOID_ELEMENTS.has(name)) {
            open.push(name);
        }
    }
    for (let i = open.length - 1; i >= 0; i--) if (open[i].includes('-')) return open[i];
    return null;
}

/**
 * @param ast            template AST
 * @param templateContent the content of the <template> block
 * @param templateStart   the offset of templateContent in the .pdx (for the segments)
 * @param genBase         the offset in the virtual file where the projected code starts
 */
export function projectTemplate(
    ast: TemplateNode[], templateContent: string, templateStart: number, genBase: number,
    resolveType?: ResolveType,
): TemplateProjection {
    const map = new SegmentMap();
    const masks = maskedRanges(templateContent);
    const out: string[] = [];
    let gen = genBase;
    let cursor = 0; // walks through the template content, to resolve the offsets in order

    const inMask = (off: number): boolean => masks.some(r => off >= r.start && off < r.end);
    const emit = (s: string): void => { out.push(s); gen += s.length; };

    /** Finds the offset (in content) of `text` starting from the cursor; -1 when it is not there. */
    const find = (text: string): number => {
        if (!text) return -1;
        let i = templateContent.indexOf(text, cursor);
        if (i < 0) i = templateContent.indexOf(text);
        if (i >= 0) cursor = i + text.length;
        return i;
    };

    /** Emits `text` verbatim with its source segment (when found and not masked). */
    const verbatim = (text: string): void => {
        const off = find(text);
        if (off < 0 || inMask(off)) { emit(text); return; } // emit it anyway (scaffolding), but unmapped
        map.add(gen, templateStart + off, text.length);
        emit(text);
    };

    /** Emits an expression as a type-checked statement: `;(EXPR);`. */
    const stmt = (text: string): void => {
        const t = (text ?? '').trim();
        if (!t || t.includes('${')) return; // the raw interpolation antipattern → do not project it
        const off = templateContent.indexOf(t, cursor);
        if (off >= 0 && inMask(off)) { cursor = off + t.length; return; } // inside pre/code → skip
        emit(';(');
        verbatim(t);
        emit(');\n');
    };

    /** Bindings/events from a raw HTML block (the attributes are not in the AST). */
    const htmlAttrs = (htmlContent: string, baseOff: number): void => {
        // Tag-aware: for `:attr` bindings with a LITERAL VALUE on a component whose prop
        // type is known, it checks the type (`:count="'x'"` on a number → an error).
        // Identifiers (loosely-typed signals) are NOT checked → 0 false positives.
        const tagRe = /<([\w-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tagRe.exec(htmlContent))) {
            const tag = tm[1];
            const attrsRegion = tm[2];
            const attrsBase = tm.index + 1 + tag.length; // the attribute region's offset in the content
            const bindRe = /([:@]{1,2}[\w.-]+)\s*=\s*"([^"]*)"/g;
            let bm: RegExpExecArray | null;
            while ((bm = bindRe.exec(attrsRegion))) {
                const name = bm[1], expr = bm[2];
                if (!expr.trim() || expr.includes('${')) continue; // raw interpolation → skip
                const exprAbs = baseOff + attrsBase + bm.index + bm[0].indexOf('"') + 1;
                if (inMask(exprAbs)) continue;
                cursor = exprAbs;
                const bare = name.replace(/^[:@]+/, '');
                // `::name` on a component's model (#124): the value is checked against the model's
                // type, asked as `::name`. A modifier changes what is written, so it is not checked.
                const modelType = name.startsWith('::') && !bare.includes('.') && resolveType ? resolveType(tag, name) : null;
                const type = name.startsWith(':') && resolveType ? resolveType(tag, bare) : null;
                // Every handler's `$event` is typed (#122): the event the component declares, or
                // `PdxEvent` — a DOM event by its name, `CustomEvent<unknown>` for any other.
                const event = bare.split('.')[0];
                const eventType = /^@[^@]/.test(name)
                    ? (resolveType?.(tag, '@' + event) ?? `PdxEvent<${JSON.stringify(event)}, ${JSON.stringify(tag.toLowerCase())}>`)
                    : null;
                emit(';');
                if (eventType) {
                    // A block body: a handler may be several statements, `save(); count += 2`, which
                    // a parenthesised expression cannot hold (#487). A reference, a call, a lambda and
                    // a mutation are each a statement as well.
                    emit(`(($event: ${eventType}) => { `);
                    map.add(gen, templateStart + exprAbs, expr.length); emit(expr);
                    emit('; })(null!);\n');
                } else if (modelType) {
                    emit(`((__v: ${modelType}) => __v)(`);
                    map.add(gen, templateStart + exprAbs, expr.length); emit(expr);
                    emit(');\n');
                } else if (type && type !== 'string' && STRING_LITERAL.test(expr)) {
                    emit(`((__v: ${type}) => __v)(`);
                    map.add(gen, templateStart + exprAbs, expr.length); emit(expr);
                    emit(');\n');
                } else {
                    emit('(');
                    map.add(gen, templateStart + exprAbs, expr.length); emit(expr);
                    emit(');\n');
                }
            }
        }
    };

    const walk = (nodes: TemplateNode[]): void => {
        for (const node of nodes) {
            switch (node.type) {
                case 'html': {
                    let base = templateContent.indexOf(node.content, cursor);
                    if (base < 0) base = templateContent.indexOf(node.content);
                    if (base >= 0) { htmlAttrs(node.content, base); cursor = base + node.content.length; }
                    break;
                }
                case 'interpolation':
                    stmt(node.expr);
                    break;
                case 'if':
                    emit('if ('); verbatim(node.condition.trim()); emit(') {\n');
                    walk(node.body);
                    emit('}\n');
                    if (node.elseBody) { emit('else {\n'); walk(node.elseBody); emit('}\n'); }
                    break;
                case 'show':
                    emit('if ('); verbatim(node.condition.trim()); emit(') {\n'); walk(node.body); emit('}\n');
                    break;
                case 'for': {
                    emit('for (const ');
                    verbatim(node.item.trim());
                    emit(' of ('); verbatim(node.items.trim()); emit(')) {\n');
                    if (node.index) emit(`let ${node.index} = 0;\n`);
                    walk(node.body);
                    emit('}\n');
                    if (node.emptyBody) walk(node.emptyBody);
                    break;
                }
                case 'switch':
                    emit('switch ('); verbatim(node.expr.trim()); emit(') {\n');
                    for (const c of node.cases) { emit('case ' + c.value + ': {\n'); walk(c.body); emit('break; }\n'); }
                    if (node.defaultBody) { emit('default: {\n'); walk(node.defaultBody); emit('}\n'); }
                    emit('}\n');
                    break;
                case 'try':
                    emit('try {\n'); walk(node.body); emit('}\n');
                    // `unknown`, as TypeScript types a strict `catch` binding (#122).
                    emit('catch ('); verbatim((node.errorVar || 'err').trim()); emit(': unknown) {\n');
                    // The retry function the boundary passes second: declared so a call to
                    // it in the catch body type-checks instead of reading as an unknown name.
                    emit('const ' + (node.retryVar || 'retry') + ' = (): void => {};\n');
                    walk(node.catchBody ?? []); emit('}\n');
                    break;
                case 'await':
                    emit('if ('); verbatim(node.condition.trim()); emit(') {\n'); walk(node.body); emit('}\n');
                    if (node.errorBody) { emit('{ const ' + (node.errorVar || 'err') + ': unknown = 0; const ' + (node.retryVar || 'retry') + ' = (): void => {};\n'); walk(node.errorBody); emit('}\n'); }
                    if (node.loading) walk(node.loading);
                    break;
                case 'let':
                    emit('let '); verbatim(node.name.trim()); emit(' = ('); verbatim(node.expr.trim()); emit(');\n');
                    break;
                case 'defer':
                    if (node.body) walk(node.body);
                    if (node.placeholder) walk(node.placeholder);
                    break;
                case 'require': case 'portal':
                    walk(node.body ?? []);
                    if ('elseBody' in node && node.elseBody) walk(node.elseBody);
                    break;
                case 'slot-template': {
                    // The context the component around it declares for this slot (`#name`), or
                    // `unknown` when it declares its slots and gives this one none (#122). A
                    // component that cannot describe it — a library one, an unknown tag — leaves it
                    // unchecked until its slots can be typed (#131).
                    const host = node.loc?.offset !== undefined ? enclosingComponent(templateContent, node.loc.offset) : null;
                    const scope = host && resolveType ? resolveType(host, '#' + node.name) : null;
                    if (scope && scope !== 'unknown' && node.scopeVars.length > 0) emit(`const { ${node.scopeVars.join(', ')} }: ${scope} = null!;\n`);
                    else for (const v of node.scopeVars) emit(`let ${v}: ${scope === 'unknown' ? 'unknown' : 'any'};\n`);
                    walk(node.body);
                    break;
                }
                case 'scoped-slot':
                    // The outlet's tag is markup with bindings, projected as html was before it had a
                    // node of its own (#276); then its fallback.
                    walk([{ type: 'html', content: node.tag, loc: node.loc }]);
                    walk(node.body);
                    break;
                case 'custom-directive':
                    if (node.expr) stmt(node.expr);
                    if (node.body) walk(node.body);
                    break;
            }
        }
    };

    emit('function __pdxRender() {\n');
    walk(ast);
    emit('}\n');

    return { code: out.join(''), map };
}

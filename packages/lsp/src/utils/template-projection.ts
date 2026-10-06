// Template projection — projects the .pdx template into a TS function `__pdxRender`
// (appended to the virtual file after the script) where every template expression is
// emitted VERBATIM in the right scope (for-of for @for, catch for @catch, and so on).
// It builds a 1:1 SegmentMap over the verbatim text; the scaffolding is not mapped.
// Signals are already typed as their value ($signal<T>:T) → no unwrapping needed.

import type { TemplateNode } from '@pdxui/compiler';
import { SegmentMap } from './segment-map';

export interface TemplateProjection { code: string; map: SegmentMap; }

/**
 * Resolves the (safe) TS type of a component's prop attribute, or null. Asked with `@name` for an
 * event, it answers the type of that event's `$event` — `CustomEvent<Payload>` — or null when the
 * payload is unknown.
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
                const type = name.startsWith(':') && resolveType ? resolveType(tag, bare) : null;
                // An event whose payload is known: `$event` in its handler is that event, not the
                // global `any`.
                const eventType = /^@[^@]/.test(name) && resolveType ? resolveType(tag, '@' + bare.split('.')[0]) : null;
                emit(';');
                if (eventType) {
                    emit(`(($event: ${eventType}) => (`);
                    map.add(gen, templateStart + exprAbs, expr.length); emit(expr);
                    emit('))(null!);\n');
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
                    emit('catch ('); verbatim((node.errorVar || 'err').trim()); emit(': any) {\n');
                    // The retry function the boundary passes second: declared so a call to
                    // it in the catch body type-checks instead of reading as an unknown name.
                    emit('const ' + (node.retryVar || 'retry') + ' = (): void => {};\n');
                    walk(node.catchBody ?? []); emit('}\n');
                    break;
                case 'await':
                    emit('if ('); verbatim(node.condition.trim()); emit(') {\n'); walk(node.body); emit('}\n');
                    if (node.errorBody) { emit('{ const ' + (node.errorVar || 'err') + ': any = 0; const ' + (node.retryVar || 'retry') + ' = (): void => {};\n'); walk(node.errorBody); emit('}\n'); }
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
                case 'slot-template':
                    for (const v of node.scopeVars) emit(`let ${v}: any;\n`);
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

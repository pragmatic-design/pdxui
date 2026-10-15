// Which event types a component delegates (#113): read off its whole template before it is generated.
//
// A bubbling event inside a @for is delegated to one listener per type on the component (core's
// `delegate`). Delegation calls handlers in DOM order, but only once the event reaches the component —
// so a direct listener on an ancestor would run before a delegated row's handler, and the row's `.stop`
// would no longer stop it. Hence the rule is per type: once a type is delegated, every handler of that
// type in the component that CAN be is, and a type is not delegated at all when a handler of it cannot
// be and could sit above a delegated one:
//   - a `.self`, `.once` or `.passive` handler without `.capture` (a capture handler runs in the capture
//     phase either way, before any of them);
//   - for `input` and `change`, a `::` binding: core's two-way listener is on the element.
// A handler on a component, under one, or in a @portal is never delegated — a component may stop its
// own events, and a portal's content is not under the component — and never sits above a delegated one:
// a delegated element is under no component and in no portal.

import type { TemplateNode } from '../parser/template';
import { VOID_ELEMENTS } from './codegen-template-inline';

/** The bubbling events delegation is for (docs/language/beta/file.md, «The render model»). */
export const DELEGABLE = new Set(['click', 'dblclick', 'input', 'change', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'contextmenu']);

/** The modifiers a delegated handler cannot honour: its listener is on the component, in bubble phase. */
const DIRECT_ONLY = ['capture', 'once', 'passive', 'self'];

/** Can a handler `@type.mods` be delegated, placed where it is? */
export function delegableHandler(type: string, mods: readonly string[], opaque: boolean): boolean {
    return DELEGABLE.has(type) && !opaque && !mods.some(m => DIRECT_ONLY.includes(m));
}

interface Handler { type: string; mods: string[]; inFor: boolean; opaque: boolean }

/**
 * The tags of a run of markup, in order: one linear scan, quoted values skipped. A regex with a
 * repeated alternation over the attributes backtracks without bound on markup that never closes
 * (`<A"` repeated, `<A` and a run of `-`): `tests/perf/compiler-scans.test.ts`. A tag that does not
 * close ends the scan, as it ends the markup.
 */
function* tags(content: string): Generator<{ closing: boolean; name: string; attrs: string }> {
    const isName = (c: string) => /[\w-]/.test(c);
    let i = 0;
    while (i < content.length) {
        const lt = content.indexOf('<', i);
        if (lt === -1) return;
        let j = lt + 1;
        const closing = content[j] === '/';
        if (closing) j++;
        const start = j;
        while (j < content.length && isName(content[j])) j++;
        if (j === start) { i = lt + 1; continue; }
        let quote = '';
        let k = j;
        for (; k < content.length; k++) {
            const c = content[k];
            if (quote) { if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'") { quote = c; continue; }
            if (c === '>') break;
        }
        if (k >= content.length) return;
        yield { closing, name: content.slice(start, j), attrs: content.slice(j, k) };
        i = k + 1;
    }
}

/** Every `@event` of the template, with where it sits; `twoWay` when any `::` binding is on a plain element. */
function collect(nodes: TemplateNode[]): { handlers: Handler[]; twoWay: boolean } {
    const handlers: Handler[] = [];
    let twoWay = false;
    // The open elements: whether each is, or is under, a component.
    const opened: boolean[] = [];
    const walk = (list: TemplateNode[], inFor: boolean, inPortal: boolean): void => {
        for (const node of list) {
            switch (node.type) {
                case 'html': readMarkup(node.content, inFor, inPortal); break;
                case 'for':
                    walk(node.body, true, inPortal);
                    if (node.emptyBody) walk(node.emptyBody, inFor, inPortal);
                    break;
                case 'portal': walk(node.body, inFor, true); break;
                case 'switch':
                    for (const c of node.cases) walk(c.body, inFor, inPortal);
                    if (node.defaultBody) walk(node.defaultBody, inFor, inPortal);
                    break;
                case 'defer':
                    for (const b of [node.body, node.placeholder, node.loading, node.error]) if (b) walk(b, inFor, inPortal);
                    break;
                case 'try': walk(node.body, inFor, inPortal); walk(node.catchBody, inFor, inPortal); break;
                case 'await':
                    for (const b of [node.body, node.loading, node.errorBody]) if (b) walk(b, inFor, inPortal);
                    break;
                case 'if': case 'require':
                    walk(node.body, inFor, inPortal);
                    if (node.elseBody) walk(node.elseBody, inFor, inPortal);
                    break;
                case 'show': case 'custom-directive': case 'scoped-slot':
                    walk(node.body, inFor, inPortal);
                    break;
                // A slot template's body is rendered into another component: opaque, its events stay
                // on its elements (#113, #364).
                default: break;
            }
        }
    };
    const readMarkup = (content: string, inFor: boolean, inPortal: boolean): void => {
        for (const { closing, name, attrs } of tags(content)) {
            if (closing) { opened.pop(); continue; }
            const custom = name.includes('-') || opened[opened.length - 1] === true;
            // Match: `@type.mod.mod=`. Groups: [1]=type [2]=modifiers
            for (const e of attrs.matchAll(/(?:^|\s)@([\w-]+)((?:\.[\w-]+)*)\s*=/g)) {
                handlers.push({ type: e[1], mods: e[2].split('.').filter(Boolean), inFor, opaque: custom || inPortal });
            }
            if (!custom && /(?:^|\s)::[\w-]/.test(attrs)) twoWay = true;
            if (!VOID_ELEMENTS.has(name) && !attrs.trimEnd().endsWith('/')) opened.push(custom);
        }
    };
    walk(nodes, false, false);
    return { handlers, twoWay };
}

/** The event types this template delegates. */
export function delegatedEventTypes(nodes: TemplateNode[]): Set<string> {
    const { handlers, twoWay } = collect(nodes);
    const types = new Set<string>();
    for (const h of handlers) if (h.inFor && delegableHandler(h.type, h.mods, h.opaque)) types.add(h.type);
    for (const h of handlers) {
        if (h.opaque || h.mods.includes('capture')) continue;
        if (h.mods.some(m => DIRECT_ONLY.includes(m))) types.delete(h.type);
    }
    if (twoWay) { types.delete('input'); types.delete('change'); }
    return types;
}

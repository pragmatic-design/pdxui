// `@for … @virtual` (#283): the shape it needs, and what it cannot do.
//
// The scroll container is the element the template writes around the `@for` (decisions.md 45): the
// `@for` is that element's only content, the element is native (a component's children are
// projected elsewhere), and a row is one element, which the virtualizer measures and the spacers
// stand in for. Anything else is `PDX_VIRTUAL_SHAPE`, naming the rule it broke.
//
// A transition modifier is `PDX_VIRTUAL_TRANSITION`: a row that scrolls out of the window is not
// leaving the list, and one that scrolls in is not arriving.

import type { ForNode, TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { VOID_ELEMENTS } from './codegen-template-inline';
import { removeHtmlComments } from '../text-scan';

/** Markup with its comments taken out — they are not content — by the compiler's linear scan. */
const withoutComments = removeHtmlComments;

// Match: an opening tag at the end of the markup (not `</x>`, not `<x/>`). Groups: [1]=tag name
const TRAILING_OPEN_TAG = /<([a-zA-Z][\w-]*)(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?>\s*$/;

/** The element the `@for` at `i` sits in, when the markup just before it opens one. */
function openingBefore(nodes: TemplateNode[], i: number): string | null {
    const prev = nodes[i - 1];
    if (!prev || prev.type !== 'html') return null;
    const m = TRAILING_OPEN_TAG.exec(withoutComments(prev.content));
    if (!m || VOID_ELEMENTS.has(m[1].toLowerCase())) return null;
    return m[1].toLowerCase();
}

/** Does the markup just after the `@for` at `i` close `tag`, with nothing before it? */
function closesAfter(nodes: TemplateNode[], i: number, tag: string): boolean {
    const next = nodes[i + 1];
    if (!next || next.type !== 'html') return false;
    return new RegExp(`^\\s*</${tag}\\s*>`, 'i').test(withoutComments(next.content));
}

/**
 * How many top-level elements, and how much top-level content besides, a block holds. A node that is
 * not markup (an interpolation, an `@if`) at the top level is content of its own.
 */
function topLevel(nodes: TemplateNode[]): { elements: string[]; other: boolean } {
    const elements: string[] = [];
    let other = false;
    let depth = 0;
    for (const node of nodes) {
        if (node.type !== 'html') {
            if (depth === 0) other = true;
            continue;
        }
        const s = withoutComments(node.content);
        let i = 0;
        while (i < s.length) {
            if (s[i] !== '<') {
                const next = s.indexOf('<', i);
                const text = s.slice(i, next === -1 ? s.length : next);
                if (depth === 0 && text.trim()) other = true;
                i = next === -1 ? s.length : next;
                continue;
            }
            const end = s.indexOf('>', i);
            if (end === -1) break;
            const tag = s.slice(i, end + 1);
            const close = /^<\//.test(tag);
            const name = /^<\/?([a-zA-Z][\w-]*)/.exec(tag)?.[1]?.toLowerCase() ?? '';
            if (close) depth = Math.max(0, depth - 1);
            else {
                if (depth === 0) elements.push(name);
                if (!tag.endsWith('/>') && !VOID_ELEMENTS.has(name)) depth++;
            }
            i = end + 1;
        }
    }
    return { elements, other };
}

/** The tag of a virtual `@for`'s rows: what its spacers are made of. */
export function virtualRowTag(node: ForNode): string {
    return topLevel(node.body).elements[0] ?? 'div';
}

function checkOne(nodes: TemplateNode[], i: number, node: ForNode): ValidationWarning[] {
    const out: ValidationWarning[] = [];
    const line = node.loc?.line;
    const shape = (message: string, hint: string): void => {
        out.push({ code: 'PDX_VIRTUAL_SHAPE', severity: 'error', message, hint, ...(line ? { line } : {}) });
    };

    const tag = openingBefore(nodes, i);
    const alone = tag !== null && closesAfter(nodes, i, tag);
    if (tag === null && !nodes[i - 1] && !nodes[i + 1]) {
        shape('@for … @virtual must be inside an element, the scroll container, as its only content.',
            'Wrap it: <ul class="feed">@for (…) @virtual { <li>…</li> }</ul>, and give the element a bounded height.');
    } else if (!alone) {
        shape(`@for … @virtual must be the only content of its container${tag ? ` <${tag}>` : ''}: the element around it is what scrolls, and nothing else may sit beside the rows.`,
            'Move the other content outside the container, or into its own element.');
    } else if (tag.includes('-')) {
        shape(`<${tag}> is a component: its children are projected, so it cannot be the scroll container. The container must be a native element.`,
            `Put a native element inside it: <${tag}><div class="list">@for (…) @virtual { … }</div></${tag}>.`);
    }

    const { elements, other } = topLevel(node.body);
    if (elements.length !== 1 || other) {
        shape('The body of a @for … @virtual must have exactly one root element: each row is one element, which is measured and which the spacers stand in for.',
            'Wrap the row in one element: @for (…) @virtual { <li>…</li> }.');
    }

    const t = node.transition;
    if (t && (t.enter || t.exit || t.stagger !== undefined || t.mode || t.move)) {
        out.push({
            code: 'PDX_VIRTUAL_TRANSITION', severity: 'error',
            message: '@for … @virtual cannot animate its rows: a row that scrolls out of view is not leaving the list, and one that scrolls in is not arriving.',
            hint: 'Remove @transition, @stagger, @mode and @move from this @for, or remove @virtual.',
            ...(line ? { line } : {}),
        });
    }
    return out;
}

/** Every virtual `@for` of the template, checked where it sits. */
export function checkVirtualFor(ast: TemplateNode[]): ValidationWarning[] {
    const out: ValidationWarning[] = [];
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            const nodes = value as TemplateNode[];
            nodes.forEach((n, i) => {
                if (n && typeof n === 'object' && n.type === 'for' && (n as ForNode).virtual) out.push(...checkOne(nodes, i, n as ForNode));
            });
            for (const n of nodes) visit(n);
        } else if (value && typeof value === 'object') {
            for (const v of Object.values(value)) if (v && typeof v === 'object') visit(v);
        }
    };
    visit(ast);
    return out;
}

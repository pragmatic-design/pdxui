// CD-D4  PDX_OVERLAY_NOT_DEFERRED (#1209): a page's closed overlay outside a `@defer`.
//
// A page that renders a dialog or a drawer, closed until a click, loads it — and every component in
// it — on the first visit. #1201 measured up to 175 KB gzip on one showcase list page. `@defer (idle)`
// around the overlays is the fix (the shape of tickets.pdx), and the developer has to know to write it:
// the framework says it instead. A design warning, not an implicit defer: taking the element out of the
// DOM until idle behind the developer's back would break a `:ref` or a query that worked.
//
// An overlay is an element whose tag has an `open` model (the library's manifest, or a project
// component's `@model open`), with `open` bound to anything but the literal `true`. One warning per run
// of adjacent overlays, with a fix that wraps the run in one `@defer (idle) { … }`.
//
// Not one that opens itself from a trigger of the page: a component that declares a `trigger` prop
// (`pdx-popover`, anchored to the element before it) wires that trigger's click in its own setup.
// Deferred, a click on the trigger before the page is idle would do nothing. A dialog the page opens
// is opened by the page's own signal, which the deferred dialog reads when it renders.

import type { HtmlNode, TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import type { ModelsLookup } from './validate-two-way';
import type { PropsLookup } from './compile-context';

/** An overlay found outside every `@defer`, as offsets into the `.pdx` source. */
interface Overlay { tag: string; start: number; end: number }

/** The child lists a node renders at once, and those it renders only once deferred. */
function children(node: TemplateNode): { now: TemplateNode[][]; deferred: TemplateNode[][] } {
    if (node.type === 'defer') {
        // The placeholder, the loading and the error bodies render before or without the body.
        return { now: [node.placeholder, node.loading, node.error].filter((b): b is TemplateNode[] => !!b), deferred: [node.body] };
    }
    const now: TemplateNode[][] = [];
    // Every other block renders its bodies as it renders: an @if branch, a @for row, a snippet.
    for (const value of Object.values(node)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'type' in value[0]) now.push(value as TemplateNode[]);
    }
    // A @switch's cases are objects holding their bodies; its default is a list, read above.
    if (node.type === 'switch') for (const c of node.cases) now.push(c.body);
    return { now, deferred: [] };
}

/** The `.pdx` offset of index `k` of an html node's content, as the source map reads it (codegen-origins.ts). */
function sourceOffset(node: HtmlNode, templateStart: number, k: number): number | null {
    if (node.loc?.offset == null) return null;
    const shifts = (node.shifts ?? []).filter((s) => s <= k).length;
    const inserted = (node.insertions ?? []).reduce((n, ins) => n + (k >= ins.at ? Math.min(ins.length, k - ins.at) : 0), 0);
    return templateStart + node.loc.offset + k + shifts - inserted;
}

/** The index just past the `>` closing the opening tag at `from`, quotes skipped; -1 when there is none. */
function tagEnd(text: string, from: number): number {
    let quote = '';
    for (let i = from; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '>') return i + 1;
    }
    return -1;
}

/** The end of the element opening at `start` in `source`: past its `/>`, or past its matching `</tag>`. */
function elementEnd(source: string, start: number, tag: string): number | null {
    const open = tagEnd(source, start);
    if (open < 0) return null;
    if (source[open - 2] === '/') return open;
    // Match: an opening or a closing tag of the same name. Groups: [1]=`/` for a closing one
    const re = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'gi');
    re.lastIndex = open;
    let depth = 1;
    for (let m = re.exec(source); m; m = re.exec(source)) {
        if (m[1]) { if (--depth === 0) { const close = source.indexOf('>', m.index); return close < 0 ? null : close + 1; } }
        else {
            const end = tagEnd(source, m.index);
            if (end > 0 && source[end - 2] !== '/') depth++;
        }
    }
    return null;
}

// Match: `:open="…"` or `::open="…"` in an opening tag, with what it binds. Groups: [1]=the value
const OPEN_BINDING = /(?<=\s)::?open\s*=\s*(?:"([^"]*)"|'([^']*)')/;
// Match: an opening tag of a custom element. Groups: [1]=the tag
const CUSTOM_TAG = /<([a-z][a-z0-9]*-[\w-]*)(?=[\s/>])/gi;

/** The overlays outside every `@defer`, in source order. */
function overlaysOf(ast: TemplateNode[], modelsOf: ModelsLookup, propsOf: PropsLookup | undefined, source: string, templateStart: number): Overlay[] {
    const out: Overlay[] = [];
    const visit = (nodes: TemplateNode[], deferred: boolean): void => {
        for (const node of nodes) {
            if (node.type === 'html') {
                if (deferred || node.raw) continue;
                for (const m of node.content.matchAll(CUSTOM_TAG)) {
                    const tag = m[1].toLowerCase();
                    const models = modelsOf(tag);
                    if (!models || ![...models].includes('open')) continue;
                    // One that opens itself from a trigger of the page (see the header): not the page's to defer.
                    if (propsOf?.(tag)?.has('trigger')) continue;
                    const end = tagEnd(node.content, m.index ?? 0);
                    const opening = node.content.slice(m.index, end < 0 ? undefined : end);
                    const bound = OPEN_BINDING.exec(opening);
                    if (!bound || (bound[1] ?? bound[2]).trim() === 'true') continue;
                    const start = sourceOffset(node, templateStart, m.index ?? 0);
                    if (start == null || source.slice(start, start + tag.length + 1).toLowerCase() !== `<${tag}`) continue;
                    const close = elementEnd(source, start, tag);
                    if (close != null) out.push({ tag, start, end: close });
                }
                continue;
            }
            const { now, deferred: later } = children(node);
            for (const body of now) visit(body, deferred);
            for (const body of later) visit(body, true);
        }
    };
    visit(ast, false);
    return out.sort((a, b) => a.start - b.start);
}

/** The fix: the run's lines, indented one step more, inside `@defer (idle) { … }`. */
function wrapInDefer(source: string, start: number, end: number): ValidationWarning['fix'] {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const indent = source.slice(lineStart, start);
    if (/\S/.test(indent)) {
        // The run starts mid-line: wrap it where it stands.
        return { title: 'Wrap in @defer (idle)', edits: [{ start, end, newText: `@defer (idle) { ${source.slice(start, end)} }` }] };
    }
    const body = source.slice(lineStart, end).split('\n').map((l) => (l.trim() ? `  ${l}` : l)).join('\n');
    return {
        title: 'Wrap in @defer (idle): load the overlays when the page is idle, not on its first visit',
        edits: [{ start: lineStart, end, newText: `${indent}@defer (idle) {\n${body}\n${indent}}` }],
    };
}

/**
 * PDX_OVERLAY_NOT_DEFERRED for a `@page`'s closed overlays outside a `@defer`: one warning for each
 * run of adjacent ones, with only whitespace between them, on the line of its first.
 */
export function checkOverlaysNotDeferred(
    ast: TemplateNode[], modelsOf: ModelsLookup | undefined, propsOf: PropsLookup | undefined, source: string, templateStart: number,
): ValidationWarning[] {
    if (!modelsOf) return [];
    const runs: Overlay[][] = [];
    let last: Overlay | null = null;
    for (const o of overlaysOf(ast, modelsOf, propsOf, source, templateStart)) {
        // An overlay inside one already found is in its run: the outer @defer covers it.
        if (last && o.start < last.end) continue;
        // Adjacent: nothing but whitespace and HTML comments between them — a comment loads nothing.
        if (last && !/\S/.test(source.slice(last.end, o.start).replace(/<!--[\s\S]*?-->/g, ''))) runs[runs.length - 1].push(o);
        else runs.push([o]);
        last = o;
    }
    return runs.map((run) => {
        const names = [...new Set(run.map((o) => `<${o.tag}>`))].join(', ');
        const start = run[0].start;
        const end = run[run.length - 1].end;
        return {
            code: 'PDX_OVERLAY_NOT_DEFERRED',
            severity: 'warn',
            message: `${names} ${run.length > 1 ? 'are' : 'is'} closed until the page opens ${run.length > 1 ? 'them' : 'it'}, and outside a @defer (CD-D4): `
                + `the first visit loads ${run.length > 1 ? 'them' : 'it'}, and every component inside, before anyone asks.`,
            hint: 'Wrap the overlays in @defer (idle) { … }: they load once the page is idle, and are there before a click can open them.',
            fix: wrapInDefer(source, start, end),
            line: source.slice(0, start).split('\n').length,
        };
    });
}

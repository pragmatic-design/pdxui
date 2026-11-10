// `@part trigger, popup;` (#134): each declared part is `data-part="name"`, written literally on the
// elements it names, and a `data-part` names a declared part. A part is every element that carries it
// (#988), as the platform's `part` attribute is: when the template can render at most one of them at
// a time, the script's name is that element; otherwise it is the array of the rendered ones.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { openingTagTexts } from '../text-scan';

/** The markup of every html node in the template, `@raw` blocks left out: they are text. */
export function markupOf(nodes: unknown, out: string[] = []): string[] {
    if (Array.isArray(nodes)) {
        for (const n of nodes) markupOf(n, out);
    } else if (nodes && typeof nodes === 'object') {
        const node = nodes as { type?: string; content?: unknown; raw?: boolean };
        if (node.type === 'html') {
            if (!node.raw && typeof node.content === 'string') out.push(node.content);
            return out;
        }
        // Every other node: its children are in its arrays and nested objects (branches, cases).
        for (const value of Object.values(node)) if (value && typeof value === 'object') markupOf(value, out);
    }
    return out;
}

// Match: a literal `data-part="name"` attribute in an opening tag (not `:data-part`, not
// `x-data-part`). Groups: [1]/[2]=the name
const DATA_PART = /(?<=\s)data-part=(?:"([^"]*)"|'([^']*)')/g;

/** How many elements of one html node's markup carry each literal `data-part`. */
function markupCounts(markup: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const tag of openingTagTexts(markup)) {
        for (const m of tag.matchAll(DATA_PART)) {
            const name = m[1] ?? m[2];
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    return counts;
}

type Counts = Map<string, number>;

/** One after the other: both render, so the counts add. */
function sum(into: Counts, more: Counts): Counts {
    for (const [name, n] of more) into.set(name, (into.get(name) ?? 0) + n);
    return into;
}

/** Alternatives: one of them renders, so the largest count is what can be there at once. */
function largest(alternatives: Counts[]): Counts {
    const out: Counts = new Map();
    for (const counts of alternatives) {
        for (const [name, n] of counts) out.set(name, Math.max(out.get(name) ?? 0, n));
    }
    return out;
}

/** Any number of times: an `@for` row, a `@snippet` the child calls as often as it likes. */
function repeated(counts: Counts): Counts {
    for (const name of counts.keys()) counts.set(name, Infinity);
    return counts;
}

/** The counts of one node, by what its directive renders. */
function nodeCounts(node: TemplateNode): Counts {
    switch (node.type) {
        case 'html': return node.raw ? new Map() : markupCounts(node.content);
        // `@else if` is an `@if` in the `elseBody`: the chain is alternatives all the way down.
        case 'if': case 'require': return largest([sequenceCounts(node.body), sequenceCounts(node.elseBody ?? [])]);
        case 'switch': return largest([...node.cases.map((c) => sequenceCounts(c.body)), sequenceCounts(node.defaultBody ?? [])]);
        // A row per item, or the empty body instead of every row.
        case 'for': return largest([repeated(sequenceCounts(node.body)), sequenceCounts(node.emptyBody ?? [])]);
        // One state at a time: the content, or its placeholder, its loading, its error.
        case 'defer': return largest([node.body, node.placeholder, node.loading, node.error].map((b) => sequenceCounts(b ?? [])));
        case 'await': return largest([node.body, node.loading, node.errorBody].map((b) => sequenceCounts(b ?? [])));
        case 'try': return largest([sequenceCounts(node.body), sequenceCounts(node.catchBody)]);
        case 'snippet': return repeated(sequenceCounts(node.body));
        case 'render': return sequenceCounts(node.fallback ?? []);
        // Rendered once, as it is: a custom directive's body is one expression of the render.
        case 'show': case 'portal': case 'hydrate': case 'custom-directive': return sequenceCounts(node.body);
        case 'interpolation': case 'let': case 'removed-slot': return new Map();
    }
}

function sequenceCounts(nodes: readonly TemplateNode[]): Counts {
    const out: Counts = new Map();
    for (const node of nodes) sum(out, nodeCounts(node));
    return out;
}

/**
 * How many elements carrying each literal `data-part` the template can render at the same time, by
 * name: `1` for one element, or for alternative branches of one chain; more for siblings or separate
 * blocks; `Infinity` inside an `@for` row or a `@snippet`.
 */
export function dataPartCounts(ast: readonly TemplateNode[]): Map<string, number> {
    return sequenceCounts(ast);
}

/** The declared parts whose script name is an array: those the template can render more than once. */
export function repeatedParts(parts: readonly string[], ast: readonly TemplateNode[]): Set<string> {
    const counts = dataPartCounts(ast);
    return new Set(parts.filter((name) => (counts.get(name) ?? 0) > 1));
}

/**
 * The part diagnostics: a declared part on no element (`PDX_PART_MISSING`), and a `data-part` the
 * script does not declare (`PDX_PART_UNDECLARED`).
 */
export function checkParts(parts: readonly string[], ast: TemplateNode[]): ValidationWarning[] {
    const counts = dataPartCounts(ast);
    const declared = new Set(parts);
    const warnings: ValidationWarning[] = [];
    for (const name of declared) {
        if ((counts.get(name) ?? 0) === 0) {
            warnings.push({
                code: 'PDX_PART_MISSING', severity: 'error',
                message: `@part '${name}' is on no element of the template.`,
                hint: `Write data-part="${name}" on the element it names, or remove it from @part.`,
            });
        }
    }
    for (const name of counts.keys()) {
        if (declared.has(name)) continue;
        warnings.push({
            code: 'PDX_PART_UNDECLARED', severity: 'error',
            message: `data-part '${name}' names no part the script declares.`,
            hint: `Declare it: @part ${name};`,
        });
    }
    return warnings;
}

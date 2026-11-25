// `@part trigger, popup;` (#134): each declared part is `data-part="name"`, written literally on the
// elements it names, and a `data-part` names a declared part. A part is every element that carries it
// (#988), as the platform's `part` attribute is: when the template can render at most one of them at
// a time, the script's name is that element; otherwise it is the array of the rendered ones.

import { parseTemplate, type TemplateNode } from '../parser/template';
import type { ScriptSnippet } from './script-analyzer-types';
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

/**
 * The template and the script's `@snippet` bodies (#1412): a script snippet is a template the
 * component renders with `@render`, so its elements' parts are the component's. Each body is a
 * `snippet` node, rendered any number of times, as a template `@snippet` counts. A body that does not
 * parse yet — the editor validates a file as it is typed, and the compile reports the parse error
 * itself — is read as markup text, as the counts read any html node.
 */
export function withScriptSnippets(ast: readonly TemplateNode[], snippets: readonly ScriptSnippet[]): TemplateNode[] {
    const out = [...ast];
    for (const s of snippets) {
        let body: TemplateNode[];
        try {
            body = parseTemplate(s.body);
        } catch {
            body = [{ type: 'html', content: s.body }];
        }
        out.push({ type: 'snippet', name: s.name, params: s.params, body });
    }
    return out;
}

/** The declared parts whose script name is an array: those the template can render more than once. */
export function repeatedParts(parts: readonly string[], ast: readonly TemplateNode[]): Set<string> {
    const counts = dataPartCounts(ast);
    return new Set(parts.filter((name) => (counts.get(name) ?? 0) > 1));
}

// Match: a name the script can declare. Groups: none
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

// Match: a `:ref=` binding in an opening tag.
const REF_BINDING = /(?<=\s):ref=/;

/** Does an element carrying the literal `data-part="name"` also bind a `:ref`? */
function partHasRef(name: string, ast: readonly TemplateNode[]): boolean {
    for (const markup of markupOf(ast)) {
        for (const tag of openingTagTexts(markup)) {
            if (!REF_BINDING.test(tag)) continue;
            for (const m of tag.matchAll(DATA_PART)) if ((m[1] ?? m[2]) === name) return true;
        }
    }
    return false;
}

/**
 * The part diagnostics: a declared part on no element (`PDX_PART_MISSING`), a `data-part` the
 * script does not declare (`PDX_PART_UNDECLARED`), and a part whose name the script declares as
 * something other than a signal, with no `:ref` on its element to reach it (`PDX_PART_NAME_TAKEN`).
 * `signalNames` are the script's signals: a part's own, or a `$signal` that receives its element.
 *
 * The parts an `@internal` view draws are its owner's (#1110): `drawnBy` maps each part the owner's
 * imported views draw to the view that draws it, and `internal` says this file is such a view, whose
 * own `data-part`s its owner checks. `scriptReads` says whether the script reads a name.
 */
export function checkParts(parts: readonly string[], ast: TemplateNode[], signalNames: ReadonlySet<string>,
    { internal = false, drawnBy = new Map(), scriptReads = () => false, external = [], scriptWrites = () => false }: PartContext = {}): ValidationWarning[] {
    const counts = dataPartCounts(ast);
    const declared = new Set(parts);
    const outside = new Set(external);
    const warnings: ValidationWarning[] = [];
    for (const name of declared) {
        if (outside.has(name)) {
            warnings.push(...checkExternalPart(name, (counts.get(name) ?? 0) > 0 || drawnBy.has(name), scriptWrites(name)));
            continue;
        }
        const view = drawnBy.get(name);
        if ((counts.get(name) ?? 0) === 0 && view) {
            // The owner's part, on an element of its view: the owner's script never holds that element.
            if (signalNames.has(name) && scriptReads(name)) {
                warnings.push({
                    code: 'PDX_PART_IN_VIEW', severity: 'warn',
                    message: `@part '${name}' is drawn by ${view}, an @internal view: '${name}' in this script is never its element.`,
                    hint: `Reach the element in ${view}, with a :ref there, and pass what the owner needs as a prop or an event.`,
                });
            }
            continue;
        }
        if ((counts.get(name) ?? 0) === 0) {
            warnings.push({
                code: 'PDX_PART_MISSING', severity: 'error',
                message: `@part '${name}' is on no element of the template.`,
                hint: `Write data-part="${name}" on the element it names, or remove it from @part.`,
            });
        } else if (!signalNames.has(name) && !partHasRef(name, ast) && IDENTIFIER.test(name)) {
            // A hyphenated name (#1299) is no identifier: no script declaration can have it.
            warnings.push({
                code: 'PDX_PART_NAME_TAKEN', severity: 'info',
                message: `@part '${name}' has the name of a script declaration, which keeps its meaning: the script does not read the part's element by that name.`,
                hint: `To reach the element, give it a :ref to a $signal of another name: data-part="${name}" :ref="${name}El".`,
            });
        }
    }
    // A view's parts, and those of the views it imports, are declared by its owner, which checks them
    // against every view under it.
    if (internal) return warnings;
    for (const name of counts.keys()) {
        if (declared.has(name)) continue;
        warnings.push({
            code: 'PDX_PART_UNDECLARED', severity: 'error',
            message: `data-part '${name}' names no part the script declares.`,
            hint: `Declare it: @part ${name};`,
        });
    }
    for (const [name, view] of drawnBy) {
        if (declared.has(name)) continue;
        warnings.push({
            code: 'PDX_PART_UNDECLARED', severity: 'error',
            message: `data-part '${name}', drawn by ${view}, an @internal view of this component, names no part the script declares.`,
            hint: `Declare it here, in the component the view belongs to: @part ${name};`,
        });
    }
    return warnings;
}

/**
 * An `@part(external)` part (#1284): the template draws none of its elements, the script writes it on
 * those it builds or marks. Drawn by the template, the declaration says the opposite of what is
 * there (`PDX_PART_EXTERNAL_DRAWN`); written by nothing, it is a name no element carries
 * (`PDX_PART_EXTERNAL_UNWRITTEN`), what `PDX_PART_MISSING` is for a template's part.
 */
function checkExternalPart(name: string, drawn: boolean, written: boolean): ValidationWarning[] {
    if (drawn) {
        return [{
            code: 'PDX_PART_EXTERNAL_DRAWN', severity: 'error',
            message: `@part(external) '${name}' is on an element of the template: an external part is one the template does not draw.`,
            hint: `Declare it with the template's parts, @part ${name};, or take data-part="${name}" off the template.`,
        }];
    }
    if (!written) {
        return [{
            code: 'PDX_PART_EXTERNAL_UNWRITTEN', severity: 'error',
            message: `@part(external) '${name}' is written by nothing in the script: no setAttribute('data-part', '${name}'), no .dataset.part = '${name}'.`,
            hint: `Write it on the element it names, el.setAttribute('data-part', '${name}'), or remove it from @part.`,
        }];
    }
    return [];
}

/** Does the script write `name` as a part, with `setAttribute('data-part', …)` or `.dataset.part =`? (#1284) */
export function writesPart(code: string, name: string): boolean {
    const n = escapeName(name);
    // Match: setAttribute('data-part', 'name'), any quotes, the name whole.  Groups: [1]/[2]=the quotes
    const attribute = new RegExp(`setAttribute\\(\\s*(['"\`])data-part\\1\\s*,\\s*(['"\`])${n}\\2\\s*\\)`);
    // Match: .dataset.part = 'name', any quote.  Groups: [1]=the quote
    const dataset = new RegExp(`\\.dataset\\.part\\s*=\\s*(['"\`])${n}\\1`);
    return attribute.test(code) || dataset.test(code);
}

const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What `checkParts` knows beyond the file: its @internal views, and whether it is one (#1110). */
export interface PartContext {
    internal?: boolean;
    drawnBy?: ReadonlyMap<string, string>;
    scriptReads?: (name: string) => boolean;
    /** The `@part(external)` names (#1284), and whether the script writes one. */
    external?: readonly string[];
    scriptWrites?: (name: string) => boolean;
}

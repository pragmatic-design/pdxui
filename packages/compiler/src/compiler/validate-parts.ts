// `@part trigger, popup;` (#134): each declared part is `data-part="name"`, written literally on
// exactly one element of the template, and a `data-part` names a declared part.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { openingTagTexts } from '../text-scan';

/** The markup of every html node in the template, `@raw` blocks left out: they are text. */
function markupOf(nodes: unknown, out: string[] = []): string[] {
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

/** How many elements of the template carry each literal `data-part`, by name. */
export function dataPartCounts(ast: TemplateNode[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const markup of markupOf(ast)) {
        for (const tag of openingTagTexts(markup)) {
            for (const m of tag.matchAll(DATA_PART)) {
                const name = m[1] ?? m[2];
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
    }
    return counts;
}

/**
 * The part diagnostics: a declared part on no element (`PDX_PART_MISSING`) or on more than one
 * (`PDX_PART_DUPLICATE`), and a `data-part` the script does not declare (`PDX_PART_UNDECLARED`).
 */
export function checkParts(parts: readonly string[], ast: TemplateNode[]): ValidationWarning[] {
    const counts = dataPartCounts(ast);
    const declared = new Set(parts);
    const warnings: ValidationWarning[] = [];
    for (const name of declared) {
        const n = counts.get(name) ?? 0;
        if (n === 0) {
            warnings.push({
                code: 'PDX_PART_MISSING', severity: 'error',
                message: `@part '${name}' is on no element of the template.`,
                hint: `Write data-part="${name}" on the element it names, or remove it from @part.`,
            });
        } else if (n > 1) {
            warnings.push({
                code: 'PDX_PART_DUPLICATE', severity: 'error',
                message: `@part '${name}' is on ${n} elements of the template: a part names one.`,
                hint: `Keep data-part="${name}" on one element; give the others parts of their own.`,
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

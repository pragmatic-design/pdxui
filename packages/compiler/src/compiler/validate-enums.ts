// PDX_INVALID_ENUM_VALUE — an attribute value outside the values its prop declares.
//
// Part of validate(), so the Vite plugin, `pdx check` and the editor all see it, given the
// resolver's enum lookup through `ValidateOptions.enumValues`. It reads a bound string literal too — `:size="'huge'"` is the
// same mistake as `size="huge"`.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { removeHtmlComments } from '../text-scan';

/** The allowed values of an enum prop on a component, or null when it is not one. */
export type EnumLookup = (tag: string, prop: string) => readonly string[] | null;

const kebabToCamel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Every piece of markup in the template, from every branch of every block. */
function markupOf(nodes: TemplateNode[]): string {
    let out = '';
    const walk = (list: TemplateNode[] | undefined): void => {
        for (const node of list ?? []) {
            switch (node.type) {
                case 'html': out += node.content + '\n'; break;
                case 'if': walk(node.body); walk(node.elseBody); break;
                case 'for': walk(node.body); walk(node.emptyBody); break;
                case 'switch': for (const c of node.cases) walk(c.body); walk(node.defaultBody); break;
                case 'require': walk(node.body); walk(node.elseBody); break;
                case 'show': case 'portal': case 'slot-template': case 'custom-directive': walk(node.body); break;
                case 'defer': walk(node.body); walk(node.placeholder); walk(node.loading); walk(node.error); break;
                case 'try': walk(node.body); walk(node.catchBody); break;
                case 'await': walk(node.body); walk(node.loading); walk(node.errorBody); break;
            }
        }
    };
    walk(nodes);
    return out;
}

/**
 * Static values (`size="huge"`) and bound string literals (`:size="'huge'"`) of enum props on
 * known components, against the values the component declares. Anything else bound is an
 * expression whose value is not known here, and is left alone.
 */
export function checkEnumValues(ast: TemplateNode[], enumValues: EnumLookup, warnings: ValidationWarning[]): void {
    // A commented-out tag is not rendered: a finding about it is about code that does not run.
    const markup = removeHtmlComments(markupOf(ast));
    // Match: an opening `<pdx-tag …>` (also self-closing). Groups: [1]=tag [2]=the attributes.
    for (const tm of markup.matchAll(/<(pdx-[\w-]+)\b([^>]*?)\/?>/gis)) {
        const tag = tm[1].toLowerCase();
        // Match: `name="literal"`, or `:name="'literal'"`. The lookbehind rejects `@name`, `::name` and
        // `x-name`; `{ }` in the value is an interpolation, not a literal.
        // Groups: [1]=`:` when bound [2]=name [3]/[4]=static value [5]/[6]=bound literal.
        const attrRe = /(?<![@.\w:-])(:?)([a-z][\w-]*)\s*=\s*(?:"([^"{}']*)"|'([^'{}"]*)'|"\s*'([^'{}]*)'\s*"|'\s*"([^"{}]*)"\s*')/gi;
        for (const am of tm[2].matchAll(attrRe)) {
            const bound = am[1] === ':';
            const value = bound ? (am[5] ?? am[6]) : (am[3] ?? am[4]);
            if (value === undefined || value === '') continue;
            const name = am[2].toLowerCase();
            const allowed = enumValues(tag, name) ?? enumValues(tag, kebabToCamel(name));
            if (!allowed || allowed.includes(value)) continue;
            warnings.push({
                code: 'PDX_INVALID_ENUM_VALUE',
                severity: 'warn',
                message: `<${tag}> ${name}="${value}" is not a declared value for "${name}".`,
                hint: `Allowed: ${allowed.map((v) => `"${v}"`).join(', ')}.`,
            });
        }
    }
}

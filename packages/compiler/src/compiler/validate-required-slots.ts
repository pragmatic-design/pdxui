// PDX_SLOT_REQUIRED (#489): a component used without a snippet it requires. A `.pdx` requires every
// `@slot name: (…);` declared without `?`. A use fills a slot with a `@snippet name(…) { … }` written
// directly inside its tag — not inside a component nested in it, which fills that one.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { tags } from './inline-event-delegation';
import { VOID_ELEMENTS } from './codegen-template-inline';
import { ordinal } from './validate-required-props';

/** The typed snippets a component requires; null when they are not known. */
export type RequiredSlotsLookup = (tag: string) => ReadonlySet<string> | readonly string[] | null;

/** One use of a component in the template, and the snippets written in its tag. */
interface Use { tag: string; filled: Set<string> }

/** The node lists inside a node: its body, its branches, its fallback. */
function childLists(node: TemplateNode): (TemplateNode[] | undefined)[] {
    switch (node.type) {
        case 'if': case 'require': return [node.body, node.elseBody];
        case 'for': return [node.body, node.emptyBody];
        case 'switch': return [...node.cases.map(c => c.body), node.defaultBody];
        case 'defer': return [node.body, node.placeholder, node.loading, node.error];
        case 'try': return [node.body, node.catchBody];
        case 'await': return [node.body, node.loading, node.errorBody];
        case 'render': return [node.fallback];
        case 'show': case 'portal': case 'slot-template': case 'scoped-slot': case 'snippet': case 'custom-directive':
            return [node.body];
        default: return [];
    }
}

/** Every use of a component in the template, in source order, with the snippets its tag holds. */
function usesOf(ast: TemplateNode[]): Use[] {
    const uses: Use[] = [];
    const walk = (list: TemplateNode[] | undefined): void => {
        // The elements open in this run of nodes: a use for a component, null for a plain element.
        const open: (Use | null)[] = [];
        for (const node of list ?? []) {
            if (node.type === 'html') {
                if (node.raw) continue;
                for (const { closing, name, attrs } of tags(node.content)) {
                    if (closing) { open.pop(); continue; }
                    const use = name.includes('-') ? { tag: name.toLowerCase(), filled: new Set<string>() } : null;
                    if (use) uses.push(use);
                    if (!VOID_ELEMENTS.has(name.toLowerCase()) && !attrs.trimEnd().endsWith('/')) open.push(use);
                }
                continue;
            }
            if (node.type === 'snippet') open[open.length - 1]?.filled.add(node.name);
            for (const child of childLists(node)) walk(child);
        }
    };
    walk(ast);
    return uses;
}

/**
 * PDX_SLOT_REQUIRED for each use of a component that leaves a required snippet unfilled. When the
 * template uses the tag more than once, the message says which use — the position locator finds it.
 */
export function checkRequiredSlots(ast: TemplateNode[], requiredSlotsOf?: RequiredSlotsLookup): ValidationWarning[] {
    if (!requiredSlotsOf) return [];
    const uses = usesOf(ast);
    const total = new Map<string, number>();
    for (const u of uses) total.set(u.tag, (total.get(u.tag) ?? 0) + 1);
    const seen = new Map<string, number>();
    const warnings: ValidationWarning[] = [];
    for (const { tag, filled } of uses) {
        const nth = (seen.get(tag) ?? 0) + 1;
        seen.set(tag, nth);
        const required = requiredSlotsOf(tag);
        if (!required) continue;
        const missing = [...required].filter(name => !filled.has(name));
        if (missing.length === 0) continue;
        const which = (total.get(tag) ?? 0) > 1 ? ` (its ${ordinal(nth)} use)` : '';
        const names = missing.map(n => `'${n}'`).join(', ');
        warnings.push({
            code: 'PDX_SLOT_REQUIRED', severity: 'error',
            message: `<${tag}>${which} is missing ${missing.length > 1 ? `its required snippets ${names}` : `its required snippet ${names}`}.`,
            hint: `Write ${missing.map(n => `@snippet ${n}(…) { … }`).join(' and ')} inside the tag — or, in the child, declare `
                + `${missing.length > 1 ? 'them' : 'it'} optional with \`?\` and render it with \`@render name?.(…)\`.`,
        });
    }
    return warnings;
}

// PDX_PROP_REQUIRED (#130): a component used without a prop it requires. A `.pdx` requires every
// `@prop name: T;` with no default and no `?`; a library component, every prop its manifest marks
// `required` (`prop.required<T>()`). A use sets a prop with an attribute or a binding of its name —
// `id="…"`, `:id`, `::id`, `:id.once`, in camelCase or kebab-case.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { openingTagTexts } from '../text-scan';
import { markupOf } from './validate-parts';

/** The props a component requires; null when they are not known. */
export type RequiredPropsLookup = (tag: string) => ReadonlySet<string> | readonly string[] | null;

// Match: an attribute name in an opening tag, bound or plain, with its modifiers. Groups: [1]=the name
const ATTRIBUTE = /(?<=\s)(?:::|:)?([A-Za-z][\w-]*)(?:\.[\w()]+)*(?=[\s=/>]|$)/g;

/** `user-name`, `userName` and `username` are one name: HTML lowercases what it is given. */
const key = (name: string): string => name.replace(/-/g, '').toLowerCase();

/** `2` → `2nd`. */
function ordinal(n: number): string {
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
    return `${n}${suffix}`;
}

/**
 * PDX_PROP_REQUIRED for each use of a component that leaves a required prop unset. When the
 * template uses the tag more than once, the message says which use — the position locator finds
 * that one.
 */
export function checkRequiredProps(ast: TemplateNode[], requiredPropsOf?: RequiredPropsLookup): ValidationWarning[] {
    if (!requiredPropsOf) return [];
    const uses = markupOf(ast).flatMap(openingTagTexts)
        .map(text => ({ text, tag: /^<([A-Za-z][\w-]*)/.exec(text)?.[1].toLowerCase() ?? '' }))
        .filter(u => u.tag.includes('-'));
    const total = new Map<string, number>();
    for (const u of uses) total.set(u.tag, (total.get(u.tag) ?? 0) + 1);
    const seen = new Map<string, number>();
    const warnings: ValidationWarning[] = [];
    for (const { text, tag } of uses) {
        const nth = (seen.get(tag) ?? 0) + 1;
        seen.set(tag, nth);
        const required = requiredPropsOf(tag);
        if (!required) continue;
        const set = new Set([...text.matchAll(ATTRIBUTE)].map(m => key(m[1])));
        const missing = [...required].filter(name => !set.has(key(name)));
        if (missing.length === 0) continue;
        const which = (total.get(tag) ?? 0) > 1 ? ` (its ${ordinal(nth)} use)` : '';
        const names = missing.map(n => `'${n}'`).join(', ');
        warnings.push({
            code: 'PDX_PROP_REQUIRED', severity: 'error',
            message: `<${tag}>${which} is missing ${missing.length > 1 ? `its required props ${names}` : `its required prop ${names}`}.`,
            hint: `Set ${missing.length > 1 ? 'them' : 'it'}: ${missing.map(n => `:${n}="…"`).join(' ')} — or, in the child, declare ${missing.length > 1 ? 'them' : 'it'} optional with \`?\` or a default.`,
        });
    }
    return warnings;
}

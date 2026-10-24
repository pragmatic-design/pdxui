// A form's fields are its members (#128, step 1): `f.fields.email` is `f.email`.
//
// `f.fields` leaves the form, so a read of it is a removed form, and the rewrite is mechanical: the
// field keeps its key, a dotted one in brackets (`f.fields['customer.name']` → `f['customer.name']`).
// Only the names the file declares as a form are looked at — `@form f`, `f = createForm(…)`,
// `createFormFromSchema(…)`, `useForm()`, `tryUseForm()` — since `fields` is a common name elsewhere
// (a grid's columns, a schema's entries).
//
// A field named like a member of the form (`reset`, `valid`, …) would hide it: PDX_FORM_FIELD_RESERVED.
// It is flagged, not renamed: the field's name is also what the server receives (decision 13).

import { parseSFC } from '../parser/sfc';
import { escapeForRegExp } from '../compiler/regexp-escape';
import { inlineFormFields } from '../compiler/script-analyzer';
import { FORM_MEMBERS } from '../compiler/form-rules';
import type { LanguageChange, LanguageChangeFinding, LanguageChangeScope } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The names `text` declares as a form. */
export function formNames(text: string): string[] {
    const names = new Set<string>();
    // Match: `@form signup` — the declared name. Groups: [1]=the name
    for (const m of text.matchAll(/@form\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // Match: `const f = createForm(` / `createFormFromSchema(` / `useForm(` / `tryUseForm(`, a type
    // argument or annotation allowed. Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:createForm|createFormFromSchema|useForm|tryUseForm)\s*[<(]/g)) names.add(m[1]);
    return [...names];
}

/** The part of `text` a scope reads: a .pdx's template for `pdx` (its script is `script`'s), all of it otherwise. */
function rangeOf(text: string, scope: LanguageChangeScope): { from: number; to: number } | null {
    if (scope !== 'pdx') return { from: 0, to: text.length };
    const template = parseSFC(text).template;
    return template && !template.src ? { from: template.start, to: template.start + template.content.length } : null;
}

/** Every `form.fields` read in the scope's part of `text`, last first, for a rewrite from the end. */
function fieldsReads(text: string, scope: LanguageChangeScope): { index: number; found: string; replacement: string }[] {
    const range = rangeOf(text, scope);
    if (!range) return [];
    const out: { index: number; found: string; replacement: string }[] = [];
    for (const name of formNames(text)) {
        // Match: the form, `.fields` or `?.fields`, then `.`, `?.`, `[` or `?.[`. Groups: [1]=`?` on the
        // form [2]=what follows `fields`. Not right after a quote: `$t('intake.fields.requester')` is a
        // translation key that starts with the form's name, not a read of its fields (#613).
        const re = new RegExp(`(?<![\\w$.'"\`])${escapeForRegExp(name)}(\\?)?\\.fields(\\?\\.\\[|\\?\\.|\\.|\\[)`, 'g');
        for (const m of text.matchAll(re)) {
            if (m.index < range.from || m.index >= range.to) continue;
            const optional = m[1] === '?' || m[2].startsWith('?');
            const bracket = m[2].endsWith('[');
            out.push({ index: m.index, found: m[0], replacement: `${name}${optional ? '?.' : bracket ? '' : '.'}${bracket ? '[' : ''}` });
        }
    }
    return out.sort((a, b) => b.index - a.index);
}

/** `f.fields.x` → `f.x`, in a scope. */
function fieldsMember(scope: LanguageChangeScope): LanguageChange {
    return {
        id: scope === 'pdx' ? 'form-fields-member' : 'form-fields-member-script',
        kind: 'removed',
        scope,
        issue: 128,
        message: "a form's fields are its members: `f.fields.email` is `f.email`, `f.fields['customer.name']` is `f['customer.name']`.",
        detect: (text): LanguageChangeFinding[] => fieldsReads(text, scope).reverse()
            .map(({ index, found }) => ({ line: lineAt(text, index), found: found.replace(/[.[?]+$/, '') })),
        fix: (text) => {
            let out = text;
            for (const { index, found, replacement } of fieldsReads(text, scope)) {
                out = out.slice(0, index) + replacement + out.slice(index + found.length);
            }
            return out;
        },
    };
}

export const formFieldsMember = fieldsMember('pdx');
export const formFieldsMemberScript = fieldsMember('script');

/** A field of an inline `@form` named like a member of the form: flagged, never renamed. */
export const formFieldReserved: LanguageChange = {
    id: 'form-field-reserved',
    kind: 'removed',
    scope: 'script',
    issue: 128,
    message: "a form field named like a member of the form would hide it: give the field another name — it is also the server's name for it, so the rename is yours.",
    reportedAs: 'PDX_FORM_FIELD_RESERVED',
    detect(text) {
        const findings: LanguageChangeFinding[] = [];
        // Match: `@form name: {` — an inline form, read from its brace. Groups: [1]=the name
        for (const m of text.matchAll(/@form\s+([A-Za-z_$][\w$]*)\s*:\s*\{/g)) {
            for (const fd of inlineFormFields(text.slice(m.index + m[0].length - 1))) {
                if (fd.objectFields || !FORM_MEMBERS.has(fd.name)) continue;
                findings.push({ line: lineAt(text, m.index), found: `@form ${m[1]}: ${fd.name}`, note: `\`${fd.name}\` is the form's own \`${m[1]}.${fd.name}\`.` });
            }
        }
        return findings;
    },
    fix: 'flag',
};

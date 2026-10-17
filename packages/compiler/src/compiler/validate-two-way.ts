// Two-way binding is a contract (#124): `::name` is valid on a component's `@model` and on the value
// properties of native form elements, which are the platform's models. On a component whose models are
// known — a project .pdx, or a library component whose manifest lists them — `::x` on anything else is
// PDX_TWO_WAY_NOT_MODEL. A library component that lists no model yet is left as it was (#125).

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { openingTagTexts } from '../text-scan';
import { markupOf } from './validate-parts';

/** The models a component declares; null when they are not known. */
export type ModelsLookup = (tag: string) => ReadonlySet<string> | readonly string[] | null;

// Match: a `::name` binding in an opening tag, with its modifiers. Groups: [1]=the name
const TWO_WAY = /(?<=\s)::([A-Za-z][\w-]*)(?:\.[\w()]+)*=/g;

/** `selected-id`, `selectedId` and `selectedid` are one name: HTML lowercases what it is given. */
const sameName = (a: string, b: string): boolean => a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();

/** Whether `::name` binds one of `models` — `::group` is a directive of its own (#127), not a model. */
export function bindsModel(models: Iterable<string>, name: string): boolean {
    return name === 'group' || [...models].some(model => sameName(model, name));
}

/** PDX_TWO_WAY_NOT_MODEL for each `::x` on a component prop that is not one of its models. */
export function checkTwoWay(ast: TemplateNode[], modelsOf?: ModelsLookup): ValidationWarning[] {
    if (!modelsOf) return [];
    const warnings: ValidationWarning[] = [];
    for (const text of markupOf(ast).flatMap(openingTagTexts)) {
        const tag = /^<([A-Za-z][\w-]*)/.exec(text)?.[1].toLowerCase() ?? '';
        if (!tag.includes('-')) continue; // a native element: its value properties are the platform's models
        const known = modelsOf(tag);
        if (!known) continue;
        const models = [...known];
        for (const m of text.matchAll(TWO_WAY)) {
            const name = m[1];
            if (bindsModel(models, name)) continue;
            warnings.push({
                code: 'PDX_TWO_WAY_NOT_MODEL', severity: 'error',
                message: `'::${name}' on <${tag}>: '${name}' is not one of its models${models.length ? ` (its models: ${models.join(', ')})` : ' (it declares none)'}, so nothing would bring the value back.`,
                hint: `declare \`@model ${name}\` in the child, or bind it one way with ':${name}'.`,
            });
        }
    }
    return warnings;
}

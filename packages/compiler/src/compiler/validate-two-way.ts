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

// Match: a binding with modifiers in an opening tag — `::value.trim=`, `:title.once=`. Groups:
// [1]=`::` or `:` [2]=the name [3]=the modifiers, each with its dot
const WITH_MODIFIERS = /(?<=\s)(::?)([A-Za-z][\w-]*)((?:\.[\w()]+)+)=/g;
const TWO_WAY_MODIFIER = /^(?:lazy|trim|number|debounce\(\d+\))$/;

/**
 * PDX_BINDING_MODIFIER for each modifier outside the closed list (#126): `.lazy`, `.trim`,
 * `.number`, `.debounce(ms)` on `::x`, and `.once` on `:x`. `:class.x` and `:style.x` are forms of
 * their own, not a modifier (their removal is #129).
 */
export function checkBindingModifiers(ast: TemplateNode[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    for (const text of markupOf(ast).flatMap(openingTagTexts)) {
        for (const m of text.matchAll(WITH_MODIFIERS)) {
            const [, sigil, name, chain] = m;
            if (sigil === ':' && (name === 'class' || name === 'style')) continue;
            for (const mod of chain.slice(1).split('.')) {
                const valid = sigil === '::' ? TWO_WAY_MODIFIER.test(mod) : mod === 'once';
                if (valid) continue;
                warnings.push({
                    code: 'PDX_BINDING_MODIFIER', severity: 'error',
                    message: `'.${mod}' on '${sigil}${name}' is not a binding modifier: ${sigil === '::' ? 'a two-way binding takes .lazy, .trim, .number, .debounce(ms)' : 'a binding takes .once'}.`,
                    hint: sigil === '::'
                        ? `Use one of .lazy, .trim, .number, .debounce(ms), or the general form ::${name}="{ get: () => …, set: (v) => … }".`
                        : `Use :${name}.once to assign once, or :${name} to follow the value.`,
                });
            }
        }
    }
    return warnings;
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

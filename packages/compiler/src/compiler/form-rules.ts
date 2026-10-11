// The rules an inline `@form` names, and where each comes from (#203).
//
// A rule is called by its name — `minLength: 3` → `minLength(3)`, `shout` → `shout()` — and the name is
// either one of core's validators, imported from @pdxui/core, or a function the script itself declares
// or imports. Every name used to be imported from core: a custom rule became an import core does not
// have, and the rules of an object's sub-fields were not imported at all.

import type { ScriptAnalysis, FormDecl, FormFieldDecl } from './script-analyzer-types';
import type { ValidationWarning } from './validate';
import { escapeForRegExp } from './regexp-escape';

/**
 * The validators @pdxui/core exports (`core/src/form/validators.ts`). The compiler cannot import from
 * core; `core/tests/form-rule-names.test.ts` fails when the two lists drift.
 */
export const CORE_FORM_RULES: ReadonlySet<string> = new Set([
    'required', 'minLength', 'maxLength', 'email', 'pattern', 'url', 'min', 'max', 'integer',
]);

/** A rule's function name: `minLength: 3` → `minLength`. */
function ruleName(rule: string): string {
    const colon = rule.indexOf(':');
    return (colon === -1 ? rule : rule.slice(0, colon)).trim();
}

function fieldRuleNames(fd: FormFieldDecl): string[] {
    const names = fd.rules.map(ruleName);
    if (fd.required) names.push('required');
    return names;
}

/**
 * Every rule name an inline form calls: its fields' and its object fields' sub-fields'. A rows field's
 * rules are dropped by the generator (`PDX_FORM_ARRAY_RULES_IGNORED`), so they are not counted.
 */
export function formRuleNames(form: FormDecl): string[] {
    if (form.kind !== 'inline' || !form.fields) return [];
    const names: string[] = [];
    for (const fd of form.fields) {
        if (fd.isArray) continue;
        if (fd.objectFields) { for (const sub of fd.objectFields) names.push(...fieldRuleNames(sub)); continue; }
        names.push(...fieldRuleNames(fd));
    }
    return [...new Set(names)];
}

/**
 * Whether the script declares `name` itself — a declaration at the start of a statement, or an import —
 * so a rule of that name is the script's, and importing core's would declare it twice.
 */
export function scriptDeclares(analysis: ScriptAnalysis, name: string): boolean {
    if (analysis.importedNames?.includes(name)) return true;
    // Match: `const name`, `let name`, `var name`, `function name`, `class name`.
    return new RegExp(`\\b(?:const|let|var|function|class)\\s+${escapeForRegExp(name)}(?![\\w$])`).test(analysis.body);
}

/** The rules to import from @pdxui/core: core's own, unless the script declares one of the same name. */
export function coreRuleImports(analysis: ScriptAnalysis): string[] {
    const out = new Set<string>();
    for (const f of analysis.forms) {
        for (const n of formRuleNames(f)) if (CORE_FORM_RULES.has(n) && !scriptDeclares(analysis, n)) out.add(n);
    }
    return [...out];
}

/**
 * PDX_FORM_UNKNOWN_RULE — a rule that is neither core's nor named anywhere in the script. A name that
 * appears as a word in the script's code is taken as declared there (a destructured const, a parameter
 * passed down): the check misses rather than invents.
 */
export function checkFormRules(analysis: ScriptAnalysis, warnings: ValidationWarning[]): void {
    const script = [analysis.body, ...analysis.userImports].join('\n');
    for (const f of analysis.forms) {
        for (const n of formRuleNames(f)) {
            if (CORE_FORM_RULES.has(n)) continue;
            if (new RegExp(`(?<![\\w$.])${escapeForRegExp(n)}(?![\\w$])`).test(script)) continue;
            warnings.push({
                code: 'PDX_FORM_UNKNOWN_RULE',
                severity: 'error',
                message: `@form ${f.name}: the rule '${n}' is not one of @pdxui/core's validators, and the script declares no function '${n}'.`,
                hint: `Core's rules are ${[...CORE_FORM_RULES].join(', ')}. A rule of your own is a function that returns a validator, `
                    + `called like them: function ${n}() { return (value) => (ok ? null : 'message'); }`,
            });
        }
    }
}

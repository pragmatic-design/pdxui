// PDX_TEMPLATE_NAME_NOT_PROVIDED — a legacy-mode template reading a name its script does not hand over.
//
// In the legacy mode the template reads `ctx.<name>`, and `ctx` holds what `defineProps({ … })`
// declares and what the top-level `return { … }` returns: a `const` the script declares and does not
// return is not there, and reads as undefined. `validate()` used to return before any check in this
// mode, so a plain `<script>` with `const title = 'Hi'` and `{{ title }}` compiled in silence (#41).

import type { TemplateNode } from '../parser/template';
import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { collectTemplateIdentifiers } from './validate';
import { extractBraceBlock, objectKeys } from './script-analyzer-helpers';
import { skipNonCode } from './tokenizer';

/** JS words and browser globals an expression may name without the script providing them. */
const AMBIENT = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'typeof', 'new', 'instanceof', 'in', 'of',
    'void', 'await', 'async', 'this', 'delete', 'as', 'Math', 'Date', 'JSON', 'Array', 'Object', 'Number',
    'String', 'Boolean', 'console', 'window', 'document', 'Promise', 'Intl', 'RegExp', 'Error', 'URL',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'event',
]);

/** The `{ … }` of the first top-level `return {` in `code`, or null when there is none. */
function topLevelReturn(code: string): string | null {
    let depth = 0;
    for (let i = 0; i < code.length; i++) {
        const skip = skipNonCode(code, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = code[i];
        if (ch === '{' || ch === '(' || ch === '[') { depth++; continue; }
        if (ch === '}' || ch === ')' || ch === ']') { depth--; continue; }
        // Match: `return {` at depth 0, as a whole word.
        if (depth === 0 && code.startsWith('return', i) && !/[\w$]/.test(code[i - 1] ?? '')) {
            const brace = /^return\s*\{/.exec(code.slice(i));
            if (brace) return extractBraceBlock(code, i + brace[0].length - 1);
        }
    }
    return null;
}

/** The names a legacy script hands to its template, or null when a spread makes them unknowable. */
function providedNames(body: string): Set<string> | null {
    const names = new Set<string>();
    // Match: defineProps({ … }) — the object's opening brace.
    const props = /defineProps\s*\(\s*\{/.exec(body);
    if (props) {
        const block = extractBraceBlock(body, props.index + props[0].length - 1);
        if (block) {
            const { keys, spread } = objectKeys(block);
            if (spread) return null;
            keys.forEach((k) => names.add(k));
        }
    }
    const returned = topLevelReturn(body);
    if (returned) {
        const { keys, spread } = objectKeys(returned);
        if (spread) return null;
        keys.forEach((k) => names.add(k));
    }
    return names;
}

/** The legacy-mode checks: one, for now — a template read the script does not provide. */
export function validateLegacy(analysis: ScriptAnalysis, ast: TemplateNode[]): ValidationWarning[] {
    const provided = providedNames(analysis.body);
    if (!provided) return [];
    const warnings: ValidationWarning[] = [];
    const returnsNothing = provided.size === 0;
    for (const id of collectTemplateIdentifiers(ast, provided)) {
        if (provided.has(id) || AMBIENT.has(id) || id.startsWith('$')) continue;
        warnings.push({
            code: 'PDX_TEMPLATE_NAME_NOT_PROVIDED',
            severity: 'error',
            message: `'${id}' is read by the template, but this legacy-mode script does not provide it: it is not in defineProps and not in the returned object, so it reads as undefined.`,
            hint: returnsNothing
                ? `Write <script setup>, which hands the template every name it declares — or return it: return { ${id} };`
                : `Add it to the returned object — return { …, ${id} } — or write <script setup>, which returns what it declares.`,
        });
    }
    return warnings;
}

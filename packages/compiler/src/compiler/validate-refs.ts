// PDX_UNDECLARED_REF — a name the template reads that the component does not declare.
//
// `{{ missingThing }}` or `@click="incremnt"` reads nothing, and `pdx check`, the dev server and the
// editor all say so. It is measured here on the template the compiler parses, with the identifiers `collectTemplateIdentifiers` already
// extracts for the other checks — loop and slot variables, `@catch`/`@await` names and arrow
// parameters are the template's own.

import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { onlyNear } from './edit-distance';

/** JS words and browser globals an expression may name without the component declaring them. */
const AMBIENT = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'typeof', 'new', 'instanceof', 'in', 'of',
    'void', 'await', 'async', 'this', 'delete', 'yield', 'as', 'function', 'return', 'if', 'else',
    'Math', 'Date', 'JSON', 'Array', 'Object', 'Number', 'String', 'Boolean', 'console', 'window',
    'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'Promise', 'Map',
    'Set', 'WeakMap', 'WeakSet', 'Intl', 'RegExp', 'Error', 'Symbol', 'BigInt', 'URL', 'URLSearchParams',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'structuredClone', 'requestAnimationFrame', 'alert', 'confirm', 'event', 'globalThis',
]);

/** Every name the component's script declares for its template to read. */
function declaredNames(analysis: ScriptAnalysis): Set<string> {
    const s = new Set<string>();
    for (const p of analysis.props) s.add(p.name);
    for (const e of analysis.events) s.add(e.name);
    for (const sig of analysis.signals) s.add(sig.name);
    for (const d of analysis.deriveds) s.add(d.name);
    for (const st of analysis.stores) s.add(st.name);
    for (const f of analysis.forms) s.add(f.name);
    for (const f of analysis.fetches) s.add(f.name);
    for (const inj of analysis.injects) s.add(inj.alias ?? inj.key);
    for (const e of analysis.exports) s.add(e.name);
    for (const n of analysis.importedNames ?? []) s.add(n);
    for (const n of analysis.coreImportNames) s.add(n);
    return s;
}

/**
 * The template reads of names the component does not declare, each once, with the one declared
 * name within 2 edits as its suggestion when there is exactly one. A name that appears as a word
 * anywhere in the script's code is taken as declared there — a destructured const, a local
 * function — so the check misses rather than invents.
 */
export function checkUndeclaredRefs(analysis: ScriptAnalysis, templateIds: ReadonlySet<string>, warnings: ValidationWarning[]): void {
    const declared = declaredNames(analysis);
    const script = [analysis.body, ...analysis.userImports, ...(analysis.inlineBlocks ?? []),
        ...analysis.lifecycle.onMount, ...analysis.lifecycle.onDestroy, ...analysis.effects].join('\n');
    for (const id of templateIds) {
        if (declared.has(id) || AMBIENT.has(id) || id.startsWith('$')) continue;
        if (new RegExp(`(?<![\\w$])${id.replace(/\$/g, '\\$')}(?![\\w$])`).test(script)) continue;
        const meant = onlyNear(id, declared, 2);
        warnings.push({
            code: 'PDX_UNDECLARED_REF',
            severity: 'error',
            message: `'${id}' is used in the template but is not declared in <script setup>.${meant ? ` Did you mean '${meant}'?` : ''}`,
            hint: meant ? `Write ${meant}, or declare ${id}.` : `Declare it — a $signal, a @prop, a function — or fix the spelling.`,
            ...(meant ? { suggestion: meant } : {}),
        });
    }
}

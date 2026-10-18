// PDX_ATTACH_UNKNOWN (#143): `attach:name` whose name is neither in the script's scope nor one of
// core's built-in attachments. Compiled, it would be `attach(el, ctx.name)` with `ctx.name`
// undefined, and the element would throw on mount.

import type { TemplateNode } from '../parser/template';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning } from './validate';
import { markupOf } from './validate-parts';
import { attachmentsOf, ATTACH_BUILTINS } from './attach-names';

/** The names a template's attachments may use: the script's, its imports', core's built-ins. */
function namesInScope(analysis: ScriptAnalysis): Set<string> {
    return new Set([
        ...analysis.exports.map((e) => e.name),
        ...analysis.props.map((p) => p.name),
        ...(analysis.importedNames ?? []),
        ...ATTACH_BUILTINS,
    ]);
}

/** PDX_ATTACH_UNKNOWN for each attachment whose name is not in scope, once per name. */
export function checkAttachments(ast: TemplateNode[], analysis: ScriptAnalysis): ValidationWarning[] {
    const scope = namesInScope(analysis);
    const reported = new Set<string>();
    const warnings: ValidationWarning[] = [];
    for (const markup of markupOf(ast)) {
        for (const { name } of attachmentsOf(markup)) {
            if (scope.has(name) || reported.has(name)) continue;
            reported.add(name);
            warnings.push({
                code: 'PDX_ATTACH_UNKNOWN',
                severity: 'error',
                message: `attach:${name} — '${name}' is not in scope: no function of the script, no import, and not one of core's attachments (${[...ATTACH_BUILTINS].join(', ')}).`,
                hint: `Declare it — function ${name}(el, value) { … return () => { /* cleanup */ }; } — or import it.`,
            });
        }
    }
    return warnings;
}

// PDX_NAME_RESERVED (#542, #545): a `@prop`, `@model` or typed `@slot` named after a member of the element
// class, or after one of the HTMLElement members whose replacement breaks the element. Each becomes a
// property of the element, defined over the member of the same name: `@slot body: ();` replaced the
// method that renders the component, `@prop style` the element's CSSStyleDeclaration. The lists are
// `reserved-element-names.ts` and `reserved-dom-names.ts`.

import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { RESERVED_ELEMENT_NAMES } from './reserved-element-names';
import { RESERVED_DOM_MEMBERS, DOM_EVENT_HANDLERS } from './reserved-dom-names';

/** PDX_NAME_RESERVED for each declaration whose name is a member of the element class, or a reserved DOM member. */
export function checkReservedNames(analysis: ScriptAnalysis): ValidationWarning[] {
    const declared = [
        ...analysis.props.map(p => ({ name: p.name, rune: p.model ? '@model' : '@prop' })),
        // An object-form `@slot` generates nothing; a typed snippet is a property of the element.
        ...analysis.slots.filter(s => s.signature !== undefined).map(s => ({ name: s.name, rune: '@slot' })),
    ];
    const warnings: ValidationWarning[] = [];
    for (const d of declared) {
        if (RESERVED_ELEMENT_NAMES.has(d.name)) {
            warnings.push({
                code: 'PDX_NAME_RESERVED',
                severity: 'error',
                message: `${d.rune} '${d.name}' is named after a member of the element, which it would replace: the component may not render.`,
                hint: `Rename it — '${d.name}' is the element's own ${d.name.startsWith('_') ? 'internal' : 'member'}.`,
            });
        } else if (RESERVED_DOM_MEMBERS.has(d.name) || DOM_EVENT_HANDLERS.has(d.name)) {
            const what = DOM_EVENT_HANDLERS.has(d.name) ? 'event handler' : 'DOM property';
            warnings.push({
                code: 'PDX_NAME_RESERVED',
                severity: 'error',
                message: `${d.rune} '${d.name}' is named after the element's ${what}, which it would replace: code that uses the element's '${d.name}' breaks.`,
                hint: `Rename it — '${d.name}' is HTMLElement's own ${what}.`,
            });
        }
    }
    return warnings;
}

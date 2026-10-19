// PDX_NAME_RESERVED (#542): a `@prop`, `@model` or typed `@slot` named after a member of the element
// class. Each becomes a property of the element, defined over the member of the same name: `@slot
// body: ();` replaced the method that renders the component. The list is `reserved-element-names.ts`.

import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { RESERVED_ELEMENT_NAMES } from './reserved-element-names';

/** PDX_NAME_RESERVED for each declaration whose name is a member of the element class. */
export function checkReservedNames(analysis: ScriptAnalysis): ValidationWarning[] {
    const declared = [
        ...analysis.props.map(p => ({ name: p.name, rune: p.model ? '@model' : '@prop' })),
        // An object-form `@slot` generates nothing; a typed snippet is a property of the element.
        ...analysis.slots.filter(s => s.signature !== undefined).map(s => ({ name: s.name, rune: '@slot' })),
    ];
    return declared.filter(d => RESERVED_ELEMENT_NAMES.has(d.name)).map(d => ({
        code: 'PDX_NAME_RESERVED',
        severity: 'error' as const,
        message: `${d.rune} '${d.name}' is named after a member of the element, which it would replace: the component may not render.`,
        hint: `Rename it — '${d.name}' is the element's own ${d.name.startsWith('_') ? 'internal' : 'member'}.`,
    }));
}

// The names a component's props, models and typed snippets may not take (#542).
//
// Each of those becomes a property of the element, defined on the instance, and one named after a
// member of the element class replaces that member: a typed snippet `body` replaced the method that
// renders the component, which then rendered nothing, with nothing said. This is the class's member
// list, from the class component() defines up to HTMLElement — written out, because the compiler does
// not import core; `packages/core/tests/reserved-element-names.test.ts` holds it to the class.
//
// HTMLElement's own members are not here. Several are props on purpose — `title`, `id` (a route's
// `:id`), `prefix`, `offsetTop`; the ones refused are `reserved-dom-names.ts` (#545).

/** Members of the element class kept on purpose: a form component's `form` replaces the form getter. */
export const ELEMENT_NAMES_KEPT: ReadonlySet<string> = new Set(['form']);

/** The element class's members a prop, model or typed snippet may not be named after. */
export const RESERVED_ELEMENT_NAMES: ReadonlySet<string> = new Set<string>([
    // PdxElement's lifecycle and rendering
    'attr', 'attributeChangedCallback', 'body', 'connected', 'connectedCallback', 'disconnected',
    'disconnectedCallback', 'emit', 'frame', 'track',
    // its form-associated API
    'checkValidity', 'formDisabledCallback', 'formResetCallback', 'formStateRestoreCallback', 'reportValidity', 'setFormValue',
    'setValidity', 'validationMessage', 'validity',
    // its internals, and the ones component() adds
    '__pdx_restoreState', '__pdx_saveState', '_collectSlotFunctions', '_disposeUnprojected', '_ownsNode',
    '_projectSlots', '_renderTarget', '_restoreLightChildren', '_watchLateSlots',
]);

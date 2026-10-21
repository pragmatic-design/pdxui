// The HTMLElement members a prop may not be named after (#545): a prop is defined on the element
// instance, and one of these replaces the member for every caller outside the component —
// `el.style.color = …` on a prop `style` throws. The event handlers (`onclick`, …) are read from the
// running DOM instead. The compiler's copy, `RESERVED_DOM_MEMBERS`, is held to this one by
// `tests/reserved-element-names.test.ts`.

/** The members whose replacement breaks the element for code outside the component. */
export const RESERVED_DOM_MEMBERS: ReadonlySet<string> = new Set<string>([
    'children', 'classList', 'className', 'dataset', 'innerHTML', 'shadowRoot', 'style', 'textContent',
]);

/** Whether a prop named `name` would replace an HTMLElement member that breaks the element. */
export function replacesDomMember(name: string): boolean {
    return RESERVED_DOM_MEMBERS.has(name) || (name.startsWith('on') && name in HTMLElement.prototype);
}

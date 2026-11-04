// The properties a native HTML element has for certain, so that a binding on it is assigned without
// asking the element at run time (#685).
//
// A bound name on a plain element is written as core's `bindProperty` writes it: `name in el` decides
// between the property and the attribute. The compiler wrote that question into every binding, and
// every update asked it again — `:checked` on an <input> asked whether an input has `checked`. Where
// this table says the element has the property, the answer is always yes, and the attribute branch is
// code that never runs: the binding is the assignment alone. The table holds only what is certain —
// a name it does not list keeps the question — so it can be incomplete, never wrong.
// packages/core/tests/native-properties.test.ts holds every entry to a DOM: an entry its DOM lacks is
// left out even where a browser has it (`draggable`, `<select>.size`, `<option>.label`), since a
// missing entry costs only the question.

/** Writable properties every HTML element has (HTMLElement, and Element and Node under it). */
const EVERY_ELEMENT = ['id', 'className', 'title', 'lang', 'dir', 'hidden', 'tabIndex', 'textContent', 'innerHTML'];

/** Writable properties of each element interface, by tag, beside EVERY_ELEMENT's. */
const BY_TAG: Record<string, readonly string[]> = {
    input: ['value', 'checked', 'disabled', 'name', 'type', 'placeholder', 'readOnly', 'required', 'min', 'max', 'step', 'multiple', 'indeterminate', 'maxLength', 'minLength', 'pattern', 'size', 'defaultValue', 'defaultChecked'],
    button: ['disabled', 'name', 'type', 'value'],
    select: ['value', 'disabled', 'name', 'multiple', 'required', 'selectedIndex'],
    textarea: ['value', 'disabled', 'name', 'placeholder', 'readOnly', 'required', 'rows', 'cols', 'maxLength', 'minLength'],
    option: ['value', 'selected', 'disabled', 'text'],
    a: ['href', 'target', 'rel', 'download'],
    img: ['src', 'alt', 'width', 'height'],
    label: ['htmlFor'],
    details: ['open'],
    progress: ['value', 'max'],
};

const KNOWN = new Map<string, ReadonlySet<string>>(
    Object.entries(BY_TAG).map(([tag, props]) => [tag, new Set([...EVERY_ELEMENT, ...props])]),
);

/** Whether the native element `tag` certainly has the writable property `prop` (a DOM name, `tabIndex`). */
export function hasNativeProperty(tag: string, prop: string): boolean {
    return KNOWN.get(tag)?.has(prop) ?? false;
}

/** Every (tag, property) the table lists: what the DOM test holds to the element. */
export function nativePropertyTable(): ReadonlyMap<string, ReadonlySet<string>> {
    return KNOWN;
}

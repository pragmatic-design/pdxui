// A form control's public property is its live value.
//
// The native contract: `input.value` is what the user typed, the `value` ATTRIBUTE is the initial
// value. A prop that kept the initial value while a private signal held the live one would make
// `el.value` stale after the user touched the control, and code that reads it (the grid commits a
// cell edit from the editor host's `.value`) would throw the edit away.
//
// Called on every user change, BEFORE the event is emitted, so a listener that reads the element
// sees the new value. It goes through the element's property setter: the prop signal updates and
// onPropsChange fires, as for a parent binding. The attribute is never written. A parent that sets
// the property afterwards still wins.

export function setOwnProp(el: HTMLElement, name: string, value: unknown): void {
    (el as unknown as Record<string, unknown>)[name] = value;
}

/**
 * Keep the host's `name` ATTRIBUTE in step with its `name` prop, for a control whose host is the
 * form's only submitter.
 *
 * A form-associated element is in FormData under its `name` attribute — the property is not
 * enough. A parent binding `:name="field"` sets the property, and the inner native control carries
 * no name, so an unreflected property would take the field out of the form without a word.
 */
export function reflectNameToHost(ctx: { el: HTMLElement; track: (fn: () => void) => void; name: () => unknown }): void {
    ctx.track(() => {
        const n = ctx.name() as string;
        if (n) { if (ctx.el.getAttribute('name') !== n) ctx.el.setAttribute('name', n); }
        else ctx.el.removeAttribute('name');
    });
}

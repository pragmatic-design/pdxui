// A control's value event, whichever contract it is on (#125).
//
// A library control that declares its model (`models` in the descriptor, #124) announces a change with
// `<kebab-model>-change` and `{ value }`; one that does not yet still emits its alpha event. Code that
// wires controls it creates — pdx-form-template, pdx-field-list, pdx-inline-edit — asks the control
// which, so each batch of #125 moves a control over without touching them.

/** The event a model dispatches, as core names it (`modelEvent`): `selectedId` → `selected-id-change`. */
function modelEventName(name: string): string {
    return `${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}-change`;
}

/** The first model a control's class declares, or null when it declares none (or is not defined yet). */
export function firstModelOf(control: Element): string | null {
    const ctor = customElements.get(control.tagName.toLowerCase()) as { models?: ReadonlySet<string> } | undefined;
    const first = ctor?.models?.values().next();
    return first && !first.done ? first.value : null;
}

/**
 * Calls `onValue` with each new value `control` announces: its first model's event and its
 * `detail.value`, or, for a control that declares no model, `alphaEvent` and what `readAlpha` reads
 * off it. Returns the teardown.
 */
export function onControlValue(
    control: Element,
    alphaEvent: string,
    readAlpha: (e: CustomEvent) => unknown,
    onValue: (value: unknown) => void,
): () => void {
    const model = firstModelOf(control);
    const type = model ? modelEventName(model) : alphaEvent;
    const listener = (e: Event): void => {
        const ce = e as CustomEvent<{ value?: unknown } | null>;
        onValue(model ? ce.detail?.value : readAlpha(ce));
    };
    control.addEventListener(type, listener);
    return () => control.removeEventListener(type, listener);
}

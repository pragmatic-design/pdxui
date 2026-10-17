// The name of the event a model dispatches when its component writes it (#124). Here, below the
// layers, because both read it: the component that dispatches it and the template binding (`::name`)
// that listens to it.

/** `value` → `value-change`, `selectedId` → `selected-id-change`. */
export function modelEvent(name: string): string {
    return `${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}-change`;
}

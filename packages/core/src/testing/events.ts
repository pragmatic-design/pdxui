// Testing utility: dispatch DOM events.

/**
 * Dispatch a DOM event on an element with optional detail payload.
 * Supports standard events (click, input) and CustomEvents.
 */
export function fireEvent(
    el: Element,
    eventName: string,
    detail?: unknown,
): void {
    if (detail !== undefined) {
        el.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true,
            composed: true,
            cancelable: true,
        }));
    } else {
        // Use appropriate event constructor for known types
        const EventCtor = getEventConstructor(eventName);
        el.dispatchEvent(new EventCtor(eventName, {
            bubbles: true,
            cancelable: true,
        }));
    }
}

function getEventConstructor(name: string): typeof Event {
    const mouseEvents = ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'contextmenu'];
    const keyEvents = ['keydown', 'keyup', 'keypress'];
    const focusEvents = ['focus', 'blur', 'focusin', 'focusout'];
    const inputEvents = ['input', 'change', 'beforeinput'];

    if (mouseEvents.includes(name)) return MouseEvent as unknown as typeof Event;
    if (keyEvents.includes(name)) return KeyboardEvent as unknown as typeof Event;
    if (focusEvents.includes(name)) return FocusEvent as unknown as typeof Event;
    if (inputEvents.includes(name)) return InputEvent as unknown as typeof Event;
    return Event;
}

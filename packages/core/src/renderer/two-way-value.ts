// The value side of a two-way binding (#126): what `::name` reads and writes, and the modifiers.
//
// Every binding is the general form `{ get, set }`; a signal is `{ get: sig, set: sig.set }`. The
// modifiers are defined over that form — each wraps the setter — so there is one mechanism:
//   .trim          trim a string before writing
//   .number        write Number(v); an empty entry writes null; an invalid one writes nothing and
//                  marks the element invalid (aria-invalid, setCustomValidity on a native control)
//   .debounce(ms)  write ms after the last input; flushed on focusout and on its form's submit
//   .lazy          which event commits — the binding's business (template.ts), not the setter's

import { onDispose } from '../reactivity/signal';
import type { Signal } from '../utils/types';

/** What a two-way binding reads and writes. */
export interface TwoWayAccessor {
    get(): unknown;
    set(value: unknown): void;
    /** When the value is a form field (#128): what the control takes from it besides the value. */
    field?: TwoWayField;
}

/**
 * The key a value carries to be bound as a form field (#128): `::value="f.email"`. The form puts it on
 * each of its fields (`core/src/form/form.ts`); the renderer reads only this, so it does not depend on
 * the form module.
 */
export const TWO_WAY_FIELD: unique symbol = Symbol.for('pdx.two-way-field');

/** A form field as a two-way binding sees it. */
export interface TwoWayField {
    get(): unknown;
    set(value: unknown): void;
    /** The control was left: the field is touched, and validates if its form says so. */
    blur(): void;
    /** Whether the field shows an error now: touched, or submitted, and failing. */
    invalid(): boolean;
    /** Whether the field must be filled in. */
    readonly required: boolean;
    /** `.number`'s parse error, or null once an entry parses: the field's error while it stands. */
    parseError(message: string | null): void;
    /**
     * A `.debounce` binding's pending write, which the form runs before it submits or validates
     * (beta rule F6). Returns the function that withdraws it.
     */
    hold(flush: () => void): () => void;
}

/** The modifiers after the name: `value.trim.debounce(300)`. */
export interface TwoWayModifiers {
    lazy: boolean;
    trim: boolean;
    number: boolean;
    /** Milliseconds, or null without `.debounce`. */
    debounce: number | null;
}

/** `value.trim.debounce(300)` → the name and its modifiers. An unknown modifier is the compiler's to report. */
export function parseTwoWay(descriptor: string): { name: string; mods: TwoWayModifiers } {
    const [name, ...rest] = descriptor.split('.');
    const mods: TwoWayModifiers = { lazy: false, trim: false, number: false, debounce: null };
    for (const m of rest) {
        // Match: debounce(300). Groups: [1]=milliseconds
        const d = /^debounce\((\d+)\)$/.exec(m);
        if (d) mods.debounce = Number(d[1]);
        else if (m === 'lazy' || m === 'trim' || m === 'number') mods[m] = true;
    }
    return { name, mods };
}

/** The value as an accessor: a form field, a signal, or the `{ get, set }` form; null for anything else. */
export function twoWayAccessor(value: unknown): TwoWayAccessor | null {
    const field = value && typeof value === 'object' ? (value as { [TWO_WAY_FIELD]?: TwoWayField })[TWO_WAY_FIELD] : undefined;
    if (field) return { get: () => field.get(), set: (v) => field.set(v), field };
    if (typeof value === 'function' && typeof (value as Signal<unknown>).set === 'function') {
        const sig = value as Signal<unknown>;
        return { get: () => sig(), set: (v) => sig.set(v) };
    }
    if (value && typeof value === 'object') {
        const { get, set } = value as Partial<TwoWayAccessor>;
        if (typeof get === 'function' && typeof set === 'function') return { get: () => get(), set: (v) => set(v) };
    }
    return null;
}

/**
 * `::group` on a native checkbox or radio (#127): a checkbox is checked when the accessor's array
 * holds its value, and toggling it writes a new array with the value added or removed; a radio is
 * checked when the accessor's value is its value, and selecting it writes that value. The value is
 * read at each sync, and synced again after the binding's own task: a `:value` written after
 * `::group` — a `@for` row's — is the one the group compares.
 */
export function bindGroup(el: HTMLInputElement, accessor: TwoWayAccessor, effect: (fn: () => void) => void): void {
    const checkbox = el.type === 'checkbox';
    const sync = (): void => {
        const current = accessor.get();
        el.checked = checkbox ? Array.isArray(current) && current.some(v => String(v) === el.value) : String(current) === el.value;
    };
    effect(sync);
    queueMicrotask(sync);
    el.addEventListener('change', () => {
        if (!checkbox) {
            if (el.checked) accessor.set(el.value);
            return;
        }
        const current = accessor.get();
        const list = Array.isArray(current) ? current : [];
        accessor.set(el.checked
            ? (list.some(v => String(v) === el.value) ? [...list] : [...list, el.value])
            : list.filter(v => String(v) !== el.value));
    });
}

/** An element that reports its own validity: an input, a textarea, a select, a form-associated element. */
interface Validatable { setCustomValidity(message: string): void }

/** `.number`'s parse: a number, null for an empty entry, or undefined for an invalid one. */
function parseNumber(raw: unknown): number | null | undefined {
    if (typeof raw === 'number') return Number.isNaN(raw) ? undefined : raw;
    const text = String(raw ?? '').trim();
    if (text === '') return null;
    const n = Number(text);
    return Number.isNaN(n) ? undefined : n;
}

/**
 * The function the binding's listener calls with the element's raw value: the modifiers applied,
 * then the accessor's setter — after `ms` with `.debounce`, at once on the element's `focusout` and
 * on the submit of its form.
 */
export function twoWayWriter(el: Element, accessor: TwoWayAccessor, mods: TwoWayModifiers): (raw: unknown) => void {
    const write = (raw: unknown): void => {
        let value = raw;
        if (mods.trim && typeof value === 'string') value = value.trim();
        if (mods.number) {
            const n = parseNumber(value);
            const message = n === undefined ? 'Enter a number.' : null;
            // Bound to a form field, the parse error is the field's (#128): it shows where its other
            // errors do, and the field's binding marks the control.
            if (accessor.field) accessor.field.parseError(message);
            else {
                if (message) el.setAttribute('aria-invalid', 'true');
                else el.removeAttribute('aria-invalid');
                (el as Partial<Validatable>).setCustomValidity?.(message ?? '');
            }
            if (n === undefined) return;
            value = n;
        }
        accessor.set(value);
    };
    if (mods.debounce === null) return write;

    const ms = mods.debounce;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { raw: unknown } | null = null;
    const flush = (): void => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (!pending) return;
        const { raw } = pending;
        pending = null;
        write(raw);
    };
    el.addEventListener('focusout', flush);
    // Capture, on the document: the binding's write lands before the form's own submit listeners,
    // and an element moved into a form after binding is still covered.
    const onSubmit = (e: Event): void => {
        if (e.target instanceof Node && e.target.contains(el)) flush();
    };
    document.addEventListener('submit', onSubmit, true);
    // Bound to a form field, the form writes it too, for a submit or a validate the page starts
    // itself, with no submit event (beta rule F6).
    const release = accessor.field?.hold(flush);
    onDispose(() => {
        release?.();
        document.removeEventListener('submit', onSubmit, true);
        if (timer !== null) clearTimeout(timer);
    });
    return (raw) => {
        pending = { raw };
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(flush, ms);
    };
}

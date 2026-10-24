// The form a section inherits (#613): what `@form f: Schema from parent;` compiles to.
//
// A form section is a component projected into `<pdx-form>`. Its controls bind to the form's fields
// explicitly, `::value="f.email"`, as a control written beside `<pdx-form>` does (#128) — but the form
// is not there when the section sets up: happy-dom connects a child before its parent, and in
// Chromium a projected child mounts detached, outside the document. A binding reads its field once,
// when it binds. So `f.email` is not the field itself but a stand-in for it, made at once and the same
// every time it is read, which reads the inherited form whenever it is asked: before the form is found
// it holds nothing and writes nowhere, and from the moment `<pdx-form>` provides it, every reading is
// the real field's. `tryUseForm(from)` makes that reactive: an effect whose lookup found nothing runs
// again when a form is provided, so a binding made at mount follows the form from then on.

import { tryUseForm } from './form-context';
import type { Form, FormField } from './form';
import { TWO_WAY_FIELD, type TwoWayField } from '../renderer/two-way-value';

type AnyForm = Form<Record<string, unknown>>;
type Member = ((...args: unknown[]) => unknown) & Record<PropertyKey, unknown>;

/**
 * The member `key` of the form `current()` finds, as a stand-in that reads it when asked.
 *
 * Called, it calls the form's member of that name — `f.reset()`, `f.valid()`, `f.handleSubmit(…)`.
 * Read as a field, it answers as the field of that name does: `value` (a signal, with `set`), `error`,
 * `warning`, `touched`, `dirty`, `required`, `onChange`, `onBlur`, `reset`, and what a two-way binding
 * reads (`TWO_WAY_FIELD`). Without a form, a reading is undefined (`false` for `required` and
 * `invalid`) and a write does nothing.
 */
function inheritedMember(current: () => AnyForm | undefined, key: PropertyKey): Member {
    const field = (): FormField<unknown> | undefined => (current() as unknown as Record<PropertyKey, FormField<unknown> | undefined> | undefined)?.[key];
    const twoWay = (): TwoWayField | undefined => (field() as unknown as { [TWO_WAY_FIELD]?: TwoWayField } | undefined)?.[TWO_WAY_FIELD];
    const read = (facet: 'error' | 'warning' | 'touched' | 'dirty') => () => field()?.[facet]?.();

    const member = function (...args: unknown[]): unknown {
        const form = current() as unknown as Record<PropertyKey, unknown> | undefined;
        const m = form?.[key];
        return typeof m === 'function' ? (m as (...a: unknown[]) => unknown).apply(form, args) : m;
    } as Member;

    const value = Object.assign(() => field()?.value(), {
        set: (v: unknown) => field()?.value.set(v),
        peek: () => field()?.value.peek?.(),
    });
    const stand: TwoWayField = {
        get: () => twoWay()?.get(),
        set: (v) => twoWay()?.set(v),
        blur: () => twoWay()?.blur(),
        invalid: () => twoWay()?.invalid() ?? false,
        get required() { return twoWay()?.required ?? false; },
        parseError: (message) => twoWay()?.parseError(message),
        hold: (flush) => twoWay()?.hold(flush) ?? (() => {}),
    };
    Object.defineProperties(member, {
        value: { value },
        error: { value: read('error') },
        warning: { value: read('warning') },
        touched: { value: read('touched') },
        dirty: { value: read('dirty') },
        required: { get: () => field()?.required ?? false },
        onChange: { value: (v: unknown) => field()?.onChange(v) },
        onBlur: { value: () => field()?.onBlur() },
        reset: { value: () => field()?.reset() },
        [TWO_WAY_FIELD]: { value: stand },
    });
    return member;
}

/**
 * The form the element `el` sits under, read lazily: what a section's `@form f: Schema from parent;`
 * compiles to (#613). Each `f.x` is a stand-in made once — the same object every read, so a binding
 * holds it — that reads the inherited form's member `x` when asked, and follows the form from the
 * moment `<pdx-form>` provides it. Outside any form, it reads nothing and writes nowhere.
 */
export function inheritedForm<T extends Record<string, unknown>>(el: HTMLElement): Form<T> {
    const current = (): AnyForm | undefined => tryUseForm(el);
    const members = new Map<PropertyKey, Member>();
    return new Proxy({}, {
        get(_, key) {
            // Not a member: a symbol is the language's (`Symbol.toPrimitive`, an inspector's tag), and a
            // `then` would make the form a thenable that a `Promise.resolve(f)` waits on for ever.
            if (typeof key === 'symbol' || key === 'then') return undefined;
            let member = members.get(key);
            if (!member) {
                member = inheritedMember(current, key);
                members.set(key, member);
            }
            return member;
        },
    }) as unknown as Form<T>;
}

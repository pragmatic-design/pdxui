// A number per form, for pdx-radio's inner name (#1210, moved out of pdx-radio.ts with the component).
//
// One submitter per radio: the host. The inner <input type="radio"> stays, because the browser's radio
// group is what gives one tab stop and arrow keys that move and check, but it must not submit: its
// `form` attribute names no form (`pdx-radio-no-submit`), so its form owner is null. Radios whose owner
// is null group by name across the whole document, so the inner name is scoped to the host's form, and
// two forms with a field `x` do not uncheck each other. The map is the module's, shared by every radio.

const formIds = new WeakMap<HTMLFormElement, number>();
let nextFormId = 0;

/** The number of `form`, the same for every radio in it. */
export function formScope(form: HTMLFormElement): number {
    let id = formIds.get(form);
    if (id === undefined) { id = ++nextFormId; formIds.set(form, id); }
    return id;
}

// The model of pdx-localized-input: one text in several cultures, `{ [culture]: string }` — the shape
// of Pragmatic's LocalizedString. Pure, so the component's rules (what is missing, what `required`
// asks, how a culture is named and written) are read without a DOM.

/** A text in several cultures. A culture with no entry, or an empty one, is missing. */
export type LocalizedText = Record<string, string>;

/** What `required` asks for: every culture, or the default one. */
export type RequiredScope = 'all' | 'default';

/** The cultures of `cultures` that have no text in `value`, a blank one included, in that order. */
export function missing(value: LocalizedText | null | undefined, cultures: readonly string[]): string[] {
    return cultures.filter((c) => !(value?.[c] ?? '').trim());
}

/** Whether `value` has what `required` asks: every culture, or the default one. */
export function isComplete(value: LocalizedText | null | undefined, cultures: readonly string[], scope: RequiredScope, defaultCulture: string): boolean {
    return missing(value, scope === 'all' ? cultures : [defaultCulture]).length === 0;
}

/** `value` with `culture` set to `text`, a copy; an empty text drops the culture. */
export function withText(value: LocalizedText | null | undefined, culture: string, text: string): LocalizedText {
    const out: LocalizedText = { ...(value ?? {}) };
    if (text === '') delete out[culture];
    else out[culture] = text;
    return out;
}

/** `cultures` with `current` first when it is one of them; the others keep their order. */
export function orderCultures(cultures: readonly string[], current: string): string[] {
    const i = cultures.indexOf(current);
    return i <= 0 ? [...cultures] : [current, ...cultures.slice(0, i), ...cultures.slice(i + 1)];
}

/** A culture's name in its own language (`it` → «italiano»), or its code when it has none. */
export function cultureName(culture: string): string {
    try {
        return new Intl.DisplayNames([culture], { type: 'language' }).of(culture) ?? culture;
    } catch {
        // Not a language tag Intl knows (RangeError): the code is the name the author gave it.
        return culture;
    }
}

/** Scripts written right to left, by language subtag: Arabic, Hebrew, Persian, Urdu, Yiddish… */
const RTL = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ckb']);

/** The direction a culture's text is written in, for the field's `dir`. */
export function directionOf(culture: string): 'ltr' | 'rtl' {
    return RTL.has(culture.toLowerCase().split(/[-_]/)[0]) ? 'rtl' : 'ltr';
}

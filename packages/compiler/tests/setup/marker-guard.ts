// The guard that keeps a removed form's marker honest (#648).
//
// `checkRemovedForms` runs a removed entry's `detect` only on a text that holds its `marker`. A marker
// that some instance of the form lacks would hide that instance from the compiler in silence. So, in
// the compiler's tests, every registry entry's `detect` is wrapped: whenever it finds something, the
// text it was given must hold the entry's marker, or the test that detected it fails, naming the entry.
// The fixtures are every test's: the entries' own tests above all, and every compile.

import { LANGUAGE_CHANGES, hasMarker, type LanguageChange } from '../../src/language/changes';

const WRAPPED = Symbol('marker-guard');

for (const change of LANGUAGE_CHANGES as LanguageChange[]) {
    const marker = change.marker;
    if (marker === undefined) continue;
    const detect = change.detect as LanguageChange['detect'] & { [WRAPPED]?: true };
    if (detect[WRAPPED]) continue;
    const guarded: LanguageChange['detect'] & { [WRAPPED]?: true } = (text, context) => {
        const found = detect(text, context);
        if (found.length > 0 && !hasMarker(text, marker)) {
            throw new Error(`${change.id}: detect found ${JSON.stringify(found[0].found)} in a text without its marker ${String(marker)}`);
        }
        return found;
    };
    guarded[WRAPPED] = true;
    change.detect = guarded;
}

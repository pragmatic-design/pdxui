// The script face pdx-signature-pad draws a typed name with (#1019): Alex Brush, SIL OFL 1.1, with no
// Reserved Font Name (fonts/LICENSE.txt, the licence the OFL asks to travel with the files). It ships with the component, so a typed signature is the same
// image on every system; `cursive` would be Comic Sans on one and Apple Chancery on another, and the
// image is what the form saves.
//
// Only the "type" mode imports this module, with `import()`: an app whose users draw never loads it.
// The two subsets carry their unicode ranges, so the browser fetches latin-ext only for a name that
// needs it.

/** The family the component's `--pdx-font-signature` token names first. */
export const SIGNATURE_FAMILY = 'pdx-signature';

const FACES: ReadonlyArray<{ url: string; unicodeRange: string }> = [
    {
        url: new URL('./fonts/alex-brush-latin.woff2', import.meta.url).href,
        unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        url: new URL('./fonts/alex-brush-latin-ext.woff2', import.meta.url).href,
        unicodeRange: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
];

let added = false;

/**
 * Make the face ready for `text`: the subsets are added to the document once, and the ones `text`
 * needs are loaded. Resolves when a canvas can draw `text` in it.
 */
export async function loadSignatureFont(text: string): Promise<void> {
    if (!added) {
        added = true;
        for (const f of FACES) {
            document.fonts.add(new FontFace(SIGNATURE_FAMILY, `url(${f.url}) format('woff2')`, { unicodeRange: f.unicodeRange }));
        }
    }
    await document.fonts.load(`48px "${SIGNATURE_FAMILY}"`, text || 'a');
}

/**
 * Turning a value into JavaScript source: the one way the compiler writes a STRING (or any JSON
 * value) into the code it generates.
 *
 * `JSON.stringify` alone quotes and escapes for JSON, which is nearly but not exactly JavaScript in
 * every place the code ends up: U+2028 and U+2029 are line terminators to an older parser, and a
 * value holding `</script>` closes the `<script>` an inlined module sits in. So the four characters
 * that matter are escaped too, as `\uXXXX`, which every JavaScript parser reads back as the same
 * character. `/` is left alone: an `import("/src/…")` written as `/…` is a path a bundler's
 * import scan would have to decode, and `</` is already defused by escaping the `<`.
 *
 * Anything the compiler writes into generated code WITHOUT going through `jsString` is code — an
 * expression from the template, a name it made itself — and is meant to run.
 */
export function jsString(value: unknown): string {
    // `JSON.stringify(undefined)` is `undefined`, not a string: written into code, `undefined` is
    // what it meant.
    const json = JSON.stringify(value) ?? 'undefined';
    return json.replace(/[<>\u2028\u2029]/g, (ch) => UNSAFE[ch]);
}

const UNSAFE: Record<string, string> = {
    '<': '\\u003C',
    '>': '\\u003E',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
};

/**
 * A string as a single-quoted JavaScript literal, escaped like `jsString`.
 *
 * For the sites that have always written `'value'`: a value with nothing to escape comes out exactly
 * as it did, so the generated code a project already has does not change shape, and a value that
 * holds a quote, a backslash, a line break, `<`, `>` or U+2028/U+2029 can no longer leave its string.
 */
export function jsQuote(text: string): string {
    return `'${String(text).replace(QUOTE_UNSAFE, escapeQuoted)}'`;
}

// Match: everything a single-quoted literal cannot hold as written, plus what `jsString` escapes.
const QUOTE_UNSAFE = /[\\'\u0000-\u001f\u007f<>\u2028\u2029]/g;

const QUOTE_ESCAPES: Record<string, string> = {
    '\\': '\\\\',
    "'": "\\'",
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
};

function escapeQuoted(ch: string): string {
    return QUOTE_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

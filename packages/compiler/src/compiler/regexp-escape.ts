/**
 * `text` as a regular expression that matches it literally: every metacharacter escaped, the
 * backslash included. A name escaped for only the characters it was expected to hold — `$` in an
 * identifier — stops being literal the day it holds another one (#71).
 */
export function escapeForRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

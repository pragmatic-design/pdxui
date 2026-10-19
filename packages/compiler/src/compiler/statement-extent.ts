// Where a script declaration ends: shared by the readers that find `@` declarations in a script by
// text — the route-field migration (#277) and the rune-position check (#278).

import { findClosing } from './tokenizer';

/**
 * The end of the declaration that starts at `at`: past its `;`, or at the end of its line, a `{ … }`
 * or `[ … ]` read whole on the way. Read on `masked` (the code with its strings and comments blank),
 * so a brace or a `;` in a string is not one; `code` is the same text unmasked, for the brackets.
 */
export function declarationEnd(code: string, masked: string, at: number): number {
    let i = at;
    for (; i < code.length; i++) {
        const ch = masked[i];
        if (ch === '{' || ch === '[') { const close = findClosing(code, i); if (close < 0) break; i = close; continue; }
        if (ch === ';') { i++; break; }
        if (ch === '\n') break;
    }
    return i;
}

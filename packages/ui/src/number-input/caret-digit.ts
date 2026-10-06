// Which digit the caret is on, as a place value — and where that digit is once the number has been
// reformatted.
//
// The rule is OpenSCAD's editor, an implementation with readable source: the
// digit BEFORE the caret, the ones with the caret at the end. `12|3` steps the tens, `1.2|5` the
// tenths. A group separator or a sign is not a digit: `1,|234` steps the thousands. With nothing
// before the caret, the first digit.
//
// One exception, and it departs from OpenSCAD: a caret RIGHT AFTER the decimal point steps the first
// decimal — `1.|25` steps 0.1, not the ones. locale-resolver.test.ts pins it, and a caret against
// the point reads as entering the decimals.
//
// After the step the caret goes back AFTER THE DIGIT OF THE SAME PLACE, not to the same offset: the
// offset is another digit once the number grows (99 → 109) or gains a group separator (999 → 1,099).

/** Every digit of `text` with its index and place value (1000, 100, 10, 1, 0.1 …). */
function digitPlaces(text: string, decimal: string): { index: number; place: number }[] {
    const sep = text.indexOf(decimal);
    const intEnd = sep === -1 ? text.length : sep;
    const out: { index: number; place: number }[] = [];
    let intDigits = 0;
    for (let i = 0; i < intEnd; i++) if (text[i] >= '0' && text[i] <= '9') intDigits++;
    let seenInt = 0;
    let seenFrac = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch < '0' || ch > '9') continue;
        if (i < intEnd) out.push({ index: i, place: Math.pow(10, intDigits - 1 - seenInt++) });
        else out.push({ index: i, place: Math.pow(10, -(++seenFrac)) });
    }
    return out;
}

/** The place value of the digit before `caret` in `text`; 1 when the text holds no digit. */
export function placeBeforeCaret(text: string, caret: number, decimal: string): number {
    const digits = digitPlaces(text, decimal);
    if (digits.length === 0) return 1;
    // Against the decimal point: the first decimal (see the note at the top).
    if (caret > 0 && text[caret - 1] === decimal) {
        const firstDecimal = digits.find((d) => d.index >= caret);
        if (firstDecimal) return firstDecimal.place;
    }
    let found = digits[0];
    for (const d of digits) if (d.index < caret) found = d;
    return found.place;
}

/**
 * Where the caret goes in `text` so it sits after the digit of `place`: right after it. When the
 * number no longer has that place (it shrank), after the digit of the nearest place it does have.
 */
export function caretAfterPlace(text: string, place: number, decimal: string): number {
    const digits = digitPlaces(text, decimal);
    if (digits.length === 0) return text.length;
    let best = digits[0];
    for (const d of digits) {
        if (Math.abs(Math.log10(d.place) - Math.log10(place)) < Math.abs(Math.log10(best.place) - Math.log10(place))) best = d;
    }
    return best.index + 1;
}

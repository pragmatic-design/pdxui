// The mask engine of pdx-masked-input: the presets, formatting and stripping, and the range check of
// the date and time presets. Pure functions of the mask and the text, beside the component so that
// they are made once per page, not at every mount.

/**
 * Country calling codes of one and two digits (ITU-T E.164); every other code has three. The codes
 * are prefix-free, so the first digits typed say how long the code is: the mask engine has no
 * optional slot, and does not need one for this.
 */
const CC_ONE = new Set(['1', '7']);
const CC_TWO = new Set([
    '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
    '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
    '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]);

/** How many digits of `digits` are the country code: 1 to 3, read from the prefix. */
function countryCodeLength(digits: string): number {
    if (CC_ONE.has(digits.slice(0, 1))) return 1;
    if (digits.length < 2 || CC_TWO.has(digits.slice(0, 2))) return 2;
    return 3;
}

/**
 * Built-in masks. A preset is a pattern, or a pattern chosen from the digits typed so far.
 * `phone-intl` is not a fixed `+## (###) ###-####`: that makes every country code two digits, and a
 * +1 number typed as 15551234567 would become "+15 (551) 234-567". `date` is month/day/year.
 */
const MASKS: Record<string, string | ((digits: string) => string)> = {
    phone: '(###) ###-####',
    'phone-intl': (digits) => '+' + '#'.repeat(countryCodeLength(digits)) + ' (###) ###-####',
    card: '#### #### #### ####',
    date: '##/##/####',
    time: '##:##',
    ssn: '###-##-####',
    zip: '#####',
    'zip-ext': '#####-####',
};

/** The pattern for `text`: a preset chosen from its digits (phone-intl), or the mask as written. */
export function patternFor(mask: string, text = ''): string {
    const preset = MASKS[mask];
    if (typeof preset === 'function') return preset(text.replace(/\D/g, ''));
    return preset || mask;
}

/** `raw` formatted to the pattern: # = digit, A = letter, * = any, every other character a literal. */
export function applyMask(mask: string, raw: string): string {
    const pattern = patternFor(mask, raw);
    if (!pattern) return raw;
    let result = '';
    let rawIdx = 0;
    for (let i = 0; i < pattern.length && rawIdx < raw.length; i++) {
        const mc = pattern[i];
        if (mc === '#') {
            // Digit
            while (rawIdx < raw.length && !/\d/.test(raw[rawIdx])) rawIdx++;
            if (rawIdx < raw.length) result += raw[rawIdx++];
            else break;
        } else if (mc === 'A') {
            // Letter
            while (rawIdx < raw.length && !/[a-zA-Z]/.test(raw[rawIdx])) rawIdx++;
            if (rawIdx < raw.length) result += raw[rawIdx++];
            else break;
        } else if (mc === '*') {
            // Any
            result += raw[rawIdx++];
        } else {
            // Literal mask char — insert it
            result += mc;
        }
    }
    return result;
}

/** The characters of `formatted` that fill a slot of the pattern: the value without the literals. */
export function stripMask(mask: string, formatted: string): string {
    const pattern = patternFor(mask, formatted);
    if (!pattern) return formatted;
    let raw = '';
    for (let i = 0; i < formatted.length; i++) {
        const mc = i < pattern.length ? pattern[i] : null;
        if (mc === '#' || mc === 'A' || mc === '*') {
            raw += formatted[i];
        }
    }
    return raw;
}

/**
 * A complete `date` (MM/DD/YYYY) or `time` (HH:MM) value out of range: month 13, day 30 of February,
 * hour 24. A mask formats and does not judge, so the digits are kept as typed; the field says it is
 * invalid instead. An incomplete value, or any other mask, is not judged.
 */
export function outOfRange(preset: string, digits: string): boolean {
    if (preset === 'date' && digits.length === 8) {
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const year = Number(digits.slice(4));
        if (month < 1 || month > 12 || day < 1) return true;
        // Day 0 of the next month is the last day of this one.
        return day > new Date(Date.UTC(year, month, 0)).getUTCDate();
    }
    if (preset === 'time' && digits.length === 4) {
        return Number(digits.slice(0, 2)) > 23 || Number(digits.slice(2)) > 59;
    }
    return false;
}

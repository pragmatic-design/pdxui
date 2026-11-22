// The colour math of pdx-color-picker: conversions between hex, rgb, hsv and hsl, and the parser of
// what the user types. Pure functions, beside the component so that they are made once per page, not
// at every mount. Zero dependencies.

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb(h: number, s: number, v: number) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function hsvToHex(h: number, s: number, v: number) {
    const { r, g, b } = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
}

export function hsvToHsl(h: number, s: number, v: number) {
    s /= 100; v /= 100;
    const l = v * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
    return { h: Math.round(h), s: Math.round(sl * 100), l: Math.round(l * 100) };
}

export function parseColor(input: string): { h: number; s: number; v: number; a: number } | null {
    if (!input) return null;
    input = input.trim().toLowerCase();
    // hex (#rgb, #rrggbb, #rrggbbaa)
    if (/^#([0-9a-f]{3,8})$/.test(input)) {
        let hex = input.replace('#', ''), a = 1;
        if (hex.length === 4) { a = parseInt(hex[3] + hex[3], 16) / 255; hex = hex.slice(0, 3); }
        if (hex.length === 8) { a = parseInt(hex.slice(6), 16) / 255; hex = hex.slice(0, 6); }
        return { ...rgbToHsv(...Object.values(hexToRgb('#' + hex)) as [number, number, number]), a };
    }
    // rgb(r,g,b) / rgba(r,g,b,a)
    const rm = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if (rm) return { ...rgbToHsv(+rm[1], +rm[2], +rm[3]), a: rm[4] != null ? +rm[4] : 1 };
    // hsl(h,s%,l%) / hsla(h,s%,l%,a)
    const hm = input.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\)/);
    if (hm) {
        const [, hh, ss, ll, aa] = hm;
        const sl = +ss / 100, l = +ll / 100;
        const v = l + sl * Math.min(l, 1 - l);
        const sv = v === 0 ? 0 : 2 * (1 - l / v);
        return { h: +hh, s: sv * 100, v: v * 100, a: aa != null ? +aa : 1 };
    }
    return null;
}

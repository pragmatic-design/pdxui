// Chart colour helpers: any CSS colour to numbers, mixing, and WCAG contrast.
//
// The theme resolves its tokens through getComputedStyle, which hands oklch() tokens back as
// `oklch(...)`. A canvas paints that fine, but arithmetic on it needs numbers: a hex-only parser
// turns it into NaN. Hex and rgb() are read directly; anything else is resolved
// by the one parser that knows every colour the browser supports — a 1×1 canvas painted with it and
// read back. Results are cached per string.

export type Rgba = [number, number, number, number];

const cache = new Map<string, Rgba>();

/** A 1×1 canvas to paint a colour on. One per unresolved colour string: the results are cached. */
function probeContext(): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
}

function parseDirect(color: string): Rgba | null {
    const c = color.trim().toLowerCase();
    let m = /^#([0-9a-f]{3,8})$/.exec(c);
    if (m) {
        let h = m[1];
        if (h.length === 3 || h.length === 4) h = h.split('').map(ch => ch + ch).join('');
        if (h.length !== 6 && h.length !== 8) return null;
        const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(c);
    if (m) {
        const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), alpha];
    }
    return null;
}

/** The colour as [r, g, b, a] (0–255, alpha 0–1), or null when nothing can resolve it. */
export function parseRgb(color: string): Rgba | null {
    if (!color) return null;
    const direct = parseDirect(color);
    if (direct) return direct;
    const known = cache.get(color);
    if (known) return known;
    const ctx = probeContext();
    let out: Rgba | null = null;
    if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        out = [r, g, b, Math.round((a / 255) * 1000) / 1000];
    }
    // An unresolved probe is not cached: the canvas may exist on a later call (after mount).
    if (out) cache.set(color, out);
    return out;
}

/** Linear mix in sRGB, t = 0 → a, t = 1 → b. */
export function mixRgb(a: Rgba, b: Rgba, t: number): Rgba {
    const k = Math.max(0, Math.min(1, t));
    return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
        a[3] + (b[3] - a[3]) * k,
    ];
}

export function rgbString(c: Rgba): string {
    return c[3] >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;
}

function luminance(c: Rgba): number {
    const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG 2 contrast ratio between two opaque colours. */
export function contrastRatio(a: Rgba, b: Rgba): number {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

/** Of `candidates`, the text colour that contrasts most with `fill`, and its ratio; null when `fill` cannot be read. */
export function mostReadableOn(fill: string, candidates: string[]): { color: string; ratio: number } | null {
    const f = parseRgb(fill);
    if (!f) return null;
    let best: { color: string; ratio: number } | null = null;
    for (const color of candidates) {
        const c = parseRgb(color);
        if (!c) continue;
        const ratio = contrastRatio(f, c);
        if (!best || ratio > best.ratio) best = { color, ratio };
    }
    return best;
}

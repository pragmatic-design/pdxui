/**
 * Color math — hex ↔ OKLCH conversion, palette generation, conflict resolution.
 * Zero dependencies. All math from OKLab spec (Björn Ottosson, 2020).
 */

import type { OKLCH, SemanticHues } from './types.js';

// ── hex ↔ sRGB ──

function hexToSrgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const n = h.length === 3
        ? [parseInt(h[0]+h[0], 16), parseInt(h[1]+h[1], 16), parseInt(h[2]+h[2], 16)]
        : [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
    return [n[0]/255, n[1]/255, n[2]/255];
}

function srgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const toHex = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── sRGB → linear RGB (gamma decode) ──

function linearize(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function delinearize(c: number): number {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1/2.4) - 0.055;
}

// ── linear sRGB → OKLab (Björn Ottosson) ──

function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
    const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l = Math.cbrt(l_);
    const m = Math.cbrt(m_);
    const s = Math.cbrt(s_);

    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

// ── OKLab ↔ OKLCH ──

function oklabToOklch(L: number, a: number, b: number): OKLCH {
    const c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { l: L, c, h };
}

function oklchToOklab(lch: OKLCH): [number, number, number] {
    const hRad = lch.h * Math.PI / 180;
    return [lch.l, lch.c * Math.cos(hRad), lch.c * Math.sin(hRad)];
}

// ── Public API ──

export function hexToOklch(hex: string): OKLCH {
    const [r, g, b] = hexToSrgb(hex);
    const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
    const [L, a, bv] = linearSrgbToOklab(lr, lg, lb);
    return oklabToOklch(L, a, bv);
}

export function oklchToHex(lch: OKLCH): string {
    const [L, a, b] = oklchToOklab(lch);
    const [lr, lg, lb] = oklabToLinearSrgb(L, a, b);
    return srgbToHex(delinearize(lr), delinearize(lg), delinearize(lb));
}

/** Hue distance on the 360° circle (0-180) */
export function deltaE(h1: number, h2: number): number {
    const d = Math.abs(h1 - h2);
    return Math.min(d, 360 - d);
}

/** Format OKLCH as CSS value string */
export function oklchCSS(l: number, c: number, h: number): string {
    return `oklch(${round(l)} ${round(c)} ${Math.round(h)})`;
}

function round(n: number, d = 3): number {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
}

// ── Palette Generation ──

const PALETTE_L = [0.97, 0.93, 0.86, 0.76, 0.65, 0.55, 0.48, 0.40, 0.32, 0.22];
const PALETTE_C = [0.03, 0.06, 0.10, 0.14, 0.17, 0.18, 0.20, 0.18, 0.14, 0.10];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Generate a 10-shade color ramp for a given hue */
export function generatePalette(hue: number): Record<string, string> {
    const result: Record<string, string> = {};
    SHADES.forEach((shade, i) => {
        result[String(shade)] = oklchCSS(PALETTE_L[i], PALETTE_C[i], hue);
    });
    return result;
}

const GRAY_L = [0.985, 0.965, 0.905, 0.82, 0.68, 0.55, 0.44, 0.35, 0.25, 0.18, 0.13];
const GRAY_C = [0.002, 0.004, 0.008, 0.012, 0.015, 0.015, 0.015, 0.015, 0.012, 0.008, 0.005];
const GRAY_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Generate 11-shade gray ramp with optional hue tint */
export function generateGrays(neutralHue: number): Record<string, string> {
    const result: Record<string, string> = {};
    GRAY_SHADES.forEach((shade, i) => {
        result[String(shade)] = oklchCSS(GRAY_L[i], GRAY_C[i], neutralHue);
    });
    return result;
}

// ── Semantic Hue Assignment with Conflict Resolution ──

const FIXED_HUES = { danger: 25, success: 155, warning: 85, info: 220 };
const MIN_DELTA = 30;

/** Assign semantic hues, shifting if brand is too close */
export function assignSemanticHues(brandHue: number): SemanticHues {
    function safeHue(target: number): number {
        if (deltaE(brandHue, target) >= MIN_DELTA) return target;
        return brandHue > target ? target - MIN_DELTA : target + MIN_DELTA;
    }

    return {
        primary: brandHue,
        secondary: (brandHue + 150) % 360,
        accent: (brandHue + 40) % 360,
        danger: safeHue(FIXED_HUES.danger),
        warning: safeHue(FIXED_HUES.warning),
        success: FIXED_HUES.success,  // green is rarely close to any brand
        info: safeHue(FIXED_HUES.info),
    };
}

// ── Surface Colors ──

export interface SurfaceColors {
    bg: string;
    surface: string;
    inset: string;
    overlay: string;
    border: string;
    borderStrong: string;
    text: string;
    muted: string;
}

/** Generate light-dark() surface tokens from the gray ramp hue. */
export function generateSurfaces(neutralHue: number): SurfaceColors {
    const h = neutralHue;
    return {
        bg:          `light-dark(${oklchCSS(0.965, 0.008, h)}, ${oklchCSS(0.13, 0.005, h)})`,
        surface:     `light-dark(${oklchCSS(0.995, 0.002, h)}, ${oklchCSS(0.17, 0.008, h)})`,
        inset:       `light-dark(${oklchCSS(0.945, 0.010, h)}, ${oklchCSS(0.22, 0.008, h)})`,
        overlay:     `light-dark(${oklchCSS(0.995, 0.002, h)}, ${oklchCSS(0.22, 0.010, h)})`,
        border:      `light-dark(${oklchCSS(0.88, 0.008, h)}, ${oklchCSS(0.30, 0.008, h)})`,
        borderStrong:`light-dark(${oklchCSS(0.75, 0.012, h)}, ${oklchCSS(0.42, 0.010, h)})`,
        text:        `light-dark(${oklchCSS(0.20, 0.010, h)}, ${oklchCSS(0.93, 0.005, h)})`,
        // Muted carries every description, on the page and on inset as well as on a card:
        // 0.55 / 0.60 read 4.1–4.4 on bg and inset.
        muted:       `light-dark(${oklchCSS(0.50, 0.015, h)}, ${oklchCSS(0.64, 0.010, h)})`,
    };
}

/**
 * Generate the primary interactive colors from the brand's own OKLCH.
 *
 * `lightness` is the brand's L: it is PRESERVED when a label can already reach AA on it
 * (fillLightnessForLabel only nudges when it must), so "my brand hex" really is the theme's
 * primary, not a canonical 0.55 that would silently shift every brand (a 0.50 purple coming
 * out at 0.55). The dark-scheme fill sits +0.15 above the light one.
 */
export function generatePrimaryColors(hue: number, chroma = 0.18, lightness = 0.55) {
    const base = Math.min(0.85, Math.max(0.30, lightness));
    const lL = fillLightnessForLabel(base, chroma, hue);
    const dL = fillLightnessForLabel(Math.min(0.82, base + 0.15), chroma * 0.85, hue);
    const lightFill: OKLCH = { l: lL, c: chroma, h: hue };
    const darkFill: OKLCH = { l: dL, c: chroma * 0.85, h: hue };
    return {
        primary:      `light-dark(${oklchCSS(lL, chroma, hue)}, ${oklchCSS(dL, chroma * 0.85, hue)})`,
        primaryHover: `light-dark(${oklchCSS(Math.max(0.30, lL - 0.07), chroma + 0.02, hue)}, ${oklchCSS(Math.min(0.82, dL - 0.08), chroma * 0.9, hue)})`,
        primaryText:  `light-dark(${autoTextColor(lightFill)}, ${autoTextColor(darkFill)})`,
        focus:        oklchCSS(0.60, chroma, hue),
    };
}

// ── WCAG contrast ──

/** OKLCH → linear sRGB components (may fall outside 0..1 if out of gamut). */
export function oklchToLinearSrgb(lch: OKLCH): [number, number, number] {
    const [L, a, b] = oklchToOklab(lch);
    return oklabToLinearSrgb(L, a, b);
}

/** WCAG relative luminance (0..1) of an OKLCH color. */
export function luminance(lch: OKLCH): number {
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    const [r, g, b] = oklchToLinearSrgb(lch);
    return 0.2126 * cl(r) + 0.7152 * cl(g) + 0.0722 * cl(b);
}

/** WCAG 2.x contrast ratio (1..21) between two OKLCH colors. */
export function wcagContrast(a: OKLCH, b: OKLCH): number {
    const la = luminance(a), lb = luminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick the label color — a hue-tinted near-white or near-black — that maximizes
 * contrast on a given fill. This is what makes generated buttons legible *by
 * construction*: a light brand gets dark labels, a dark fill gets white ones, in
 * each scheme, instead of assuming white everywhere.
 */
export function autoTextColor(fill: OKLCH): string {
    const light: OKLCH = { l: 0.98, c: 0.01, h: fill.h };
    const dark: OKLCH = { l: 0.22, c: 0.01, h: fill.h };
    const pick = wcagContrast(light, fill) >= wcagContrast(dark, fill) ? light : dark;
    return oklchCSS(pick.l, pick.c, pick.h);
}

/** Best achievable label contrast on a fill (whichever of near-white/near-black wins). */
function bestLabelContrast(l: number, c: number, h: number): number {
    const fill: OKLCH = { l, c, h };
    return Math.max(wcagContrast({ l: 0.98, c: 0.01, h }, fill), wcagContrast({ l: 0.22, c: 0.01, h }, fill));
}

/**
 * Nudge a fill's lightness (the least amount, either direction) until its best auto
 * label clears `target`. Mid-luminance hues like green/cyan sit at the contrast
 * "saddle" where neither white nor black reaches AA at L≈0.55 — this moves the fill
 * off the saddle so generated buttons are legible by construction. Returns the
 * original lightness if it already passes or no nearby value reaches the target.
 */
export function fillLightnessForLabel(l: number, c: number, h: number, target = 4.5): number {
    if (bestLabelContrast(l, c, h) >= target) return l;
    let down = l, up = l;
    while (down > 0.30 && bestLabelContrast(down, c, h) < target) down -= 0.01;
    while (up < 0.85 && bestLabelContrast(up, c, h) < target) up += 0.01;
    const downOk = bestLabelContrast(down, c, h) >= target;
    const upOk = bestLabelContrast(up, c, h) >= target;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    if (downOk && upOk) return round(l - down <= up - l ? down : up);
    if (downOk) return round(down);
    if (upOk) return round(up);
    return l;
}

/** Split a string on top-level commas, ignoring commas nested in parentheses. */
function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
        else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
}

/** Split on top-level whitespace, keeping `min(l, 0.5)` and `light-dark(a, b)` whole. */
function splitTopLevelSpaces(s: string): string[] {
    const out: string[] = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; }
        else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
}

/** `L C H / A` → [`L C H`, `A`]: the slash at the top level, not one inside a nested origin. */
function splitAlpha(s: string): [string, string | undefined] {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth--;
        else if (s[i] === '/' && depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }
    return [s, undefined];
}

/** A number, or a percentage of `full` (lightness: `50%` is 0.5; alpha: `50%` is 0.5). */
function parseChannelNumber(s: string, full = 1): number {
    const n = parseFloat(s);
    return s.trim().endsWith('%') ? (n / 100) * full : n;
}

/**
 * One channel of a relative colour: a number, the origin's own channel (`l`, `c`, `h`, `alpha`),
 * or `min(…)` / `max(…)` of those. Anything else — `calc()`, units — is NaN, so the whole colour
 * reads as unreadable rather than as a guess.
 */
function evalChannel(expr: string, origin: Required<OKLCH>): number {
    const e = expr.trim();
    if (e === 'l' || e === 'c' || e === 'h' || e === 'alpha') return origin[e];
    const fn = e.match(/^(min|max)\((.*)\)$/);
    if (fn) {
        const args = splitTopLevel(fn[2]).map((a) => evalChannel(a, origin));
        return fn[1] === 'min' ? Math.min(...args) : Math.max(...args);
    }
    return /^-?[\d.]+%?$/.test(e) ? parseChannelNumber(e) : NaN;
}

/**
 * Parse a generated color token into OKLCH for a given scheme. Handles
 * `oklch(L C H [/ a])`, the relative form `oklch(from ORIGIN L C H [/ a])` whose channels may be
 * the origin's own or `min()`/`max()` of them, `light-dark(LIGHT, DARK)`, and `#hex`. Returns null
 * for values that can't be resolved statically (var(), gradients, currentColor…) — resolve the
 * `var()`s first with {@link resolveColorToken}.
 */
export function parseColorToken(css: string, scheme: 'light' | 'dark'): OKLCH | null {
    const s = css.trim();
    if (s.startsWith('light-dark(')) {
        const parts = splitTopLevel(s.slice('light-dark('.length, -1));
        if (parts.length !== 2) return null;
        return parseColorToken(parts[scheme === 'dark' ? 1 : 0], scheme);
    }
    if (s.startsWith('oklch(')) {
        const [channels, alphaPart] = splitAlpha(s.slice('oklch('.length, -1).trim());
        const parts = splitTopLevelSpaces(channels);
        if (parts[0] === 'from') {
            // Relative colour syntax: the tokens derive a legible text colour from a
            // theme's own colour, so the gate has to read what the browser computes.
            const origin = parseColorToken(parts[1] ?? '', scheme);
            if (!origin || parts.length !== 5) return null;
            const env: Required<OKLCH> = { ...origin, alpha: origin.alpha ?? 1 };
            const [l, c, h] = parts.slice(2).map((p) => evalChannel(p, env));
            const alpha = alphaPart === undefined ? env.alpha : evalChannel(alphaPart, env);
            if ([l, c, h, alpha].some(Number.isNaN)) return null;
            return alpha < 1 ? { l, c, h, alpha } : { l, c, h };
        }
        const l = parseFloat(parts[0]), c = parseFloat(parts[1]), h = parseFloat(parts[2]);
        if ([l, c, h].some(Number.isNaN)) return null;
        const alpha = alphaPart === undefined ? 1 : parseChannelNumber(alphaPart);
        const lch: OKLCH = { l: parts[0].includes('%') ? l / 100 : l, c, h };
        return alpha < 1 ? { ...lch, alpha } : lch;
    }
    if (s.startsWith('#')) return hexToOklch(s);
    // The token system writes its label colours as keywords: `--pdx-color-danger-text: white` and
    // friends in tokens.css. Returning null for those would make every caller skip the five pairs the
    // label rule is about — and the contrast gate turns "cannot read" into "did not check"
    // (`if (!bg || !fg) continue`). Only the two the tokens actually use are recognised; anything
    // else stays null on purpose, so an unreadable value is still visible as unreadable.
    if (s === 'white') return { l: 1, c: 0, h: 0 };
    if (s === 'black') return { l: 0, c: 0, h: 0 };
    return null;
}

/**
 * `top` painted over the opaque `bottom`, as the browser composites: per channel, in gamma-encoded
 * sRGB. An opaque `top` is returned as it is. Glass's surfaces are 55–65% opaque; reading them as
 * solid measures a background nobody sees.
 */
export function compositeOver(top: OKLCH, bottom: OKLCH): OKLCH {
    const a = top.alpha ?? 1;
    if (a >= 1) return { l: top.l, c: top.c, h: top.h };
    const srgb = (lch: OKLCH) => oklchToLinearSrgb(lch).map((v) => delinearize(Math.max(0, Math.min(1, v))));
    const t = srgb(top), b = srgb(bottom);
    const mixed = t.map((v, i) => linearize(a * v + (1 - a) * b[i])) as [number, number, number];
    const [L, A, B] = linearSrgbToOklab(...mixed);
    return oklabToOklch(L, A, B);
}

/** `var(--name)` / `var(--name, fallback)`, innermost first. */
const VAR_REF = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/i;

/**
 * Read token `name` from a token map as a colour for `scheme`, following every `var()` in it —
 * nested ones included: `light-dark(white, var(--pdx-gray-950))` is how ten themes write their dark
 * background, and `oklch(from var(--pdx-color-danger) …)` how the tokens derive a text colour.
 * Null when a reference is missing or the result is not a colour this module can read.
 */
export function resolveColorToken(
    tokens: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
    name: string,
    scheme: 'light' | 'dark',
): OKLCH | null {
    const get = (k: string) => (tokens instanceof Map ? tokens.get(k) : (tokens as Record<string, string>)[k]);
    let value = get(name);
    for (let hop = 0; hop < 32 && value && VAR_REF.test(value); hop++) {
        let missing = false;
        value = value.replace(VAR_REF, (_m: string, ref: string, fallback?: string) => {
            const v = get(ref) ?? fallback?.trim();
            if (v === undefined) missing = true;
            return v ?? '';
        });
        if (missing) return null;
    }
    return value && !VAR_REF.test(value) ? parseColorToken(value, scheme) : null;
}

/** Generate danger/success/warning/info colors, each with an auto-contrast label. */
export function generateSemanticColors(hues: SemanticHues) {
    const sem = (hue: number, lightC = 0.16, darkC = 0.14, baseL = 0.52, baseDarkL = 0.68) => {
        const lL = fillLightnessForLabel(baseL, lightC, hue);
        const dL = fillLightnessForLabel(baseDarkL, darkC, hue);
        const lightFill: OKLCH = { l: lL, c: lightC, h: hue };
        const darkFill: OKLCH = { l: dL, c: darkC, h: hue };
        return {
            color: `light-dark(${oklchCSS(lL, lightC, hue)}, ${oklchCSS(dL, darkC, hue)})`,
            hover: `light-dark(${oklchCSS(Math.max(0.30, lL - 0.07), lightC + 0.02, hue)}, ${oklchCSS(Math.min(0.82, dL - 0.08), darkC + 0.02, hue)})`,
            text:  `light-dark(${autoTextColor(lightFill)}, ${autoTextColor(darkFill)})`,
        };
    };
    return {
        danger: sem(hues.danger, 0.20, 0.16),
        success: sem(hues.success, 0.14, 0.12),
        // Warning is the one semantic whose fill must stay LIGHT. Every shipped theme uses a
        // light amber with a DARK label (base tokens.css 0.75/0.78, famous 0.70-0.78); the
        // generic 0.52 policy would turn it into a dark brown — the single largest fidelity gap
        // against the hand-written themes. autoTextColor then picks the dark label.
        warning: sem(hues.warning, 0.15, 0.12, 0.75, 0.78),
        info: sem(hues.info, 0.14, 0.12),
    };
}

/**
 * A colour as TEXT, and the tint behind it.
 *
 * A fill cannot double as a text colour. The label rule keeps a fill at L≈0.52–0.58 so a white
 * label reads on it, which is too light for text on the light page and too dark for text on the
 * dark one; warning's amber is light on purpose and unreadable as text on white. In Chromium,
 * tinted badges, outline chips, links and error messages written in the fill fail WCAG AA in 26 of
 * 26 theme×scheme combinations.
 *
 * `*-ink` is the colour for text on bg, surface, inset and on its own `*-soft` tint: the theme's
 * own colour, darkened in light and lightened in dark, its chroma capped to stay in gamut. It is
 * DERIVED with relative colour syntax, so a theme that re-hues danger gets a matching ink without
 * declaring one. `*-soft` is the tint of a tonal badge or chip.
 *
 * These strings are the source: `tokens.css` declares exactly them (a test holds the two in
 * lockstep), and the contrast gates — the engine's `validate()` and the shipped-theme test — read
 * them to measure what the browser renders.
 */

/** The colours that are also written as text. `info` in the components is mostly `accent`. */
export const TEXT_HUES = ['primary', 'accent', 'danger', 'success', 'warning', 'info'] as const;

/** Light: at most this lightness. Dark: at least this. Chroma: at most these. */
export const INK = { lightMaxL: 0.46, lightMaxC: 0.15, darkMinL: 0.72, darkMaxC: 0.12 } as const;
/** The tint: a fixed lightness per scheme, a whisper of the colour's chroma. */
export const SOFT = { lightL: 0.94, darkL: 0.27, maxC: 0.05 } as const;

/** `--pdx-color-{hue}-ink` and `--pdx-color-{hue}-soft` for every text hue, as `tokens.css` writes them. */
export function derivedTextTokens(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const hue of TEXT_HUES) {
        const from = `from var(--pdx-color-${hue})`;
        out[`--pdx-color-${hue}-ink`] =
            `light-dark(oklch(${from} min(l, ${INK.lightMaxL}) min(c, ${INK.lightMaxC}) h), `
            + `oklch(${from} max(l, ${INK.darkMinL}) min(c, ${INK.darkMaxC}) h))`;
        out[`--pdx-color-${hue}-soft`] =
            `light-dark(oklch(${from} ${SOFT.lightL} min(c, ${SOFT.maxC}) h), `
            + `oklch(${from} ${SOFT.darkL} min(c, ${SOFT.maxC}) h))`;
    }
    return out;
}

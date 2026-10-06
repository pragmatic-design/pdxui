/**
 * THEME SINGLE SOURCE OF TRUTH
 *
 * Unifies the two lists that had diverged in the repository:
 *  - contracts/universal.ts → 8 themes (default, material, fluent, cupertino, corporate, playful, cyberpunk, editorial)
 *  - visual-regression/theme-regression.spec.ts → 11 themes
 * Aligned with the real files in packages/design/src/themes/*.css (13 themes).
 *
 * Every runner (contract, axe, isolation, keyboard, visual) imports from here and NOWHERE else.
 * Adding a theme = adding a row, without touching the runners.
 */

export type Scheme = 'light' | 'dark';

export interface ThemeMeta {
    /** The value of [pdx-theme] on <html>. '' = default (matches :root:not([pdx-theme])) */
    name: string;
    /** Readable label, for the test names */
    label: string;
    /**
     * The scheme the theme is meant to be shown in, in screenshots and axe runs.
     * Every theme supports both schemes through [pdx-scheme]; this is only the theme's
     * "canonical" scheme (cyberpunk and glass, for instance, are born dark).
     */
    defaultScheme: Scheme;
    /**
     * A theme that reproduces a known design system (Material 3, Fluent 2, Apple HIG, Metro).
     * These carry theme-specific contracts based on the vendor's own spec.
     */
    famous?: boolean;
    /** Themes that share a design language (the Pragmatic family, for instance) */
    family?: string;
}

/**
 * Every official theme. The order is the canonical one the reports use.
 * `neutral` first: it is the neutral, vanilla canvas.
 */
export const THEME_META: ThemeMeta[] = [
    { name: 'neutral', label: 'Neutral', defaultScheme: 'light' },
    { name: 'material', label: 'Material 3', defaultScheme: 'light', famous: true },
    { name: 'fluent', label: 'Fluent 2', defaultScheme: 'light', famous: true },
    { name: 'cupertino', label: 'Cupertino', defaultScheme: 'light', famous: true },
    { name: 'metro', label: 'Metro', defaultScheme: 'light', famous: true },
    { name: 'corporate', label: 'Corporate', defaultScheme: 'light' },
    { name: 'playful', label: 'Playful', defaultScheme: 'light' },
    { name: 'editorial', label: 'Editorial', defaultScheme: 'light' },
    { name: 'cyberpunk', label: 'Cyberpunk', defaultScheme: 'dark' },
    { name: 'glass', label: 'Glass', defaultScheme: 'dark' },
    { name: 'neumorphic', label: 'Neumorphic', defaultScheme: 'light' },
    { name: 'pragmatic', label: 'Pragmatic Blue', defaultScheme: 'light', family: 'pragmatic' },
    { name: 'pragmatic-gold', label: 'Pragmatic Gold', defaultScheme: 'light', family: 'pragmatic' },
];

/** Every theme name (replaces the scattered ALL_THEMES). */
export const THEMES: string[] = THEME_META.map((t) => t.name);

/** Only the "famous" themes, the ones with contracts based on a vendor spec. */
export const FAMOUS_THEMES: string[] = THEME_META.filter((t) => t.famous).map((t) => t.name);

/** Themes born in dark mode (replaces DARK_THEMES). */
export const DARK_THEMES: string[] = THEME_META.filter((t) => t.defaultScheme === 'dark').map((t) => t.name);

/** A theme's canonical scheme. */
export function schemeFor(theme: string): Scheme {
    return THEME_META.find((t) => t.name === theme)?.defaultScheme ?? 'light';
}

/** A theme's metadata, by name. */
export function themeMeta(theme: string): ThemeMeta | undefined {
    return THEME_META.find((t) => t.name === theme);
}

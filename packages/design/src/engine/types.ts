/** Theme engine types — zero dependencies */

export interface ThemeInput {
    name: string;
    brandColor: string;              // '#6442d6' or 'oklch(0.52 0.16 215)' (hex clips wide-gamut)
    accentColor?: string;            // same forms; auto-calculated if omitted
    /**
     * Focus-ring colour, same forms. Derived from the brand when omitted. Explicit because
     * it is the most accessibility-visible single colour, and several themes deliberately
     * pick one that is neither the brand hue nor the canonical lightness (editorial uses
     * its accent hue; the neutral canvas uses a darker ring).
     */
    focusColor?: string;
    neutralHue?: number;             // 0-360, warm/cool tint for grays

    language: LanguageId;
    density?: 'compact' | 'normal' | 'comfort';
    radiusScale?: 'sharp' | 'rounded' | 'pill';

    fontSans?: string;
    fontHeading?: string;
    fontMono?: string;
    typeScale?: ScaleRatio;

    scheme?: 'light' | 'dark' | 'auto';
    motionScale?: number;            // 0 = no motion, 1 = normal
    contrastMode?: 'normal' | 'high';

    /** Per-token overrides — applied AFTER generation */
    overrides?: Record<string, string>;

    /**
     * Raw CSS escape-hatch appended inside the theme block, for personality that
     * can't be expressed as a token yet (per-component rules, pseudo-elements).
     * Nested selectors auto-scope to the theme via CSS nesting. Concatenated after
     * the language's own `cssOverrides`.
     */
    cssOverrides?: string;
}

export type LanguageId =
    | 'material' | 'fluent' | 'cupertino' | 'metro' | 'neutral'
    | 'corporate' | 'playful' | 'cyberpunk' | 'editorial' | 'neumorphic' | 'glass'
    | 'pragmatic'
    | 'custom';

export type ScaleRatio = 'minor-third' | 'major-third' | 'perfect-fourth' | 'golden';

export type InputStyle = 'outlined' | 'filled' | 'underlined';
export type ButtonShape = 'sharp' | 'rounded' | 'pill';
export type TabIndicator = 'underline' | 'pill';
export type CardStyle = 'bordered' | 'elevated' | 'flat';
export type FocusStyle = 'ring' | 'outline' | 'underline';

/**
 * Table-header vocabulary. 11 of the 13 shipped themes redefine `.pdx-table th`, which made
 * it the single most theme-specific surface — and one the engine could not express at all,
 * so `--language=corporate` produced a table header that looked nothing like corporate.
 * Each field maps to `--pdx-table-header-<kebab>`; omitted fields fall back to tokens.css.
 */
export interface TableHeaderTokens {
    transform?: string;
    letterSpacing?: string;
    weight?: string;
    size?: string;
    color?: string;
    bg?: string;
    font?: string;
    borderWidth?: string;
    borderColor?: string;
}

export interface BehaviorTokens {
    tableHeader?: TableHeaderTokens;
    /** Card VALUES (the structure comes from cardStyle). */
    cardRadius?: string;
    cardShadow?: string;
    cardBorderColor?: string;
    /** Premium hover on the primary button — the base reads these on :hover. */
    buttonHoverShadow?: string;
    buttonHoverTransform?: string;
    inputStyle: InputStyle;
    inputFocus?: 'ring' | 'bottom';
    buttonShape: ButtonShape;
    /**
     * Explicit button radius when the 3-value shape enum can't express the vendor's spec
     * (Apple uses a LARGE radius, which is neither `rounded`=md nor `pill`). Wins over
     * buttonShape; an explicit ThemeInput.radiusScale still wins over this.
     */
    buttonRadius?: string;
    tabIndicator: TabIndicator;
    tabIndicatorSize: string;
    cardStyle: CardStyle;
    accordionIcon: 'plus' | 'chevron' | 'arrow';
    /** Raw breadcrumb separator glyph (e.g. '›', '/', '·'). Emitted as --pdx-breadcrumb-separator. */
    breadcrumbSeparator?: string;
    focusStyle: FocusStyle;
    inputMinHeight: string;
    buttonMinHeight: string;
    toggleWidth: string;
    toggleHeight: string;
    opacityHover: number;
    opacityPressed: number;
    borderWidth: string;
    borderWidthFocus: string;
}

export interface DesignLanguage {
    id: LanguageId;
    behaviors: BehaviorTokens;
    tokens: {
        radiusScale: 'sharp' | 'rounded' | 'pill';
        baseUnit: number;
        densityFactor?: number;
        fontWeightMedium: number;
        fontWeightSemibold: number;
        shadowIntensity: 'none' | 'subtle' | 'medium' | 'strong';
    };
    fonts: {
        sans: string;
        heading?: string;
        mono?: string;
    };
    /** Theme-specific CSS overrides that can't be expressed as tokens */
    cssOverrides?: string;
}

export interface OKLCH {
    l: number;  // 0-1
    c: number;  // 0-0.4
    h: number;  // 0-360
    /** 0-1; absent means opaque. Only `parseColorToken` sets it, from `oklch(… / a)`. */
    alpha?: number;
}

export interface SemanticHues {
    primary: number;
    secondary: number;
    accent: number;
    danger: number;
    warning: number;
    success: number;
    info: number;
}

export interface GeneratedTheme {
    name: string;
    input: ThemeInput;
    tokens: Record<string, string>;
    behaviors: BehaviorTokens;
    /** Attributes to set on <html> for CSS structural variants */
    attributes: Record<string, string>;
    /** Complete CSS block for [pdx-theme="name"] */
    toCSS(): string;
    /** Apply to a document's root element. Defaults to the ambient document; pass a
     *  same-origin iframe's `contentDocument` to theme a preview in isolation. */
    apply(target?: Document): void;
    /** Validate and return issues */
    validate(): ThemeIssue[];
}

export interface ThemeIssue {
    level: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    /** Human-readable remedy. Prose — for the operator, not for a program. */
    fix?: string;
    /**
     * MACHINE-ACTIONABLE remedy, when the issue has one.
     *
     * Without this a caller has to parse `message` to learn which tokens are at fault,
     * which is the difference between a report that can be acted on and one that can only
     * be read. Present on contrast issues; absent on advisory ones.
     */
    remedy?: {
        /** The pair that failed, so a tool knows what to change. */
        foreground: string;
        background: string;
        /** Which scheme failed — the same pair can pass in one and fail in the other. */
        scheme: 'light' | 'dark';
        /** Measured ratio and the threshold it missed. */
        ratio: number;
        required: number;
        /** A value for `foreground` that satisfies the threshold on this background. */
        suggested: string;
    };
}

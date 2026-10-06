/**
 * Design Language presets — behavior tokens + structural rules per language.
 * Each language encodes the visual personality of a design system.
 *
 * References:
 * - Material: m3.material.io/styles
 * - Fluent: fluent2.microsoft.design
 * - Cupertino: developer.apple.com/design/human-interface-guidelines
 * - Metro: Microsoft Design Language (Windows 8)
 */

import type { DesignLanguage, LanguageId } from './types.js';

// ── Material Design 3 "Expressive" ──
// Key traits: tonal surfaces, warm cream bg, filled inputs, rounded shapes.
// 4dp grid, corner scale (extra-small 4, small 8, medium 12, large 16).
// Pill buttons, 56dp input height, M3 label-large typography.
const material: DesignLanguage = {
    id: 'material',
    behaviors: {
        inputStyle: 'filled',
        inputFocus: 'bottom',
        buttonShape: 'pill',
        cardRadius: 'var(--pdx-radius-lg)',
        buttonHoverShadow: 'var(--pdx-shadow-sm)',
        tabIndicator: 'underline',
        tabIndicatorSize: '3px',
        cardStyle: 'elevated',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '·',
        tableHeader: {
            transform: 'none',
            letterSpacing: 'normal',
            weight: 'var(--pdx-weight-medium)',
            size: 'var(--pdx-text-sm)',
            color: 'var(--pdx-color-muted)',
            bg: 'light-dark(oklch(from var(--pdx-color-primary) l c h / 0.04), oklch(from var(--pdx-color-primary) l c h / 0.08))',
        },
        focusStyle: 'ring',
        inputMinHeight: '3.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '3.25rem',
        toggleHeight: '2rem',
        opacityHover: 0.08,
        opacityPressed: 0.12,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 500,
        shadowIntensity: 'medium',
    },
    fonts: {
        sans: "'Roboto', system-ui, sans-serif",
        heading: "'Roboto', system-ui, sans-serif",
    },
};

// ── Fluent UI 2 (Microsoft) ──
// Key traits: compact, clean, bottom-accent focus, subtle shadows.
// 32px medium height, semibold 600, minimal letter-spacing.
const fluent: DesignLanguage = {
    id: 'fluent',
    behaviors: {
        inputStyle: 'outlined',
        inputFocus: 'bottom',
        buttonShape: 'rounded',
        cardRadius: 'var(--pdx-radius-lg)',
        tabIndicator: 'underline',
        tabIndicatorSize: '3px',
        cardStyle: 'bordered',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '/',
        tableHeader: {
            transform: 'none',
            letterSpacing: 'normal',
            weight: 'var(--pdx-weight-semibold)',
            size: 'var(--pdx-text-xs)',
            color: 'var(--pdx-color-muted)',
            borderColor: 'var(--pdx-color-border)',
        },
        focusStyle: 'outline',
        inputMinHeight: '2rem',
        buttonMinHeight: '2rem',
        toggleWidth: '2.5rem',
        toggleHeight: '1.25rem',
        opacityHover: 0.04,
        opacityPressed: 0.08,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        densityFactor: 0.9,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'subtle',
    },
    fonts: {
        sans: "'Segoe UI', system-ui, sans-serif",
    },
};

// ── Apple HIG (Cupertino) ──
// Key traits: 44px touch targets, segmented control tabs, system font.
// Subtle borders, generous padding, rounded but not pill.
const cupertino: DesignLanguage = {
    id: 'cupertino',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        // Apple HIG uses a LARGE button radius; aligned with the shipped cupertino.css
        // (which also uses a 2px tab rule, not 0).
        buttonRadius: 'var(--pdx-radius-lg)',
        tabIndicator: 'pill',
        tabIndicatorSize: '2px',
        cardStyle: 'bordered',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '›',
        tableHeader: {
            transform: 'none',
            letterSpacing: 'normal',
            weight: 'var(--pdx-weight-semibold)',
            size: 'var(--pdx-text-xs)',
            color: 'var(--pdx-color-muted)',
            borderWidth: 'var(--pdx-border-width)',
            borderColor: 'var(--pdx-color-border)',
        },
        focusStyle: 'ring',
        inputMinHeight: '2.75rem',
        buttonMinHeight: '2.75rem',
        toggleWidth: '3rem',
        toggleHeight: '1.75rem',
        opacityHover: 0.06,
        opacityPressed: 0.10,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'subtle',
    },
    fonts: {
        sans: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
        heading: "system-ui, -apple-system, 'SF Pro Display', sans-serif",
    },
};

// ── Metro (Windows 8 / Modern UI) ──
// Key traits: ZERO radius, bold 2px borders, no shadows, geometric precision.
// Typography-forward, flat surfaces, strong grid.
const metro: DesignLanguage = {
    id: 'metro',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'sharp',
        tabIndicator: 'underline',
        // Aligned with the shipped metro.css: Win8 chrome is
        // compact 32px with a 3px tab rule, and its tiles are BORDERED-flat, not borderless.
        tabIndicatorSize: '3px',
        cardStyle: 'bordered',
        accordionIcon: 'arrow',
        breadcrumbSeparator: '\\',
        tableHeader: {
            transform: 'uppercase',
            letterSpacing: '0.08em',
            size: 'var(--pdx-text-xs)',
            weight: 'var(--pdx-weight-semibold)',
            borderWidth: '3px',
            borderColor: 'var(--pdx-color-primary)',
        },
        focusStyle: 'outline',
        inputMinHeight: '2rem',
        buttonMinHeight: '2rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.06,
        opacityPressed: 0.12,
        borderWidth: '2px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'sharp',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'none',
    },
    fonts: {
        sans: "'Segoe UI', 'Noto Sans', system-ui, sans-serif",
        heading: "'Segoe UI Light', 'Segoe UI', system-ui, sans-serif",
    },
};

// ── Neutral ──
// The canvas language: barely-there UI, thin borders, maximum whitespace.
// Shares its name with the shipped `neutral` theme (the unbranded canvas).
const neutral: DesignLanguage = {
    id: 'neutral',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        tabIndicator: 'underline',
        tabIndicatorSize: '1px',
        cardStyle: 'bordered',
        accordionIcon: 'plus',
        breadcrumbSeparator: '/',
        focusStyle: 'ring',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.04,
        opacityPressed: 0.08,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'subtle',
    },
    fonts: {
        sans: "'Inter', system-ui, sans-serif",
    },
};

// ── Corporate ──
// Key traits: sharp, structured, uppercase buttons, strong borders.
// Blue-heavy, conservative, information-dense.
const corporate: DesignLanguage = {
    id: 'corporate',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        buttonRadius: 'var(--pdx-radius-sm)',
        cardRadius: 'var(--pdx-radius-md)',
        cardShadow: 'none',
        cardBorderColor: 'var(--pdx-color-border)',
        tabIndicator: 'underline',
        tabIndicatorSize: '3px',
        cardStyle: 'bordered',
        accordionIcon: 'arrow',
        breadcrumbSeparator: '|',
        tableHeader: {
            borderWidth: '3px',
            borderColor: 'var(--pdx-color-primary)',
        },
        focusStyle: 'ring',
        // 36px, inputs and buttons alike so a row of both stays aligned. Corporate follows no external
        // spec; 32 reads as "still small" in a real app. fluent and metro stay at 32 by spec.
        inputMinHeight: '2.25rem',
        buttonMinHeight: '2.25rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.06,
        opacityPressed: 0.10,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'none',
    },
    fonts: {
        sans: "'Inter', system-ui, sans-serif",
    },
};

// ── Playful ──
// Key traits: pill everything, bold colors, bouncy interactions, colored shadows.
// High chroma, high contrast, large radius.
const playful: DesignLanguage = {
    id: 'playful',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'pill',
        buttonHoverShadow: '0 6px 16px oklch(from var(--pdx-color-primary) l c h / 0.35)',
        buttonHoverTransform: 'translateY(-1px)',
        tabIndicator: 'pill',
        tabIndicatorSize: '0',
        cardStyle: 'elevated',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '→',
        tableHeader: {
            transform: 'none',
            color: 'var(--pdx-color-primary)',
            borderColor: 'var(--pdx-color-primary)',
        },
        focusStyle: 'ring',
        inputMinHeight: '2.75rem',
        buttonMinHeight: '2.75rem',
        toggleWidth: '3rem',
        toggleHeight: '1.75rem',
        opacityHover: 0.08,
        opacityPressed: 0.15,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'pill',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 700,
        shadowIntensity: 'medium',
    },
    fonts: {
        sans: "'Nunito', 'Poppins', system-ui, sans-serif",
    },
};

// ── Cyberpunk ──
// Key traits: neon colors, sharp edges (zero radius), bold borders, mono font accents.
// Dark-first, glow effects, aggressive typography.
const cyberpunk: DesignLanguage = {
    id: 'cyberpunk',
    behaviors: {
        inputStyle: 'underlined',
        buttonShape: 'sharp',
        cardBorderColor: 'light-dark(var(--pdx-color-border), oklch(0.3 0.05 330))',
        buttonHoverShadow: '0 0 6px oklch(from var(--pdx-color-primary) l c h / 0.5), 0 0 16px oklch(from var(--pdx-color-primary) l c h / 0.3), 0 0 32px oklch(from var(--pdx-color-primary) l c h / 0.1)',
        tabIndicator: 'underline',
        tabIndicatorSize: '3px',
        cardStyle: 'bordered',
        accordionIcon: 'arrow',
        breadcrumbSeparator: '>>',
        tableHeader: {
            font: 'var(--pdx-font-mono)',
            transform: 'uppercase',
            letterSpacing: '0.08em',
            size: 'var(--pdx-text-xs)',
            borderColor: 'var(--pdx-color-primary)',
            color: 'var(--pdx-color-primary)',
        },
        focusStyle: 'ring',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.08,
        opacityPressed: 0.15,
        borderWidth: '2px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'sharp',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 700,
        shadowIntensity: 'none',
    },
    fonts: {
        sans: "'JetBrains Mono', 'Fira Code', monospace",
        heading: "'Orbitron', 'Rajdhani', system-ui, sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
};

// ── Editorial ──
// Key traits: serif headings, underlined inputs, minimal borders, magazine elegance.
// High typography contrast, generous whitespace, line-based separators.
const editorial: DesignLanguage = {
    id: 'editorial',
    behaviors: {
        inputStyle: 'underlined',
        buttonShape: 'sharp',
        buttonHoverShadow: '0 2px 0 0 var(--pdx-color-primary)',
        tabIndicator: 'underline',
        tabIndicatorSize: '1px',
        cardStyle: 'flat',
        accordionIcon: 'plus',
        breadcrumbSeparator: '—',
        tableHeader: {
            transform: 'none',
            font: 'var(--pdx-font-heading)',
            weight: 'var(--pdx-weight-bold)',
            size: 'var(--pdx-text-sm)',
            letterSpacing: 'normal',
            borderWidth: '2px',
            borderColor: 'var(--pdx-color-text)',
        },
        focusStyle: 'underline',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.04,
        opacityPressed: 0.08,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'sharp',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'none',
    },
    fonts: {
        sans: "'Georgia', 'Times New Roman', serif",
        heading: "'Playfair Display', 'Georgia', serif",
    },
};

// ── Neumorphic ──
// Key traits: soft inset/outset shadows, no borders, pillowy surfaces.
// Low contrast, pastel colors, rounded shapes.
const neumorphic: DesignLanguage = {
    id: 'neumorphic',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        buttonRadius: 'var(--pdx-radius-lg)',
        buttonHoverShadow: 'var(--pdx-shadow-md)',
        tabIndicator: 'pill',
        tabIndicatorSize: '2px',
        cardStyle: 'flat',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '•',
        tableHeader: {
            transform: 'none',
            letterSpacing: 'normal',
            weight: 'var(--pdx-weight-medium)',
            color: 'var(--pdx-color-muted)',
            borderWidth: 'var(--pdx-border-width-focus)',
            borderColor: 'var(--pdx-color-border)',
        },
        focusStyle: 'ring',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.06,
        opacityPressed: 0.10,
        borderWidth: '0px',
        borderWidthFocus: '1px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'medium',
    },
    fonts: {
        sans: "'Inter', system-ui, sans-serif",
    },
};

// ── Glass / Glassmorphism ──
// Key traits: frosted blur backdrop, semi-transparent surfaces, light borders.
const glass: DesignLanguage = {
    id: 'glass',
    behaviors: {
        // The frosted header band, mirroring what glass.css ships: without it glass inherits six
        // header tokens and renders a header indistinguishable from the base, and `--language=glass`
        // would generate that same generic header.
        tableHeader: {
            transform: 'uppercase',
            letterSpacing: '0.06em',
            weight: 'var(--pdx-weight-semibold)',
            color: 'var(--pdx-color-text)',
            bg: 'light-dark(oklch(1 0 0 / 0.35), oklch(1 0 0 / 0.06))',
            borderWidth: '1px',
            borderColor: 'var(--pdx-color-primary)',
        },
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        buttonRadius: 'var(--pdx-radius-lg)',
        buttonHoverShadow: '0 4px 16px oklch(from var(--pdx-color-primary) l c h / 0.35)',
        tabIndicator: 'underline',
        tabIndicatorSize: '2px',
        cardStyle: 'bordered',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '›',
        focusStyle: 'ring',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.06,
        opacityPressed: 0.10,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'subtle',
    },
    fonts: {
        sans: "'Inter', system-ui, sans-serif",
    },
};

// ── Pragmatic (PDX house style) ──
// Signature: pill tabs (filled active), chevron breadcrumb/accordion, primary
// top-accent cards, premium hover (lift + brand glow), generous radius, Inter/DM Sans.
// Colours are BRAND-DERIVED (oklch(from var(--pdx-color-primary) …)) so the SAME
// language yields both the blue and the gold instance — the archetype × brand model.
const pragmatic: DesignLanguage = {
    id: 'pragmatic',
    behaviors: {
        inputStyle: 'outlined',
        buttonShape: 'rounded',
        buttonHoverShadow: '0 4px 16px oklch(0.50 0.20 235 / 0.35)',
        buttonHoverTransform: 'translateY(-1px)',
        tabIndicator: 'pill',
        tabIndicatorSize: '3px',
        cardStyle: 'bordered',
        accordionIcon: 'chevron',
        breadcrumbSeparator: '›',
        tableHeader: {
            transform: 'none',
            letterSpacing: 'normal',
            weight: 'var(--pdx-weight-semibold)',
            color: 'var(--pdx-color-text)',
            borderColor: 'var(--pdx-color-primary)',
            borderWidth: '2px',
        },
        focusStyle: 'ring',
        inputMinHeight: '2.5rem',
        buttonMinHeight: '2.5rem',
        toggleWidth: '2.75rem',
        toggleHeight: '1.5rem',
        opacityHover: 0.08,
        opacityPressed: 0.12,
        borderWidth: '1px',
        borderWidthFocus: '2px',
    },
    tokens: {
        radiusScale: 'rounded',
        baseUnit: 4,
        fontWeightMedium: 500,
        fontWeightSemibold: 600,
        shadowIntensity: 'medium',
    },
    fonts: {
        sans: "'Inter', 'DM Sans', system-ui, sans-serif",
        heading: "'DM Sans', 'Manrope', system-ui, sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    // Appended inside [pdx-theme="name"] {} via CSS nesting (& = the theme root).
    cssOverrides: `
/* Pill tabs — filled active (Pragmatic signature) */
&[pdx-tab-style="pill"] .pdx-tabs { border-radius: 9999px; background: var(--pdx-color-inset); padding: 3px; }
&[pdx-tab-style="pill"] .pdx-tab { border-radius: 9999px; }
&[pdx-tab-style="pill"] .pdx-tab[aria-selected="true"] { background: var(--pdx-color-primary); color: var(--pdx-color-primary-text); font-weight: var(--pdx-weight-semibold); }
/* Chevron breadcrumb + rotating accordion */
& .pdx-breadcrumb > *:not(:last-child)::after { content: '›'; font-size: 1.1em; }
& details.pdx-accordion summary::after { content: '›'; font-size: 1.2em; font-weight: var(--pdx-weight-bold); }
& details.pdx-accordion[open] summary::after { transform: rotate(90deg); }
/* Card: primary top-accent + brand glow on hover */
& .pdx-surface-card { border-top: 3px solid var(--pdx-color-primary); }
& .pdx-surface-card[interactive]:hover { box-shadow: 0 4px 12px oklch(from var(--pdx-color-primary) l c h / 0.15), var(--pdx-shadow-md); }
/* Primary: brand gradient + hover lift */
& .pdx-primary { background: linear-gradient(135deg, oklch(from var(--pdx-color-primary) calc(l + 0.05) c h), oklch(from var(--pdx-color-primary) calc(l - 0.02) c calc(h + 15))); }
& .pdx-primary:hover { background: linear-gradient(135deg, oklch(from var(--pdx-color-primary) l c h), oklch(from var(--pdx-color-primary) calc(l - 0.05) c calc(h + 15))); box-shadow: 0 4px 16px oklch(from var(--pdx-color-primary) l c h / 0.35); transform: translateY(-1px); }
& .pdx-secondary { border-color: oklch(from var(--pdx-color-primary) l c h / 0.3); }
& .pdx-secondary:hover { border-color: var(--pdx-color-primary); }
& .pdx-input:not(.pdx-input-wrap > *):focus-visible { border-color: var(--pdx-color-primary); box-shadow: var(--pdx-focus-ring); }
& .pdx-page[aria-current="page"] { border-radius: var(--pdx-radius-full); }
/* Brand accent on controls */
& .pdx-toggle:checked { background: var(--pdx-color-primary); }
& .pdx-checkbox:checked { background-color: var(--pdx-color-primary); border-color: var(--pdx-color-primary); }
& .pdx-radio:checked { border-color: var(--pdx-color-primary); box-shadow: inset 0 0 0 4px var(--pdx-color-primary); }
& .pdx-progress-bar { background: var(--pdx-color-primary); }
& .pdx-step[data-status="done"] .pdx-step-number { background: var(--pdx-color-primary); border-color: var(--pdx-color-primary); color: var(--pdx-color-primary-text); }
& .pdx-step[data-status="done"] + .pdx-step-connector { background: var(--pdx-color-primary); }
& .pdx-alert-info { border-left-color: var(--pdx-color-primary); }
& .pdx-badge-primary { background: var(--pdx-color-primary); color: var(--pdx-color-primary-text); }
& .pdx-table th { text-transform: none; letter-spacing: normal; font-weight: var(--pdx-weight-semibold); color: var(--pdx-color-text); border-bottom-color: var(--pdx-color-primary); border-bottom-width: 2px; }
& .pdx-table-striped tr:nth-child(even) td { background: oklch(from var(--pdx-color-primary) l 0.04 h / 0.05); }
& .pdx-timeline-item[data-status="done"]::before { background: var(--pdx-color-primary); border-color: var(--pdx-color-primary); }
& .pdx-timeline-item[data-status="active"]::before { border-color: var(--pdx-color-primary); }
`.trim(),
};

// ── Registry ──

const LANGUAGES: Record<string, DesignLanguage> = {
    material, fluent, cupertino, metro, neutral,
    corporate, playful, cyberpunk, editorial, neumorphic, glass,
    pragmatic,
};

/** Get a design language preset by ID. Falls back to neutral for 'custom'. */
export function getLanguage(id: LanguageId): DesignLanguage {
    return LANGUAGES[id] || neutral;
}

/** List all available language IDs */
export function getLanguageIds(): LanguageId[] {
    return Object.keys(LANGUAGES) as LanguageId[];
}

/**
 * Theme generation — combines color math, scales, and language presets
 * into a complete set of CSS custom properties + behavior attributes.
 */

import type { ThemeInput, GeneratedTheme, ThemeIssue, BehaviorTokens, OKLCH } from './types.js';
import { assignSemanticHues, generatePalette, generateGrays, generateSurfaces, generatePrimaryColors, generateSemanticColors, deltaE, oklchCSS, wcagContrast, parseColorToken, autoTextColor, fillLightnessForLabel, resolveColorToken, compositeOver } from './color.js';
import { TEXT_HUES, derivedTextTokens } from './text-colors.js';
import { generateTypeScale, generateSpacing, generateRadius, generateShadows, densityFactor } from './scale.js';
import { getLanguage } from './languages.js';
import { guardThemeRules } from './nested-theme-guard.js';

/**
 * Brand/accent input: `#hex` OR `oklch(L C H)`. Hex is sRGB-only, so a vivid wide-gamut
 * brand (many saturated blues/cyans) is CLIPPED before the engine ever sees it — measured
 * loss on a Fluent-blue: dC −0.054, dH 13°. Pass OKLCH to keep such a brand intact.
 */
function parseBrandColor(v: string, what: string): OKLCH {
    const parsed = parseColorToken(v, 'light');
    if (!parsed) throw new Error(`Invalid ${what} color: "${v}" — expected #hex or oklch(L C H).`);
    return parsed;
}

export function generateTheme(input: ThemeInput): GeneratedTheme {
    const lang = getLanguage(input.language);
    const brand = parseBrandColor(input.brandColor, 'brand');
    const neutralHue = input.neutralHue ?? brand.h;
    const density = input.density ?? 'normal';
    const df = lang.tokens.densityFactor ?? densityFactor(density);
    const radiusScale = input.radiusScale ?? lang.tokens.radiusScale;
    const typeScaleRatio = input.typeScale ?? 'major-third';

    // ── Color ──
    const hues = assignSemanticHues(brand.h);
    // An explicit accent keeps its LIGHTNESS and CHROMA too, not just its hue — same fix as
    // P4 on the brand: taking only the hue meant "my accent is #X" never actually produced X.
    // When auto-derived, fall back to the canonical accent lightness/chroma.
    const accent = input.accentColor ? parseBrandColor(input.accentColor, 'accent') : null;
    const accentHue = accent?.h ?? hues.accent;
    const grays = generateGrays(neutralHue);
    const primaryPalette = generatePalette(brand.h);
    const secondaryPalette = generatePalette(hues.secondary);
    const surfaces = generateSurfaces(neutralHue);
    const primaryColors = generatePrimaryColors(brand.h, brand.c > 0.01 ? brand.c : 0.18, brand.l);
    const semanticColors = generateSemanticColors(hues);

    // ── Scales ──
    const typeScale = generateTypeScale(16, typeScaleRatio);
    const spacing = generateSpacing(lang.tokens.baseUnit, df);
    const radius = generateRadius(radiusScale, lang.tokens.baseUnit);
    const shadows = generateShadows(lang.tokens.shadowIntensity);

    // ── Fonts ──
    const fontSans = input.fontSans ?? lang.fonts.sans;
    const fontHeading = input.fontHeading ?? lang.fonts.heading ?? fontSans;
    const fontMono = input.fontMono ?? lang.fonts.mono ?? "'JetBrains Mono', 'Fira Code', monospace";

    // ── Behaviors ──
    const behaviors: BehaviorTokens = { ...lang.behaviors };

    // ── CSS escape-hatch: language overrides + per-theme input overrides ──
    const cssOverrides = [lang.cssOverrides, input.cssOverrides].filter(Boolean).join('\n\n');

    // ── Assemble tokens ──
    const tokens: Record<string, string> = {};

    // Hue anchors
    tokens['--pdx-hue-primary'] = String(Math.round(brand.h));
    tokens['--pdx-hue-secondary'] = String(Math.round(hues.secondary));
    tokens['--pdx-hue-accent'] = String(Math.round(accentHue));
    tokens['--pdx-hue-danger'] = String(Math.round(hues.danger));
    tokens['--pdx-hue-warning'] = String(Math.round(hues.warning));
    tokens['--pdx-hue-success'] = String(Math.round(hues.success));
    tokens['--pdx-hue-info'] = String(Math.round(hues.info));

    // Gray ramp
    for (const [shade, value] of Object.entries(grays)) {
        tokens[`--pdx-gray-${shade}`] = value;
    }

    // Primary ramp
    for (const [shade, value] of Object.entries(primaryPalette)) {
        tokens[`--pdx-primary-${shade}`] = value;
    }

    // Secondary ramp
    for (const [shade, value] of Object.entries(secondaryPalette)) {
        tokens[`--pdx-secondary-${shade}`] = value;
    }

    // Surfaces
    tokens['--pdx-color-bg'] = surfaces.bg;
    tokens['--pdx-color-surface'] = surfaces.surface;
    tokens['--pdx-color-inset'] = surfaces.inset;
    tokens['--pdx-color-overlay'] = surfaces.overlay;
    tokens['--pdx-color-border'] = surfaces.border;
    tokens['--pdx-color-border-strong'] = surfaces.borderStrong;
    tokens['--pdx-color-text'] = surfaces.text;
    tokens['--pdx-color-muted'] = surfaces.muted;

    // Primary interactive
    tokens['--pdx-color-primary'] = primaryColors.primary;
    tokens['--pdx-color-primary-hover'] = primaryColors.primaryHover;
    tokens['--pdx-color-primary-text'] = primaryColors.primaryText;
    // The info button, and every filled `.pdx-info` chip and badge, is painted with the accent: it
    // carries a label, so it follows the label rule the brand follows — its lightness nudged only
    // when no label reaches AA on it (the default 0.60 sat on the saddle: 4.14 at best) — and the
    // label is picked for contrast like every other.
    const accentC = accent?.c ?? 0.12;
    const accentL = fillLightnessForLabel(accent?.l ?? 0.60, accentC, accentHue);
    tokens['--pdx-color-accent'] = oklchCSS(accentL, accentC, accentHue);
    tokens['--pdx-color-accent-text'] = autoTextColor({ l: accentL, c: accentC, h: accentHue });
    // Explicit focus colour wins over the brand-derived ring (see ThemeInput.focusColor).
    const focus = input.focusColor ? parseBrandColor(input.focusColor, 'focus') : null;
    tokens['--pdx-color-focus'] = focus ? oklchCSS(focus.l, focus.c, focus.h) : primaryColors.focus;

    // Semantic colors (+ auto-contrast label color for each fill)
    tokens['--pdx-color-danger'] = semanticColors.danger.color;
    tokens['--pdx-color-danger-hover'] = semanticColors.danger.hover;
    tokens['--pdx-color-danger-text'] = semanticColors.danger.text;
    tokens['--pdx-color-success'] = semanticColors.success.color;
    tokens['--pdx-color-success-text'] = semanticColors.success.text;
    tokens['--pdx-color-warning'] = semanticColors.warning.color;
    tokens['--pdx-color-warning-text'] = semanticColors.warning.text;
    tokens['--pdx-color-info'] = semanticColors.info.color;
    tokens['--pdx-color-info-text'] = semanticColors.info.text;

    // Typography
    tokens['--pdx-font-sans'] = fontSans;
    tokens['--pdx-font-heading'] = fontHeading;
    tokens['--pdx-font-mono'] = fontMono;
    // ONLY when the caller asked for a ratio. The type scale is not part of a theme's
    // identity here: `tokens.css` owns one FLUID scale and not one of the 13 shipped themes
    // overrides it — whereas 6 of them do override the weights below, which is what genuine
    // typographic personality looks like in this system.
    //
    // Emitting it unconditionally replaced that shared scale with a static major-third one
    // on every generated theme: `sm` 12.8px against the shipped 15px, `xl` 25px against 20px.
    // Identical everywhere except `base`, so it read as "the builder makes smaller buttons"
    // rather than as a different scale. The fidelity guard could not see it either: it
    // compares what the shipped themes declare, and they declare none of these.
    if (input.typeScale) {
        for (const [name, value] of Object.entries(typeScale)) {
            tokens[`--pdx-text-${name}`] = value;
        }
    }
    tokens['--pdx-weight-medium'] = String(lang.tokens.fontWeightMedium);
    tokens['--pdx-weight-semibold'] = String(lang.tokens.fontWeightSemibold);

    // Spacing
    for (const [name, value] of Object.entries(spacing)) {
        tokens[`--pdx-space-${name}`] = value;
    }

    // Radius
    for (const [name, value] of Object.entries(radius)) {
        tokens[`--pdx-radius-${name}`] = value;
    }

    // Shadows
    for (const [name, value] of Object.entries(shadows)) {
        tokens[`--pdx-shadow-${name}`] = value;
    }

    // Focus
    tokens['--pdx-focus-ring'] = `0 0 0 3px oklch(from var(--pdx-color-primary) l c h / 0.3)`;

    // Motion — ONLY when the caller asked, like the type scale above. The motion scale is the
    // page's (tokens.css declares it on :root alone, and no shipped theme does). Emitted always, a
    // saved theme on <html> — in pdx.themes, after pdx.adaptive — would beat the reduced-motion
    // `--pdx-motion-scale: 0`, and the durations would come back at full length.
    if (input.motionScale !== undefined) {
        tokens['--pdx-motion-scale'] = String(input.motionScale);
    }

    // Behavior tokens (CSS custom properties for documentation/tooling)
    tokens['--pdx-input-style'] = behaviors.inputStyle;
    tokens['--pdx-input-min-height'] = behaviors.inputMinHeight;
    // Button shape is its OWN behavior, not the global radius ramp: Material 3 has PILL
    // buttons on ROUNDED cards. So the language's buttonShape decides here — unless the
    // caller passed radiusScale explicitly, in which case that intent wins.
    if (!input.radiusScale && behaviors.buttonRadius) {
        tokens['--pdx-button-radius'] = behaviors.buttonRadius;
    } else {
        const buttonShape = input.radiusScale ?? behaviors.buttonShape ?? radiusScale;
        tokens['--pdx-button-radius'] = buttonShape === 'pill' ? '9999px'
            : buttonShape === 'sharp' ? '0' : `var(--pdx-radius-md)`;
    }
    tokens['--pdx-button-min-height'] = behaviors.buttonMinHeight;
    tokens['--pdx-tab-indicator'] = behaviors.tabIndicator;
    tokens['--pdx-tab-indicator-size'] = behaviors.tabIndicatorSize;
    tokens['--pdx-card-style'] = behaviors.cardStyle;
    // accordionIcon (semantic enum) → live glyph + open-transform tokens the base CSS reads.
    const accordionGlyph = { plus: "'+'", chevron: "'▾'", arrow: "'▸'" } as const;
    const accordionOpen = { plus: 'rotate(45deg)', chevron: 'rotate(180deg)', arrow: 'rotate(90deg)' } as const;
    tokens['--pdx-accordion-glyph'] = accordionGlyph[behaviors.accordionIcon];
    tokens['--pdx-accordion-open-transform'] = accordionOpen[behaviors.accordionIcon];
    // Table header vocabulary → --pdx-table-header-*. Only the fields the language declares
    // are emitted; the rest inherit tokens.css.
    const TH_SUFFIX: Record<string, string> = {
        transform: 'transform', letterSpacing: 'letter-spacing', weight: 'weight', size: 'size',
        color: 'color', bg: 'bg', font: 'font', borderWidth: 'border-width', borderColor: 'border-color',
    };
    for (const [field, suffix] of Object.entries(TH_SUFFIX)) {
        const v = (behaviors.tableHeader as Record<string, string | undefined> | undefined)?.[field];
        if (v) tokens[`--pdx-table-header-${suffix}`] = v;
    }

    // Flat vocabulary tokens: emitted only when the language declares them.
    const FLAT_VOCAB: Record<string, string> = {
        cardRadius: '--pdx-card-radius', cardShadow: '--pdx-card-shadow',
        cardBorderColor: '--pdx-card-border-color',
        buttonHoverShadow: '--pdx-button-hover-shadow',
        buttonHoverTransform: '--pdx-button-hover-transform',
    };
    for (const [field, token] of Object.entries(FLAT_VOCAB)) {
        const v = (behaviors as unknown as Record<string, string | undefined>)[field];
        if (v) tokens[token] = v;
    }

    // Breadcrumb separator glyph → CSS string. Backslash (Metro) must be escaped for content:.
    if (behaviors.breadcrumbSeparator) {
        tokens['--pdx-breadcrumb-separator'] = `'${behaviors.breadcrumbSeparator.replace(/\\/g, '\\\\')}'`;
    }
    tokens['--pdx-toggle-width'] = behaviors.toggleWidth;
    tokens['--pdx-toggle-height'] = behaviors.toggleHeight;
    tokens['--pdx-opacity-disabled'] = '0.5';
    tokens['--pdx-opacity-hover'] = String(behaviors.opacityHover);
    tokens['--pdx-opacity-pressed'] = String(behaviors.opacityPressed);
    tokens['--pdx-border-width'] = behaviors.borderWidth;
    tokens['--pdx-border-width-focus'] = behaviors.borderWidthFocus;

    // User overrides (applied last)
    if (input.overrides) {
        for (const [key, value] of Object.entries(input.overrides)) {
            tokens[key] = value;
        }
    }

    // ── Behavior attributes (for CSS structural variants) ──
    const attributes: Record<string, string> = {};
    if (behaviors.inputStyle !== 'outlined') attributes['pdx-input-style'] = behaviors.inputStyle;
    if (behaviors.inputFocus === 'bottom') attributes['pdx-input-focus'] = 'bottom';
    if (behaviors.tabIndicator === 'pill') attributes['pdx-tab-style'] = 'pill';
    if (behaviors.cardStyle === 'elevated') attributes['pdx-card-style'] = 'elevated';
    else if (behaviors.cardStyle === 'flat') attributes['pdx-card-style'] = 'flat';

    return {
        name: input.name,
        input,
        tokens,
        behaviors,
        attributes,
        toCSS: () => themeToCSS(input.name, tokens, cssOverrides),
        apply: (target?: Document) => applyToDocument(input.name, tokens, attributes, target),
        validate: () => validateTheme(brand, hues, tokens),
    };
}

function themeToCSS(name: string, tokens: Record<string, string>, cssOverrides?: string): string {
    const lines = [`[pdx-theme="${name}"] {`];
    for (const [key, value] of Object.entries(tokens)) {
        lines.push(`    ${key}: ${value};`);
    }
    // Escape-hatch: raw CSS appended INSIDE the block; nested selectors auto-scope
    // to `[pdx-theme="name"]` via CSS nesting, so authors don't need the theme name.
    // Each rule's subject carries the nested-theme guard, as the shipped themes' do: without it
    // the rules reach into a nested root of another theme.
    if (cssOverrides && cssOverrides.trim()) {
        lines.push('');
        lines.push('    /* cssOverrides — personality not yet expressible as tokens */');
        lines.push(guardThemeRules(cssOverrides.trim(), name).split('\n').map((l) => (l.trim() ? '    ' + l : l)).join('\n'));
    }
    lines.push('}');
    return lines.join('\n');
}

function applyToDocument(
    name: string,
    tokens: Record<string, string>,
    attributes: Record<string, string>,
    /** Target document. Defaults to the ambient one. Pass a same-origin iframe's
     *  `contentDocument` to theme a PREVIEW without restyling the host page — which is
     *  what any theme-builder UI needs, since the theme is applied on <html>. */
    target?: Document,
): void {
    const root = (target ?? document).documentElement;
    root.setAttribute('pdx-theme', name);
    // Set CSS custom properties
    for (const [key, value] of Object.entries(tokens)) {
        root.style.setProperty(key, value);
    }
    // Set behavior attributes
    for (const [attr, value] of Object.entries(attributes)) {
        root.setAttribute(attr, value);
    }
    // Clean up attributes not in this theme
    for (const attr of ['pdx-input-style', 'pdx-input-focus', 'pdx-tab-style', 'pdx-card-style']) {
        if (!attributes[attr]) root.removeAttribute(attr);
    }
}

/**
 * The WCAG gate, runnable on ANY token map.
 *
 * `GeneratedTheme.validate()` gates the map the engine produced. A tool that lets someone
 * override individual tokens needs to gate the map that RESULTS — otherwise the overrides
 * are exactly the part nobody checks, which is the opposite of the point.
 */
export function validateTokenContrast(tokens: Record<string, string>): ThemeIssue[] {
    return contrastIssues(tokens);
}

/** WCAG AA thresholds. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

/**
 * WCAG contrast gate: checks the critical text/background pairs of a generated theme
 * in BOTH light and dark schemes. The risky pairs are muted-on-surface and label-on-
 * colored-fill — labels are auto-contrast, and this proves the choice worked.
 */
function contrastIssues(tokens: Record<string, string>): ThemeIssue[] {
    const out: ThemeIssue[] = [];
    // The derived text tokens come from tokens.css, under whatever the theme declares: a generated
    // theme does not emit them, and its text is still written in them.
    const all: Record<string, string> = { ...derivedTextTokens(), ...tokens };
    // A ground is what the text is really painted on: bg over the canvas, surface and inset over
    // bg, a tint over the surface — composited, because a translucent token read as solid measures
    // a background nobody sees.
    const ground = (tok: string, scheme: 'light' | 'dark') => {
        const canvas = parseColorToken(scheme === 'light' ? 'white' : 'oklch(0.2 0 0)', scheme)!;
        const c = resolveColorToken(all, tok, scheme);
        const bgTok = resolveColorToken(all, '--pdx-color-bg', scheme);
        if (!c || !bgTok) return c;
        const bg = compositeOver(bgTok, canvas);
        if (tok === '--pdx-color-bg') return bg;
        if (!tok.endsWith('-soft')) return compositeOver(c, bg);
        const surface = resolveColorToken(all, '--pdx-color-surface', scheme);
        return compositeOver(c, surface ? compositeOver(surface, bg) : bg);
    };
    const check = (fgTok: string, bgTok: string, label: string, large = false) => {
        for (const scheme of ['light', 'dark'] as const) {
            const bg = ground(bgTok, scheme);
            const fg = resolveColorToken(all, fgTok, scheme);
            if (!bg || !fg) continue;
            const ratio = wcagContrast(fg, bg);
            const min = large ? AA_LARGE : AA_NORMAL;
            if (ratio < min) {
                out.push({
                    level: ratio < AA_LARGE ? 'error' : 'warning',
                    code: `CONTRAST_${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
                    message: `${label} contrast is ${ratio.toFixed(2)}:1 in ${scheme} mode — below WCAG AA (${min}:1).`,
                    fix: 'Darken/lighten the foreground or background lightness until ≥ the threshold.',
                    // The engine's own rule for picking a label on a fill, handed back as data:
                    // whichever of near-white/near-black wins on this background.
                    remedy: {
                        foreground: fgTok, background: bgTok, scheme,
                        ratio: Number(ratio.toFixed(2)), required: min,
                        suggested: autoTextColor(bg),
                    },
                });
            }
        }
    };

    check('--pdx-color-text', '--pdx-color-bg', 'text-on-bg');
    check('--pdx-color-muted', '--pdx-color-surface', 'muted-on-surface');
    check('--pdx-color-muted', '--pdx-color-bg', 'muted-on-bg');
    check('--pdx-color-muted', '--pdx-color-inset', 'muted-on-inset');
    // A colour as text: on the three grounds, and on its own tint.
    for (const hue of TEXT_HUES) {
        for (const g of ['bg', 'surface', 'inset', `${hue}-soft`]) {
            check(`--pdx-color-${hue}-ink`, `--pdx-color-${g}`, `${hue}-ink-on-${g}`);
        }
    }
    check('--pdx-color-primary-text', '--pdx-color-primary', 'primary-label');
    // What the secondary and info buttons really paint. A generated map has no
    // secondary of its own: tokens.css's then applies, and the pair is skipped here.
    check('--pdx-color-secondary-text', '--pdx-color-secondary', 'secondary-label');
    check('--pdx-color-accent-text', '--pdx-color-accent', 'accent-label');
    check('--pdx-color-danger-text', '--pdx-color-danger', 'danger-label');
    check('--pdx-color-success-text', '--pdx-color-success', 'success-label');
    check('--pdx-color-warning-text', '--pdx-color-warning', 'warning-label');
    check('--pdx-color-info-text', '--pdx-color-info', 'info-label');
    return out;
}

function validateTheme(brand: { l: number; c: number; h: number }, hues: { danger: number; warning: number }, tokens: Record<string, string>): ThemeIssue[] {
    const issues: ThemeIssue[] = [];

    // Brand too close to danger
    const dangerDist = deltaE(brand.h, hues.danger);
    if (dangerDist < 30) {
        issues.push({
            level: 'warning', code: 'COLOR_CONFLICT_DANGER',
            message: `Brand hue (${Math.round(brand.h)}) is close to danger (${Math.round(hues.danger)}), deltaE=${Math.round(dangerDist)}. Min recommended: 30.`,
            fix: 'Consider shifting brand hue or the engine will auto-shift danger.',
        });
    }

    // Brand too close to warning
    const warningDist = deltaE(brand.h, hues.warning);
    if (warningDist < 30) {
        issues.push({
            level: 'warning', code: 'COLOR_CONFLICT_WARNING',
            message: `Brand hue (${Math.round(brand.h)}) is close to warning (${Math.round(hues.warning)}), deltaE=${Math.round(warningDist)}.`,
        });
    }

    // Low chroma brand
    if (brand.c < 0.03) {
        issues.push({
            level: 'info', code: 'LOW_CHROMA',
            message: `Brand color has low chroma (${brand.c.toFixed(3)}). Buttons/links may appear gray.`,
            fix: 'Use a more saturated brand color, or the engine will boost chroma to 0.18.',
        });
    }

    // Very dark or very light brand
    if (brand.l < 0.25 || brand.l > 0.85) {
        issues.push({
            level: 'warning', code: 'EXTREME_LIGHTNESS',
            message: `Brand color lightness (${brand.l.toFixed(2)}) is extreme. The primary fill is clamped to 0.30-0.85 and nudged for label contrast, so the rendered primary will differ noticeably from this brand color.`,
            fix: 'Pick a mid-lightness brand (0.35-0.70) if the primary must match the brand exactly.',
        });
    }

    // WCAG contrast gate — the measurable definition of a "correct" theme.
    issues.push(...contrastIssues(tokens));

    return issues;
}

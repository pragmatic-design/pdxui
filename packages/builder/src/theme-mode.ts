// Theme mode — author a NEW theme, judge it, take it away.
//
// The engine is the SAME one `pdx theme` uses; the builder adds live preview and a verdict,
// it does not add a second generator. `tests/theme-mode.spec.ts` pins the CSS produced here
// byte-for-byte against the CLI's for identical inputs, so the two cannot drift.

import { CAN_SAVE, THEMES_URL, CUSTOM_THEME_BASE } from './config';
import { createTheme, getLanguageIds, toDTCGJson, validateTokenContrast, type ThemeInput, type GeneratedTheme, type ThemeIssue, type LanguageId } from '@pdxui/design/engine';

export const LANGUAGES = getLanguageIds();
export const DENSITIES = ['compact', 'normal', 'comfort'] as const;
/** `''` = let the design language decide (the usual case). */
export const RADIUS_SCALES = ['', 'sharp', 'rounded', 'pill'] as const;

/** The knobs, as they travel in the URL. Strings throughout: the URL is the source. */
export interface ThemeDraft {
    name: string;
    brand: string;
    language: string;
    accent: string;
    focus: string;
    neutral: string;
    density: string;
    radius: string;
    /** Per-token overrides, `--pdx-x` → value. Applied on top of what the engine derived. */
    tokens: Record<string, string>;
    /** Free-form CSS appended inside the theme block (nesting auto-scopes to the theme). */
    css: string;
}

/**
 * The semantic core a designer actually reaches for. Deliberately NOT all ~110 generated
 * tokens: the strategy doc names token sprawl as the anti-pattern, and a list nobody can
 * scan is a list nobody uses. Everything else stays reachable through the CSS box.
 */
export const EDITABLE_TOKENS = [
    '--pdx-color-primary', '--pdx-color-primary-hover', '--pdx-color-primary-text',
    '--pdx-color-accent', '--pdx-color-focus',
    '--pdx-color-bg', '--pdx-color-surface', '--pdx-color-inset',
    '--pdx-color-text', '--pdx-color-muted', '--pdx-color-border',
    '--pdx-color-danger', '--pdx-color-success', '--pdx-color-warning', '--pdx-color-info',
    '--pdx-radius-md', '--pdx-button-radius', '--pdx-font-sans',
];

export const DEFAULT_DRAFT: ThemeDraft = {
    name: 'my-theme',
    brand: '#3b5bdb',
    language: 'neutral',
    accent: '',
    focus: '',
    neutral: '',
    density: 'normal',
    radius: '',
    tokens: {},
    css: '',
};

export function draftFromParams(params: URLSearchParams): ThemeDraft {
    return {
        name: params.get('name') || DEFAULT_DRAFT.name,
        brand: params.get('brand') || DEFAULT_DRAFT.brand,
        language: params.get('language') || DEFAULT_DRAFT.language,
        accent: params.get('accent') || '',
        focus: params.get('focus') || '',
        neutral: params.get('neutral') || '',
        density: params.get('density') || DEFAULT_DRAFT.density,
        radius: params.get('radius') || '',
        tokens: parseTokenParam(params.get('tok') || ''),
        css: params.get('css') || '',
    };
}

/** `--pdx-color-primary: red; --pdx-color-bg: white` → a map. Tolerant of trailing separators. */
export function parseTokenParam(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of raw.split(';')) {
        const i = part.indexOf(':');
        if (i <= 0) continue;
        const key = part.slice(0, i).trim();
        const value = part.slice(i + 1).trim();
        if (key.startsWith('--') && value) out[key] = value;
    }
    return out;
}

export function serializeTokenParam(tokens: Record<string, string>): string {
    return Object.entries(tokens).map(([k, v]) => `${k}: ${v}`).join('; ');
}

/** Token overrides + free CSS, as one block the engine appends inside the theme rule. */
export function overridesCss(d: ThemeDraft): string {
    const lines = Object.entries(d.tokens ?? {}).map(([k, v]) => `${k}: ${v};`);
    const raw = (d.css ?? '').trim();
    if (raw) lines.push(raw);
    return lines.join('\n');
}

/** The keys of `T` whose value is a string — the ones a query parameter can carry. */
type StringKeyOf<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

/** Only what differs from the defaults, so the URL stays readable and shareable. */
export function draftToParams(d: ThemeDraft, into: URLSearchParams): void {
    // Only the fields that ARE strings. `keyof ThemeDraft` also covers `tokens`, a
    // `Record<string, string>`, and `URLSearchParams.set` takes a string — so a signature over
    // `keyof` would be a promise the type cannot keep, and a future non-string field would be
    // passed here with no complaint.
    const put = (k: StringKeyOf<ThemeDraft>, dflt: string) => { if (d[k] && d[k] !== dflt) into.set(k, d[k]); };
    put('name', DEFAULT_DRAFT.name);
    put('brand', DEFAULT_DRAFT.brand);
    put('language', DEFAULT_DRAFT.language);
    put('accent', '');
    put('focus', '');
    put('neutral', '');
    put('density', DEFAULT_DRAFT.density);
    put('radius', '');
    const tok = serializeTokenParam(d.tokens ?? {});
    if (tok) into.set('tok', tok);
    if (d.css) into.set('css', d.css);
}

/**
 * Draft → the engine's input. Empty strings are OMITTED, not passed as '': an empty
 * accent means "derive it", and passing '' would be a different (invalid) request.
 */
export function draftToInput(d: ThemeDraft): ThemeInput {
    const input: ThemeInput = {
        name: d.name.trim() || DEFAULT_DRAFT.name,
        brandColor: d.brand.trim(),
        language: (d.language || 'neutral') as LanguageId,
        density: (d.density || 'normal') as 'compact' | 'normal' | 'comfort',
    };
    if (d.accent.trim()) input.accentColor = d.accent.trim();
    if (d.focus.trim()) input.focusColor = d.focus.trim();
    if (d.neutral.trim() !== '') input.neutralHue = Number(d.neutral);
    if (d.radius) input.radiusScale = d.radius as 'sharp' | 'rounded' | 'pill';
    // The engine appends this INSIDE the theme block, so overrides ship with the theme:
    // preview, export and save all carry them, and the CSS still comes from one generator.
    const overrides = overridesCss(d);
    if (overrides) input.cssOverrides = overrides;
    return input;
}

export interface ThemeBuild {
    theme: GeneratedTheme | null;
    /** Generated tokens with the draft's overrides applied — what the preview actually shows. */
    tokens: Record<string, string>;
    css: string;
    dtcg: string;
    /** The engine's WCAG token gate — this is the COLOUR verdict the rendered oracle cannot give. */
    issues: ThemeIssue[];
    errors: number;
    warnings: number;
    /** Set when the input itself is rejected (a malformed brand colour, say). */
    error?: string;
}

export function buildTheme(d: ThemeDraft): ThemeBuild {
    try {
        const theme = createTheme(draftToInput(d));
        // Overrides are exactly the part that would otherwise escape the gate, so the
        // contrast check is re-run on the RESULTING map. The non-contrast issues are
        // brand-derived and unaffected, so they are kept as the engine reported them.
        const overridden = Object.keys(d.tokens ?? {}).length > 0;
        const merged = overridden ? Object.assign({}, theme.tokens, d.tokens) : theme.tokens;
        const issues = overridden
            ? theme.validate().filter(i => !i.code.startsWith('CONTRAST')).concat(validateTokenContrast(merged))
            : theme.validate();
        return {
            theme,
            tokens: merged,
            css: theme.toCSS(),
            dtcg: toDTCGJson(theme.tokens),
            issues,
            errors: issues.filter(i => i.level === 'error').length,
            warnings: issues.filter(i => i.level === 'warning').length,
        };
    } catch (err) {
        return {
            theme: null, tokens: {}, css: '', dtcg: '', issues: [], errors: 0, warnings: 0,
            error: String((err as Error)?.message ?? err),
        };
    }
}

/**
 * Put the generated theme on the preview. `apply(doc)` writes the tokens as inline custom
 * properties on that document's root and sets the behaviour attributes — no stylesheet, no
 * rebuild, and (unlike the global `apply()`) it leaves the builder's own chrome alone.
 */
export function applyToPreview(build: ThemeBuild, doc: Document): void {
    if (!build.theme) return;
    const root = doc.documentElement;

    // The preview renders the EXPORTED stylesheet, not an inline copy of the tokens.
    // `apply()` writes each token as an inline custom property, and an inline declaration
    // beats any rule — so a cssOverrides entry (which is what a token edit or a custom-CSS
    // block becomes) would be applied to the file and silently ignored on screen. Injecting
    // `toCSS()` keeps what you see and what you ship the same artifact.
    root.setAttribute('pdx-theme', build.theme.name);
    for (const [attr, value] of Object.entries(build.theme.attributes)) root.setAttribute(attr, value);
    for (const key of Object.keys(build.theme.tokens)) root.style.removeProperty(key);

    let el = doc.getElementById(DRAFT_CSS_ID) as HTMLStyleElement | null;
    if (!el) {
        el = doc.createElement('style');
        el.id = DRAFT_CSS_ID;
        doc.head.appendChild(el);
    }
    el.textContent = build.css;
}

const DRAFT_CSS_ID = 'pdx-builder-theme';

/** Drop the previewed theme, so the picked one takes over again. */
export function clearPreviewTheme(build: ThemeBuild, doc: Document): void {
    doc.getElementById(DRAFT_CSS_ID)?.remove();
    for (const key of Object.keys(build.theme?.tokens ?? {})) doc.documentElement.style.removeProperty(key);
}

/** Offer a file without a server round-trip. */
export function download(filename: string, contents: string, mime = 'text/plain'): void {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── The last mile: make the theme real in the repo ───────────────────────────

export interface SaveOutcome {
    ok: boolean;
    error?: string;
    written?: string[];
    replaced?: boolean;
}

/**
 * POST the generated CSS to the dev server, which writes it under themes/custom/.
 * The draft travels too, so the saved file can carry a `pdx theme …` line that actually runs.
 */
export async function saveTheme(name: string, css: string, draft?: ThemeDraft): Promise<SaveOutcome> {
    if (!CAN_SAVE) {
        return { ok: false, error: 'Saving needs the dev server (it writes into the repo). Export the CSS or DTCG instead.' };
    }
    try {
        const origin = draft && {
            brand: draft.brand, language: draft.language, accent: draft.accent,
            focus: draft.focus, neutral: draft.neutral, density: draft.density, radius: draft.radius,
        };
        const res = await fetch('/__pdx/save-theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, css, origin }),
        });
        return await res.json() as SaveOutcome;
    } catch (err) {
        return { ok: false, error: String((err as Error)?.message ?? err) };
    }
}

/** Shipped + saved themes, straight from disk — no hand-maintained list to drift. */
export async function fetchThemes(): Promise<{ shipped: string[]; custom: string[] }> {
    try {
        const res = await fetch(THEMES_URL, { cache: 'no-store' });
        return await res.json() as { shipped: string[]; custom: string[] };
    } catch {
        return { shipped: [], custom: [] };
    }
}

/** `<input type="color">` speaks hex only; an oklch() brand has no equivalent to show. */
export function hexForPicker(brand: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(brand.trim()) ? brand.trim() : '#3b5bdb';
}

// ── The agent loop: turn a verdict into an applicable change ──────────────────

export interface ThemeFix {
    token: string;
    from: string;
    to: string;
    reason: string;
}

/**
 * Split `light-dark(a, b)` into its two branches, depth-aware so the comma inside
 * `oklch(...)` does not split it. Anything else is the same value in both schemes.
 */
export function splitLightDark(value: string): [string, string] {
    const v = value.trim();
    if (!v.startsWith('light-dark(')) return [v, v];
    const inner = v.slice('light-dark('.length, -1);
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
        }
    }
    return [inner.trim(), inner.trim()];
}

/**
 * Verdict → changes a caller can apply without parsing prose.
 *
 * The gate now reports which pair failed, in which scheme, and a value that satisfies it,
 * so this is assembly rather than inference. The fix is written back as `light-dark(...)`
 * with only the FAILING scheme replaced: a pair can fail in dark and pass in light, and
 * overwriting both would fix one while breaking the other.
 */
export function suggestFixes(build: ThemeBuild): ThemeFix[] {
    const byToken = new Map<string, { light?: string; dark?: string; reasons: string[] }>();

    for (const issue of build.issues) {
        const r = issue.remedy;
        if (!r || issue.level !== 'error') continue;
        const entry = byToken.get(r.foreground) ?? { reasons: [] };
        entry[r.scheme] = r.suggested;
        entry.reasons.push(`${issue.code} ${r.ratio}:1 < ${r.required}:1 (${r.scheme})`);
        byToken.set(r.foreground, entry);
    }

    const out: ThemeFix[] = [];
    for (const [token, entry] of byToken) {
        const current = build.tokens[token] ?? '';
        const [curLight, curDark] = splitLightDark(current);
        const to = `light-dark(${entry.light ?? curLight}, ${entry.dark ?? curDark})`;
        if (to === current.trim()) continue;
        out.push({ token, from: current, to, reason: entry.reasons.join('; ') });
    }
    return out;
}

/**
 * Load a SAVED theme into the preview as its own stylesheet.
 *
 * The saved file is registered in `themes/custom/_custom.css`, which the design entry imports
 * — that is what makes it a real theme for a real app at build time. In the dev server it is
 * not enough: Vite inlines `@import`s at transform time and caches the parent, and the
 * watcher deliberately does not look at that directory (a write there reloads every open
 * page, which destroys the confirmation and, under test, other specs' execution contexts).
 * Re-enabling the watcher brings the reload back; invalidating the module by hand does not
 * reach the cached transform.
 *
 * So the builder does not depend on the global stylesheet for its own preview and loads the
 * file directly, cache-busted. The registration still happens for everyone else.
 *
 * Returns when the sheet is IN FORCE, not when the tag is in the head. A `<link>` loads
 * asynchronously, and everything that reads the preview right after this call — the verdict, the
 * stage reveal, a test — would judge the default theme whenever the file is slow to arrive.
 * It resolves on `error` too: the verdict is then about what is on screen, and the
 * failed request is in the console.
 *
 * The same theme in the same document keeps its sheet. This runs on every knob and every
 * measurement, and replacing the link each time would re-fetch the file and put the default theme
 * back on screen until it arrives. A re-save needs no new link here: `save()` reloads the frame,
 * and the new document gets one with a new query.
 */
export function ensureCustomThemeCss(doc: Document, name: string): Promise<void> {
    const id = 'pdx-builder-custom-theme';
    const existing = doc.getElementById(id) as HTMLLinkElement | null;
    if (existing && existing.dataset.theme === name) return sheetLoads.get(existing) ?? Promise.resolve();
    existing?.remove();
    if (!name) return Promise.resolve();
    const link = doc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.dataset.theme = name;
    // The file changes under a stable path, so the query is what makes a re-save visible.
    link.href = `${CUSTOM_THEME_BASE}/${name}.css?v=${Date.now()}`;
    const loads = new Promise<void>((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
    });
    sheetLoads.set(link, loads);
    doc.head.appendChild(link);
    return loads;
}

/** When each custom-theme `<link>` finished loading — so a second caller can wait on the first load. */
const sheetLoads = new WeakMap<HTMLLinkElement, Promise<void>>();

/**
 * Seed a fresh draft from the theme being previewed, so entering theme mode CONTINUES from
 * what is on screen instead of swapping it.
 *
 * Without this the switch silently replaced the preview: from the shipped `neutral` canvas
 * (primary charcoal, chroma 0.02) to the default draft brand (#3b5bdb, an electric blue).
 * Both are legitimately "neutral" — the archetype is the STYLE, the shipped theme is that
 * style with no brand — but nothing on screen said so, and it read as the tool changing the
 * component.
 *
 * The brand is seeded from the theme's resolved primary. That is a derived fill rather than
 * the original brand, so the generated theme is a near-neighbour, not a reproduction — good
 * enough as a starting point, and the point is continuity, not fidelity.
 * Returns the draft unchanged if it has been touched, or if there is nothing to read.
 */
export function seedDraftFromTheme(draft: ThemeDraft, theme: string, doc: Document | null | undefined): ThemeDraft {
    const untouched = draft.brand === DEFAULT_DRAFT.brand
        && draft.language === DEFAULT_DRAFT.language
        && Object.keys(draft.tokens ?? {}).length === 0
        && !draft.css;
    if (!untouched || !doc?.documentElement) return draft;

    const primary = doc.defaultView?.getComputedStyle(doc.documentElement)
        .getPropertyValue('--pdx-color-primary').trim();
    // `light-dark(a, b)` cannot be a brand input: take the branch in force.
    const brand = primary ? splitLightDark(primary)[0] : '';
    if (!brand.startsWith('oklch') && !brand.startsWith('#')) return draft;

    return Object.assign({}, draft, {
        brand,
        // A shipped theme name is only an archetype when the engine knows it as one
        // (`pragmatic-gold` ships but is not a design language).
        language: (LANGUAGES as readonly string[]).includes(theme) ? theme : draft.language,
        name: draft.name === DEFAULT_DRAFT.name ? `${theme}-custom` : draft.name,
    });
}

// Reactive Style Runtime — signal-backed CSS custom properties,
// token auto-discovery from @pdxui/design, theme switching.

import { signal, computed, effect } from '../reactivity/signal';
import type { Signal, ReadonlySignal } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── cssVar — Reactive CSS Custom Property ────────────────────────

/**
 * Create a reactive CSS custom property backed by a signal.
 * Changes to the signal automatically update the CSS variable on the target element.
 *
 * @param name - CSS variable name (e.g. '--primary-color')
 * @param initial - Initial value (string) or reactive getter
 * @param target - Element to set the variable on (default: document.documentElement)
 */
export function cssVar(
    name: string,
    initial: string | (() => string),
    target?: Element
): Signal<string> {
    const el = target ?? (isBrowser ? document.documentElement : null);
    const value = typeof initial === 'function'
        ? signal(initial())
        : signal(initial);

    if (el && isBrowser) {
        effect(() => {
            (el as HTMLElement).style.setProperty(name, value());
        });
    }

    return value;
}

// ─── Token Bridge — Auto-discovery from CSS ───────────────────────

/** Token bridge: reads --pdx-* CSS custom properties and creates signal wrappers. */
export interface TokenBridge {
    /** Get a token value as signal. camelCase name (e.g. 'colorPrimary' for --pdx-color-primary). */
    get(name: string): ReadonlySignal<string>;
    /** Override a token value at runtime. */
    set(name: string, value: string): void;
    /** Snapshot all current token values. */
    snapshot(): Record<string, string>;
    /** Apply a set of token values (e.g. from snapshot). */
    apply(values: Record<string, string>): void;
    /** Refresh all tokens from computed styles (e.g. after theme change). */
    refresh(): void;
    /** Disconnect the MutationObserver. Call when the bridge is no longer needed. */
    disconnect(): void;
    /** All discovered token names. */
    readonly names: string[];
}

/**
 * Create a token bridge that auto-discovers --pdx-* CSS custom properties.
 * Tokens become reactive signals that update when the theme changes.
 *
 * @param prefix - CSS variable prefix to discover (default: '--pdx-')
 * @param target - Element to read from (default: document.documentElement)
 */
export function createTokenBridge(prefix = '--pdx-', target?: Element): TokenBridge {
    const el = target ?? (isBrowser ? document.documentElement : null);
    const tokens = new Map<string, Signal<string>>();
    const discoveredNames: string[] = [];

    let observer: MutationObserver | null = null;

    // Initial discovery
    if (el && isBrowser) {
        discoverTokens(el, prefix, tokens, discoveredNames);

        // Watch for theme/scheme/density attribute changes → refresh
        observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' &&
                    (m.attributeName === 'pdx-theme' || m.attributeName === 'pdx-scheme' || m.attributeName === 'pdx-density')) {
                    requestAnimationFrame(() => refreshAll(el, prefix, tokens));
                }
            }
        });
        observer.observe(el, { attributes: true, attributeFilter: ['pdx-theme', 'pdx-scheme', 'pdx-density'] });
    }

    return {
        get(name: string): ReadonlySignal<string> {
            const cssName = camelToCssVar(name, prefix);
            let sig = tokens.get(cssName);
            if (!sig) {
                const value = el ? getComputedStyle(el as HTMLElement).getPropertyValue(cssName).trim() : '';
                sig = signal(value);
                tokens.set(cssName, sig);
            }
            return computed(() => sig!());
        },

        set(name: string, value: string): void {
            const cssName = camelToCssVar(name, prefix);
            const sig = tokens.get(cssName);
            if (sig) sig.set(value);
            if (el && isBrowser) (el as HTMLElement).style.setProperty(cssName, value);
        },

        snapshot(): Record<string, string> {
            const result: Record<string, string> = {};
            for (const [cssName, sig] of tokens) {
                result[cssVarToCamel(cssName, prefix)] = sig.peek();
            }
            return result;
        },

        apply(values: Record<string, string>): void {
            for (const [name, value] of Object.entries(values)) {
                this.set(name, value);
            }
        },

        refresh(): void {
            if (el) refreshAll(el, prefix, tokens);
        },

        disconnect(): void {
            observer?.disconnect();
            observer = null;
        },

        get names() { return discoveredNames; },
    };
}

// ─── Theme Helpers ────────────────────────────────────────────────

/** Create a theme as a record of CSS variable values. */
export function createTheme(vars: Record<string, string>): Record<string, string> {
    return { ...vars };
}

/** Apply a theme by setting all its CSS variables on target (default: :root). */
export function applyTheme(theme: Record<string, string>, target?: Element): void {
    if (!isBrowser) return;
    const el = (target ?? document.documentElement) as HTMLElement;
    for (const [name, value] of Object.entries(theme)) {
        el.style.setProperty(name, value);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Discover all CSS custom properties with given prefix from computed styles. */
function discoverTokens(
    el: Element,
    prefix: string,
    tokens: Map<string, Signal<string>>,
    names: string[]
): void {
    const styles = getComputedStyle(el as HTMLElement);
    // getComputedStyle doesn't enumerate custom properties in all browsers.
    // Fallback: read from stylesheets.
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of (sheet as CSSStyleSheet).cssRules) {
                if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
                    for (let i = 0; i < rule.style.length; i++) {
                        const prop = rule.style[i];
                        if (prop.startsWith(prefix)) {
                            const value = rule.style.getPropertyValue(prop).trim();
                            if (!tokens.has(prop)) {
                                tokens.set(prop, signal(value));
                                names.push(cssVarToCamel(prop, prefix));
                            }
                        }
                    }
                }
            }
        } catch {
            // Cross-origin stylesheets throw SecurityError — skip
        }
    }

    // Also read inline styles / computed values for any we missed
    for (const [cssName] of tokens) {
        const computed = styles.getPropertyValue(cssName).trim();
        if (computed) tokens.get(cssName)!.set(computed);
    }
}

/** Refresh all token signals from current computed styles. */
function refreshAll(el: Element, _prefix: string, tokens: Map<string, Signal<string>>): void {
    const styles = getComputedStyle(el as HTMLElement);
    for (const [cssName, sig] of tokens) {
        const value = styles.getPropertyValue(cssName).trim();
        if (value && value !== sig.peek()) {
            sig.set(value);
        }
    }
}

/** Convert camelCase to CSS variable: 'colorPrimary' → '--pdx-color-primary'. */
function camelToCssVar(name: string, prefix: string): string {
    if (name.startsWith('-')) return name; // Already CSS format
    const kebab = name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    return `${prefix}${kebab}`;
}

/** Convert CSS variable to camelCase: '--pdx-color-primary' → 'colorPrimary'. */
function cssVarToCamel(cssName: string, prefix: string): string {
    const stripped = cssName.startsWith(prefix) ? cssName.slice(prefix.length) : cssName;
    return stripped.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Theme Manager — setTheme / setScheme / toggleDarkMode ──────

const THEME_KEY = 'pdx-theme';
const SCHEME_KEY = 'pdx-scheme';

const _currentTheme = signal<string>(isBrowser ? (localStorage.getItem(THEME_KEY) ?? 'neutral') : 'neutral');
const _currentScheme = signal<string>(isBrowser ? (localStorage.getItem(SCHEME_KEY) ?? detectSystemScheme()) : 'light');

function detectSystemScheme(): string {
    if (!isBrowser) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Current brand theme name (e.g. 'neutral', 'material', 'fluent'). */
export const currentTheme: ReadonlySignal<string> = computed(() => _currentTheme());

/** Current color scheme ('light' or 'dark'). */
export const currentScheme: ReadonlySignal<string> = computed(() => _currentScheme());

/**
 * Set the brand theme (e.g. 'material', 'fluent', 'cupertino').
 * Sets `pdx-theme` attribute on <html>, persists to localStorage,
 * and syncs behavior attributes (input-style, tab-style, card-style)
 * from the theme's CSS custom properties.
 */
export function setTheme(name: string): void {
    _currentTheme.set(name);
    if (isBrowser) {
        document.documentElement.setAttribute('pdx-theme', name);
        localStorage.setItem(THEME_KEY, name);
        // Sync behavior attributes from theme CSS tokens → HTML attributes
        // CSS selectors like [pdx-input-style="filled"] need these attrs
        requestAnimationFrame(() => syncBehaviorAttrs());
    }
}

// Behavior: CSS custom property → HTML attribute mapping
// Some token names differ from attribute names (e.g. --pdx-tab-indicator → pdx-tab-style)
//
// Exported because it is not only this module's business: switching themes means setting
// `pdx-theme` AND re-deriving these, and anything that changes the theme without them leaves the
// previous theme's behaviour in place — a card keeps a border it should have lost, an input keeps
// the wrong fill. A second, hand-maintained copy of this list is what
// the responsive suite would otherwise need, so it reads this one.
export const BEHAVIOR_TOKEN_MAP: [string, string][] = [
    ['--pdx-input-style', 'pdx-input-style'],
    ['--pdx-input-focus', 'pdx-input-focus'],
    ['--pdx-tab-indicator', 'pdx-tab-style'],
    ['--pdx-card-style', 'pdx-card-style'],
];

/** Read behavior CSS custom properties and mirror as HTML attributes on <html>. */
function syncBehaviorAttrs(): void {
    if (!isBrowser) return;
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    for (const [token, attr] of BEHAVIOR_TOKEN_MAP) {
        const value = styles.getPropertyValue(token).trim();
        if (value) {
            root.setAttribute(attr, value);
        } else {
            root.removeAttribute(attr);
        }
    }
}

/**
 * Set the color scheme ('light' or 'dark').
 * Sets `pdx-scheme` attribute on <html> and persists to localStorage.
 */
export function setScheme(scheme: 'light' | 'dark'): void {
    _currentScheme.set(scheme);
    if (isBrowser) {
        document.documentElement.setAttribute('pdx-scheme', scheme);
        localStorage.setItem(SCHEME_KEY, scheme);
    }
}

/** Get the current theme name. */
export function getTheme(): string {
    return _currentTheme.peek();
}

/** Get the current color scheme. */
export function getScheme(): string {
    return _currentScheme.peek();
}

/** Toggle between 'light' and 'dark' color schemes. */
export function toggleDarkMode(): void {
    setScheme(_currentScheme.peek() === 'dark' ? 'light' : 'dark');
}

// Apply stored theme + scheme on load.
//
// ⚠️ Precedence: **the user's saved choice, then what the AUTHOR declared in the document, then the
// OS preference.** Without the middle one, a `<html pdx-scheme="light">` written in index.html
// would be overwritten before anything rendered, on any machine whose OS is set to dark, with no
// warning.
//
// A system preference is a DEFAULT, not an instruction: it applies when nobody has said otherwise.
if (isBrowser) {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const storedScheme = localStorage.getItem(SCHEME_KEY);
    const authored = document.documentElement.getAttribute('pdx-scheme');

    if (storedTheme) {
        document.documentElement.setAttribute('pdx-theme', storedTheme);
    }
    if (storedScheme) {
        document.documentElement.setAttribute('pdx-scheme', storedScheme);
    } else if (authored === 'light' || authored === 'dark') {
        // The author already said. Adopt it as the current scheme instead of replacing it, so
        // `getScheme()` and `toggleDarkMode()` start from what is actually on screen.
        _currentScheme.set(authored);
    } else if (detectSystemScheme() === 'dark') {
        document.documentElement.setAttribute('pdx-scheme', 'dark');
    }
    // Sync behavior attrs from theme tokens on initial load
    requestAnimationFrame(() => syncBehaviorAttrs());
}

// ─── Shadow-root styles ────────────────────────────────────────────

/** One constructed sheet per component id, shared by every instance that adopts it. */
const _shadowSheets = new Map<string, { sheet: CSSStyleSheet; css: string }>();

/**
 * Put a component's CSS inside a shadow root.
 *
 * Emitted by the compiler for a `<template shadow>` component, and the reason it has to exist: the
 * light-DOM path appends a `<style>` to `document.head`, and a document stylesheet does not cross a
 * shadow boundary. A shadow component whose styles went to the head would render unstyled, with
 * every piece individually correct.
 *
 * One constructed stylesheet per component, adopted by every instance — so a hundred rows share one
 * sheet, and an HMR update to it reaches all of them at once. Where constructable stylesheets are
 * not available the fallback is a `<style>` element per root, which is correct and merely heavier.
 */
export function __adoptStyles(root: ShadowRoot | null | undefined, css: string, id: string): void {
    if (!root) return;

    if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in root) {
        try {
            let entry = _shadowSheets.get(id);
            if (!entry) {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(css);
                entry = { sheet, css };
                _shadowSheets.set(id, entry);
            } else if (entry.css !== css) {
                // An HMR pass with new CSS: replacing the shared sheet updates every root that has
                // already adopted it, which is the point of sharing it.
                entry.sheet.replaceSync(css);
                entry.css = css;
            }
            if (!root.adoptedStyleSheets.includes(entry.sheet)) {
                root.adoptedStyleSheets = [...root.adoptedStyleSheets, entry.sheet];
            }
            return;
        } catch {
            // A browser that has the constructor and refuses the assignment: fall through.
        }
    }

    const existing = root.querySelector(`style[data-pdx-s="${id}"]`);
    if (existing) {
        if (existing.textContent !== css) existing.textContent = css;
        return;
    }
    const el = document.createElement('style');
    el.setAttribute('data-pdx-s', id);
    el.textContent = css;
    root.appendChild(el);
}

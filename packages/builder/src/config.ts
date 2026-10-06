// Fixed points the builder shell is wired to. One place, greppable.

/**
 * Where the scenario pages and their catalog live — which differs by deployment.
 *
 * In DEV the Vite root is the repo root and the pages are served straight from the tree, so
 * they are always the freshly generated ones. A BUILD is a standalone site with no repo
 * behind it: `scripts/prepare-static.mjs` copies the pages under this package and the URLs
 * become public ones. Getting this wrong shows up as a picker offering components whose page
 * 404s, so the two halves live next to each other rather than in two files.
 */
export const IS_DEV: boolean = import.meta.env.DEV;

export const SCENARIOS_BASE = IS_DEV ? '/packages/ui/tests/scenarios/generated' : '/scenarios';
export const CATALOG_URL = `${SCENARIOS_BASE}/catalog.json`;

/**
 * Saving writes into the working tree, so it exists only while the dev server does. A
 * deployed builder still authors, judges and exports — it just cannot commit for you.
 */
export const CAN_SAVE: boolean = IS_DEV;

/** The theme list is an endpoint in dev (a save can extend it) and a file in a build. */
export const THEMES_URL = IS_DEV ? '/__pdx/themes' : '/scenarios/themes.json';

/** Where a saved custom theme's CSS is reachable from. In dev the save plugin serves it from the
 *  directory it saved into, which is not always the working tree. */
export const CUSTOM_THEME_BASE = IS_DEV ? '/__pdx/custom-themes' : '/scenarios/custom';

export interface CatalogScenario {
    id: string;
    title: string;
    viewport?: number;
}

export interface CatalogComponent {
    name: string;
    tags: string[];
    tier: string;
    status: string;
    /** Slug of the generated tier page that contains this component's scenarios. */
    page: string;
    scenarios: CatalogScenario[];
}

/**
 * The shipped themes. Hand-written on purpose — `@pdxui/design` exposes no list, and
 * inventing one here would be a second source of truth. `tests/themes.test.ts` asserts
 * this array matches `packages/design/src/themes/*.css` on disk, so drift fails a test
 * instead of silently offering a theme that does not exist.
 */
export const THEMES = [
    'neutral',
    'corporate',
    'cupertino',
    'cyberpunk',
    'editorial',
    'fluent',
    'glass',
    'material',
    'metro',
    'neumorphic',
    'playful',
    'pragmatic',
    'pragmatic-gold',
] as const;

export const SCHEMES = ['light', 'dark'] as const;

/** Viewport presets. `width: 0` means "fill the stage". */
export const VIEWPORTS = [
    { id: 'fill', label: 'Fill', width: 0 },
    { id: 'mobile', label: '390', width: 390 },
    { id: 'tablet', label: '768', width: 768 },
    { id: 'desktop', label: '1280', width: 1280 },
] as const;

/**
 * The composite page — what the EYE judges a theme on, as opposed to the
 * manifest scenarios, which are what the oracle measures. It is a pseudo-component in the
 * picker: same iframe, same ?theme/?scheme contract, same ready flag.
 */
export const COMPOSITION_NAME = 'composition';
export const COMPOSITION_URL = IS_DEV ? '/packages/builder/preview/composition.html' : '/preview/composition.html';

export function compositionUrl(theme: string, scheme: string): string {
    return `${COMPOSITION_URL}?${new URLSearchParams({ theme, scheme }).toString()}`;
}

/** Build the preview URL. The scenario page reads all three params itself. */
export function scenarioUrl(page: string, scenario: string, theme: string, scheme: string): string {
    const q = new URLSearchParams({ scenario, theme, scheme });
    return `${SCENARIOS_BASE}/${page}.html?${q.toString()}`;
}

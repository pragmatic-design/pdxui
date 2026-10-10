/**
 * COMPONENT TEST MANIFEST (CTM)
 *
 * A manifest file per component is the ONLY thing written by hand to certify it.
 * The generator (tooling/generate.ts) produces from here: the scenario HTML, the contract
 * registry, and what feeds the 5 runners (contract math, axe, isolation, keyboard, visual).
 *
 * The principle (CONTRIBUTING.md, rule 1): "if a developer has to write boilerplate, the framework
 * has a bug".
 * The manifest declares the intent; the runners generate the wiring.
 *
 * It reuses the Contract Testing System's existing rule types instead of duplicating them.
 */
import type {
    StandaloneRule,
    CompositionRule,
    StateRule,
    PositioningRule,
    OverlayRule,
    ResponsiveRule,
} from '../integration/ui-components/contracts/types';

// ── Scenario: an isolated HTML fragment, selectable with ?scenario= ──

export interface ScenarioDef {
    /** Unique id → ?scenario=<id>. Convention: "<component>-<variant>" */
    id: string;
    /** Readable title, for the report */
    title: string;
    /**
     * The fragment's static markup. Every measurable element MUST carry data-test="...".
     * No app shell and no router: only the component and the CSS.
     */
    html: string;
    /** Override viewport width (default 1280) */
    viewport?: number;
    /**
     * For a scenario that needs a JS state applied before the measurement (opening a dialog or a
     * menu, say). A string of code run in the page after the mount.
     */
    setup?: string;
}

// ── Dimension 1: the mathematical contract (reuses the existing *Rule types) ──

export interface ContractBlock {
    standalone?: StandaloneRule[];
    composition?: CompositionRule[];
    states?: StateRule[];
    positioning?: PositioningRule[];
    overlay?: OverlayRule[];
    responsive?: ResponsiveRule[];
}

export interface ContractSpec {
    /**
     * Rules grouped by scenario id. Each rule runs in the scenario where its target is VISIBLE
     * (elements in a hidden section measure 0 → they must be scoped to the right scenario). The
     * rules here hold for EVERY theme (they are the universal ones).
     */
    scenarios: Record<string, ContractBlock>;
    /**
     * Overrides and additions for one theme (material → a pill radius, for instance), shaped as
     * theme → (scenario id → block). They apply ONLY to the theme named, on top of the universal
     * ones. Based on the competitor research (Step 1 of the workflow).
     */
    themeOverrides?: Record<string, Record<string, ContractBlock>>;
}

// ── Dimension 2: axe-core (WCAG) ──

export interface A11ySpec {
    /** Which scenario ids axe scans */
    scenarios: string[];
    /**
     * axe rules to disable for KNOWN false positives.
     * Every entry MUST carry a comment in the manifest saying why. Never to silence a real bug.
     */
    disableRules?: string[];
    /** Override the WCAG tags (default ['wcag2a','wcag2aa','wcag21a','wcag21aa']) */
    wcagTags?: string[];
    /**
     * Per-theme override: some themes (cyberpunk, for instance) may need different disableRules
     * (contrast). Always say why.
     */
    themeDisableRules?: Record<string, string[]>;
}

// ── Dimension 3: style isolation (immunity to somebody else's CSS) ──

/**
 * What the isolation runner compares before and after the hostile CSS. Computed values are compared
 * exactly; `height` and `radius` (the four corners) within `tolerancePx`.
 */
export type IsolatedProperty =
    | 'color' | 'backgroundColor'
    | 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'
    | 'borderTopWidth' | 'borderTopStyle' | 'borderTopColor'
    | 'height' | 'radius';

/**
 * Properties the hostile CSS changes today, named so the suite stays green while the issue that
 * removes them is open. They are still measured: the run fails when one STOPS changing, and it is
 * then removed from the entry. A change that no entry lists fails.
 */
export interface IsolationLeak {
    /** The GitHub issue that removes the leak */
    issue: number;
    properties: IsolatedProperty[];
    /** Only on these themes (default: every theme the isolation runner uses) */
    themes?: string[];
}

export interface IsolationTarget {
    /** The element whose style must hold under hostile CSS */
    selector: string;
    /** Largest drift tolerated, in px, on the height and the radii (default 1) */
    tolerancePx?: number;
    /** The properties that leak today, each with the issue that removes it */
    leaks?: IsolationLeak[];
    /**
     * Skip the assertion on the height. For elements whose height is NOT a clean structural
     * invariant: modal panels with `transform: scale()` (getBoundingClientRect is scaled) or
     * content-driven containers (height = the sum of the content, sensitive to the host's
     * line-height). The radius (a CSS value, not scaled) stays asserted.
     */
    skipHeight?: boolean;
}

export interface IsolationSpec {
    /** The scenario the hostile CSS is injected into */
    scenario: string;
    /** The elements that must keep their style despite the external CSS */
    targets: IsolationTarget[];
}

// ── Dimension 4: keyboard (WAI-ARIA) ──

export interface KeyStep {
    /** A Playwright key: 'Tab' | 'Shift+Tab' | 'ArrowDown' | 'Enter' | 'Escape' | 'Home' ... */
    key: string;
    /** The selector that MUST have the focus after the key (activeElement.matches) */
    expectFocus?: string;
    /** The ARIA attribute expected on an element after the key */
    expectAttr?: { selector: string; name: string; value: string };
    /** A selector that MUST have moved or changed geometry (the tabs indicator, for instance) */
    expectGeometryChange?: string;
    /** For a focus trap: after the key the focus MUST stay inside this container */
    expectFocusWithin?: string;
    /**
     * An event the key MUST make `selector` emit, exactly `count` times (default 1; 0 = the key
     * must not emit it). For what a key does without leaving a trace in the DOM: Enter on a
     * clickable card emits `pdx-click` and nothing else.
     */
    expectEvent?: { selector: string; name: string; count?: number };
    /**
     * The element named by `selector`'s aria-activedescendant MUST be `target`: the id is
     * generated, the element it has to reach is not (combobox/listbox).
     */
    expectActiveDescendant?: { selector: string; target: string };
}

export interface KeyboardSpec {
    /** The interactive scenario the sequence runs in */
    scenario: string;
    /** The selector of the element that takes the initial focus (before the first key) */
    initialFocus?: string;
    /**
     * The container that traps the focus (dialog, drawer: the components that use focusTrap). After
     * the last step the runner presses Tab and then Shift+Tab ten times each, and the focus must
     * stay inside. Not for menus: Tab leaves a menu (WAI-ARIA APG).
     *
     * There are no default steps per WAI-ARIA pattern: every manifest's steps are explicit.
     */
    trapContainer?: string;
    /** The steps, in order */
    steps?: KeyStep[];
}

// ── Dimension 5: visual regression (Docker) ──

export interface VisualSpec {
    /** The scenarios to screenshot (keep to 1-2 per component: only what the maths cannot catch) */
    scenarios: string[];
    /** Selectors to mask (blinking cursors, timestamps, random content) */
    mask?: string[];
    /** Override the diff threshold (the default comes from the Docker config: 0.01) */
    maxDiffPixelRatio?: number;
    /**
     * EXTRA screenshots with one element focused, saved as `<scenario>-focused`.
     *
     * The visual dimension photographs components at rest and never interacts: without these no
     * baseline holds a focused element, so the focus ring — its width, its offset, its colour, a
     * theme's double ring — is looked at by none of the five runners, and every ring in the product
     * could grow from 2px to 3px without the suite moving a pixel.
     *
     * Opt-in per scenario, not automatic: it is one more baseline for every (scenario, theme) pair,
     * and doubling all of them would cost more than it is worth. It is for where the ring IS the
     * point: fields, choice controls, buttons, tabs.
     */
    focus?: VisualFocusSpec[];
}

export interface VisualFocusSpec {
    /** The scenario to open — one of `scenarios`, or at least a valid scenario. */
    scenario: string;
    /** The element to focus. The first one the selector finds. */
    selector: string;
    /** A suffix for the baseline name, when a scenario has more than one focus. Default: none. */
    name?: string;
}

// ── The manifest as a whole ──

export type ManifestStatus = 'todo' | 'wip' | 'done';

export interface ComponentManifest {
    /** The component's name, 'button' for instance */
    name: string;
    /** The custom element tag, 'pdx-button' for instance. Validated against ui/package.json exports. */
    tag: string;
    /** The component's tier ('1A', '2', '3C'…) — used for the CI sharding */
    tier: string;
    /** Certification status */
    status: ManifestStatus;
    /**
     * The sub-paths to import to register the custom element, e.g. ['@pdxui/ui/button'].
     * The generator can also use the glob import '@pdxui/ui'; this is for targeted imports
     * and for validating the exports.
     */
    imports: string[];
    /** Override the themes (default: all of THEMES). A mobile-only component, for instance. */
    themes?: string[];
    /** The scenarios' HTML fragments */
    scenarios: ScenarioDef[];

    /** Dim. 1 — mathematical geometry and style */
    contracts?: ContractSpec;
    /** Dim. 2 — accessibility, axe-core */
    a11y?: A11ySpec;
    /** Dim. 3 — immunity to external style */
    isolation?: IsolationSpec;
    /** Dim. 4 — WAI-ARIA keyboard interaction */
    keyboard?: KeyboardSpec;
    /** Dim. 5 — visual regression (Docker screenshots) */
    visual?: VisualSpec;

    /** The ids of cross-component scenarios this component appears in */
    crossRefs?: string[];
}

/**
 * A cross-component manifest: the same shape, but its scenarios hold more than one component.
 * It lives in manifests/cross/*.manifest.ts.
 */
export interface CrossManifest extends Omit<ComponentManifest, 'tag'> {
    /** The tags of the components involved (for validating the imports) */
    tags: string[];
}

/**
 * Component Contract Type System
 *
 * Expresses visual rules as structured objects that the test runner
 * interprets into Playwright assertions. Covers:
 * - Standalone properties (border, radius, height, color, font)
 * - Composition (parent-child geometry relationships)
 * - Positioning (offset, centering, containment)
 * - Responsive (rules that change at breakpoints)
 * - States (hover, focus, disabled, active)
 */

// ── Primitives ──

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Corner = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
export type CompareOp = '==' | '!=' | '>=' | '<=' | '>' | '<' | 'between' | 'matches';

/** A numeric assertion: value op threshold */
export interface NumericRule {
    op: CompareOp;
    value: number;
    /** For 'between': [min, max] inclusive */
    range?: [number, number];
    /** Tolerance for '==' comparisons (default 1px) */
    tolerance?: number;
}

/** A string assertion */
export interface StringRule {
    op: 'is' | 'isNot' | 'contains' | 'matches' | 'oneOf';
    value: string | string[] | RegExp;
}

// ── Border Model (4 sides) ──

export interface BorderSideRule {
    style?: StringRule;   // 'none' | 'solid' | 'dashed' ...
    width?: NumericRule;  // px
    color?: StringRule;   // 'transparent' | regex for oklch/rgb
}

export interface BorderRule {
    top?: BorderSideRule;
    right?: BorderSideRule;
    bottom?: BorderSideRule;
    left?: BorderSideRule;
    /** Shorthand: apply to all sides */
    all?: BorderSideRule;
}

// ── Radius Model (4 corners) ──

export interface RadiusRule {
    topLeft?: NumericRule;
    topRight?: NumericRule;
    bottomRight?: NumericRule;
    bottomLeft?: NumericRule;
    /** Shorthand: all corners */
    all?: NumericRule;
}

// ── Element Measurement (what Playwright extracts) ──

export interface MeasuredElement {
    // Geometry (getBoundingClientRect)
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
    centerX: number;
    centerY: number;
    // Computed style
    borderTopWidth: number;
    borderRightWidth: number;
    borderBottomWidth: number;
    borderLeftWidth: number;
    borderTopStyle: string;
    borderRightStyle: string;
    borderBottomStyle: string;
    borderLeftStyle: string;
    borderTopColor: string;
    borderRightColor: string;
    borderBottomColor: string;
    borderLeftColor: string;
    borderTopLeftRadius: number;
    borderTopRightRadius: number;
    borderBottomRightRadius: number;
    borderBottomLeftRadius: number;
    backgroundColor: string;
    color: string;
    opacity: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    letterSpacing: string;
    textTransform: string;
    cursor: string;
    display: string;
    minHeight: number;
    maxWidth: number;
    minWidth: number;
    boxShadow: string;
    pointerEvents: string;
    /** The computed `overflow` shorthand ("hidden", "visible", "auto hidden"…). */
    overflow: string;
    /**
     * How much wider the content is than the box: `scrollWidth - clientWidth`, never negative.
     * 0 means nothing is cut. On a label with `text-overflow: ellipsis` this is the only way to
     * see the ellipsis from a measurement — the box is exactly as wide as the column either way
     * (a header that reserves 18px for an invisible icon renders "C…").
     */
    contentOverflowX: number;
}

// ── Standalone Rule ──

export interface StandaloneRule {
    /** What to measure */
    selector: string;
    /** Human-readable description for test name */
    description: string;
    /**
     * How many elements the selector matches — an assertion about the SET, not about one element,
     * and the only rule here that is meaningful at zero.
     *
     * It exists because the alternative does not work: "no children are rendered" written as a
     * measurement of a child that should not be there stops at «Element not found», which is a red
     * about the rule rather than about the component.
     *
     * A rule with ONLY `count` measures no element, so `0` is expressible. Combined with other
     * properties, the count is asserted first and then the first match is measured as usual.
     */
    count?: NumericRule;
    /** Property assertions */
    height?: NumericRule;
    width?: NumericRule;
    minHeight?: NumericRule;
    maxWidth?: NumericRule;
    minWidth?: NumericRule;
    opacity?: NumericRule;
    fontSize?: NumericRule;
    cursor?: StringRule;
    textTransform?: StringRule;
    letterSpacing?: StringRule;
    fontFamily?: StringRule;
    fontWeight?: StringRule;
    backgroundColor?: StringRule;
    boxShadow?: StringRule;
    display?: StringRule;
    pointerEvents?: StringRule;
    /** Whether the element clips what overflows it: a clip cuts a child's focus ring. */
    overflow?: StringRule;
    /** `scrollWidth - clientWidth`: 0 asserts the text is not cut, ellipsis or not. */
    contentOverflowX?: NumericRule;
    border?: BorderRule;
    radius?: RadiusRule;
    /**
     * WCAG contrast of the element's text colour on what it is really painted on: its own
     * background and its ancestors', composited down to the first opaque one. axe's
     * `color-contrast` is off in Dim 2 because it cannot sample the themes' translucent layers;
     * this can. Background images (gradients) are not composited — a rule on such an element
     * says so in its failure message.
     */
    contrast?: NumericRule;
    /**
     * The element's text colour is the colour this custom property resolves to beside it — a theme
     * token, whatever value each theme gives it (a negative colorBySign number must be
     * `--pdx-color-danger-ink`, not the text colour). Both colours are read
     * as the browser computes them.
     */
    colorVar?: string;
    /**
     * A mark painted inside the element — a checkbox's check or dash — read from a screenshot of
     * it, decoded in the page. Only the central 60% of the box is read, clear of the
     * border and the rounded corners; its most common colour is the fill.
     */
    mark?: MarkRule;
}

export interface MarkRule {
    /** Pixels of the central area that stand out from the fill (WCAG contrast ≥ 1.5 to it): 0 = nothing drawn. */
    pixels?: NumericRule;
    /**
     * WCAG contrast of the mark against the fill: the pixel of the central area that contrasts
     * most. Antialiasing only lowers it, so a rule that passes here passes on the declared colour.
     * WCAG 1.4.11 asks 3:1 for the state of a UI component.
     */
    contrast?: NumericRule;
}

// ── Composition Rule (parent-child relationships) ──

export type RelationOp = '==' | '<=' | '>=' | '<' | '>' | 'contained-in' | 'flush-left' | 'flush-right';

export interface CompositionRule {
    description: string;
    /** Parent selector */
    parent: string;
    /** Child selectors (named for reference) */
    children: Record<string, string>;
    /** Relations between children or parent-child */
    relations: CompositionRelation[];
}

export interface CompositionRelation {
    description: string;
    /** e.g. "input.height", "button.height", "parent.height" */
    left: string;
    op: RelationOp;
    right: string;
    /** px tolerance for == */
    tolerance?: number;
}

// ── Positioning Rule (floating elements) ──

export interface PositioningRule {
    description: string;
    /** How to trigger the floating element (hover, click, etc.) */
    trigger: {
        selector: string;
        action: 'hover' | 'click' | 'focus';
    };
    /** Floating element selector */
    floating: string;
    /** Wait ms after trigger (default 400) */
    wait?: number;
    /** Expected position relative to trigger */
    placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
    /** Gap in px between trigger and floating */
    gap?: NumericRule;
    /** Alignment on cross-axis */
    alignment?: 'center' | 'start' | 'end';
    /** Tolerance in px (default 4) */
    tolerance?: number;
    /** Must be within viewport */
    withinViewport?: boolean;
}

// ── Modal/Overlay Rule ──

export interface OverlayRule {
    description: string;
    /** How to open */
    trigger: {
        selector: string;
        action: 'click' | 'call';
    };
    /** Overlay panel selector */
    panel: string;
    /** Backdrop selector (optional) */
    backdrop?: string;
    /** Expected centering */
    centering?: 'horizontal' | 'vertical' | 'both';
    /** Width constraints */
    width?: NumericRule;
    /** Min/max width */
    minWidth?: NumericRule;
    maxWidth?: NumericRule;
    /** Padding */
    padding?: NumericRule;
    /** Must have backdrop */
    hasBackdrop?: boolean;
    /** Backdrop opacity */
    backdropOpacity?: NumericRule;
}

// ── State Rule (interactions) ──

export interface StateRule {
    description: string;
    selector: string;
    /** How to enter the state */
    trigger: 'hover' | 'focus' | 'click' | 'attribute';
    /** For attribute trigger: attribute name + value */
    attribute?: { name: string; value: string };
    /** Properties that CHANGE in this state (relative to default) */
    changes: Partial<{
        opacity: NumericRule;
        backgroundColor: StringRule;
        borderColor: StringRule;
        boxShadow: StringRule;
        cursor: StringRule;
        transform: StringRule;
        pointerEvents: StringRule;
        /** "different" = must differ from default state */
        mustDiffer: (keyof MeasuredElement)[];
    }>;
}

// ── Responsive Rule ──

export interface ResponsiveRule {
    description: string;
    selector: string;
    /** Viewport width */
    viewport: number;
    /** Expected properties at this viewport */
    expect: Partial<StandaloneRule>;
}

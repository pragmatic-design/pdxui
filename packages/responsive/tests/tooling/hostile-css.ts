/**
 * HOSTILE CSS for the style-isolation tests (Dimension 3).
 *
 * It simulates a "sloppy" or aggressive host app injecting global rules able to
 * break badly isolated components. Pragmatic's components use the Light DOM (no Shadow
 * DOM): their defence is the specificity of the .pdx-* classes + the @layer ordering.
 *
 * The test measures an element BEFORE and AFTER the injection: if the critical geometry
 * (height/width/radius/border) stays within tolerance, the component is immune.
 * A failure is NOT a bug in the test: it is a real vulnerability of the design system,
 * to be hardened (defensive specificity on the critical geometry).
 *
 * NB: we deliberately do NOT use `* { all: revert }` (it would zero everything out and make the
 * test trivial). We use rules a messy third-party app would realistically have.
 */

/**
 * "Realistic" hostile CSS: what a messy host app would actually inject.
 * A well-isolated component (.pdx-* classes with adequate specificity + @layer + tokens
 * hung off [pdx-theme]) MUST survive. No pathological `* { ... !important }`:
 * that would break anything at all and leave the test worthless. Here we use
 * generic element and class selectors WITHOUT !important — the design system's defence
 * has to win on specificity/cascade.
 */
export const HOSTILE_CSS = `
/* The box-sizing reset third parties commonly ship */
* { box-sizing: border-box; }

/* The host's "bare" element selectors (the design system uses more specific .pdx-* classes) */
button, input, a, label, p, span, div {
    border: 2px dotted magenta;
    font-size: 11px;
    font-family: "Comic Sans MS", cursive;
    line-height: 2.2;
    letter-spacing: 1px;
    color: lime;
}

/* NB: we do NOT poison the --pdx-* tokens here. They are the PUBLIC customisation API
   (:root { --pdx-color-primary }, for one): changing them is an intended feature, not an attack.
   Isolation checks immunity to the host's NON-pdx style, not to token overrides. */

/* Third-party classes OUTSIDE the pdx- namespace. NB: we do NOT include common "bare"
   state classes (.active, .disabled, .row) — those would test name COLLISION
   (naming hygiene, handled by the .pdx-* convention), not style isolation proper.
   INVESTIGATE: the tab markup uses class "pdx-tab active" -> a bare ".active" is a collision
   risk; prefer state through [aria-selected] or a namespaced class. */
.third-party-btn, .third-party-card {
    padding: 30px;
    background: repeating-linear-gradient(45deg, red, blue 10px);
}
`;

/** The "extreme" variant, for targeted stress tests (not used by default). */
export const HOSTILE_CSS_EXTREME = `
${HOSTILE_CSS}
* { all: revert; }
`;

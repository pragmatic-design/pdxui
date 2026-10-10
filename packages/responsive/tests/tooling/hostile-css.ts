/**
 * HOSTILE CSS for the style-isolation tests (Dimension 3).
 *
 * It simulates a "sloppy" host app with global rules able to break badly isolated components.
 * Pragmatic's components use the Light DOM (no Shadow DOM), and the design system lives in
 * `@layer pdx.*`.
 *
 * WHAT IS PROMISED, AND WHAT IS NOT. A rule outside any layer wins over every layered rule,
 * whatever its specificity: that is the cascade-layers spec, and the design system chose it on
 * purpose (`pragmatic-design.css`: "Consumer's unlayered CSS always wins"). So an unlayered
 * `button { color: lime }` restyles every button, by design, and the certification does not test it.
 * The contract is the other half: a host that puts its global CSS in a layer declared BEFORE the
 * design system's (`@layer host, pdx;`) cannot change anything the design system declares.
 * `HOSTILE_STYLESHEET` is that host. What still changes under it is an element the design system
 * leaves unstyled, so the host's bare `span { … }` reaches it: a real leak of that component.
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

/**
 * The hostile rules as a well-behaved host loads them: in its own layer, declared before the design
 * system's. Must be the FIRST stylesheet of the document: layer order is the order in which the names
 * first appear, so a sheet added after the design system would put `host` above `pdx`.
 */
export const HOSTILE_STYLESHEET = `@layer host, pdx;
@layer host {
${HOSTILE_CSS}
}
`;

/** The "extreme" variant, for targeted stress tests (not used by default). */
export const HOSTILE_CSS_EXTREME = `
${HOSTILE_CSS}
* { all: revert; }
`;

/**
 * MANIFEST — pdx-form-section
 *
 * Contracts written by inspecting the SOURCE (packages/ui/src/form-section/pdx-form-section.ts)
 * and the CSS (packages/design/src/components/form.css, the "pdx-form-section" block, lines 24-62).
 *
 * ⚠️ IT DIVERGES from the brief: the component has NO `title`/`description`/`collapsible` props.
 *    The real API (the source, lines 9-20) is:
 *      - name     : string  → identificazione logica (no DOM)
 *      - label    : string  → the header text (the legend) plus the aria-label on the fieldset
 *      - fields   : string  → a CSV of the fields the section validates (no DOM)
 *      - validate : 'onLeave'|'onSubmit'|'blocking' → the validation timing (no DOM)
 *      - active   : boolean  → when false it adds the class .pdx-form-section-hidden
 *    No "description" prop, no "collapsible" prop, no toggle.
 *
 * DOM structure (NATIVE, render lines 71-81):
 *   <pdx-form-section>                              ← host CE (light DOM)
 *     <fieldset class="pdx-form-section ..."        ← a NATIVE <fieldset> (an implicit group role,
 *               role="group" aria-label="{label}">    an explicit role="group" + a redundant aria-label)
 *       <legend class="pdx-form-section-legend">…   ← rendered ONLY when label() is truthy (the header above)
 *       <div class="pdx-form-section-content">      ← the fields' flex-column container
 *         <slot></slot>                             ← campi slottati
 *       </div>
 *     </fieldset>
 *
 * ACCESSIBILITY — no BUG in the certified happy path:
 *   It uses a NATIVE <fieldset> with an explicit role="group". The accessible name comes from TWO
 *   redundant but consistent sources: the native <legend> AND aria-label="{label}". With `label` set
 *   (as in the scenario) the group HAS a clean accessible name → axe is expected green.
 *   A NOTE (not a bug, an edge outside the contract): with an EMPTY `label` the render emits no <legend> but the
 *   the fieldset gets aria-label="" all the same (an empty string, source line 73 `:aria-label="${ctx.label}"`).
 *   An empty aria-label is inert (assistive technology ignores it), so it raises no violation; it stays an edge
 *   untested here, because `label` is the header's reason to exist.
 *
 * COLLAPSIBLE — a clarification (NOT a bug in the component):
 *   form.css defines .pdx-form-section-collapsible (a ::before chevron, lines 49-62) BUT the
 *   component never emits that class, has no `collapsible` prop, and has no toggle and no
 *   aria-expanded. It is optional CSS a developer can apply by hand, not a feature of the custom element. So
 *   the keyboard pattern is 'none' (no composite widget): the focus is the fields' native one.
 *   → keyboard 'none', no State or aria-expanded to test. (No real bug; only dormant CSS.)
 *
 * CLASSES VERIFIED (source + form.css):
 *   .pdx-form-section         → border 1px solid var(--pdx-color-border), border-radius md, padding lg.
 *   .pdx-form-section-legend  → the text header (font-size sm, weight semibold).
 *   .pdx-form-section-content → display:flex; flex-direction:column; gap md.
 *
 * Universal rules (no theme-specific px): display set, border-width > 0 (a border is always there,
 * there is no borderless variant), radius >= 0 (metro and cyberpunk zero it), a content-driven height
 * → no rigid numeric assertion on the height, only a minimum threshold.
 */
import type { ComponentManifest } from './_types';

export const formSection: ComponentManifest = {
    name: 'form-section',
    tag: 'pdx-form-section',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/form-section'],

    // ── Scenarios ──
    scenarios: [
        {
            // Header (label) + a few deterministic native fields slotted in.
            id: 'form-section-basic',
            title: 'Form Section — Label header + slotted fields',
            html: `
                <div style="max-width: 480px;">
                    <pdx-form-section data-test="form-section" name="contact" label="Contact details">
                        <label class="pdx-field" data-test="field-1">
                            <span>Full name</span>
                            <input type="text" class="pdx-input" value="Mario Rossi" />
                        </label>
                        <label class="pdx-field" data-test="field-2">
                            <span>Email</span>
                            <input type="email" class="pdx-input" value="mario@example.com" />
                        </label>
                    </pdx-form-section>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'form-section-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                        description: 'form-section container is a block-ish box (display set)',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                        description: 'form-section is tall enough to hold legend + two fields',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // A 1px solid border is always there (there is no borderless variant in the source).
                        selector: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                        description: 'form-section has a visible border (width > 0)',
                        border: { all: { width: { op: '>', value: 0 } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                        description: 'form-section has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the legend (the header) ABOVE the content; the fields CONTAINED in the fieldset.
                composition: [
                    {
                        description: 'legend header sits above the content; fields contained within the form-section box',
                        parent: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                        children: {
                            fs: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                            legend: 'section:not([hidden]) [data-test="form-section"] .pdx-form-section-legend',
                            content: 'section:not([hidden]) [data-test="form-section"] .pdx-form-section-content',
                            field1: 'section:not([hidden]) [data-test="field-1"]',
                            field2: 'section:not([hidden]) [data-test="field-2"]',
                        },
                        relations: [
                            {
                                description: 'legend bottom is at/above content top (header renders above the fields)',
                                left: 'legend.bottom',
                                op: '<=',
                                right: 'content.top',
                                tolerance: 2,
                            },
                            {
                                description: 'content area is contained within the form-section box',
                                left: 'content',
                                op: 'contained-in',
                                right: 'fs',
                            },
                            {
                                description: 'first field is contained within the form-section box',
                                left: 'field1',
                                op: 'contained-in',
                                right: 'fs',
                            },
                            {
                                description: 'second field is contained within the form-section box',
                                left: 'field2',
                                op: 'contained-in',
                                right: 'fs',
                            },
                            {
                                description: 'fields stack: second field is below the first',
                                left: 'field1.bottom',
                                op: '<=',
                                right: 'field2.bottom',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
// the group (fieldset role="group") is named by the native <legend> + a consistent aria-label.
        // No disableRule: a clean native pattern with an accessible name.
        scenarios: ['form-section-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'form-section-basic',
        targets: [
            // A content-driven container: the hostile CSS poisons the font and line-height → the fields and the
            // legend reflow and the height follows (which is legitimate, not a containment failure).
            // Skip the height; the border-width and the radius (CSS values, not scaled) stay asserted as the
            // real immunity guarantee — the same pattern as fieldset and card.
            {
                selector: 'section:not([hidden]) [data-test="form-section"] fieldset.pdx-form-section',
                tolerancePx: 10,
                skipHeight: true,
                leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }],
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // It is not a composite widget: no collapsible or toggle (see the header comment), no
        // roving, trap or menu. The focus management is the slotted fields' native one. Pattern: none.
        scenario: 'form-section-basic',
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['form-section-basic'],
        // Masks the inputs' values (the cursor and the text), for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="form-section"] input'],
    },
};

export default formSection;

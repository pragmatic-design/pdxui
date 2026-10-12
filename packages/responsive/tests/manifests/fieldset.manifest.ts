/**
 * MANIFEST — pdx-fieldset
 *
 * Contracts written by inspecting the source (packages/ui/src/fieldset/pdx-fieldset.ts) and the
 * CSS (packages/design/src/surfaces/forms.css, the "Fieldset / Legend" block, lines 383-462).
 *
 * DOM structure (NATIVE, no custom role):
 *   <pdx-fieldset>                          ← host CE (light DOM)
 *     <fieldset class="pdx-fieldset ...">    ← a NATIVE element (an implicit group role)
 *       <legend class="pdx-legend">          ← a NATIVE <legend> → the group's accessible name
 *         <span class="pdx-legend-text">…</span>   ← the legend's text (set through textContent in an rAF)
 *         <button class="pdx-fieldset-toggle">…</button>  ← the collapsible chevron (display:none by default)
 *       </legend>
 *       <div class="pdx-fieldset-description">…</div>  ← display:none when empty
 *       <div class="pdx-fieldset-content"><slot></slot></div>  ← slotted content (fields)
 *       <div class="pdx-fieldset-error" role="alert">…</div>   ← display:none when empty
 *     </fieldset>
 *
 * ACCESSIBILITY — no bug:
 *   It uses a NATIVE <fieldset> + <legend>. The browser derives role="group" from the <fieldset> and uses
 *   the <legend> as the accessible name. No manual aria-labelledby is needed: the native pair is
 *   the right WAI-ARIA pattern (the preferred one, in fact). As long as the `legend` prop is set (as
 *   it is in every scenario here), the group HAS an accessible name. An untested edge: with an empty
 *   `legend` the source does `legendEl.style.display = 'none'` (lines 76-78) → a group with no name; but
 *   that is an edge outside the contract (the legend is the component's reason to exist) and NOT a bug in the
 *   happy path certified here.
 *   The collapsible's toggle: it takes its name from the legend (aria-labelledby) or, with no
 *   legend, from the registered string `fieldset.toggle`; aria-controls points at the content. With
 *   collapsible, the legend stays visible even when empty, because it holds the toggle. The scenario
 *   fieldset-collapsible, covered by axe.
 *
 * CLASSES VERIFIED in the source and in forms.css:
 *   .pdx-fieldset  → border (border-width solid color-border), border-radius md, padding md.
 *                    The -filled and -plain variants ZERO the border (border:none) → the border and radius are
 *                    asserted ONLY in the bordered scenario. All universal, no theme-specific px.
 *   .pdx-legend / .pdx-legend-text / .pdx-fieldset-content / .pdx-fieldset-error / -description.
 *
 * Geometria conservativa cross-tema: display set, border-width >= 0, radius >= 0
 * (metro and cyberpunk zero the radius). The height is content-driven → no rigid numeric assertion.
 */
import type { ComponentManifest } from './_types';

export const fieldset: ComponentManifest = {
    name: 'fieldset',
    tag: 'pdx-fieldset',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/fieldset'],

    // ── Scenarios ──
    scenarios: [
        {
            // Bordered (the default): legend + 2 deterministic native fields slotted in.
            id: 'fieldset-basic',
            title: 'Fieldset — Bordered with legend + fields',
            html: `
                <div style="max-width: 480px;">
                    <pdx-fieldset data-test="fieldset" legend="Shipping address">
                        <label class="pdx-field" data-test="field-1">
                            <span>Street</span>
                            <input type="text" class="pdx-input" value="Via Roma 1" />
                        </label>
                        <label class="pdx-field" data-test="field-2">
                            <span>City</span>
                            <input type="text" class="pdx-input" value="Milano" />
                        </label>
                    </pdx-fieldset>
                </div>`,
        },
        {
            // Collapsible: here the chevron toggle is visible, so it needs a name. With a
            // legend it is named by the legend (aria-labelledby); without one, by the registered
            // string. fieldset-basic hides the toggle, so only this scenario shows it to axe.
            id: 'fieldset-collapsible',
            title: 'Fieldset — Collapsible, with and without a legend',
            html: `
                <div style="max-width: 480px;">
                    <pdx-fieldset data-test="fieldset" legend="Storico 2025" collapsible>
                        <label class="pdx-field" data-test="field-1">
                            <span>Visits</span>
                            <input type="text" class="pdx-input" value="12" />
                        </label>
                    </pdx-fieldset>
                    <pdx-fieldset data-test="fieldset-unnamed" collapsible>
                        <label class="pdx-field">
                            <span>Notes</span>
                            <input type="text" class="pdx-input" value="None" />
                        </label>
                    </pdx-fieldset>
                </div>`,
        },
        {
            // Disabled: the prop reaches the inner <fieldset>, and the native `disabled` disables the
            // controls inside, so the input accepts no text.
            id: 'fieldset-disabled',
            title: 'Fieldset — Disabled',
            html: `
                <div style="max-width: 480px;">
                    <pdx-fieldset data-test="fieldset-dis" legend="Locked section" disabled>
                        <label class="pdx-field">
                            <span>Street</span>
                            <input type="text" class="pdx-input" data-test="dis-input" value="Via Roma 1" />
                        </label>
                    </pdx-fieldset>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'fieldset-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                        description: 'fieldset container is a block-ish box (display set)',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                        description: 'fieldset is tall enough to hold legend + two fields',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // bordered is the default variant → a border is there and radius >= 0.
                        selector: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                        description: 'bordered fieldset has a visible border (width > 0)',
                        border: { all: { width: { op: '>', value: 0 } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                        description: 'fieldset has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the legend ABOVE the content; the fields CONTAINED in the fieldset.
                composition: [
                    {
                        description: 'legend sits above the content, fields contained within the fieldset box',
                        parent: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                        children: {
                            fs: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                            legend: 'section:not([hidden]) [data-test="fieldset"] .pdx-legend',
                            content: 'section:not([hidden]) [data-test="fieldset"] .pdx-fieldset-content',
                            field1: 'section:not([hidden]) [data-test="field-1"]',
                            field2: 'section:not([hidden]) [data-test="field-2"]',
                        },
                        relations: [
                            {
                                description: 'legend bottom is at/above content top (legend renders above the fields)',
                                left: 'legend.bottom',
                                op: '<=',
                                right: 'content.top',
                                tolerance: 2,
                            },
                            {
                                description: 'content area is contained within the fieldset box',
                                left: 'content',
                                op: 'contained-in',
                                right: 'fs',
                            },
                            {
                                description: 'first field is contained within the fieldset box',
                                left: 'field1',
                                op: 'contained-in',
                                right: 'fs',
                            },
                            {
                                description: 'second field is contained within the fieldset box',
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
            // A disabled native fieldset disables the input: `.pdx-input:disabled` has cursor
            // not-allowed and a reduced opacity; the legend fades with it (forms.css).
            'fieldset-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dis-input"]',
                        description: 'the input inside is disabled (cursor not-allowed)',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fieldset-dis"] .pdx-legend-text',
                        description: 'the legend text is dimmed',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The group takes its accessible name from the native <legend>. No disableRule: a clean native pattern.
        // fieldset-collapsible: the visible toggle must have a name (button-name).
        scenarios: ['fieldset-basic', 'fieldset-collapsible', 'fieldset-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'fieldset-basic',
        targets: [
            // A content-driven container: the hostile CSS poisons the font and line-height → the fields and the
            // legend reflow and the height follows (which is legitimate, not a containment failure).
            // Skip the height; the border-width and the radius (CSS values, not scaled) stay asserted as the
            // real immunity guarantee — as for card and dialog.
            {
                selector: 'section:not([hidden]) [data-test="fieldset"] fieldset.pdx-fieldset',
                tolerancePx: 10,
                skipHeight: true,
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // A <fieldset> of native fields alone is not a composite widget: no roving, no trap, no menu.
        // The focus management is the slotted fields' native one. Pattern: none.
        scenario: 'fieldset-basic',
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['fieldset-basic'],
        // Masks the inputs' values (the cursor and any text), for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="fieldset"] input'],
    },
};

export default fieldset;

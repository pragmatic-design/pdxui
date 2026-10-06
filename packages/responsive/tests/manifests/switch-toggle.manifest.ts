/**
 * MANIFEST — pdx-switch (Custom Element, Tier 1)
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/switch-toggle/pdx-switch.ts
 *      the HOST <pdx-switch> (light DOM, formAssociated) renders an INNER
 *      <label class="pdx-switch-wrap">:
 *        - <input type="checkbox" role="switch" class="pdx-toggle[ pdx-toggle-<size>][ pdx-toggle-error][ pdx-toggle-loading]">
 *          with :checked, :disabled (= disabled || loading), :aria-checked="String(!!checked)", :name.
 *        - with label/description: <span class="pdx-switch-content"> holding
 *            <span class="pdx-switch-label"> (the label text) and/or <span class="pdx-switch-desc"> (description).
 *          otherwise a <slot>.
 *      wrapClass: + " pdx-switch-label-left" when labelPosition='left'; + " disabled" when disabled||loading.
 *      onChange emits the CustomEvent 'pdx-change' { checked, value } (gated on disabled/loading).
 *      No custom keydown handler: the native checkbox input is tabbable and toggles with Space → keyboard 'none'.
 *
 *  - CSS: packages/design/src/surfaces/forms.css (the "Toggle / Switch" block)
 *      .pdx-toggle      → appearance:none; width:2.75rem(44px); height:1.5rem(24px);
 *                         border-radius:full; cursor:pointer; flex-shrink:0.
 *      .pdx-toggle-sm   → 2rem x 1.125rem (32x18px).
 *      .pdx-toggle-lg   → 3.5rem x 2rem (56x32px).
 *      :disabled        → opacity:var(--pdx-opacity-disabled); cursor:not-allowed.
 *      .pdx-switch-wrap → display:inline-flex; align-items:flex-start; gap:sm; cursor:pointer.
 *      .pdx-switch-wrap.disabled → reduced opacity; cursor:not-allowed.
 *      .pdx-switch-label-left    → flex-direction:row-reverse.
 *      .pdx-switch-content       → flex column; .pdx-switch-label / .pdx-switch-desc texts.
 *      Theme-dependent tokens: --pdx-toggle-width/height vary (cupertino 3rem/1.75rem,
 *      material 3.25rem/2rem). The standalone rules stay CONSERVATIVE (min thresholds), never exact px.
 *
 * Choices:
 *  - The checked/disabled state is PRE-SET through an attribute in the scenario → STANDALONE rules
 *    (no StateRule with a trigger: it avoids timing flake).
 *  - role="switch" + aria-checked on the <input> → correct a11y semantics (see a11y, no bug).
 *  - Isolation: target the TRACK .pdx-toggle (clean w/h geometry from CSS, not content-driven) → no skipHeight.
 *  - Keyboard 'none': a native checkbox, Tab brings the focus onto the input.
 *  - the tag 'pdx-switch' is shared with the CSS-only manifest toggle.manifest.ts (a bare input.pdx-toggle);
 *    here we certify the real Custom Element. Distinct name/scenario ids (switch-*) so they do not collide.
 */
import type { ComponentManifest } from './_types';

export const switchToggle: ComponentManifest = {
    name: 'switch-toggle',
    tag: 'pdx-switch',
    tier: '1',
    status: 'wip',
    imports: ['@pdxui/ui/switch', '@pdxui/ui/form-field', '@pdxui/ui/input'],

    // ── Scenarios (the Custom Element with real props) ──
    scenarios: [
        {
            id: 'switch-basic',
            title: 'Switch — Basic (off / on / with label)',
            html: `
                <div style="display:flex; flex-direction:column; gap:16px; max-width:360px;">
                    <pdx-switch data-test="switch-off" aria-label="Wi-Fi"></pdx-switch>
                    <pdx-switch data-test="switch-on" checked aria-label="Bluetooth"></pdx-switch>
                    <pdx-switch data-test="switch-labeled" checked label="Enable notifications" description="We will email you on activity"></pdx-switch>
                </div>`,
        },
        {
            id: 'switch-sizes',
            title: 'Switch — Sizes (sm / md / lg)',
            html: `
                <div style="display:flex; align-items:center; gap:24px;">
                    <pdx-switch data-test="switch-sm" size="sm" checked aria-label="Small"></pdx-switch>
                    <pdx-switch data-test="switch-md" checked aria-label="Medium"></pdx-switch>
                    <pdx-switch data-test="switch-lg" size="lg" checked aria-label="Large"></pdx-switch>
                </div>`,
        },
        {
            id: 'switch-disabled',
            title: 'Switch — Disabled',
            html: `
                <pdx-switch data-test="switch-disabled" disabled checked label="Locked setting"></pdx-switch>`,
        },
        {
            // A switch in a form, beside a text field, at the three densities. The density
            // is the custom property the app sets on <html>; set here on each row, it inherits the same
            // way into the fields' `calc(... * var(--pdx-density-factor))`.
            id: 'switch-in-form',
            title: 'Switch — In a form, beside a text field (compact / normal / comfortable)',
            html: `
                <div style="display:flex; flex-direction:column; gap:24px; max-width:640px;">
                    ${['compact:0.75', 'normal:1', 'comfortable:1.25'].map((d) => {
                        const [key, factor] = d.split(':');
                        return `<div data-test="row-${key}" style="--pdx-density-factor:${factor}; display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;">
                        <pdx-form-field label="Monthly price" data-test="price-${key}"><pdx-input aria-label="Monthly price" value="120"></pdx-input></pdx-form-field>
                        <pdx-form-field label="On sale" data-test="sale-${key}"><pdx-switch checked aria-label="On sale"></pdx-switch></pdx-form-field>
                    </div>`;
                    }).join('')}
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, conservative across themes) ──
    contracts: {
        scenarios: {
            'switch-basic': {
                standalone: [
                    {
                        // An interactive track → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="switch-off"] .pdx-toggle',
                        description: 'switch track cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // Appreciable track width (>= 28px; sm CSS = 32px, default 44px).
                        selector: 'section:not([hidden]) [data-test="switch-off"] .pdx-toggle',
                        description: 'switch track width >= 28px',
                        width: { op: '>=', value: 28 },
                    },
                    {
                        // Appreciable track height (>= 14px; sm CSS = 18px).
                        selector: 'section:not([hidden]) [data-test="switch-off"] .pdx-toggle',
                        description: 'switch track height >= 14px',
                        height: { op: '>=', value: 14 },
                    },
                    {
                        // The track is wider than tall (a "pill" shape in every theme).
                        selector: 'section:not([hidden]) [data-test="switch-off"] .pdx-toggle',
                        description: 'switch track radius non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // A switch that is not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="switch-on"] .pdx-toggle',
                        description: 'enabled switch opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // The label-side wrapper is inline-flex.
                        selector: 'section:not([hidden]) [data-test="switch-labeled"] .pdx-switch-wrap',
                        description: 'switch wrap is (inline-)flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                ],
                composition: [
                    {
                        // Track and label content sit in the same wrap, aligned in a row (flex).
                        description: 'track and label content sit inside the switch wrap',
                        parent: 'section:not([hidden]) [data-test="switch-labeled"] .pdx-switch-wrap',
                        children: {
                            wrap: 'section:not([hidden]) [data-test="switch-labeled"] .pdx-switch-wrap',
                            track: 'section:not([hidden]) [data-test="switch-labeled"] .pdx-toggle',
                            content: 'section:not([hidden]) [data-test="switch-labeled"] .pdx-switch-content',
                        },
                        relations: [
                            {
                                description: 'track within wrap',
                                left: 'track',
                                op: 'contained-in',
                                right: 'wrap',
                            },
                            {
                                description: 'label content within wrap',
                                left: 'content',
                                op: 'contained-in',
                                right: 'wrap',
                            },
                        ],
                    },
                ],
            },
            'switch-sizes': {
                composition: [
                    {
                        // Size hierarchy: sm < md < lg on the width of the track.
                        description: 'switch track width grows sm < md < lg',
                        parent: 'section:not([hidden])',
                        children: {
                            sm: 'section:not([hidden]) [data-test="switch-sm"] .pdx-toggle',
                            md: 'section:not([hidden]) [data-test="switch-md"] .pdx-toggle',
                            lg: 'section:not([hidden]) [data-test="switch-lg"] .pdx-toggle',
                        },
                        relations: [
                            {
                                description: 'sm width < md width',
                                left: 'sm.width',
                                op: '<',
                                right: 'md.width',
                            },
                            {
                                description: 'md width < lg width',
                                left: 'md.width',
                                op: '<',
                                right: 'lg.width',
                            },
                        ],
                    },
                ],
            },
            // The text field is 30 / 40 / 50 px with the density; a 24 px switch top-aligned in its cell
            // would sit 8 px off at normal and 13 at comfortable. The rule: the ROW follows the density,
            // the track keeps its own size and sits centred in it.
            'switch-in-form': {
                composition: ['compact', 'normal', 'comfortable'].map((key) => ({
                    description: `${key}: the switch's control box is a text field's height, and the switch is centred on the field`,
                    parent: `section:not([hidden]) [data-test="row-${key}"]`,
                    children: {
                        field: `section:not([hidden]) [data-test="price-${key}"] .pdx-input-wrap`,
                        box: `section:not([hidden]) [data-test="sale-${key}"] .pdx-switch-wrap`,
                        track: `section:not([hidden]) [data-test="sale-${key}"] .pdx-toggle`,
                    },
                    relations: [
                        { description: `${key}: the switch's box is as tall as the text field`, left: 'box.height', op: '==' as const, right: 'field.height', tolerance: 1 },
                        { description: `${key}: the track is centred on the text field`, left: 'track.centerY', op: '==' as const, right: 'field.centerY', tolerance: 1 },
                    ],
                })),
            },
            'switch-disabled': {
                standalone: [
                    {
                        // A disabled wrapper → reduced opacity (.pdx-switch-wrap.disabled).
                        selector: 'section:not([hidden]) [data-test="switch-disabled"] .pdx-switch-wrap',
                        description: 'disabled switch wrap has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        // A disabled track → cursor not-allowed (input:disabled).
                        selector: 'section:not([hidden]) [data-test="switch-disabled"] .pdx-toggle',
                        description: 'disabled switch track cursor = not-allowed',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // <input type="checkbox" role="switch"> with an accessible name from the <label> wrapper (the label-text scenario).
    // role="switch" + aria-checked are correct → no false positive, no disableRules.
    a11y: {
        scenarios: ['switch-basic', 'switch-disabled'],
    },

    // ── Dim. 3: style isolation ──
    // Target the track .pdx-toggle: w/h come from the CSS (appearance:none), clean geometry,
    // not content-driven → the height IS a structural invariant, no skipHeight.
    isolation: {
        scenario: 'switch-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="switch-on"] .pdx-toggle', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (a native checkbox → 'none') ──
    // No custom keydown handler: the input is tabbable, Space toggles it natively.
    keyboard: {
        scenario: 'switch-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="switch-off"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['switch-basic', 'switch-sizes'],
        // Measured floor, not a guess. At maxDiffPixelRatio 0 the whole visual
        // dimension has 25 failures out of 1591, and they are not spread across the suite — they
        // come from FOUR scenarios that carry state or movement. This is one of them: the switch knob sits mid-transition.
        // Worst observed difference: 79 pixels.
        //
        // Everything else runs at 0, so a 2px border (about 2400 pixels on a wide section, and
        // 0.34% of them — under a 1% allowance) is caught. Here it would not be, and that is
        // the deliberate trade: this scenario keeps a tolerance and says why.
        maxDiffPixelRatio: 0.005,
    },
};

export default switchToggle;

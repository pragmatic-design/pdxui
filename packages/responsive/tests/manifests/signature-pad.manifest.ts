/**
 * MANIFEST — pdx-signature-pad (#1019)
 *
 * Derived from:
 *  - source: packages/ui/src/signature-pad/pdx-signature-pad.pdx
 *      the HOST <pdx-signature-pad> :state(empty|typing|disabled|readonly|invalid) → an inner
 *        <div class="pdx-signature-pad" data-part="root" role="group" aria-label>
 *          <div data-part="toolbar"> two <button data-part="modeButton" aria-pressed> (Draw, Type)
 *          <input data-part="nameInput"> only in the Type mode
 *          <div class="pdx-signature-surface" data-part="surface">
 *            <canvas data-part="pad" role="img" aria-label="Signature, empty" tabindex="0">
 *            <span data-part="guide"> · <span data-part="prompt"> while empty
 *          <div class="pdx-signature-actions"> Undo, Clear (disabled while there is nothing to take off)
 *  - CSS: packages/design/src/components/signature-pad.css
 *      .pdx-signature-surface → height var(--pdx-signature-height) (10rem), paper background, border.
 *      .pdx-signature-canvas → width/height 100% of the surface; touch-action: none.
 *      :state(disabled) > .pdx-signature-pad → opacity var(--pdx-opacity-disabled).
 *
 * Conservative rules: only invariants true on all themes, no exact px.
 */
import type { ComponentManifest } from './_types';

export const signaturePad: ComponentManifest = {
    name: 'signature-pad',
    tag: 'pdx-signature-pad',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/signature-pad'],

    scenarios: [
        {
            id: 'signature-pad-basic',
            title: 'Signature pad — Basic',
            html: `<div style="max-width: 420px;"><pdx-signature-pad data-test="sig" label="Customer signature"></pdx-signature-pad></div>`,
        },
        {
            id: 'signature-pad-disabled',
            title: 'Signature pad — Disabled',
            html: `<div style="max-width: 420px;"><pdx-signature-pad data-test="sig" label="Customer signature" disabled></pdx-signature-pad></div>`,
        },
    ],

    contracts: {
        scenarios: {
            'signature-pad-basic': {
                standalone: [
                    {
                        // A surface a finger can sign on: 10rem by default.
                        selector: 'section:not([hidden]) [data-test="sig"] [data-part="surface"]',
                        description: 'the surface is at least 120px tall',
                        height: { op: '>=', value: 120 },
                    },
                    {
                        // touch-action: none on the canvas — the page does not scroll under the pen.
                        selector: 'section:not([hidden]) [data-test="sig"] [data-part="pad"]',
                        description: 'the canvas is a crosshair to draw on',
                        cursor: { op: 'is', value: 'crosshair' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sig"] [data-part="root"]',
                        description: 'an enabled pad is opaque',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The canvas fills its surface: what is drawn is where the paper is.
                        description: 'the canvas fills the surface',
                        parent: 'body',
                        children: {
                            surface: '[data-test="sig"] [data-part="surface"]',
                            pad: '[data-test="sig"] [data-part="pad"]',
                        },
                        relations: [
                            { description: 'pad width ≈ surface width', left: 'pad.width', op: '<=', right: 'surface.width', tolerance: 0 },
                            { description: 'pad height ≈ surface height', left: 'pad.height', op: '<=', right: 'surface.height', tolerance: 0 },
                            { description: 'pad fills the width (within the border)', left: 'pad.width', op: '>=', right: 'surface.width', tolerance: 2 },
                        ],
                    },
                ],
            },
            'signature-pad-disabled': {
                standalone: [
                    {
                        // :state(disabled) > .pdx-signature-pad → opacity var(--pdx-opacity-disabled).
                        selector: 'section:not([hidden]) [data-test="sig"] [data-part="root"]',
                        description: 'a disabled pad has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ── the group and the canvas are named by the label.
    a11y: {
        scenarios: ['signature-pad-basic', 'signature-pad-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'signature-pad-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="sig"] [data-part="surface"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── Draw, Type, then the canvas; Undo and Clear are disabled while it is empty.
    keyboard: {
        scenario: 'signature-pad-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="sig"] [data-part="modeButton"]:first-child' },
            { key: 'Tab', expectFocus: '[data-test="sig"] [data-part="modeButton"]:last-child' },
            { key: 'Tab', expectFocus: '[data-test="sig"] [data-part="pad"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['signature-pad-basic'],
    },
};

export default signaturePad;

/**
 * MANIFEST — pdx-color-picker (tier 3, a colour picker with a swatch trigger and a floating popover)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/color-picker/pdx-color-picker.ts)
 * and the CSS (packages/design/src/components/color-picker.css).
 *
 * ── DOM structure (light DOM, render() in pdx-color-picker.ts:248) ──
 *   <pdx-color-picker>                                   ← host, display:inline-block, position:relative (CSS:24-27)
 *     <button class="pdx-color-swatch [pdx-color-swatch--{size}]"  ← TRIGGER: box 32×32 (CSS:32-48), a native <button>
 *             type="button" role="button"
 *             aria-label="{label}|'Pick color'"          ← an accessible name is always there (render:252)
 *             aria-expanded="false|true"                 ← String(_open) (render:253)
 *             aria-disabled="true"|—                     ← only when disabled (render:254)
 *             style="--pdx-cp-current: {hex}"            ← the current colour through a custom property; ::after paints it (CSS:51-58)
 *             @click=togglePopup>                        ← rendered ONLY when !inline (render:249)
 *     <div class="pdx-color-panel [pdx-color-panel--inline]"  ← THE PANEL: a 240px box (CSS:83-90)
 *          style="display:none">                         ← popup closed → display:none inline (render:259);
 *                                                            open → the inline style is emptied → display:block (CSS)
 *       <div class="pdx-color-spectrum" role="slider"    ← the 2D saturation/value AREA (160px), a deterministic gradient
 *            aria-label="Color" :aria-valuetext :style="--pdx-cp-hue:hsl(...)"
 *            @pointerdown=onSpectrumDown>
 *         <div class="pdx-color-spectrum-white"/>         ← note: the CSS uses ::before/::after, these divs are inert
 *         <div class="pdx-color-spectrum-black"/>
 *         <div class="pdx-color-spectrum-thumb" .../>
 *       <div class="pdx-color-hue-slider" role="slider"   ← SLIDER hue (rainbow bar 12px)
 *            aria-label="Hue" aria-valuemin="0" aria-valuemax="360" :aria-valuenow
 *            @pointerdown=onHueDown>
 *         <div class="pdx-color-slider-thumb" .../>
 *       [ <div class="pdx-color-alpha-slider" role="slider" aria-label="Opacity" ...> ]?  ← only when showAlpha
 *       <div class="pdx-color-controls">                  ← the input+clear row (the class is not in the CSS, it is inert)
 *         <input class="pdx-color-hex-input pdx-input"     ← the hex INPUT, aria-label "Hex color"
 *                type="text" :value="{displayValue}" @change=onHexInput>
 *         [ <button class="pdx-color-clear" aria-label="Clear color" @click=onClear>×</button> ]?  ← only when clearable
 *       [ <div class="pdx-color-presets" role="group" aria-label="Color presets">  ← only when presets.length
 *           <button class="pdx-color-preset" :aria-label="{c}" :style="background:{c}" @click=onPresetClick>… ]?
 *     [ <input type="hidden" :name :value="{hex}"> ]?     ← form participation, only when the name prop is set
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The popover is NOT portalled to document.body. usePopover is created with `container: ctx.el`
 *   (pdx-color-picker.ts:210) → the swatch trigger and the `.pdx-color-panel` are SIBLINGS in the host's light DOM.
 *   So the panel's selectors CAN stay section-scoped like every other element's.
 *   usePopover sets `position`/`top`/`left` inline (placement 'bottom-start', offset 4, flip) → the panel
 *   FLOATS, positioned under the trigger. Closed-to-open visibility is driven by the inline style `display:none`
 *   (render:259): closed applies it, open empties it (→ display:block from the .pdx-color-panel CSS).
 *   A PRECAUTION: a SINGLE "open" scenario is used (cp-open) for the overlay and the keyboard, so there are never two
 *   floating panels open at once, fighting over selectors and positioning.
 *
 * ── Opening (CRITICAL — deterministic through the setup) ──
 *   togglePopup() on a click on the swatch (render:256) → _open toggles. The host also exposes TWO methods
 *   programmatic ones: `el.open()` and `el.close()` (pdx-color-picker.ts:236-237). The cp-open scenario is opened
 *   by calling `host.open()` in the setup (a method VERIFIED on the host) → _open=true → the effect (render:216)
 *   calls popover.open() and clears the inline display:none → the panel is visible under the trigger.
 *   dismissOnOutside:true + dismissOnEscape:true (pdx-color-picker.ts:209-210).
 *
 * ── DETERMINISM ──
 *   value="#4a6fa5" is fixed in EVERY scenario → the swatch (--pdx-cp-current) and the spectrum (--pdx-cp-hue) have a
 *   stable colour and gradient for the visual dimension. The spectrum uses deterministic CSS gradients (::before/::after),
 *   with no random content. displayValue = the hex (the default format) → the input's text is stable.
 *
 * ── a11y ──
 *   The swatch trigger: a <button> + aria-haspopup="dialog" + an aria-label that is always set ('Pick color' by default).
 *   The panel (the popup): role="dialog" + aria-label; on opening, the focus goes to the colour area.
 *   Spectrum: role="slider" + aria-valuenow/min/max = saturation 0–100, aria-valuetext "Saturation …%,
 *     brightness …%, {colour}" (the APG 2D pattern). Hue and opacity: sliders with
 *     valuenow/min/max. All three are tabindex="0" (−1 when disabled or readonly) with arrows, PageUp/Down and Home/End.
 *   The hex input: aria-label "Hex color".
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the swatch is a visible, square, interactive box (cursor pointer) with radius >= 0;
 *   · open: the panel is VISIBLE (display block, a noticeable width) and sits UNDER the trigger (an overlay, no backdrop);
 *   · the spectrum and the hue slider are contained in the panel.
 */
import type { ComponentManifest } from './_types';

export const colorPicker: ComponentManifest = {
    name: 'color-picker',
    tag: 'pdx-color-picker',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/color-picker'],

    // ── Scenarios ──
    scenarios: [
        {
            // Closed: popup mode, the swatch visible with the fixed current colour. The default size, nothing inline.
            id: 'cp-closed',
            title: 'Color Picker — Closed (swatch trigger)',
            html: `
                <pdx-color-picker data-test="cp"
                    label="Pick a color"
                    value="#4a6fa5"></pdx-color-picker>`,
        },
        {
            // The ONE open scenario: the floating panel is made visible by the setup (opened programmatically).
            // el.open() is exposed on the host (pdx-color-picker.ts:236). Called after the mount.
            // presets are set, to exercise the preset grid (role="group").
            id: 'cp-open',
            title: 'Color Picker — Open (spectrum + hue slider + hex input panel below trigger)',
            html: `
                <pdx-color-picker data-test="cp-open"
                    label="Pick a color"
                    value="#4a6fa5"
                    presets='["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"]'></pdx-color-picker>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="cp-open"]');
                if (host && typeof host.open === 'function') host.open();`,
        },
        {
            id: 'cp-disabled',
            title: 'Color Picker — Disabled swatch',
            html: `
                <pdx-color-picker data-test="cp-dis"
                    label="Pick a color"
                    disabled
                    value="#4a6fa5"></pdx-color-picker>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'cp-closed': {
                standalone: [
                    {
                        // CSS:32 → display:inline-block → a visible box (not 'none').
                        selector: 'section:not([hidden]) [data-test="cp"] .pdx-color-swatch',
                        description: 'swatch trigger is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:40 → cursor:pointer → interactive.
                        selector: 'section:not([hidden]) [data-test="cp"] .pdx-color-swatch',
                        description: 'swatch trigger is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // CSS:35-36 → 32×32 (the default size). A noticeable box, not collapsed.
                        selector: 'section:not([hidden]) [data-test="cp"] .pdx-color-swatch',
                        description: 'swatch has an appreciable width',
                        width: { op: '>=', value: 16 },
                    },
                    {
                        // CSS:39 → a border-radius from a token; the radius-zero themes zero it, never below 0.
                        selector: 'section:not([hidden]) [data-test="cp"] .pdx-color-swatch',
                        description: 'swatch radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
            },

            // Open: the panel (display:block, the inline display:none emptied) sits UNDER the trigger.
            // An overlay with no backdrop (a popover, not a modal). The panel is ALREADY open from the setup (el.open) →
            // action:'call' = the state is on, and the runner measures without interacting further.
            'cp-open': {
                standalone: [
                    {
                        // The inline display:none is emptied on opening → the .pdx-color-panel CSS goes back to display:block.
                        selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                        description: 'open panel is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:84 → width:240px → a measurable width.
                        selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                        description: 'open panel has an appreciable width',
                        width: { op: '>=', value: 120 },
                    },
                    {
                        // Spectrum visibile (area 2D saturazione/valore).
                        selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-spectrum',
                        description: 'saturation/value spectrum area is displayed',
                        display: { op: 'isNot', value: 'none' },
                    },
                ],
                overlay: [
                    {
                        description: 'open color picker shows the floating panel without a backdrop',
                        // action:'call' → the state is already on from the setup (el.open); the runner does NOT click.
                        trigger: { selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-swatch', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (a sibling of the swatch in the light DOM, positioned by usePopover with placement
                        // 'bottom-start') sits UNDER the trigger. Both are children of the host.
                        description: 'panel sits below the swatch trigger',
                        parent: 'section:not([hidden]) [data-test="cp-open"]',
                        // Scoped like the parent: the bare swatch class finds a hidden scenario's
                        // swatch (0×0), and `0 <= panel.top` would hold without measuring.
                        children: {
                            swatch: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-swatch',
                            panel: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                        },
                        relations: [
                            { description: 'panel.top >= swatch.bottom (below)', left: 'swatch.bottom', op: '<=', right: 'panel.top', tolerance: 2 },
                        ],
                    },
                    {
                        // The spectrum and the hue slider live inside the panel.
                        description: 'spectrum and hue slider are contained within the panel',
                        parent: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                        children: {
                            panel: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-panel',
                            spectrum: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-spectrum',
                            hue: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-hue-slider',
                        },
                        relations: [
                            { description: 'spectrum within panel', left: 'spectrum', op: 'contained-in', right: 'panel' },
                            { description: 'hue slider within panel', left: 'hue', op: 'contained-in', right: 'panel' },
                            { description: 'hue slider below the spectrum (stacked column)', left: 'spectrum.bottom', op: '<=', right: 'hue.top', tolerance: 2 },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone. CSS:74-79 → cursor:not-allowed + pointer-events:none.
            'cp-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="cp-dis"] .pdx-color-swatch',
                        description: 'disabled swatch is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: the swatch is role="button" with an accessible name from its aria-label (always set).
    // Open: the spectrum and the hue slider have role="slider" + aria-label + aria-value*; the preset group has an aria-label.
    // The hex input is named by its aria-label. The axe rules are NOT disabled: if axe reports an unnamed
    //   field (label/aria-input-field-name) it must fail. No disableRule, so no real bug is masked.
    a11y: {
        scenarios: ['cp-closed', 'cp-open'],
    },

    // ── Dim. 3: style isolation ──
    // The swatch is a sized box (32×32) → it keeps its geometry under hostile global CSS.
    // skipHeight: some themes, and the hostile CSS, can touch box-sizing and line-height; the height is not an absolute
    //   structural invariant here (the radius — a CSS value, not scaled — stays asserted). A generous tolerance.
    isolation: {
        scenario: 'cp-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="cp"] .pdx-color-swatch', tolerancePx: 4, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (the three sliders and Escape) ──
    // The colour area, the hue and the opacity are tab stops moved by the arrows, not pointer-only
    //   with tabIndex -1, which would leave the hex field as the only keyboard path. The panel is a dialog and on opening the
    //   focus goes to the colour area. #4a6fa5 = saturation 55,15 → ArrowRight 56; hue 215,6 → 217.
    // usePopover (dismissOnEscape) closes on Escape and returns the focus to the swatch.
    // Not modal, no trap → pattern 'none' with custom steps.
    keyboard: {
        scenario: 'cp-open',
        initialFocus: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-spectrum',
        steps: [
            { key: 'ArrowRight', expectAttr: { selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-spectrum', name: 'aria-valuenow', value: '56' } },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-hue-slider' },
            { key: 'ArrowRight', expectAttr: { selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-hue-slider', name: 'aria-valuenow', value: '217' } },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-hex-input' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-swatch',
                expectAttr: { selector: 'section:not([hidden]) [data-test="cp-open"] .pdx-color-swatch', name: 'aria-expanded', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — one scenario (the open one) ──
    // A fixed value (#4a6fa5) → a deterministic swatch and spectrum gradient. The hex input is masked (it may show a caret).
    visual: {
        scenarios: ['cp-open'],
        mask: ['section:not([hidden]) [data-test="cp-open"] .pdx-color-hex-input'],
    },
};

export default colorPicker;

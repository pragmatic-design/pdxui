/**
 * MANIFEST — pdx-time-picker (tier 4, a SEGMENTED time input — NOT a dropdown)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/time-picker/pdx-time-picker.ts)
 * and the CSS (packages/design/src/components/time-picker.css).
 *
 * ⚠️ NOT A DROPDOWN (CRITICAL — read this first):
 *   There is no "input + dropdown with hour/minute lists role=listbox/option, a popover on body,
 *   opened through a method or a click". pdx-time-picker is an inline SEGMENTED INPUT (spinbutton style): every segment
 *   (hours / minutes / [seconds] / [AM-PM]) is a <div role="spinbutton"> edited with the up/down arrows.
 *   There is NO dropdown, NO listbox/option, NO overlay, NO backdrop, NO opening.
 *   Consequently: no "opened through setup" scenario, no OverlayRule, no opening/Escape
 *   keyboard.
 *
 * ── DOM structure (light DOM; built ONCE in a requestAnimationFrame, src:177-220) ──
 *   <pdx-time-picker>                                       ← the host (render: () => html``, empty)
 *     <div class="pdx-time-picker [pdx-time-picker-{size}] [disabled]"  ← WRAP: inline-flex, border, radius (CSS:3-13)
 *          role="group" aria-label="{ariaLabel|'Time picker'}">          ← the group's accessible name (src:190-191)
 *       <div class="pdx-time-col">                          ← the hours SEGMENT column
 *         <button class="pdx-time-arrow pdx-time-arrow-up"  ← up arrow: tabindex=-1, aria-hidden=true (src:243-250)
 *                 type="button" tabindex="-1" aria-hidden="true">▲</button>
 *         <div class="pdx-time-value"                       ← the VALUE: focusable, editable (src:253-264)
 *              role="spinbutton" tabindex="0|-1"            ← tabindex=-1 ONLY when disabled (src:256)
 *              aria-label="Hour"                            ← the segment's localized label (src:257)
 *              aria-valuenow="…">00</div>                   ← updated reactively (src:230-233)
 *         <button class="pdx-time-arrow pdx-time-arrow-down" …>▼</button>
 *       <span class="pdx-time-separator" aria-hidden="true">:</span>     ← the separator (src:279-285)
 *       <div class="pdx-time-col"> … minutes (aria-label="Minute") … </div>
 *       [ <span class="pdx-time-separator">:</span>
 *         <div class="pdx-time-col"> … seconds … </div> ]?  ← only with showSeconds
 *       [ <div class="pdx-time-col pdx-time-period-col"> … AM/PM (aria-label="AM/PM") … </div> ]?  ← only in 12h
 *       [ <input type="hidden" name value> ]?               ← only with the name prop (form participation)
 *
 * ── There is NO opening / overlay / dropdown ──
 *   The component is always fully visible inline. No openX method on ctx.el, no popover,
 *   no document.body. → A SINGLE closed/static scenario; no "opened through setup" scenario.
 *
 * ── DETERMINISM (CRITICAL) ──
 *   · value="14:30" FIXED + format="24h" FIXED. 12h/24h is auto-detected from the locale (is12HourClock,
 *     src:45-50): without an explicit format the number of segments (and therefore the selectors) would depend
 *     on the runner's locale → NOT deterministic. With format="24h": hours=14, minutes=30, NO
 *     period segment. parseTime sets _hour=14 (24h does not remap, src:58-62).
 *   · The value is parsed in a setTimeout(0) (src:65) and the DOM is built in a rAF (src:177): both
 *     asynchronous. The runner already waits (waitUntil networkidle + waitForTimeout) → the selectors
 *     .pdx-time-picker / .pdx-time-value are stable when the runner measures.
 *
 * ── a11y (verified) ──
 *   role="group" with aria-label (src:190-191) → a container with an accessible name.
 *   Every .pdx-time-value: role="spinbutton" + aria-label (Hour/Minute/Second/AM-PM) + aria-valuenow.
 *   The arrows are aria-hidden + tabindex=-1 → they enter neither the tab order nor the a11y tree.
 *   ⚠️ aria-valuemin/aria-valuemax are NOT set on the spinbuttons (a note, not blocking).
 *
 * ── Keyboard (verified, src:152-159) ──
 *   ArrowUp → increments the focused segment (aria-valuenow changes); ArrowDown → decrements.
 *   Digit/Tab are handled; NO Enter, NO Escape (there is nothing to open or close). The closest
 *   WAI-ARIA pattern: spinbutton → steps that check aria-valuenow changing under the arrows (deterministic: value=14:30 → hours=14,
 *   ArrowUp → 15). initialFocus on the hours segment.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants universal across the 13 themes:
 *   · the wrap is a visible inline-flex box, radius >= 0 (metro zeroes it, never < 0);
 *   · the segments (spinbuttons) are contained in the wrap, aligned in a row (hours.left <= minutes.left);
 *   · the segments have an interactive cursor (text) and are visible.
 */
import type { ComponentManifest } from './_types';

export const timePicker: ComponentManifest = {
    name: 'time-picker',
    tag: 'pdx-time-picker',
    tier: '4',
    status: 'wip',
    imports: ['@pdxui/ui/time-picker'],

    // ── Scenarios ──
    // A SINGLE scenario: the component is always inline and visible, it has no "open" state.
    // format="24h" FIXED → 2 segments (hours, minutes), no period → deterministic selectors.
    scenarios: [
        {
            id: 'time-picker-default',
            title: 'Time Picker — 24h, value 14:30 (segmented spinbutton input)',
            html: `
                <pdx-time-picker data-test="tp"
                    value="14:30"
                    format="24h"
                    aria-label="Meeting time">
                </pdx-time-picker>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'time-picker-default': {
                standalone: [
                    {
                        // CSS:4 → .pdx-time-picker { display: inline-flex } → box visibile.
                        selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-picker',
                        description: 'time picker wrap is a visible inline-flex box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:8 → border-radius: var(--pdx-radius-md). Non-negative (metro zeroes it, never < 0).
                        selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-picker',
                        description: 'time picker wrap radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                    {
                        // CSS:75 → .pdx-time-value { cursor: text } → an editable segment (interactive).
                        selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-value',
                        description: 'segment is an editable interactive field (cursor text)',
                        cursor: { op: 'is', value: 'text' },
                    },
                ],
                composition: [
                    {
                        // The segments (spinbuttons) and the separators live inside the wrap, in a row.
                        // first = segmento ORE, last = segmento MINUTI (format 24h → 2 segmenti).
                        description: 'segments are contained in the wrap and laid out left-to-right',
                        parent: 'section:not([hidden]) [data-test="tp"] .pdx-time-picker',
                        children: {
                            wrap: 'section:not([hidden]) [data-test="tp"] .pdx-time-picker',
                            hour: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(1) .pdx-time-value',
                            minute: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(2) .pdx-time-value',
                        },
                        relations: [
                            { description: 'hour segment within wrap', left: 'hour', op: 'contained-in', right: 'wrap' },
                            { description: 'minute segment within wrap', left: 'minute', op: 'contained-in', right: 'wrap' },
                            { description: 'hour is to the left of minute', left: 'hour.left', op: '<=', right: 'minute.left' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="group" + aria-label="Meeting time" (the scenario fills aria-label in) → an accessible name.
    // Every spinbutton has aria-label + aria-valuenow. The arrows are aria-hidden+tabindex=-1.
    // No disableRule: I am not masking real bugs.
    a11y: {
        scenarios: ['time-picker-default'],
    },

    // ── Dim. 3: style isolation ──
    // The wrap (.pdx-time-picker) must keep its box under hostile global CSS. The height depends on the
    // content (padding + the segments' height + the host's line-height) → not a clean structural invariant →
    // skipHeight. The radius (a CSS value, not scaled) stays asserted. A generous tolerance on the box.
    isolation: {
        scenario: 'time-picker-default',
        targets: [
            { selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-picker', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (spinbutton — NOT listbox/menu/dialog) ──
    // No opening or closing: ArrowUp/ArrowDown on the focused segment change aria-valuenow.
    // value="14:30" + format="24h" → ore=14. initialFocus = segmento ore. ArrowUp → 15, ArrowDown → 14.
    // The steps check aria-valuenow.
    keyboard: {
        scenario: 'time-picker-default',
        initialFocus: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(1) .pdx-time-value',
        steps: [
            // ArrowUp: ore 14 → 15.
            { key: 'ArrowUp', expectAttr: { selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(1) .pdx-time-value', name: 'aria-valuenow', value: '15' } },
            // ArrowDown: hours 15 → 14 (back to the initial value).
            { key: 'ArrowDown', expectAttr: { selector: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(1) .pdx-time-value', name: 'aria-valuenow', value: '14' } },
            // The focus stays on the hours segment after the arrows (the arrows do not move it).
            { key: 'ArrowUp', expectFocus: 'section:not([hidden]) [data-test="tp"] .pdx-time-col:nth-of-type(1) .pdx-time-value' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — a single scenario ──
    visual: {
        scenarios: ['time-picker-default'],
    },
};

export default timePicker;

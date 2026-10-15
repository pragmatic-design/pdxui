/**
 * MANIFEST — pdx-wizard
 *
 * Contracts DERIVED by inspecting the source + CSS:
 *
 *   - Source: packages/ui/src/wizard/pdx-wizard.ts
 *       · Compound: the CE discovers the [data-wizard-step] children (discoverSteps, lines 51-60) and
 *         auto-generates the stepper header + the navigation footer in a rAF.
 *       · render() = <slot></slot>: the step panels are projected as direct children
 *         of the <pdx-wizard> HOST (light DOM). In a rAF the host receives the class `.pdx-wizard`
 *         (line 305) + `.pdx-wizard-vertical` when orientation=vertical.
 *       · STEPPER (buildStepper, lines 106-168):
 *           <nav class="pdx-stepper" role="tablist" aria-label="Wizard steps"
 *                aria-orientation="horizontal|vertical">
 *             <button class="pdx-step" role="tab" data-step-btn="i"
 *                     aria-label="<label> — <desc>" id="pdx-wizard-<n>-step-i"
 *                     aria-controls="<the id of panel i>">   ← <n> is per instance
 *               <span class="pdx-step-number">      ← 1,2,3… or ✓/an icon when done
 *               <span class="pdx-step-label">…</span>
 *             </button>
 *             <span class="pdx-step-connector" data-connector="i"></span>  ← horizontal only, between steps
 *             …
 *           </nav>
 *         updateStepper (lines 206-244) sets on every btn:
 *           data-status="done" (i<current) | "active" (i==current) | "" (in the future)
 *           aria-selected="true|false", tabindex="0" (the active one only) | "-1"  → ROVING.
 *           num.textContent = ✓/an icon when done, an icon when active, otherwise String(i+1).
 *         The connectors with i<current receive data-connector + data-status="done".
 *       · PANELS (updatePanels, lines 247-257): every [data-wizard-step] →
 *           role="tabpanel", aria-hidden="true|false", display:none when not active,
 *           id="pdx-wizard-<n>-panel-i" (or the one the author wrote). The active step is the only visible one.
 *       · FOOTER (buildNav lines 171-203 + updateNav lines 260-286):
 *           <div class="pdx-wizard-nav" role="navigation" aria-label="Wizard navigation">
 *             <button class="pdx-ghost" data-wizard-back>   ← textContent "Back" (rAF); size="sm" only on a small wizard
 *             <span class="pdx-wizard-indicator" data-wizard-indicator>  ← "Step N of M"
 *             <button class="pdx-primary|pdx-success" data-wizard-next>  ← "Next"/"Complete" (rAF)
 *           On the FIRST step backBtn has visibility:hidden + disabled.
 *       · Events: pdx-before-change (cancelable), pdx-change, pdx-complete.
 *       · Keyboard: focusGroup(el, {selector:'[data-step-btn]:not([disabled])',
 *         orientation, wrap:false}) line 315 → ROVING tabindex with the arrows + onSelect→goTo.
 *         The back/next buttons are NATIVE <button>s (tabbable). Stepper pattern = 'tabs'.
 *
 *   - CSS: .pdx-wizard in packages/design/src/components/wizard.css (display:flex,
 *     flex-direction:column). The stepper's circles/connectors/labels come from
 *     packages/design/src/components/pagination.css (the "Stepper / Wizard" block):
 *       · `.pdx-stepper { display:flex; align-items:center }`  → a row, steps aligned.
 *       · `.pdx-step { display:flex; align-items:center; gap }`.
 *       · `.pdx-step-number { width/height 2rem; border-radius:50%; border:2px }`
 *         (1.5rem in `.pdx-stepper-sm`). Theme-agnostic in its DIMENSIONS (fixed rem),
 *         it varies only in colour → we assert width≈height (a circle) with no theme-specific px.
 *       · `.pdx-step-connector { flex:1; height:2px }` → a horizontal line between steps.
 *       · `.pdx-wizard .pdx-step { cursor:pointer }` (wizard.css lines 77-78); :disabled → not-allowed.
 *
 * SEMANTIC NOTES (not a bug, a WAI-ARIA choice):
 *   The wizard does NOT use aria-current="step": it adopts the TABS pattern (role="tablist" on the
 *   stepper, role="tab"+aria-selected on the buttons, role="tabpanel" on the panels). It is a
 *   legitimate and complete WAI-ARIA pattern for a navigable stepper — the active step IS
 *   marked semantically through aria-selected="true". The a11y checks below verify
 *   THAT contract (aria-selected on the active step) instead of aria-current. See the report.
 *
 * Contracts kept CONSERVATIVE but true in all 13 themes: NO theme-specific px.
 *   - stepper display:flex (a row), step number ~a circle (width≈height), connectors width>0.
 *   - the active step: aria-selected=true, tabindex=0; a done step: data-status=done.
 *   - steps aligned on the same row (the same top), contained in the stepper's box.
 *   - the active panel visible (height>0), back/next with an accessible name (textContent).
 */
import type { ComponentManifest } from './_types';

export const wizard: ComponentManifest = {
    name: 'wizard',
    tag: 'pdx-wizard',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/wizard'],

    // ── Scenarios ──
    // 3 steps. value="1" → step 2 (index 1) ACTIVE, step 1 (index 0) COMPLETED.
    // The source sets _highestVisited=initial, so with the linear default the footer/stepper
    // settle on index 1: step0 data-status="done" (✓), step1 "active", step2 in the future.
    // A wide, fixed container (760px): horizontal surplus so the flex:1 connectors stay >0
    // with the most generous fonts (cupertino SF Pro, material Roboto).
    scenarios: [
        {
            id: 'wizard-basic',
            title: 'Wizard — 3 steps, step 2 active, step 1 done',
            html: `
                <div style="width: 760px; max-width: 100%;">
                    <pdx-wizard data-test="wizard" value="1">
                        <div data-wizard-step data-label="Account" data-test="step-panel-0">
                            <p>Account details panel</p>
                        </div>
                        <div data-wizard-step data-label="Profile" data-test="step-panel-1">
                            <p>Profile details panel</p>
                        </div>
                        <div data-wizard-step data-label="Confirm" data-test="step-panel-2">
                            <p>Confirmation panel</p>
                        </div>
                    </pdx-wizard>
                </div>`,
        },
        {
            id: 'wizard-vertical',
            title: 'Wizard — vertical orientation',
            html: `
                <div style="width: 760px; max-width: 100%;">
                    <pdx-wizard data-test="wizard-vertical" orientation="vertical" value="1">
                        <div data-wizard-step data-label="One" data-test="vstep-panel-0">
                            <p>Step one</p>
                        </div>
                        <div data-wizard-step data-label="Two" data-test="vstep-panel-1">
                            <p>Step two</p>
                        </div>
                        <div data-wizard-step data-label="Three" data-test="vstep-panel-2">
                            <p>Step three</p>
                        </div>
                    </pdx-wizard>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'wizard-basic': {
                standalone: [
                    {
                        // Host: the class .pdx-wizard → a flex column (wizard.css).
                        selector: 'section:not([hidden]) [data-test="wizard"]',
                        description: 'wizard host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                    {
                        // The auto-generated stepper header: display flex (a row of steps).
                        selector: 'section:not([hidden]) [data-test="wizard"] .pdx-stepper',
                        description: 'auto-generated stepper renders as a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The step number is a circle: border-radius 50% → radius >= 0, appreciable size.
                        selector: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"] .pdx-step-number',
                        description: 'active step number circle has a measurable size',
                        height: { op: '>=', value: 16 },
                    },
                    {
                        // A step (button) is clickable → cursor pointer (wizard.css line 78).
                        selector: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="0"]',
                        description: 'reachable step button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The horizontal connector between steps 0 and 1: flex:1 → width > 0.
                        selector: 'section:not([hidden]) [data-test="wizard"] [data-connector="0"]',
                        description: 'connector between steps takes horizontal space',
                        width: { op: '>', value: 0 },
                    },
                    {
                        // The active panel (index 1) is visible → appreciable height.
                        selector: 'section:not([hidden]) [data-test="wizard"] [data-test="step-panel-1"]',
                        description: 'active step panel is visible (measurable height)',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The 3 steps and the footer are contained in the wizard host's box.
                        description: 'stepper buttons are contained within the wizard host',
                        parent: 'section:not([hidden]) [data-test="wizard"]',
                        children: {
                            wizard: 'section:not([hidden]) [data-test="wizard"]',
                            step0: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="0"]',
                            step1: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"]',
                            step2: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="2"]',
                        },
                        relations: [
                            { description: 'step0 within wizard', left: 'step0', op: 'contained-in', right: 'wizard' },
                            { description: 'step1 within wizard', left: 'step1', op: 'contained-in', right: 'wizard' },
                            { description: 'step2 within wizard', left: 'step2', op: 'contained-in', right: 'wizard' },
                            {
                                description: 'last step right edge does not overflow stepper/host',
                                left: 'step2.right',
                                op: '<=',
                                right: 'wizard.right',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // Steps aligned on the SAME row (stepper align-items:center, horizontal).
                        description: 'steps are laid out on the same row in left-to-right order',
                        parent: 'section:not([hidden]) [data-test="wizard"] .pdx-stepper',
                        children: {
                            step0: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="0"]',
                            step1: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"]',
                            step2: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="2"]',
                        },
                        relations: [
                            { description: 'step0.top == step1.top', left: 'step0.top', op: '==', right: 'step1.top', tolerance: 4 },
                            { description: 'step1.top == step2.top', left: 'step1.top', op: '==', right: 'step2.top', tolerance: 4 },
                            { description: 'step1 sits to the right of step0', left: 'step1.left', op: '>', right: 'step0.left' },
                            { description: 'step2 sits to the right of step1', left: 'step2.left', op: '>', right: 'step1.left' },
                        ],
                    },
                    {
                        // The connector between step0 and step1: horizontally IN BETWEEN (right of step0,
                        // left of step1). A geometric invariant of the horizontal stepper.
                        description: 'connector sits between the two steps it joins',
                        parent: 'section:not([hidden]) [data-test="wizard"] .pdx-stepper',
                        children: {
                            step0: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="0"]',
                            step1: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"]',
                            conn0: 'section:not([hidden]) [data-test="wizard"] [data-connector="0"]',
                        },
                        relations: [
                            { description: 'connector starts at/after step0 right', left: 'conn0.left', op: '>=', right: 'step0.left' },
                            { description: 'connector ends at/before step1 right', left: 'conn0.right', op: '<=', right: 'step1.right', tolerance: 2 },
                        ],
                    },
                    {
                        // The footer back/next below the stepper (the next row) and contained in the host.
                        description: 'nav footer buttons sit below the stepper, within the host',
                        parent: 'section:not([hidden]) [data-test="wizard"]',
                        children: {
                            stepper: 'section:not([hidden]) [data-test="wizard"] .pdx-stepper',
                            next: 'section:not([hidden]) [data-test="wizard"] [data-wizard-next]',
                        },
                        relations: [
                            { description: 'next button below the stepper', left: 'stepper.bottom', op: '<=', right: 'next.top', tolerance: 4 },
                        ],
                    },
                ],
                // NB: the "marked active step" (aria-selected=true) and the "completed step"
                // (data-status=done) are PRE-SET attributes, not changes on interaction.
                // A StateRule exists to measure CHANGES of a CSS property on hover/focus/click, so
                // it is not the right type: the assertion on aria-selected is covered by the keyboard step
                // (expectAttr) below and by the a11y scan (role=tab + aria-selected).
            },
            'wizard-vertical': {
                standalone: [
                    {
                        // Vertical: the host becomes a flex row (the stepper on the left, the content on the right).
                        selector: 'section:not([hidden]) [data-test="wizard-vertical"]',
                        description: 'vertical wizard host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                ],
                composition: [
                    {
                        // Vertical: the steps are STACKED in a column (.pdx-stepper-vertical).
                        description: 'vertical stepper stacks steps in a column',
                        parent: 'section:not([hidden]) [data-test="wizard-vertical"] .pdx-stepper',
                        children: {
                            step0: 'section:not([hidden]) [data-test="wizard-vertical"] [data-step-btn="0"]',
                            step1: 'section:not([hidden]) [data-test="wizard-vertical"] [data-step-btn="1"]',
                        },
                        relations: [
                            {
                                description: 'step1 sits below step0 (column)',
                                left: 'step0.bottom',
                                op: '<=',
                                right: 'step1.top',
                                tolerance: 4,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Stepper role="tablist"+aria-label; step role="tab"+aria-label+aria-selected; pannelli
    // role="tabpanel"+aria-controls; footer role="navigation". Back/Next ricevono textContent
    // ("Back"/"Next") in a rAF → an accessible name is present. No disableRules: no known false
    // positive. NB: the pattern is tabs (not aria-current) — a valid WAI-ARIA pattern.
    a11y: {
        scenarios: ['wizard-basic', 'wizard-vertical'],
    },

    // ── Dim. 3: style isolation ──
    // skipHeight: the wizard's box is content-driven (height = stepper + active panel + footer,
    // sensitive to the host's font/line-height under hostile CSS). We measure the STEP NUMBER (the circle):
    // a fixed size in rem → width/radius stay a clean invariant of immunity.
    isolation: {
        scenario: 'wizard-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"] .pdx-step-number', tolerancePx: 8 },
            { selector: 'section:not([hidden]) [data-test="wizard"]', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The stepper uses focusGroup (roving tabindex) with orientation horizontal → the Left/Right
    // arrows navigate + Home/End go to the ends: pattern 'tabs'. The initial focus is the active
    // step (tabindex=0). ArrowRight (linear: it may advance to highestVisited+1 = step 2)
    // moves the roving tab stop and selects the next step.
    keyboard: {
        scenario: 'wizard-basic',
        initialFocus: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"]',
        // Roving tabindex: the arrows MOVE the focus between the steps (a single tab stop). ACTIVATION
        // (aria-selected/goTo) is manual (Enter/Space) and gated by the wizard's logic (canGoTo), so
        // here we check only the focus roving; aria-selected is covered by the a11y scan.
        steps: [
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="2"]' },
            { key: 'ArrowLeft', expectFocus: 'section:not([hidden]) [data-test="wizard"] [data-step-btn="1"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // basic (stepper orizzontale: done ✓ / active / futuro + connettori + footer) e
    // vertical (a column layout): they cover what the mathematics does not catch (state colours per theme).
    visual: {
        scenarios: ['wizard-basic', 'wizard-vertical'],
    },
};

export default wizard;

/**
 * MANIFEST — pdx-date-picker (tier 3, input trigger + popover calendar)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/date-picker/pdx-date-picker.ts),
 * the child calendar (packages/ui/src/calendar/pdx-calendar.ts) and the CSS
 * (packages/design/src/components/date-picker.css).
 *
 * ── DOM structure (light DOM, built imperatively in an rAF, pdx-date-picker.ts:325) ──
 *   <pdx-date-picker>                                       ← host
 *     <div class="pdx-date-picker-trigger pdx-input-wrap [pdx-input-{size}] [disabled] [readonly]"  ← box from .pdx-input-wrap
 *          role="combobox"                                  ← trigger (date-picker.ts:355)
 *          aria-expanded="false|true"
 *          aria-haspopup="dialog"
 *          aria-label="{ariaLabel}"                         ← ALWAYS set: the prop, or else the placeholder or a default
 *          tabindex="0|-1">                                    '-1' only when disabled
 *       <span class="pdx-date-picker-icon" aria-hidden="true"><svg/></span>  ← the calendar icon
 *       <span class="pdx-date-picker-text|pdx-date-picker-placeholder">…</span>  ← text: the formatted date, or the placeholder
 *       <button class="pdx-input-clear pdx-input-suffix-interactive" tabindex="-1">×</button>  ← clear (display:none with no value)
 *     <input type="hidden" name value>                      ← form participation (formAssociated); display:none when name is empty
 *     <div class="pdx-date-picker-panel" role="dialog"      ← THE popover PANEL: position:absolute, display:none → '' on open
 *          aria-label="Choose date">                           a named dialog; on opening the focus goes to the day
 *       <div class="pdx-date-picker-panel-inner [pdx-date-picker-has-presets]">
 *         [ <div class="pdx-date-picker-presets"> <button class="pdx-date-picker-preset-btn">…  ]?  ← the presets sidebar (only with presets)
 *         <div class="pdx-date-picker-main">
 *           <pdx-calendar inline>                           ← THE CALENDAR (not in time-only mode)
 *             <div class="pdx-calendar pdx-calendar-inline" role="group" aria-label="Calendar">
 *               <div class="pdx-cal-nav">
 *                 <button class="pdx-cal-nav-btn" aria-label="Previous month">‹</button>
 *                 <button class="pdx-cal-title" aria-live="polite">June 2024</button>   ← the month's title (deterministic with the fixed value)
 *                 <button class="pdx-cal-nav-btn" aria-label="Next month">›</button>
 *               <div class="pdx-cal-grids">
 *                 <div class="pdx-cal-grid" role="grid" aria-label="June 2024">  ← GRID: accessible name from the month
 *                   <div class="pdx-cal-header-row" role="row"> <div class="pdx-cal-day-header" role="columnheader">…
 *                   <div class="pdx-cal-row" role="row">
 *                     <button class="pdx-cal-cell […]" role="gridcell" [aria-selected] [aria-current="date"] [aria-disabled]>{day}</button>
 *       <div class="pdx-date-picker-footer">
 *         <button class="pdx-ghost" size="sm">Today</button>   ← (assente in time-only mode)
 *         <div style="flex:1"></div>
 *         [ <button class="pdx-primary" size="sm">Done</button> ]?   ← only with showTime or range
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The `.pdx-date-picker-panel` is NOT portalled to document.body. usePopover is created with
 *   `container: ctx.el` (date-picker.ts:517) → the trigger and the panel are SIBLINGS in the host's light DOM.
 *   So the selectors stay section-scoped like every other component's. usePopover sets
 *   position/top/left inline (placement 'bottom-start', the default offset) → the panel FLOATS under the trigger.
 *   Its visibility is driven by `_panelEl.style.display = open ? '' : 'none'` in onOpenChange
 *   (date-picker.ts:519). No backdrop (usePopover dropdown-style, dismissOnOutside:true,
 *   dismissOnEscape:true). ONE open scenario → no two popovers fighting over the selectors.
 *
 * ── HOW IT OPENS (CRITICAL — verified in the source) ──
 *   `openPopover` IS exposed on the host: it is in the setup's return (date-picker.ts:566) → it becomes a method of the
 *   custom element → `host.openPopover()`. The open scenario calls it in the setup (opened programmatically, NOT through an attribute).
 *   The alternatives in the source: a click on the trigger (date-picker.ts:387) or an Enter/Space/ArrowDown keydown
 *   (date-picker.ts:388). There is NO `open` prop → opening through the setup is the only clean declarative way.
 *   Note: the popover does NOT use a focus trap (it is dropdown-style, not a modal dialog) → no risk of aria-hidden
 *   over the whole page at upgrade time (the problem that forced command.manifest to open through the setup alone;
 *   here we open through the setup anyway, for consistency and determinism).
 *
 * ── DETERMINISM (CRITICAL) ──
 *   value="2024-06-15" in EVERY scenario → the trigger shows a stable formatted date
 *   ("Jun 15, 2024", dateStyle:'medium', the en locale) and, on opening, the calendar initialises the view
 *   on June 2024 (calendar initView: parseISO(value) → viewYear=2024, viewMonth=6, date-picker.ts:147
 *   synchronises _internalValue, calendar.ts:92-98). A fixed month → the title "June 2024", a stable grid.
 *   The DOM is built in an rAF (the host) plus a setTimeout/rAF (the calendar): the runner waits for networkidle and the
 *   standard timeout before measuring; the open scenario calls openPopover in the post-mount setup.
 *
 * ── a11y (verified) ──
 *   The trigger is role="combobox" + aria-haspopup="dialog" + aria-expanded. Its ACCESSIBLE NAME comes ONLY
 *   from aria-label: the ariaLabel prop, or else the placeholder or a default (aria-label="" would leave
 *   the combobox unnamed). The scenarios set ariaLabel. The grid has role="grid" +
 *   aria-label="{Month Year}" (the accessible name is fine). The nav buttons have aria-labels (Previous/Next month).
 *   The day cells are <button role="gridcell"> with text (their accessible name is the day number).
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the trigger is a visible interactive box (cursor pointer, from .pdx-date-picker-trigger);
 *   · the trigger's radius is non-negative (the radius-zero themes zero it, never below 0);
 *   · open: the panel is VISIBLE (display block), of a noticeable width (min-width:300px in the CSS), under the trigger;
 *   · an overlay with no backdrop;
 *   · the calendar (the grid) is contained in the panel.
 */
import type { ComponentManifest } from './_types';

export const datePicker: ComponentManifest = {
    name: 'date-picker',
    tag: 'pdx-date-picker',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/date-picker'],

    // ── Scenarios ──
    scenarios: [
        {
            // CLOSED: the trigger with a fixed value → it shows "Jun 15, 2024". ariaLabel is set.
            id: 'date-picker-closed',
            title: 'Date Picker — Closed (input with a fixed value)',
            html: `
                <pdx-date-picker data-test="dp"
                    value="2024-06-15"
                    ariaLabel="Event date">
                </pdx-date-picker>`,
        },
        {
            // The ONE open scenario: the floating panel made visible through the setup (a programmatic opening).
            // openPopover() is exposed on the host (the setup's return, date-picker.ts:566). Called after the mount.
            // a fixed value → the calendar on June 2024 (the title "June 2024", a stable grid).
            id: 'date-picker-open',
            title: 'Date Picker — Open (calendar popover below the input)',
            // Room for the calendar. Without it the section is shorter than the popover and the
            // visual baseline is the input plus the top edge of a calendar cut off by the crop —
            // an unstable picture of the wrong thing, at 1224 pixels of difference between runs.
            // The same containment the tooltip, popover and split-button scenarios have.
            //
            // 460px: the calendar measures 306x401, and the input above it takes the rest.
            html: `
                <div style="padding-bottom: 460px;">
                    <pdx-date-picker data-test="dp-open"
                        value="2024-06-15"
                        ariaLabel="Event date">
                    </pdx-date-picker>
                </div>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="dp-open"]');
                if (host && typeof host.openPopover === 'function') host.openPopover();`,
        },
        {
            // The month view open (mode="month"): the months grid is a group named by the year and the
            // arrows have names. Dim 2 only: the setup opens the active section alone.
            id: 'date-picker-month-open',
            title: 'Date Picker — Month mode, open',
            html: `
                <div style="padding-bottom: 320px;">
                    <pdx-date-picker data-test="dp-month"
                        mode="month"
                        value="2024-06-15"
                        ariaLabel="Billing month">
                    </pdx-date-picker>
                </div>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="dp-month"]');
                if (host && typeof host.openPopover === 'function') host.openPopover();`,
        },
        {
            // Editable: the text is an input with the combobox role, the icon the "Choose
            // date" button. The second picker holds an entry that is not a date, marked aria-invalid.
            id: 'date-picker-editable',
            title: 'Date Picker — Editable (typed date), valid and invalid',
            html: `
                <div style="display: grid; gap: 12px; max-width: 320px;">
                    <pdx-date-picker data-test="dp-edit" editable locale="en-US" value="2024-06-15" ariaLabel="Event date"></pdx-date-picker>
                    <pdx-date-picker data-test="dp-edit-bad" editable locale="en-US" value="2024-06-15" ariaLabel="Return date"></pdx-date-picker>
                </div>`,
            setup: `
                const find = () => document.querySelector('section:not([hidden]) [data-test="dp-edit-bad"] input.pdx-date-picker-input');
                let el = find();
                for (let i = 0; i < 30 && !el; i++) { await new Promise(r => requestAnimationFrame(r)); el = find(); }
                if (el) {
                    el.value = '13/45/2024';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                }`,
        },
        {
            // DISABLED: a static prop → a standalone rule (the cursor is not pointer, and it does not open).
            id: 'date-picker-disabled',
            title: 'Date Picker — Disabled',
            html: `
                <pdx-date-picker data-test="dp-dis"
                    value="2024-06-15"
                    ariaLabel="Event date"
                    disabled>
                </pdx-date-picker>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'date-picker-closed': {
                standalone: [
                    {
                        // .pdx-date-picker-trigger { display: inline-flex } → box visibile (CSS:4-9).
                        selector: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger',
                        description: 'trigger is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:5 → cursor: pointer → interactive.
                        selector: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger',
                        description: 'trigger is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The trigger's radius (from .pdx-input-wrap) is non-negative (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger',
                        description: 'trigger radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // The DISTANCE the calendar opens at. The
                // `date-picker-open` scenario is certified on axe, isolation, keyboard and visual,
                // and none of those looks at geometry; the composition rule there asserts
                // `trigger.bottom <= panel.top` with a tolerance of 2, which a panel flush against
                // the trigger satisfies: a gap of 0 would keep every other contract green.
                //
                // Measured (13 themes, viewport 1280): the token is
                // 4px everywhere and the gap is 4 everywhere. `usePopover` is created without an
                // `offset` (`pdx-date-picker.ts:544-549`), so the value comes from
                // `readFloatOffset`, whose fallback is 8 — which is what makes the mutation
                // visible: making it ignore the token turns 4 into 8 and a tolerance of 1 refuses
                // it.
                //
                // ── Why this rule lives on the CLOSED scenario ──
                // On `date-picker-open` the panel is already open by the scenario's setup, and a
                // click on the trigger there was measured to leave it open — so the rule's
                // `waitFor({state:'visible'})` would resolve whether or not the click did
                // anything, and the contract would no longer be evidence that clicking opens the
                // calendar. Here the panel is `display:none` at 0x0 before the click, Playwright
                // reports it not visible, and the click is what satisfies the wait.
                positioning: [
                    {
                        description: 'date picker calendar opens below the trigger, one float-offset away',
                        trigger: { selector: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger', action: 'click' },
                        floating: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-panel',
                        placement: 'bottom',
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
                composition: [
                    {
                        // The icon and the text are contained in the trigger (the layout holds).
                        description: 'icon and text are contained within the trigger box',
                        parent: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger',
                        children: {
                            trigger: '.pdx-date-picker-trigger',
                            icon: '.pdx-date-picker-icon',
                            text: '.pdx-date-picker-text, .pdx-date-picker-placeholder',
                        },
                        relations: [
                            { description: 'icon within trigger', left: 'icon', op: 'contained-in', right: 'trigger' },
                            { description: 'text within trigger', left: 'text', op: 'contained-in', right: 'trigger' },
                            { description: 'icon is to the left of the text', left: 'icon.left', op: '<=', right: 'text.left' },
                        ],
                    },
                ],
            },

            // Open: the panel (display:'' through onOpenChange) sits UNDER the trigger. An overlay with no backdrop.
            // The panel is ALREADY open from the setup (openPopover) → action:'call' = the state is on.
            'date-picker-open': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        description: 'open calendar panel is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:54 → min-width: 300px → a measurable width at a 1280 viewport.
                        selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        description: 'open calendar panel has an appreciable width',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        // CSS:51 → border-radius: var(--pdx-radius-lg) → non-negative (the radius-zero themes zero it).
                        selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        description: 'open calendar panel has non-negative radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                overlay: [
                    {
                        // Dropdown-style: a floating panel, no backdrop. action:'call' → already opened by the setup.
                        description: 'open date picker shows the calendar panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (a sibling of the trigger in the light DOM, positioned by usePopover with placement
                        // 'bottom-start') sits UNDER the trigger. Both are direct children of the host.
                        description: 'calendar panel sits below the trigger',
                        parent: 'section:not([hidden]) [data-test="dp-open"]',
                        // Scoped like the parent: the bare trigger class finds a hidden scenario's
                        // trigger (0×0), and `0 <= panel.top` would hold without measuring.
                        children: {
                            trigger: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger',
                            panel: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 2 },
                        ],
                    },
                    {
                        // The calendar (the grid) is contained in the panel.
                        description: 'the calendar grid is contained within the panel',
                        parent: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                        // Scoped like the parent: bare classes find the first calendar in the
                        // document, in a hidden scenario (0×0).
                        children: {
                            panel: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-panel',
                            grid: 'section:not([hidden]) [data-test="dp-open"] .pdx-cal-grid',
                        },
                        relations: [
                            { description: 'calendar grid within panel', left: 'grid', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone.
            'date-picker-disabled': {
                standalone: [
                    {
                        // .pdx-date-picker-trigger.disabled → the cursor is not pointer (it reuses the .pdx-input-wrap.disabled pattern).
                        selector: 'section:not([hidden]) [data-test="dp-dis"] .pdx-date-picker-trigger',
                        description: 'disabled trigger is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: the trigger is role="combobox" with an accessible name from aria-label (the scenarios set ariaLabel;
    //   without it the name falls back to the placeholder or a default). Open: the grid is role="grid" +
    //   aria-label="{Month Year}", and the nav buttons have aria-labels. No disableRule: if axe reports the combobox
    //   without a name it must fail.
    // The open panel is a role="dialog" with a name; the month view a named group.
    a11y: {
        scenarios: ['date-picker-closed', 'date-picker-open', 'date-picker-month-open', 'date-picker-editable'],
    },

    // ── Dim. 3: style isolation ──
    // The target: the trigger (.pdx-date-picker-trigger, an inline-flex box). skipHeight: its height is content- and
    //   line-height-driven (padding, the text, the icon), not a clean structural invariant; the radius (a CSS value) stays asserted.
    isolation: {
        scenario: 'date-picker-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA combobox + dialog popover) ──
    // The combobox trigger is tabindex="0" and focusable. onKeydown on the trigger (date-picker.ts:388): Enter/Space/ArrowDown
    //   open → aria-expanded="true". usePopover dismissOnEscape:true → Escape closes → aria-expanded goes back to "false".
    // Pattern 'dialog' (a popover with Esc). initialFocus = the trigger. aria-expanded is checked through expectAttr
    //   (deterministic and readable from the DOM). It starts from the open scenario (openPopover in the setup):
    //   first the open state is asserted, then the close through Escape.
    keyboard: {
        scenario: 'date-picker-open',
        initialFocus: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger',
        steps: [
            // Open (through the setup): aria-expanded must be true.
            { key: 'ArrowDown', expectAttr: { selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger', name: 'aria-expanded', value: 'true' } },
            // Escape closes → aria-expanded goes back to false (onOpenChange sets aria-expanded=String(open)).
            { key: 'Escape', expectAttr: { selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger', name: 'aria-expanded', value: 'false' } },
            // Reopened from the keyboard: the focus enters the dialog, on the chosen day.
            { key: 'ArrowDown',
                expectFocus: 'section:not([hidden]) [data-test="dp-open"] [role="dialog"] [data-iso="2024-06-15"]' },
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="dp-open"] [data-iso="2024-06-16"]' },
            // Enter chooses and closes; the focus returns to the trigger, not to <body>.
            { key: 'Enter',
                expectAttr: { selector: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger', name: 'aria-expanded', value: 'false' },
                expectFocus: 'section:not([hidden]) [data-test="dp-open"] .pdx-date-picker-trigger' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — closed + open ──
    // A fixed value → a deterministic input and calendar. No "today" cell is coloured differently in the fixed month
    //   (June 2024) than the current date → no mask is needed on the grid body. The "today" cell is masked
    //   for immunity to the run date (in case the month shown changed, or today fell into view).
    visual: {
        scenarios: ['date-picker-closed', 'date-picker-open'],
        mask: ['section:not([hidden]) [data-test="dp-open"] .pdx-cal-today'],
    },
};

export default datePicker;

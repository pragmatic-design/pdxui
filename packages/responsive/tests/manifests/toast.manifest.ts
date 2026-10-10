/**
 * MANIFEST — pdx-toast (notification, tier ?)
 *
 * Contracts written by inspecting the source (packages/ui/src/toast/pdx-toast.ts),
 * the queue (packages/core/src/component/toast-queue.ts) and the CSS
 * (packages/design/src/components/toast.css, the .pdx-toast-container / .pdx-toast / .pdx-toast-* blocks).
 *
 * ── ARCHITECTURE (crucial for the selectors) ──
 * There is a SINGLE custom element <pdx-toast>: it is the CONTAINER, not the individual toast.
 * (There is no separate <pdx-toast-container>, whatever an older table said.)
 *
 * <pdx-toast> renders into its own LIGHT DOM (NOT portalled onto body):
 *   <div class="pdx-toast-container" position="...">      ← position:fixed, flex column, pointer-events:none
 *     <div class="pdx-toast pdx-toast-{type}[ pdx-toast-bordered|minimal][ pdx-toast-rich]"
 *          data-toast-id="..." data-open                  ← role + aria-live set per type
 *          role="alert"  (type=error)  |  role="status"  (the others)
 *          aria-live="assertive" (error) | aria-live="polite" (the others)>
 *       <pdx-icon class="pdx-toast-icon">                 ← when icon !== null
 *       <div class="pdx-toast-content">
 *         <div class="pdx-toast-title">  (with title)
 *         <div class="pdx-toast-message">
 *       <button class="pdx-toast-action"> (with action)
 *       <button class="pdx-toast-close" aria-label="Dismiss">×</button>   ← when dismissible (default true)
 *       <div class="pdx-toast-progress"> (ONLY when duration > 0 → we AVOID it, see below)
 *
 * Toasts are NOT declarable in markup: they come ONLY from the global queue (the singleton
 * createToastQueue through getToastQueue()). The public API is `toast.add/success/error/...`.
 *
 * ── DETERMINISM (timers OFF) ──
 * The queue auto-dismisses: a toast with duration>0 disappears on its own (setTimeout → dismiss) and
 * shows an animated progress bar. To make the scenario STABLE and measurable:
 *   - `duration: 0`  → a PERSISTENT toast: no setTimeout, no .pdx-toast-progress (no
 *                      animation → no flakiness and no visual mask). See add(): `if (duration > 0)`.
 *   - `dismissible: true` (the default) → renders the close button (a keyboard target + cursor).
 * The setup `clear()`s the singleton queue BEFORE adding (the queue is module-level, shared across
 * scenarios) and then waits TWO rAFs: the first is when the component hooks containerEl+effect
 * (ctx.track → rAF), the second is when renderToasts appends and sets data-open (an inner rAF).
 *
 * ── STACKING ──
 * The container is flex-direction:column (top-*) → toasts appended later sit BELOW the earlier ones:
 * toast2.top >= toast1.bottom. (bottom-* would use column-reverse → the relation would invert;
 * the stack scenario uses the default top-right position for a deterministic relation.)
 *
 * Conservative across themes: display flex, height>0 (content-driven), radius>=0, cursor pointer.
 * No theme-specific px (radius/border vary: metro=0, material/pragmatic more generous).
 */
import type { ComponentManifest } from './_types';

// A reusable setup: it clears the singleton queue, adds persistent toasts (duration 0),
// and waits for the container's double rAF before the runner measures.
const SETUP_STACK = `
    const { toast } = await import('@pdxui/ui/toast');
    toast.clear();
    toast.success('Changes saved successfully.', { duration: 0 });
    toast.error('Could not reach the server.', { duration: 0 });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
`;

const SETUP_VARIANTS = `
    const { toast } = await import('@pdxui/ui/toast');
    toast.clear();
    toast.success('File uploaded.', { duration: 0 });
    toast.error('Upload failed.', { duration: 0 });
    toast.warning('Low disk space.', { duration: 0 });
    toast.info('A new version is available.', { duration: 0 });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
`;

const SETUP_RICH = `
    const { toast } = await import('@pdxui/ui/toast');
    toast.clear();
    toast.add({ type: 'success', title: 'Backup complete', message: 'Your data is safe.', duration: 0 });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
`;

export const toast: ComponentManifest = {
    name: 'toast',
    tag: 'pdx-toast',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/toast'],

    // ── Scenarios ──
    // The container is position:fixed: anchored to the viewport, not to the wrapper. data-test on the <pdx-toast>;
    // the toasts live inside its .pdx-toast-container (host-scoped, NOT on body).
    scenarios: [
        {
            id: 'toast-stack',
            title: 'Toast — Stack (success + error, persistent)',
            html: `<pdx-toast data-test="toast" position="top-right"></pdx-toast>`,
            setup: SETUP_STACK,
        },
        {
            id: 'toast-variants',
            title: 'Toast — Variants (success/error/warning/info, persistent)',
            html: `<pdx-toast data-test="toast" position="top-right"></pdx-toast>`,
            setup: SETUP_VARIANTS,
        },
        {
            id: 'toast-rich',
            title: 'Toast — Rich (title + message)',
            html: `<pdx-toast data-test="toast" position="top-right"></pdx-toast>`,
            setup: SETUP_RICH,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'toast-stack': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast',
                        description: 'toast item is a flex row',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast',
                        description: 'toast item has content-driven positive height',
                        height: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast',
                        description: 'toast item has non-negative radius (metro may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast-close',
                        description: 'close button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                // Composition: two toasts in the stack do NOT overlap (column → toast2 below toast1)
                // and every part (icon/content/close) is contained in the first toast's box.
                composition: [
                    {
                        description: 'stacked toasts do not overlap (second sits below the first)',
                        parent: 'section:not([hidden]) [data-test="toast"] .pdx-toast-container',
                        children: {
                            first: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1)',
                            second: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(2)',
                        },
                        relations: [
                            {
                                description: 'second toast top is at/below first toast bottom',
                                left: 'first.bottom',
                                op: '<=',
                                right: 'second.top',
                                tolerance: 1,
                            },
                        ],
                    },
                    {
                        description: 'toast parts are contained within the toast box',
                        parent: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1)',
                        children: {
                            toast: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1)',
                            content: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1) .pdx-toast-content',
                            close: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1) .pdx-toast-close',
                        },
                        relations: [
                            { description: 'content within toast box', left: 'content', op: 'contained-in', right: 'toast' },
                            { description: 'close within toast box', left: 'close', op: 'contained-in', right: 'toast' },
                            {
                                description: 'content right edge does not overflow toast right edge',
                                left: 'content.right',
                                op: '<=',
                                right: 'toast.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'toast-rich': {
                // Rich: the title above the message, both inside the content box.
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast',
                        description: 'rich toast item has content-driven positive height',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'rich toast title sits above message inside the content box',
                        parent: 'section:not([hidden]) [data-test="toast"] .pdx-toast-content',
                        children: {
                            content: 'section:not([hidden]) [data-test="toast"] .pdx-toast-content',
                            title: 'section:not([hidden]) [data-test="toast"] .pdx-toast-title',
                            message: 'section:not([hidden]) [data-test="toast"] .pdx-toast-message',
                        },
                        relations: [
                            { description: 'title within content', left: 'title', op: 'contained-in', right: 'content' },
                            { description: 'message within content', left: 'message', op: 'contained-in', right: 'content' },
                            {
                                description: 'title is above the message (stacked column)',
                                left: 'title.bottom',
                                op: '<=',
                                right: 'message.top',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // Source (createToastElement): role="status"/"alert" + aria-live="polite"/"assertive" per type,
        // a close button with aria-label="Dismiss" → accessible name OK. No known violation → no disableRules.
        // The variants scenario covers both status (success/warning/info) and alert (error).
        scenarios: ['toast-variants', 'toast-rich'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'toast-stack',
        targets: [
            // A content-driven toast (height = the sum of its content, sensitive to the host's line-height) → skipHeight.
            // The radius (a CSS value, not scaled) and the border stay asserted. Standard tolerance.
            {
                selector: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1)',
                tolerancePx: 2,
                skipHeight: true,
                leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }],
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The toast is not a widget with roving or a trap: the only interactive element is the close button.
        // Pattern 'none'; Tab must be able to focus the close button (it is a native <button>).
        scenario: 'toast-stack',
        steps: [
            {
                key: 'Tab',
                expectFocus: 'section:not([hidden]) [data-test="toast"] .pdx-toast:nth-child(1) .pdx-toast-close',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // The 4 variants cover colours/accent borders per theme; rich covers the title+message layout.
    visual: {
        scenarios: ['toast-variants', 'toast-rich'],
    },
};

export default toast;

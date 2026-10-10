/**
 * MANIFEST — pdx-file-upload (dropzone + file list)
 *
 * Contracts written by inspecting the source (packages/ui/src/file-upload/pdx-file-upload.ts)
 * and the CSS (packages/design/src/components/file-upload.css).
 *
 * ── DOM structure (light DOM) ──
 *   <pdx-file-upload>                       host, display:block, rootClass = .pdx-file-upload[(-sm|-lg)]
 *     <div class="pdx-file-dropzone"        ← THE DROPZONE AREA (dragover/disabled added dynamically)
 *          role="button" tabindex="0"       ← operable from the keyboard (Enter/Space → opens the file dialog)
 *          aria-label="<label>"             ← accessible name from the `label` prop
 *          aria-disabled="true"|absent>      ← null when it is not disabled (removed, which is right)
 *       <span class="pdx-file-dropzone-icon" aria-hidden="true"> <svg…> </span>
 *       <span class="pdx-file-dropzone-label">…</span>
 *       <span class="pdx-file-dropzone-hint">…</span>   ← only when hint() is not empty (maxSize/accept)
 *     </div>
 *     <input type="file" hidden …>          ← a HIDDEN native input (see the a11y note below)
 *     <div class="pdx-file-list" role="list"> … </div>  ← there ONLY with files selected
 *
 * ── DETERMINISMO ──
 *   The EMPTY state (the dropzone alone, no files) is the only deterministic one: the file list
 *   needs real Files injected through the API (addFiles) → an async preview (FileReader), an XHR progress
 *   animated, and there is no prop to pre-populate files. So the list is NOT tested: the scenarios are an empty
 *   dropzone (the default) plus a disabled dropzone. No real files, no progress, no screenshot
 *   of an animated state.
 *
 * ── Geometria base (.pdx-file-dropzone) ──
 *   min-height:120px, border:2px DASHED, border-radius:lg, padding:lg, cursor:pointer,
 *   display:flex. Disabled: opacity<1 + pointer-events:none + cursor:not-allowed.
 *   Conservative contracts across themes: height >= 80 (the smallest min-height is -sm = 80px, but here
 *   the default size 120 is used → >= 100 is asserted, with room to spare), radius >= 0 (metro zeroes it),
 *   border width > 0, no theme-specific px.
 *
 * ── An a11y note (the hidden file input) — NOT a bug ──
 *   The <input type="file"> is `hidden` and has no id, label or aria-label (name='' by default).
 *   That is an INTENTIONAL and correct pattern: the input is out of the accessibility tree (hidden),
 *   and the accessible name and the operability come from the role="button" wrapper with its aria-label.
 *   axe ignores hidden elements → no `label` or `button-name` violation. The screen
 *   reader interacts with the dropzone, not with the input. So it is not a bug to write down.
 */
import type { ComponentManifest } from './_types';

export const fileUpload: ComponentManifest = {
    name: 'file-upload',
    tag: 'pdx-file-upload',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/file-upload'],

    // ── Scenarios (deterministic states only) ──
    scenarios: [
        {
            id: 'file-upload-empty',
            title: 'File Upload — Empty dropzone',
            html: `
                <div style="max-width: 480px;">
                    <pdx-file-upload
                        data-test="fu"
                        label="Drop files here or click to browse"
                        accept="image/*"
                        max-size="5242880"
                        multiple>
                    </pdx-file-upload>
                </div>`,
        },
        {
            id: 'file-upload-disabled',
            title: 'File Upload — Disabled dropzone',
            html: `
                <div style="max-width: 480px;">
                    <pdx-file-upload
                        data-test="fu-disabled"
                        label="Upload disabled"
                        disabled>
                    </pdx-file-upload>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'file-upload-empty': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone is a flex box',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone has a generous drop area (min-height honored)',
                        height: { op: '>=', value: 100 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone is the full width of its container',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone invites clicking (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone has a visible border (2px in base; > 0 cross-theme)',
                        border: { all: { width: { op: '>', value: 0 } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        description: 'dropzone has non-negative radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the icon and the label (the "browse" affordance) sit INSIDE the dropzone.
                composition: [
                    {
                        description: 'dropzone affordances are contained within the drop area',
                        parent: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                        children: {
                            zone: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone',
                            icon: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone-icon',
                            label: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone-label',
                        },
                        relations: [
                            {
                                description: 'icon within dropzone box',
                                left: 'icon',
                                op: 'contained-in',
                                right: 'zone',
                            },
                            {
                                description: 'label within dropzone box',
                                left: 'label',
                                op: 'contained-in',
                                right: 'zone',
                            },
                            {
                                description: 'label right edge does not overflow dropzone',
                                left: 'label.right',
                                op: '<=',
                                right: 'zone.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'file-upload-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="fu-disabled"] .pdx-file-dropzone',
                        description: 'disabled dropzone has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu-disabled"] .pdx-file-dropzone',
                        description: 'disabled dropzone blocks pointer events',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fu-disabled"] .pdx-file-dropzone',
                        description: 'disabled dropzone shows not-allowed cursor',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // The dropzone is role="button" with an aria-label → its accessible name is there. The file input is
    // hidden (out of the a11y tree, ignored by axe). No disableRule is needed.
    a11y: {
        scenarios: ['file-upload-empty', 'file-upload-disabled'],
    },

    // ── Dim. 3: style isolation ──
    // The dropzone has a fixed min-height (120px) but its inner content (the label and the hint) is text:
    // under hostile CSS (the host's font and line-height) the effective height can exceed the min-height and
    // drift. Skip the height; the border (2px dashed) and the radius (CSS values, not scaled) stay
    // asserted as the real guarantee of immunity to external style.
    isolation: {
        scenario: 'file-upload-empty',
        targets: [
            { selector: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The dropzone is role="button" tabindex=0 → focusable with Tab and activated with Enter or Space
    // (onDropzoneKeydown → it opens the native file dialog). There is no composite navigation (no roving,
    // no menu): pattern 'none' plus a check that Tab puts the focus on the dropzone.
    keyboard: {
        scenario: 'file-upload-empty',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="fu"] .pdx-file-dropzone' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['file-upload-empty', 'file-upload-disabled'],
    },
};

export default fileUpload;

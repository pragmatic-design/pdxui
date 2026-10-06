// The components a form or a panel puts in a scrolling region, most of which build part of their
// DOM in a requestAnimationFrame. The list in-scroll-area.spec.ts moves with the library's own movers.
// plain-move.spec.ts moves every component in the manifest instead.
export const FRAME_BUILT_TAGS = [
    'pdx-mention', 'pdx-input', 'pdx-textarea', 'pdx-select', 'pdx-number-input', 'pdx-masked-input',
    'pdx-date-picker', 'pdx-time-picker', 'pdx-otp-input', 'pdx-slider', 'pdx-checkbox', 'pdx-toggle',
    'pdx-button', 'pdx-card', 'pdx-fieldset', 'pdx-form-field', 'pdx-tabs', 'pdx-accordion', 'pdx-list',
    'pdx-inline-edit', 'pdx-rich-text', 'pdx-data-grid', 'pdx-tree-select', 'pdx-cascader', 'pdx-transfer',
    'pdx-relation-picker', 'pdx-image', 'pdx-progress', 'pdx-statistic', 'pdx-timeline',
];

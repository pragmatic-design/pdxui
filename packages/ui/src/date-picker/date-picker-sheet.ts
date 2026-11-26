// The width at which pdx-date-picker's panel becomes a bottom sheet, beside the component.

/**
 * The width at which the panel becomes a bottom sheet. The stylesheet's
 * `@media (max-width: 640px)` in design's components/date-picker.css is the same query, and
 * `date-picker-sheet-query.test.ts` fails if the two disagree: one system positions the panel at a
 * time, the stylesheet below this width and the popover above it.
 */
export const DATE_PICKER_SHEET_QUERY = '(max-width: 640px)';

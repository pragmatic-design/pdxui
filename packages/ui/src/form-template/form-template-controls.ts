// pdx-form-template's controls: the component each field type is drawn with (#1210).

// ─── Field Type → Component Tag ──────────────────────────────

export const TYPE_TAG: Record<string, string> = {
    text: 'pdx-input', email: 'pdx-input', password: 'pdx-password-input',
    url: 'pdx-input', tel: 'pdx-input',
    number: 'pdx-number-input', textarea: 'pdx-textarea',
    // A date is a pdx-date-picker, not the browser's own input through the pdx-input fallback.
    date: 'pdx-date-picker',
    select: 'pdx-select', checkbox: 'pdx-checkbox', switch: 'pdx-switch',
    radio: 'pdx-radio-group', slider: 'pdx-slider', rating: 'pdx-rating',
    color: 'pdx-color-picker', file: 'pdx-file-upload',
    tags: 'pdx-tag-input', segmented: 'pdx-segmented',
    lookup: 'pdx-autocomplete',
};

// Controls that bind to `checked` instead of `value`
export const CHECKED_TYPES = new Set(['checkbox', 'switch']);

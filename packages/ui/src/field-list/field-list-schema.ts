// pdx-field-list's row schema, and the controls it builds for each field type. Module-level, beside the
// component: in its .pdx script they would be made again at every mount (#1210).

/** One field of a row: its name in the row's values, the control it gets, and its label. */
export interface FieldListItemSchema {
    name: string;
    type?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
}

/** Field type → component tag (subset of form-template TYPE_TAG). */
export const TYPE_TAG: Record<string, string> = {
    text: 'pdx-input', email: 'pdx-input', number: 'pdx-number-input',
    textarea: 'pdx-textarea', select: 'pdx-select',
    checkbox: 'pdx-checkbox', switch: 'pdx-switch',
};

/** The types whose value is the control's `checked`, not its `value`. */
export const CHECKED_TYPES = new Set(['checkbox', 'switch']);

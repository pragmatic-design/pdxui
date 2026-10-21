// Form control registry — allows custom components to participate in the form system.
//
// By registering a custom control, both the compiler (form-binding pass) and
// pdx-form-template (JSON schema) will auto-wire the component.
//
// Usage:
//   registerFormControl('my-date-picker', {
//       valueEvent: 'change',          // event that fires when value changes
//       valueProp: 'value',            // property name for the value (default: 'value')
//       valueExpr: 'e.detail?.date',   // how to extract value from event (default: 'e.detail?.value')
//       blurEvent: 'pdx-blur',         // blur event name (default: 'pdx-blur')
//       checked: false,                // true for checkbox-like controls
//       textInput: false,              // true to skip reactive :value (avoids controlled input loop)
//   });


// ─── Types ──────────────────────────────────────────────────

export interface FormControlConfig {
    /** Event name fired when value changes. Default: 'pdx-change'. */
    valueEvent?: string;
    /** Property name for the value. Default: 'value'. */
    valueProp?: string;
    /** JS expression to extract value from event. Default: 'e.detail?.value ?? e.target?.value'. */
    valueExpr?: string;
    /** Blur event name. Default: 'pdx-blur'. */
    blurEvent?: string;
    /** Whether this is a checked/boolean control (like checkbox). Default: false. */
    checked?: boolean;
    /** Whether this is a text input (skip reactive :value to avoid controlled loop). Default: false. */
    textInput?: boolean;
}

export interface CustomValidatorDef {
    /** Validator function. */
    validate: (value: unknown) => string | undefined;
    /** Error message (overrides return value of validate if provided). */
    message?: string;
}

// ─── Registry ───────────────────────────────────────────────

/**
 * The built-in controls, as the registry's initial contents rather than calls at load: a module that
 * runs nothing at load is one a bundler may drop when no export of it is used, so an app with no form
 * does not carry the registry (#244, the hello scenario).
 */
const BUILT_IN_CONTROLS: [string, FormControlConfig][] = [
    // Text inputs (#479): their model's live `value-change`, with the value in `detail.value`; the
    // reactive `:value` is skipped while the user types.
    ...['pdx-input', 'pdx-textarea', 'pdx-password-input', 'pdx-search-input', 'pdx-masked-input']
        .map((tag): [string, FormControlConfig] => [tag, { textInput: true, valueEvent: 'value-change', valueExpr: 'e.detail?.value' }]),
    ...['pdx-number-input', 'pdx-otp-input']
        .map((tag): [string, FormControlConfig] => [tag, { valueEvent: 'value-change', valueExpr: 'e.detail?.value' }]),
    // The controls that declare a model (#480): its event, `<model>-change`, with the value in
    // `detail.value`, and the model as the prop.
    ...['pdx-checkbox', 'pdx-switch', 'pdx-radio']
        .map((tag): [string, FormControlConfig] => [tag, { checked: true, valueProp: 'checked', valueEvent: 'checked-change', valueExpr: 'e.detail?.value' }]),
    ['pdx-toggle', { valueProp: 'pressed', valueEvent: 'pressed-change', valueExpr: 'e.detail?.value' }],
    ...['pdx-radio-group', 'pdx-checkbox-group', 'pdx-segmented', 'pdx-slider', 'pdx-rating']
        .map((tag): [string, FormControlConfig] => [tag, { valueEvent: 'value-change', valueExpr: 'e.detail?.value' }]),
    // Standard controls, on the alpha event until their batch of #125 lands
    ...['pdx-select', 'pdx-pin-input', 'pdx-tag-input', 'pdx-color-picker', 'pdx-autocomplete']
        .map((tag): [string, FormControlConfig] => [tag, {}]),
];

const _formControls = new Map<string, FormControlConfig>(BUILT_IN_CONTROLS);
const _formFieldTypes = new Map<string, string>(); // schema type → tag name

/**
 * Register a custom element as a form control.
 * Once registered, the compiler auto-wires it inside <pdx-form>,
 * and pdx-form-template can render it via JSON schema.
 */
export function registerFormControl(tagName: string, config?: FormControlConfig): void {
    _formControls.set(tagName.toLowerCase(), config ?? {});
}

/**
 * Register a custom field type for JSON schema → component mapping.
 * Usage: `registerFormFieldType('datepicker', 'my-date-picker')`
 * Then in schema: `{ name: 'date', type: 'datepicker' }`
 */
export function registerFormFieldType(typeName: string, tagName: string): void {
    _formFieldTypes.set(typeName, tagName.toLowerCase());
}

/** Check if a tag is a registered form control (built-in or custom). */
export function isFormControl(tagName: string): boolean {
    return _formControls.has(tagName.toLowerCase());
}

/** Get config for a registered form control. */
export function getFormControlConfig(tagName: string): FormControlConfig | undefined {
    return _formControls.get(tagName.toLowerCase());
}

/** Get tag name for a schema field type (custom types). */
export function getFieldTypeTag(typeName: string): string | undefined {
    return _formFieldTypes.get(typeName);
}

/** Get all registered control tag names (for compiler). */
export function getRegisteredFormControls(): string[] {
    return Array.from(_formControls.keys());
}

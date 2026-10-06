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

const _formControls = new Map<string, FormControlConfig>();
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

// ─── Built-in registrations ─────────────────────────────────

// Text inputs — skip reactive :value, use pdx-input event
for (const tag of ['pdx-input', 'pdx-textarea', 'pdx-password-input', 'pdx-search-input', 'pdx-masked-input']) {
    registerFormControl(tag, { textInput: true, valueEvent: 'pdx-input' });
}

// Checked controls
registerFormControl('pdx-checkbox', { checked: true });
registerFormControl('pdx-switch', { checked: true });

// Standard controls
for (const tag of ['pdx-radio', 'pdx-radio-group', 'pdx-checkbox-group', 'pdx-select', 'pdx-slider', 'pdx-rating', 'pdx-number-input', 'pdx-otp-input', 'pdx-pin-input', 'pdx-tag-input', 'pdx-color-picker', 'pdx-autocomplete']) {
    registerFormControl(tag);
}

// Special event names
registerFormControl('pdx-segmented', { valueEvent: 'change' });
registerFormControl('pdx-toggle', { valueEvent: 'pressedchange', valueExpr: 'e.detail?.pressed' });

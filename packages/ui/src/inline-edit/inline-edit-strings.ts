// pdx-inline-edit's strings and its form-control registration, once per page: beside the component,
// whose .pdx script runs at every mount. Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings, registerFormControl } from '@pdxui/core';

registerComponentStrings('inline-edit', {
    empty: 'Click to edit',
    save: 'Save',
    cancel: 'Cancel',
    yes: 'Yes',
    no: 'No',
    // The editor's accessible name with no `label`: the value it edits.
    edit: 'Edit {value}',
    // The editor's accessible name when there is no value, `name` or `placeholder` either.
    label: 'Edit value',
});

registerFormControl('pdx-inline-edit', {
    valueEvent: 'value-change',
    valueProp: 'value',
    valueExpr: 'e.detail?.value',
});

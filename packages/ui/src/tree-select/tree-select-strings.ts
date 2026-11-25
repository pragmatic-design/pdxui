// pdx-tree-select's strings and its form-control registration, once per page: beside the component,
// whose .pdx script runs at every mount. Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings, registerFormControl } from '@pdxui/core';

registerComponentStrings('tree-select', {
    placeholder: 'Select...',
    search: 'Search...',
    noData: 'No data',
    noMatch: 'No match',
});

registerFormControl('pdx-tree-select', {
    valueEvent: 'value-change',
    valueProp: 'value',
    valueExpr: 'e.detail?.value',
});

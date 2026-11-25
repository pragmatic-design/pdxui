// pdx-time-picker's strings and its form-control registration, once per page: beside the component,
// whose .pdx script runs at every mount. Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings, registerFormControl } from '@pdxui/core';

registerComponentStrings('time-picker', {
    hour: 'Hour',
    minute: 'Minute',
    second: 'Second',
    period: 'AM/PM',
    increment: 'Increment',
    decrement: 'Decrement',
    // What a screen reader hears on a segment of an empty picker, which shows "--".
    empty: 'No time',
    // The group's name when aria-label is not set.
    label: 'Time picker',
});

registerFormControl('pdx-time-picker', {
    valueEvent: 'value-change',
    valueProp: 'value',
    valueExpr: 'e.detail?.value',
});

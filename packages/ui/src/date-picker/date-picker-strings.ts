// pdx-date-picker's strings and its form-control registration, once per page: beside the component,
// whose .pdx script runs at every mount. Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings, registerFormControl } from '@pdxui/core';

registerComponentStrings('date-picker', {
    today: 'Today',
    clear: 'Clear',
    close: 'Close',
    done: 'Done',
    apply: 'Apply',
    cancel: 'Cancel',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    selectMonth: 'Select month',
    selectYear: 'Select year',
    weekNumber: 'W',
    startDate: 'Start date',
    endDate: 'End date',
    compareToggle: 'Compare',
    placeholder: 'Select date',
    placeholderRange: 'Start — End',
    placeholderTime: 'Select time',
    // The trigger's name when neither aria-label nor placeholder is set, and the popup
    // dialog's name; a time-only picker's dialog is `chooseTime`.
    choose: 'Choose date',
    chooseTime: 'Choose time',
});

registerFormControl('pdx-date-picker', {
    valueEvent: 'value-change',
    valueProp: 'value',
    valueExpr: 'e.detail?.value',
});

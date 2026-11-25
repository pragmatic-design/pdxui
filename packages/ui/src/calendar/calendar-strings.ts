// pdx-calendar's strings, once per page: beside the component, whose .pdx script runs at every mount.
// Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('calendar', {
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    prevYear: 'Previous year',
    nextYear: 'Next year',
    // The year view's arrows move twelve years at a time.
    prevYears: 'Previous years',
    nextYears: 'Next years',
    today: 'Today',
    selectMonth: 'Select month',
    selectYear: 'Select year',
    weekNumber: 'W',
});

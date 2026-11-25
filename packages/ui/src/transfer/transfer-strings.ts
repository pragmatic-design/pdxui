// pdx-transfer's strings, once per page: beside the component, whose .pdx script runs at every mount.
// Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('transfer', {
    source: 'Source',
    target: 'Target',
    search: 'Search',
    /** A search field's name: the list it filters. */
    searchIn: 'Search {list}',
    selectAll: 'Select all',
    noData: 'No data',
    noMatch: 'No match',
    moveRight: 'Move to target',
    moveLeft: 'Move to source',
    moveAllRight: 'Move all to target',
    moveAllLeft: 'Move all to source',
});

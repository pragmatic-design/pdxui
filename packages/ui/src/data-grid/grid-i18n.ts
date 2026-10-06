// Grid i18n — translatable strings via @pdxui/core component string registry.
// All grid modules use t() instead of hardcoded strings.

import { registerComponentStrings, getComponentString } from '@pdxui/core';

// Register English defaults
registerComponentStrings('data-grid', {
    'filter.contains': 'Contains',
    'filter.eq': 'Equals',
    'filter.neq': 'Not equals',
    'filter.startswith': 'Starts with',
    'filter.endswith': 'Ends with',
    'filter.gt': 'Greater than',
    'filter.gte': 'Greater or equal',
    'filter.lt': 'Less than',
    'filter.lte': 'Less or equal',
    'filter.after': 'After',
    'filter.onOrAfter': 'On or after',
    'filter.before': 'Before',
    'filter.onOrBefore': 'On or before',
    'filter.isnull': 'Is empty',
    'filter.isnotnull': 'Is not empty',
    'filter.forColumn': 'Filter {column}',
    'filter.remove': 'Remove filter {column}',
    'sort.remove': 'Remove sort {column}',
    // Multi-sort said out loud: the header's hint and the level's accessible description.
    'sort.hint': '{column} · Shift+click to add to the sort',
    'sort.position': 'Sort {n} of {total}, {dir}',
    'group.remove': 'Remove group {column}',
    // The toolbar's «Group by» menu and its chip.
    'group.by': 'Group by',
    'group.none': 'None',
    'group.chip': 'Group: {column}',
    'selectRow': 'Select row {n}',
    // The detail row's toggle.
    'detail.expand': 'Expand row',
    'detail.collapse': 'Collapse row',
    // The names of the two header cells that have no text: the detail toggles' and a single
    // selection's.
    'detail.column': 'Details',
    'selection.column': 'Selection',
    // The group of rows with no value, and the set filter's option for them.
    'group.empty': '(Empty)',
    // A group row's toggle button.
    'group.toggle': '{column}: {value}, {count} rows',
    'group.toggleOne': '{column}: {value}, {count} row',
    'filter.blanks': '(Blanks)',
    'filter.apply': 'Apply',
    'filter.clear': 'Clear',
    // The toolbar's clear-all button, whose content is only a ✕.
    'filter.clearAll': 'Clear all filters',
    'filter.addFilter': '+ Add Filter',
    // The inline filter's operator button and its menu, and the Add Filter menu.
    'filter.operatorFor': '{column} filter: {operator}',
    'filter.operatorMenu': '{column} filter operator',
    'filter.addFilterMenu': 'Add a filter on',
    'filter.title': 'Filter: {field}',
    'filter.all': 'All',
    'filter.yes': 'Yes',
    'filter.no': 'No',
    'filter.placeholder': 'Filter...',
    'filter.valuePlaceholder': 'Value...',
    'filter.minPlaceholder': 'Min...',
    'filter.datePlaceholder': 'Date...',
    'filter.fromPlaceholder': 'From...',
    'logic.and': 'AND',
    'logic.or': 'OR',
    'toolbar.reload': 'Reload',
    'toolbar.columns': 'Columns',
    'toolbar.export': 'Export',
    // The export menu and its two formats.
    'toolbar.exportMenu': 'Export as',
    'toolbar.exportCsv': 'CSV (.csv)',
    'toolbar.exportXlsx': 'Excel (.xlsx)',
    // The quick search field's name and placeholder.
    'toolbar.search': 'Search',
    // The toolbar's name.
    'toolbar.label': 'Table tools',
    'toolbar.sort': 'Sort',
    'toolbar.filter': 'Filter',
    'groupBar.dropHere': 'Drag columns here to group',
    'empty.title': 'No data',
    'pagination.rows': '{count} rows',
    'pagination.row': '{count} row',
    'sort.asc': 'Ascending',
    'sort.desc': 'Descending',
    'columns.title': 'Columns',
    'selectAll': 'Select all',
    'edit.save': 'Save',
    'edit.cancel': 'Cancel',
    'edit.saveAll': 'Save All',
    'edit.revert': 'Revert',
    'edit.addRow': 'Add',
    'edit.delete': 'Delete',
    'edit.edit': 'Edit',
    'edit.dialogTitle': 'Edit Record',
    // A `rowMenu` cell's trigger, when the column does not name it after its row.
    'row.actions': 'Row actions',
});

/** Get a translated grid string (reactive signal, auto-unwrapped for imperative DOM). */
export function t(key: string): string {
    return getComponentString('data-grid', key)();
}

// pdx-field-list's English defaults, registered when the list is imported (overridable via
// setComponentStrings/setLocaleStrings). They stay with the component, not in shared/i18n.ts's table,
// so an app that renders no field list does not load them before its first paint (#1210).
import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('field-list', {
    add: '+ Add',
    remove: 'Remove',
    edit: 'Edit',
    done: 'Done',
    empty: 'No items',
    editItem: 'Edit Item',
    addItem: 'Add Item',
    editItemN: 'Edit Item #{n}',
    // The tooltip of a summary cell in display="dialog". Not `edit`: that is the button.
    cellHint: 'Click to edit',
});

// pdx-form-template's English defaults, registered when the template is imported (overridable via
// setComponentStrings). They stay with the component, not in shared/i18n.ts's table, so an app that
// renders no form template does not load them before its first paint (#1210).
// The wizard layout's buttons and position are pdx-wizard's own strings (#293).
import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('form-template', {
    'list.add': '+ Add',
    'list.remove': 'Remove',
    // A row's remove button, named after its line, not "×".
    'list.removeLine': 'Remove line {n}',
    // A row control's name: the column header names it by sight only.
    'list.cell': '{label}, line {n}',
    'list.empty': 'No items yet',
});

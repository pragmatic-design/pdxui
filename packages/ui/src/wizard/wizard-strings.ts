// The wizard's own English defaults, registered when the wizard is imported: the footer's buttons and
// its position. They stay with the component, not in shared/i18n.ts's table, so an app that renders
// no wizard does not load them before its first paint (#1210). The wizard's other strings
// (`navigation`, `steps`, `stepAnnounce`) are in that table.
import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('wizard', {
    back: 'Back',
    next: 'Next',
    complete: 'Complete',
    stepOf: 'Step {current} of {total}',
});

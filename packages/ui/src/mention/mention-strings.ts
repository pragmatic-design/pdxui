// pdx-mention's strings, once per page: beside the component, whose .pdx script runs at every mount.
// Declared under `sideEffects`, as the bundler must keep it.

import { registerComponentStrings } from '@pdxui/core';

registerComponentStrings('mention', {
    loading: 'Loading...',
    noResults: 'No results',
    placeholder: 'Type @ to mention someone',
    // Announced when the suggestions change.
    suggestions: '{n, plural, one {# suggestion} other {# suggestions}}',
});

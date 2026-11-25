// pdx-icon's one-time setup, imported by the component before its define.
//
// Register the "pragmatic" set BEFORE the component's define (which does the synchronous upgrade of
// the <pdx-icon>s already in the DOM). If the registration happened after (from the body of index.ts,
// say, which runs after ALL the imports), the first resolveIcon of the icons already mounted would
// return null and the <svg> would never be rendered (the effect does not re-run). It is the default
// set → `<pdx-icon name="...">` works out of the box. The resolver, not the set: an icon is on the page
// when something imported it, and a name that is not loads its own module on demand (#47).
// Declared under `sideEffects`, as the bundler must keep it.

import { registerPragmaticResolver } from './pragmatic-resolver';

registerPragmaticResolver();

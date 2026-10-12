// The whole «pragmatic» set on the page, as a side effect of the import — what the barrel
// (`import '@pdxui/ui'`, every component, for a page with no compiler) imports first, so the icons are
// there before any component draws one and no name has to load on demand.

import { registerPragmaticIcons } from './pragmatic-icons';

registerPragmaticIcons();

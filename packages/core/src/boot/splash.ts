// Boot: the start-up splash leaves once the app is ready (#1246).
//
// A behaviour an app relies on without calling anything, so it runs when this module loads, and only
// this module: `browser/splash.ts` does nothing at load. The `pdx()` plugin imports it into the entry
// of an app whose `index.html` has the splash; the IIFE build and `@pdxui/framework` import it too, for
// an app without the plugin.

import { startSplash } from '../browser/splash';

startSplash();

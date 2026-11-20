// Boot: the stored theme and scheme are applied to <html> as the app starts (#1246).
//
// A behaviour an app relies on without calling anything, so it runs when this module loads, and only
// this module: `component/style.ts` does nothing at load. The `pdx()` plugin imports it into the entry
// of an app that uses the design system; the IIFE build and `@pdxui/framework` import it too, for an
// app without the plugin.

import { restoreTheme } from '../component/style';

restoreTheme();

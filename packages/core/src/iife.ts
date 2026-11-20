// The CDN bundle's entry (vite.config.iife.ts): the barrel, and the two boot modules (#1246).
//
// A page that loads `pragmatic-core.iife.js` has no `pdx()` plugin to import them into its entry, and
// it gets what core did at load before #1246: the stored theme restored, the splash taken down.

import './boot/theme';
import './boot/splash';

export * from './index';

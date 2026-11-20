// @pdxui/framework — meta-package that re-exports all runtime APIs.
// One install: npm i @pdxui/framework
// This root registers every component on import (~340 KB gzip in an app, tests/entry-cost.test.ts):
// code that needs the API imports it from '@pdxui/framework/core' (~4 KB for a signal).

// What an app relies on without calling anything (#1246): the stored theme restored, the start-up
// splash taken down. The pdx() plugin imports these into an app's entry when it has them; the root
// imports both, for an app built without the plugin (level 2 of the progressive levels).
import '@pdxui/core/boot/theme';
import '@pdxui/core/boot/splash';

// Core — reactivity, rendering, components, lifecycle, communication, styles
export * from '@pdxui/core';

// UI — pre-built Web Components (dialog, drawer, tabs, transition, etc.)
// Side-effectful: registers all custom elements on import.
// Use @pdxui/framework/core for tree-shakeable core-only imports.
export * from '@pdxui/ui';

// Router — compiled route management, navigation, guards
export * from '@pdxui/router';

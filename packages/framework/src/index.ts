// @pdxui/framework — meta-package that re-exports all runtime APIs.
// One install: npm i @pdxui/framework
// This root registers every component on import (~340 KB gzip in an app, tests/entry-cost.test.ts):
// code that needs the API imports it from '@pdxui/framework/core' (~4 KB for a signal).

// Core — reactivity, rendering, components, lifecycle, communication, styles
export * from '@pdxui/core';

// UI — pre-built Web Components (dialog, drawer, tabs, transition, etc.)
// Side-effectful: registers all custom elements on import.
// Use @pdxui/framework/core for tree-shakeable core-only imports.
export * from '@pdxui/ui';

// Router — compiled route management, navigation, guards
export * from '@pdxui/router';

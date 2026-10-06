// @pdxui/framework — meta-package that re-exports all runtime APIs.
// One install: npm i @pdxui/framework
// One import: import { signal, html, component } from '@pdxui/framework';

// Core — reactivity, rendering, components, lifecycle, communication, styles
export * from '@pdxui/core';

// UI — pre-built Web Components (dialog, drawer, tabs, transition, etc.)
// Side-effectful: registers all custom elements on import.
// Use @pdxui/framework/core for tree-shakeable core-only imports.
export * from '@pdxui/ui';

// Router — compiled route management, navigation, guards
export * from '@pdxui/router';

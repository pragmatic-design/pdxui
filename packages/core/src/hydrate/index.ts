// Hydration, for an app whose pages are generated (#160): `@pdxui/core/hydrate`. Kept out of the
// barrel, so an app that is not generated carries none of it. `pdx({ hydrate: true })` calls it in
// the page before the app's own script; an app without the plugin calls it itself, first.
//
// What a .pdx compiled to hydrate calls (`hydrationRange`, `placePart`…) stays in the barrel: the
// compiled module imports it from `@pdxui/core` like the rest of its runtime.

export { installHydration } from './host';

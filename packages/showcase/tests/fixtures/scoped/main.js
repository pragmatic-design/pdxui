// The scoped-styles fixture (tests/scoped-styles.spec.ts). The two components are imported here, not
// found by the plugin's scan (src/ and pages/): the dev server says <app-sc-child> is unresolved in
// sc-parent.pdx, which is true of the scan and not of this page, where it is registered first.
await import('./sc-child.pdx');
await import('./sc-parent.pdx');
await import('./sc-variant.pdx');
window.__scReady = true;

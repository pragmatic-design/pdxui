// Fixture for the ordinary lazy-load path: importing this file registers the page component,
// exactly as a compiled .pdx page module does.

if (!customElements.get('pdx-lt-loaded')) {
    customElements.define('pdx-lt-loaded', class extends HTMLElement {});
}

export {};

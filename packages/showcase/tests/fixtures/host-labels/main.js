// The host-labels fixture (tests/host-labels.spec.ts, #987): a compiled .pdx that reads its labels
// through `self.labels`, a descriptor component that is form-associated and named by no label, and one
// that is not form-associated. `window.__hl` is set once each is defined.
const { component, model, html } = await import('@pdxui/core');

// Form-associated, with no <label for> of its own in the page.
component('hl-unlabelled', {
    models: { value: model('', { form: true }) },
    render: () => html`<span></span>`,
});

// Not form-associated: no internals, so no labels.
component('hl-plain', {
    render: () => html`<span></span>`,
});

await import('./hl-field.pdx');
await import('@pdxui/ui/select');
await Promise.all(['hl-unlabelled', 'hl-plain', 'app-hl-field', 'pdx-select'].map((t) => customElements.whenDefined(t)));
window.__hl = { ready: true };

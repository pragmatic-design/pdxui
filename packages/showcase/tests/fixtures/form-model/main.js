// The form-model fixture (tests/form-model.spec.ts): components whose model is declared `{ form }`
// (#135), one compiled from a .pdx and four from a descriptor, each a case of the serialization.
// `window.__fm` is set once every one of them is defined.
const { component, model, prop, html } = await import('@pdxui/core');

// A boolean model, submitted as a native checkbox: its `value`, or 'on', when checked.
component('fm-check', {
    props: { value: prop(''), required: prop(false) },
    models: { checked: model(false, { form: true }) },
    render: () => html`<span class="check"></span>`,
});

// An array model: one entry per item under the name.
component('fm-tags', {
    models: { tags: model(() => [], { form: true }) },
    render: () => html`<span class="tags"></span>`,
});

// A number model, with the validity and the disabled state the wiring reads.
component('fm-number', {
    props: { error: prop(''), disabled: prop(false) },
    models: { count: model(0, { form: true }) },
    render: () => html`<span class="number"></span>`,
});

// An object model: no serialization rule, so no entry.
component('fm-object', {
    models: { point: model(() => ({ x: 1 }), { form: true }) },
    render: () => html`<span class="object"></span>`,
});

await import('./fm-text.pdx');
await Promise.all(['fm-check', 'fm-tags', 'fm-number', 'fm-object', 'app-fm-text'].map((t) => customElements.whenDefined(t)));
window.__fm = { ready: true };

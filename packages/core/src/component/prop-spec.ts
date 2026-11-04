// The mark the descriptor's builders put on what they return (#300).
//
// `prop()` and `model()` put it on their spec; `component()` refuses, in development, a prop or a model
// without it, because an object written by hand is the removed constructor form. It lives in a module
// of its own so `component()` can read it without importing the builders, whose `model()` carries the
// form wiring an app with no form model must not ship. Internal: not exported from the package.

export const PROP_SPEC: unique symbol = Symbol('pdx.prop');

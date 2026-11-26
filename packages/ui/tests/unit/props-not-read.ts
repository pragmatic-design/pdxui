// Props a component declares and deliberately does not read, by `tag.prop`, with the reason.
//
// One registry for the two scans that judge an unread prop, props-are-read.test.ts and
// no-dead-props.test.ts: two lists let a prop pass one by being listed and the other by a local
// variable that happened to share its name (pdx-form-section's `name` did, while it was TypeScript).
// props-are-read.test.ts also fails when an entry here no longer applies.

// Empty: pdx-form-section's `name`, its one entry, now names the section's <fieldset> (#1271).
export const NOT_READ: Record<string, string> = {};
